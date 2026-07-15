import { z } from "zod";
import {
  createAnalysisProvider,
  createEmbeddingProvider,
  createPageExtractor,
  createSearchProvider,
  getEnv,
  type ProviderUsage,
  type ReasoningProvider,
} from "./providers.ts";
import type { ResearchRequest } from "./types.ts";
import type { ResearchStatus } from "./status.ts";
import {
  assertCitationsBelongToRun,
  adversarialGateSchema,
  assertNormalizedOpportunityRows,
  finalJudgeSchema,
  independentCheckerSchema,
  normalizedOpportunityArtifactsSchema,
  type SpecialistName,
  specialistSchemas,
} from "./reasoning.ts";
import {
  calculateDeterministicScore,
  computeFactors,
  verdictFor,
  type WeightRow,
} from "./scoring-engine.ts";
import {
  type ExportBundleInput,
  renderCsv,
  renderJson,
  renderMarkdown,
  renderPdf,
  sha256,
} from "./exports.ts";
import {
  buildAdversarialQueries,
  buildBroadQueries,
  buildEscalationQueries,
  buildTargetedQueries,
  classifySourceTier,
  clusterBySimilarity,
  deriveFollowUpSeeds,
  evaluateSufficiency,
  type PlannedQuery,
  type ResearchPass,
} from "./retrieval-strategy.ts";
import {
  checkVerdictConsistency,
  compareSpecialistAndChecker,
  gateVerdict,
  validateNarrativeCitations,
} from "./reasoning-integrity.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function retryDelay(error: unknown, attempt: number) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests/i.test(message)
    ? 5_000 * attempt
    : 500 * 2 ** (attempt - 1);
}
export class PipelineError extends Error {
  constructor(
    message: string,
    readonly runId: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PipelineError";
  }
}

class CostBudget {
  private reserved: number;
  readonly cap = Number(getEnv("RESEARCH_RUN_COST_CAP_USD") || "1.00");
  constructor(persistedSpend = 0) {
    this.reserved = persistedSpend;
  }
  reserve(amount: number) {
    if (!Number.isFinite(this.cap) || this.cap <= 0) {
      throw new Error("RESEARCH_RUN_COST_CAP_USD must be positive.");
    }
    if (this.reserved + amount > this.cap) {
      throw new Error(
        `Per-run provider cost cap of $${
          this.cap.toFixed(4)
        } would be exceeded.`,
      );
    }
    this.reserved += amount;
  }
  remaining() {
    return Math.max(0, this.cap - this.reserved);
  }
  canSpend(amount: number, downstreamReserve = 0) {
    return this.remaining() >= amount + downstreamReserve;
  }
}
async function costBudgetForRun(runId: string, db: any) {
  const { data, error } = await db.from("api_usage_logs").select("cost").eq(
    "run_id",
    runId,
  );
  if (error) {
    throw new Error(
      `Failed to load persisted provider spend: ${error.message}`,
    );
  }
  const persistedSpend = (data || []).reduce(
    (sum: number, row: any) => sum + Number(row.cost || 0),
    0,
  );
  return new CostBudget(persistedSpend);
}
const COST: Record<string, number> = {
  tavily: .008,
  firecrawl: .001,
  cohere: .0002,
  groq: .02,
  cerebras: .02,
};
async function logUsage(
  runId: string,
  provider: string,
  operation: string,
  status: "success" | "failed",
  usage: ProviderUsage,
  cost: number,
  error: string | null,
  db: any,
) {
  const { error: insertError } = await db.from("api_usage_logs").insert({
    run_id: runId,
    provider,
    operation,
    prompt_tokens: usage.prompt || null,
    completion_tokens: usage.completion || null,
    cost,
    status,
    error_message: error,
  });
  if (insertError) {
    throw new Error(`Failed to persist provider usage: ${insertError.message}`);
  }
}
async function callProvider<T>(
  runId: string,
  provider: { name: string; lastUsage?: ProviderUsage },
  operation: string,
  budget: CostBudget,
  db: any,
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const cost = COST[provider.name] ?? 0;
    budget.reserve(cost);
    try {
      const result = await fn();
      await logUsage(
        runId,
        provider.name,
        operation,
        "success",
        provider.lastUsage || {},
        cost,
        null,
        db,
      );
      return result;
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      await logUsage(
        runId,
        provider.name,
        operation,
        "failed",
        {},
        cost,
        message,
        db,
      );
      if (attempt < retries) await wait(retryDelay(error, attempt));
    }
  }
  throw last;
}
async function updateState(
  id: string,
  status: ResearchStatus,
  progress: number,
  detail: string,
  db: any,
) {
  const values: any = {
    status,
    progress,
    progress_detail: detail,
    updated_at: new Date().toISOString(),
  };
  if (status === "Failed") values.error_message = detail;
  const { error } = await db.from("research_runs").update(values).eq("id", id);
  if (error) throw new Error(`Failed to persist ${status}: ${error.message}`);
  const { data: latest } = await db.from("research_stages").select(
    "status,progress_detail",
  ).eq("run_id", id).order("created_at", { ascending: false }).limit(1)
    .maybeSingle();
  if (latest?.status === status && latest?.progress_detail === detail) return;
  const now = new Date().toISOString();
  const { error: stageError } = await db.from("research_stages").insert({
    run_id: id,
    stage_name: status,
    status,
    progress_detail: detail,
    error_message: status === "Failed" ? detail : null,
    started_at: now,
    completed_at: now,
  });
  if (stageError) {
    throw new Error(
      `Failed to persist transition ${status}: ${stageError.message}`,
    );
  }
}
async function logError(
  runId: string,
  context: string,
  error: unknown,
  db: any,
) {
  const message = error instanceof Error ? error.message : String(error);
  const { data: run } = await db.from("research_runs").select("created_by").eq(
    "id",
    runId,
  ).maybeSingle();
  await db.from("error_logs").insert({
    user_id: run?.created_by || null,
    run_id: runId,
    context,
    error_message: message,
    stack_trace: error instanceof Error ? error.stack || null : null,
  });
}
function cosine(a: number[], b: number[]) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? d / Math.sqrt(aa * bb) : 0;
}
function chunk(text: string, size = 4000) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function acquireAndNormalize(
  id: string,
  input: ResearchRequest,
  db: any,
  budget: CostBudget,
) {
  const search = createSearchProvider(),
    extractor = createPageExtractor(),
    embedder = createEmbeddingProvider();
  let reasoner = createAnalysisProvider();
  const { data: opp, error: oppError } = await db.from("opportunities").insert({
    run_id: id,
    name: input.ideaName,
    one_liner: input.ideaDescription.slice(0, 240),
    target_customer: input.targetCustomer,
    core_pain: input.ideaDescription.slice(0, 240),
    market: input.marketType,
  }).select("id").single();
  if (oppError || !opp) {
    throw oppError || new Error("Opportunity insert failed");
  }
  const startedAt = Date.now();
  const retrievalBudgetMs = Number(getEnv("RESEARCH_RETRIEVAL_BUDGET_MS") || "85000");
  const downstreamCostReserve = Number(getEnv("RESEARCH_REASONING_COST_RESERVE_USD") || ".36");
  const maxSourcesPerPass = input.depth === "deep" ? 4 : 3;
  const seenUrls = new Set<string>();
  let persistedEvidence: any[] = [];
  let coverage = evaluateSufficiency([]);
  let budgetLimited = false;

  const persistCoverage = async (pass: ResearchPass, _queryCount: number) => {
    const { count: persistedQueryCount, error: countError } = await db.from("research_queries").select("id", { count: "exact", head: true }).eq("run_id", id).eq("pass_number", pass);
    if (countError) throw countError;
    const { error } = await db.from("research_passes").upsert({
      run_id: id,
      pass_number: pass,
      objective: pass === 1 ? "broad" : pass === 2 ? "targeted" : "disconfirming",
      query_count: persistedQueryCount || 0,
      evidence_count: persistedEvidence.filter((e) => e.research_pass === pass).length,
      sufficient: coverage.sufficient,
      coverage: coverage,
      coverage_gaps: coverage.gaps,
      budget_limited: budgetLimited,
      completed_at: new Date().toISOString(),
    }, { onConflict: "run_id,pass_number" });
    if (error) throw error;
  };

  const recluster = async () => {
    const usable = persistedEvidence.filter((e) => !e.excluded);
    if (!usable.length || !budget.canSpend(COST.cohere, downstreamCostReserve)) return;
    try {
      const vectors = await callProvider(id, embedder, "evidence_clustering", budget, db, () => embedder.embed(usable.map((e) => `${e.pain_point}. ${e.snippet}`)), 1);
      const clustered = clusterBySimilarity(usable, vectors, cosine);
      for (const item of clustered) {
        const { error } = await db.from("evidence_items").update({
          cluster_key: item.cluster_key,
          supporting_count: item.supporting_count,
          independent_source_count: item.independent_source_count,
          independent_domain_count: item.independent_domain_count,
        }).eq("id", item.id).eq("run_id", id);
        if (error) throw error;
      }
      const byId = new Map(clustered.map((e) => [e.id, e]));
      persistedEvidence = persistedEvidence.map((e) => byId.get(e.id) || e);
    } catch (error) {
      console.warn("Cross-source clustering unavailable", error);
    }
  };

  const runPass = async (pass: ResearchPass, queries: PlannedQuery[]) => {
    await updateState(id, "Searching", 12 + pass * 9, `Pass ${pass}: ${pass === 1 ? "broad problem and solution mapping" : pass === 2 ? "targeted follow-up from prior evidence" : "adversarial disconfirmation"}`, db);
    const candidates: any[] = [];
    let attempted = 0;
    for (const planned of queries) {
      if (Date.now() - startedAt >= retrievalBudgetMs || !budget.canSpend(COST.tavily, downstreamCostReserve)) { budgetLimited = true; break; }
      const { data: queryRow, error: queryError } = await db.from("research_queries").insert({
        run_id: id, pass_number: pass, evidence_family: planned.family, objective: planned.objective,
        query: planned.query, triggered_by_evidence_ids: planned.triggeredByEvidenceIds, status: "Running",
      }).select("id").single();
      if (queryError || !queryRow) throw queryError || new Error("Research query insert failed");
      attempted++;
      try {
        const found = await callProvider(id, search, `search_pass_${pass}`, budget, db, () => search.search(planned.query), 1);
        candidates.push(...found.map((r) => ({ ...r, planned, queryId: queryRow.id })));
        await db.from("research_queries").update({ status: "Complete", result_count: found.length, completed_at: new Date().toISOString() }).eq("id", queryRow.id).eq("run_id", id);
      } catch (error) {
        await db.from("research_queries").update({ status: "Failed", error_message: error instanceof Error ? error.message : String(error), completed_at: new Date().toISOString() }).eq("id", queryRow.id).eq("run_id", id);
      }
    }
    await updateState(id, "Extracting", 18 + pass * 10, `Pass ${pass}: extracting independently addressable sources`, db);
    const selected: any[] = [];
    const passDomains = new Set<string>();
    const firstProblem = candidates.find((c) => c.planned.family === "problem");
    const firstSolution = candidates.find((c) => c.planned.family === "solution");
    const firstMarketSize = candidates.find((c) => c.planned.objective === "market-sizing");
    const balancedCandidates = [firstProblem, firstSolution, firstMarketSize, ...candidates].filter(Boolean).filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index);
    for (const result of balancedCandidates) {
      if (!result.url || seenUrls.has(result.url)) continue;
      let domain = "unknown";
      try { domain = new URL(result.url).hostname.replace(/^www\./, ""); } catch { /* invalid URL is skipped */ continue; }
      if (passDomains.has(domain) && candidates.some((c) => { try { return !seenUrls.has(c.url) && !passDomains.has(new URL(c.url).hostname.replace(/^www\./, "")); } catch { return false; } })) continue;
      selected.push({ ...result, domain }); seenUrls.add(result.url); passDomains.add(domain);
      if (selected.length >= maxSourcesPerPass) break;
    }
    for (const result of selected) {
      if (Date.now() - startedAt >= retrievalBudgetMs || !budget.canSpend(COST.firecrawl + COST.groq, downstreamCostReserve)) { budgetLimited = true; break; }
      try {
        const markdown = await callProvider(id, extractor, `extract_pass_${pass}`, budget, db, () => extractor.extract(result.url), 1);
        const tier = classifySourceTier(result.url, result.title || "", markdown, result.planned.family);
        const { data: source, error } = await db.from("sources").insert({
          run_id: id, title: result.title || "Web Source", url: result.url, source_type: result.sourceType || "web",
          text_content: markdown.slice(0, 20000), source_domain: result.domain, evidence_family: result.planned.family,
          research_pass: pass, source_tier: tier.tier, tier_reason: tier.reason, excluded: tier.excluded,
          exclusion_reason: tier.excluded ? tier.reason : null, research_query_id: result.queryId,
        }).select("id").single();
        if (error || !source) throw error || new Error("Source insert failed");
        let output;
        const context = { family: result.planned.family, pass, objective: result.planned.objective };
        try {
          output = await callProvider(id, reasoner, `evidence_extraction_pass_${pass}`, budget, db, () => reasoner.extractEvidence(input.ideaName, input.targetCustomer, chunk(markdown)[0], context), 1);
        } catch (error) {
          if (!budget.canSpend(COST.cerebras, downstreamCostReserve)) throw error;
          reasoner = createAnalysisProvider(true);
          output = await callProvider(id, reasoner, `evidence_extraction_pass_${pass}_fallback`, budget, db, () => reasoner.extractEvidence(input.ideaName, input.targetCustomer, chunk(markdown)[0], context), 1);
        }
        const exact = new Set<string>();
        for (const e of output.evidence) {
          const key = e.snippet.toLowerCase().replace(/\W/g, "");
          if (!key || exact.has(key)) continue;
          exact.add(key);
          const { data, error: evidenceError } = await db.from("evidence_items").insert({
            run_id: id, opportunity_id: opp.id, source_id: source.id, signal_type: e.signal_type, strength: e.strength,
            title: e.title, snippet: e.snippet, verified: !tier.excluded, supporting_count: 1, contradicting_count: e.disconfirming ? 1 : 0,
            confidence: e.strength === "High" ? .85 : e.strength === "Medium" ? .65 : .45,
            evidence_family: result.planned.family, research_pass: pass, source_tier: tier.tier, excluded: tier.excluded,
            disconfirming: e.disconfirming, pain_point: e.pain_point,
            author: e.author, named_entities: e.named_entities, source_domain: result.domain,
            market_size_metric: e.market_size_metric === "None" ? null : e.market_size_metric,
            market_size_figure: e.market_size_metric === "None" ? null : e.market_size_figure,
          }).select("id,source_id,signal_type,strength,title,snippet,evidence_family,research_pass,source_tier,excluded,disconfirming,pain_point,author,named_entities,source_domain,market_size_metric,market_size_figure,independent_source_count,independent_domain_count").single();
          if (evidenceError || !data) throw evidenceError || new Error("Evidence insert failed");
          persistedEvidence.push(data);
        }
      } catch (error) {
        console.warn("Pass source exhausted", result.url, error);
      }
    }
    await recluster();
    coverage = evaluateSufficiency(persistedEvidence);
    await persistCoverage(pass, attempted);
  };

  await runPass(1, buildBroadQueries(input));
  let seeds = deriveFollowUpSeeds(persistedEvidence);
  if (!seeds.length) {
    seeds = persistedEvidence.filter((e) => e.pain_point).slice(0, 3).map((e) => ({ entity: input.ideaName, evidenceIds: [e.id], family: e.evidence_family, painLanguage: e.pain_point }));
  }
  await runPass(2, buildTargetedQueries(seeds));
  seeds = deriveFollowUpSeeds(persistedEvidence);
  await runPass(3, buildAdversarialQueries(input, seeds));
  if (!coverage.sufficient && !budgetLimited) {
    const escalation = buildEscalationQueries(input, coverage.gaps, seeds);
    if (escalation.length) await runPass(3, escalation);
  }
  coverage = evaluateSufficiency(persistedEvidence);
  const remainingGaps = [...coverage.gaps];
  if (budgetLimited) remainingGaps.push("retrieval escalation was budget-limited");
  await db.from("research_runs").update({ retrieval_sufficient: coverage.sufficient, retrieval_coverage: coverage, retrieval_coverage_gaps: remainingGaps, retrieval_budget_limited: budgetLimited }).eq("id", id);
  if (!persistedEvidence.length) throw new Error("No structured evidence could be produced.");
  const firstPain = persistedEvidence.find((e) => e.signal_type === "Pain" && !e.excluded);
  if (firstPain) await db.from("opportunities").update({ core_pain: firstPain.title }).eq("id", opp.id);
  await updateState(id, "Normalizing", 72, coverage.sufficient ? "Evidence clustered with sufficient cross-source coverage" : `Research incomplete: ${remainingGaps.join("; ")}`, db);
  await generateAndPersistOpportunityArtifacts(
    id,
    input,
    opp.id,
    persistedEvidence,
    db,
    budget,
  );
}

async function generateAndPersistOpportunityArtifacts(
  runId: string,
  input: ResearchRequest,
  opportunityId: string,
  evidence: any[],
  db: any,
  budget: CostBudget,
) {
  const usableEvidence = evidence.filter((item: any) => !item.excluded && item.source_tier !== 4);
  if (!usableEvidence.length) throw new Error("Normalized artifacts require at least one non-excluded source.");
  const artifactContract =
    `{"competitors":[{"name":"Named entity from evidence","positioning":"One phrase","pricing":"Observed pricing or evidence-grounded description","target":"One phrase","strength":"One phrase","gap":"One phrase","evidence_ids":["UUID"]}],"risks":[{"category":"Market|Execution|Platform|Regulatory","severity":"High|Medium|Low","description":"One sentence","mitigation":"One sentence","evidence_ids":["UUID"]}],"pricing_model":{"model":"One phrase","price_point":"One phrase","rationale":"One sentence","first_offer":"One phrase","target_customers":10,"evidence_ids":["UUID"]},"mvp_plan":{"outcome":"One sentence","build_estimate":"One phrase","build_complexity":"Low|Medium|High","scope":["One phrase"],"exclusions":["One phrase"],"evidence_ids":["UUID"]},"launch_plan":{"first_customer_channel":"One phrase","outreach_message":"One sentence","success_metric":"One phrase","week_one":["One sentence"],"first_ten":["One sentence"],"evidence_ids":["UUID"]}}`;
  const allowedEvidenceIds = new Set<string>(
    usableEvidence.map((item: any) => item.id),
  );
  const artifactPacingMs = Number(
    getEnv("NORMALIZATION_ARTIFACT_PACING_MS") || "8000",
  );
  if (!Number.isFinite(artifactPacingMs) || artifactPacingMs < 0) {
    throw new Error(
      "NORMALIZATION_ARTIFACT_PACING_MS must be zero or greater.",
    );
  }
  if (artifactPacingMs > 0) await wait(artifactPacingMs);
  let artifacts:
    | z.infer<typeof normalizedOpportunityArtifactsSchema>
    | undefined;
  let last: unknown;
  const artifactMaxCompletionTokens = Number(
    getEnv("NORMALIZATION_MAX_COMPLETION_TOKENS") || "8192",
  );
  if (
    !Number.isInteger(artifactMaxCompletionTokens) ||
    artifactMaxCompletionTokens <= 0
  ) {
    throw new Error(
      "NORMALIZATION_MAX_COMPLETION_TOKENS must be a positive integer.",
    );
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const provider = createAnalysisProvider(
      attempt >= 2,
      artifactMaxCompletionTokens,
    );
    try {
      artifacts = await callProvider(
        runId,
        provider,
        "normalized_opportunity_artifacts",
        budget,
        db,
        () =>
          provider.generateStructured(
            `Normalize the supplied startup idea and evidence rows into the database-ready analysis sections. Return exactly this JSON field structure: ${artifactContract}. Replace every example value with supported values from the input and emit enum values as one allowed value, never the pipe-delimited example. Use only facts present in evidence. Return at most three competitors and three risks, and at most five items in each plan list. Competitors must be named entities actually present in evidence; do not invent names, prices, or capabilities. Pricing, MVP, and launch fields are recommendations, but each must be grounded in the cited evidence. Risks must describe a concrete evidenced concern. Every object must cite one or more exact evidence_items UUIDs from the input. Keep every field to one concise sentence or phrase specific to the submitted idea. target_customers is the integer customer count for the recommended initial validation offer, not a market-size estimate. If the evidence cannot support every required section, fail by returning no valid object rather than filling fields with placeholders such as Unknown, Incomplete, Not established, or N/A.`,
            JSON.stringify({
              idea: {
                name: input.ideaName,
                description: input.ideaDescription,
                target_customer: input.targetCustomer,
                market_type: input.marketType,
                target_region: input.targetRegion,
              },
              evidence: usableEvidence,
            }),
            normalizedOpportunityArtifactsSchema,
          ),
        1,
      );
      assertCitationsBelongToRun(artifacts, allowedEvidenceIds);
      break;
    } catch (error) {
      last = error;
      if (attempt < 3) {
        const delay = attempt >= 2
          ? Math.max(10_000, retryDelay(error, attempt))
          : retryDelay(error, attempt);
        await wait(delay);
      }
    }
  }
  if (!artifacts) {
    throw last || new Error("Required normalized opportunity artifacts failed");
  }

  const cleanupResults = await Promise.all([
    db.from("competitors").delete().eq("opportunity_id", opportunityId),
    db.from("risks").delete().eq("opportunity_id", opportunityId),
    db.from("pricing_models").delete().eq("opportunity_id", opportunityId),
    db.from("mvp_plans").delete().eq("opportunity_id", opportunityId),
    db.from("launch_plans").delete().eq("opportunity_id", opportunityId),
  ]);
  for (const result of cleanupResults) {
    if (result.error) throw result.error;
  }

  const { error: competitorError } = await db.from("competitors").insert(
    artifacts.competitors.map(({ evidence_ids: _citations, ...row }) => ({
      ...row,
      opportunity_id: opportunityId,
    })),
  );
  if (competitorError) throw competitorError;

  const { error: riskError } = await db.from("risks").insert(
    artifacts.risks.map(({ evidence_ids: _citations, ...row }) => ({
      ...row,
      opportunity_id: opportunityId,
    })),
  );
  if (riskError) throw riskError;

  const { evidence_ids: _pricingCitations, ...pricing } =
    artifacts.pricing_model;
  const { error: pricingError } = await db.from("pricing_models").insert({
    ...pricing,
    opportunity_id: opportunityId,
  });
  if (pricingError) throw pricingError;

  const { evidence_ids: _mvpCitations, scope, exclusions, ...mvp } =
    artifacts.mvp_plan;
  const { data: mvpPlan, error: mvpError } = await db.from("mvp_plans").insert({
    ...mvp,
    opportunity_id: opportunityId,
  }).select("id").single();
  if (mvpError || !mvpPlan) {
    throw mvpError || new Error("MVP plan insert failed");
  }
  const { error: scopeError } = await db.from("mvp_scope_items").insert([
    ...scope.map((description) => ({
      mvp_plan_id: mvpPlan.id,
      item_type: "Scope",
      description,
    })),
    ...exclusions.map((description) => ({
      mvp_plan_id: mvpPlan.id,
      item_type: "Exclusion",
      description,
    })),
  ]);
  if (scopeError) throw scopeError;

  const {
    evidence_ids: _launchCitations,
    week_one,
    first_ten,
    ...launch
  } = artifacts.launch_plan;
  const { data: launchPlan, error: launchError } = await db.from("launch_plans")
    .insert({ ...launch, opportunity_id: opportunityId }).select("id").single();
  if (launchError || !launchPlan) {
    throw launchError || new Error("Launch plan insert failed");
  }
  const { error: strategyError } = await db.from("launch_strategies").insert([
    ...week_one.map((description) => ({
      launch_plan_id: launchPlan.id,
      strategy_type: "WeekOne",
      description,
    })),
    ...first_ten.map((description) => ({
      launch_plan_id: launchPlan.id,
      strategy_type: "FirstTen",
      description,
    })),
  ]);
  if (strategyError) throw strategyError;
}

function specialistContract(name: SpecialistName) {
  const claims =
    '"claims":[{"claim":"One concise sentence.","evidence_ids":["UUID"]}],"limitations":[],"verdict_direction":"Insufficient"';
  switch (name) {
    case "market":
      return `{${claims},"demand_pattern":"Unknown"}`;
    case "pricing":
      return `{${claims},"pricing_structure":"Unknown"}`;
    case "risk":
      return `{${claims},"risks":[{"category":"Market","severity":"Low","claim":"One concise sentence.","evidence_ids":["UUID"]}]}`;
    case "demand":
      return `{${claims},"confidence_label":"Low","contradiction_observation":"One concise categorical observation."}`;
    case "gtm":
      return `{${claims},"channels":[{"channel":"Channel name","rationale":"One concise sentence.","evidence_ids":["UUID"]}]}`;
    default:
      return `{${claims}}`;
  }
}

function specialistPrompt(name: SpecialistName, structured: any) {
  return `You are the ${name} specialist. Analyze only the supplied structured database rows. Return exactly this JSON shape: ${
    specialistContract(name)
  }. Replace example values with supported values from the input. verdict_direction must be SupportsOpportunity, Mixed, ChallengesOpportunity, or Insufficient. Allowed enums: demand_pattern=Growing|Stable|Seasonal|Declining|Unknown; pricing_structure=Subscription|Usage|One-time|Service|Mixed|Unknown; risk category=Market|Execution|Platform|Regulatory; severity and confidence_label=High|Medium|Low. Every array item must be an object using exactly the shown field names. Return at most three claims, three risks, and three channels. Keep every claim, rationale, limitation, and observation to one concise sentence. Every claim, risk, and channel must cite one or more exact evidence_items UUIDs from the input. Never output a numeric score, rating number, probability, percentage, market-size estimate, competitor count, average price, or other score-like number. Categorical labels are allowed. If the evidence does not support a claim, omit it and describe the limitation.\n\nSTRUCTURED INPUT:\n${
    JSON.stringify(structured)
  }`;
}

function specialistInput(name: SpecialistName, structured: any) {
  const signals: Record<SpecialistName, string[]> = {
    competition: ["Demand", "Risk"],
    market: ["Demand", "Pain"],
    pricing: ["Pricing", "Demand"],
    risk: ["Risk", "Pain"],
    demand: ["Pain", "Demand"],
    gtm: ["Demand", "Pain"],
  };
  const candidates = structured.evidence.filter((item: any) =>
    !item.excluded && item.source_tier !== 4 && signals[name].includes(item.signal_type)
  );
  const evidence = (candidates.length ? candidates : structured.evidence.filter((item: any) => !item.excluded && item.source_tier !== 4))
    .toSorted((a: any, b: any) =>
      Number(b.confidence || 0) - Number(a.confidence || 0) ||
      Number(b.supporting_count || 0) - Number(a.supporting_count || 0) ||
      String(a.id).localeCompare(String(b.id))
    ).slice(0, 8);
  const base: any = { opportunity: structured.opportunity, evidence };
  if (name === "competition" || name === "gtm") {
    base.competitors = structured.competitors;
  }
  if (name === "pricing") base.pricing_model = structured.pricing_model;
  if (name === "risk") base.risks = structured.risks;
  if (name === "gtm") base.launch_plan = structured.launch_plan;
  return base;
}

export function groundedMarketSizing(evidence: any[]) {
  const result: Record<string, any> = { TAM: null, SAM: null, SOM: null, MarketSize: null };
  for (const item of evidence) {
    const metric = item.market_size_metric;
    const figure = item.market_size_figure;
    if (!metric || !Object.hasOwn(result, metric) || result[metric] || item.excluded || !figure) continue;
    if (!/\d/.test(String(figure)) || !item.id || !item.source_id || !item.sources?.url) continue;
    result[metric] = { figure, evidenceItemId: item.id, sourceId: item.source_id, citationUrl: item.sources.url };
  }
  const found = Object.values(result).some(Boolean);
  return { ...result, reason: found ? null : "No verifiable market-size data found in named, cited sources." };
}

export function assertGroundedMarketSizing(value: Record<string, any>, allowedEvidenceIds: Set<string>) {
  for (const metric of ["TAM", "SAM", "SOM", "MarketSize"]) {
    const entry = value[metric];
    if (entry === null) continue;
    if (!entry?.figure || !/\d/.test(String(entry.figure)) || !entry?.sourceId || !entry?.citationUrl || !allowedEvidenceIds.has(entry.evidenceItemId)) {
      throw new Error(`${metric} must trace to a numeric evidence item and named source citation.`);
    }
  }
  if (!["TAM", "SAM", "SOM", "MarketSize"].some((metric) => value[metric]) && !value.reason) {
    throw new Error("Missing market-size figures require an explicit reason.");
  }
}

function deterministicCompetitionMetrics(competitors: any[]) {
  const prices = competitors.flatMap((competitor) =>
    [
      ...String(competitor.pricing || "").matchAll(
        /\$\s*([0-9]+(?:\.[0-9]+)?)/g,
      ),
    ]
      .map((match) => Number(match[1])).filter(Number.isFinite)
  );
  const vcBackedCount =
    competitors.filter((competitor) =>
      /venture|vc-backed|series [a-f]|funded/i.test(
        `${competitor.positioning} ${competitor.strength}`,
      )
    ).length;
  const explicitGapCount =
    competitors.filter((competitor) =>
      String(competitor.gap || "").trim().length >= 12
    ).length;
  const stickyCount =
    competitors.filter((competitor) =>
      /integration|workflow|enterprise|migration|system of record/i.test(
        `${competitor.positioning} ${competitor.strength}`,
      )
    ).length;
  return {
    competitor_count: competitors.length,
    vc_backed_count: vcBackedCount,
    average_observed_price: prices.length
      ? Math.round(
        prices.reduce((sum, price) => sum + price, 0) / prices.length * 100,
      ) / 100
      : null,
    differentiation_signal: !competitors.length
      ? "Unknown"
      : explicitGapCount / competitors.length >= .6
      ? "Strong"
      : explicitGapCount
      ? "Moderate"
      : "Weak",
    switching_cost: !competitors.length
      ? "Unknown"
      : stickyCount / competitors.length >= .6
      ? "High"
      : stickyCount
      ? "Medium"
      : "Low",
  };
}
async function runSpecialist(
  name: SpecialistName,
  structured: any,
  allowed: Set<string>,
  runId: string,
  budget: CostBudget,
  db: any,
) {
  const schema: z.ZodTypeAny = specialistSchemas[name];
  let last: unknown;
  let attempt = 0;
  for (attempt = 1; attempt <= 3; attempt++) {
    const provider: ReasoningProvider = createAnalysisProvider(attempt >= 2);
    try {
      if (getEnv("FORCE_SPECIALIST_AGENT_FAILURE") === name) {
        throw new Error(`Forced ${name} specialist failure for verification`);
      }
      const output: any = await callProvider(
        runId,
        provider,
        `agent_${name}`,
        budget,
        db,
        () =>
          provider.generateStructured(
            specialistPrompt(name, structured),
            "Return JSON only.",
            schema,
          ),
        1,
      );
      assertCitationsBelongToRun(output, allowed);
      await db.from("reasoning_agent_outputs").upsert({
        run_id: runId,
        agent_name: name,
        status: "Complete",
        attempt_count: attempt,
        payload: output,
      }, { onConflict: "run_id,agent_name" });
      return { status: "Complete", output };
    } catch (error) {
      last = error;
      if (attempt < 3) await wait(retryDelay(error, attempt));
    }
  }
  await logError(runId, `reasoning-agent:${name}`, last, db);
  const output = {
    claims: [],
    limitations: [
      `Incomplete after three citation-validating attempts: ${
        last instanceof Error ? last.message : String(last)
      }`,
    ],
  };
  await db.from("reasoning_agent_outputs").upsert({
    run_id: runId,
    agent_name: name,
    status: "Incomplete",
    attempt_count: 3,
    payload: output,
  }, { onConflict: "run_id,agent_name" });
  return { status: "Incomplete", output };
}

async function runIndependentChecker(
  name: SpecialistName,
  isolatedInput: any,
  allowed: Set<string>,
  runId: string,
  budget: CostBudget,
  db: any,
) {
  try {
    const provider = createAnalysisProvider(true);
    const output = await callProvider(
      runId,
      provider,
      `checker_${name}`,
      budget,
      db,
      () => provider.generateStructured(
        `You are the independent checker for the ${name} domain. Re-derive a judgment from the supplied database evidence in isolation. You have not seen and must not speculate about any specialist output. Return JSON exactly as {"claims":[{"claim":"One concise independently derived finding.","evidence_ids":["UUID"]}],"limitations":[],"verdict_direction":"SupportsOpportunity|Mixed|ChallengesOpportunity|Insufficient"}. Cite every claim. verdict_direction summarizes only this evidence subset. Omit unsupported claims; do not invent numbers or use parametric knowledge.`,
        JSON.stringify(isolatedInput),
        independentCheckerSchema,
      ),
      1,
    );
    assertCitationsBelongToRun(output, allowed);
    return { status: "Complete", output, attemptCount: 1 };
  } catch (error) {
    await logError(runId, `reasoning-checker:${name}`, error, db);
    return {
      status: "Incomplete",
      output: {
        claims: [],
        limitations: [`Independent checker failed: ${error instanceof Error ? error.message : String(error)}`],
        verdict_direction: "Insufficient",
      },
      attemptCount: 1,
    };
  }
}

async function runAdversarialVerdictGate(
  runId: string,
  deterministic: { total: number; verdict: string; factors: any[] },
  structured: any,
  allowed: Set<string>,
  budget: CostBudget,
  db: any,
) {
  const evidence = structured.evidence.filter((item: any) =>
    !item.excluded && item.source_tier !== 4
  ).toSorted((a: any, b: any) =>
    Number(Boolean(b.disconfirming)) - Number(Boolean(a.disconfirming)) ||
    Number(a.source_tier || 3) - Number(b.source_tier || 3) ||
    Number(b.independent_source_count || 1) - Number(a.independent_source_count || 1)
  ).slice(0, 12);
  try {
    const provider = createAnalysisProvider();
    const output = await callProvider(
      runId,
      provider,
      "adversarial_verdict_gate",
      budget,
      db,
      () => provider.generateStructured(
        `Act as a one-shot adversarial verdict gate. Your only mandate is to kill or disprove the emerging deterministic verdict using the supplied persisted evidence. You have not seen specialist conclusions. Prioritize Pass 3 disconfirmation, missing Tier 1 willingness-to-pay proof, dominant incumbents, retrieval gaps, and thin independent corroboration. Return exactly {"outcome":"StrongObjection|NoStrongDisproof|InsufficientEvidence","severity":"High|Medium|Low|None","objection":"One specific sentence, or an explicit certification that no strong disproof was found.","evidence_ids":["UUID"]}. StrongObjection requires direct citations. NoStrongDisproof must use severity None. Do not soften or balance the objection and do not propose a new score.`,
        JSON.stringify({
          deterministic_verdict: deterministic.verdict,
          weakest_factors: deterministic.factors.toSorted((a: any, b: any) => a.score - b.score).slice(0, 4),
          evidence,
          competitors: structured.competitors,
          retrieval: structured.retrieval,
        }),
        adversarialGateSchema,
      ),
      1,
    );
    assertCitationsBelongToRun(output, allowed);
    const unresolved = output.outcome === "StrongObjection" &&
      (output.severity === "High" || output.severity === "Medium");
    const persisted = { ...output, unresolved };
    const { error } = await db.from("adversarial_verdict_gates").upsert({
      run_id: runId,
      emerging_verdict: deterministic.verdict,
      outcome: output.outcome,
      severity: output.severity,
      objection: output.objection,
      evidence_ids: output.evidence_ids,
      unresolved,
      status: "Complete",
      payload: persisted,
    }, { onConflict: "run_id" });
    if (error) throw error;
    return persisted;
  } catch (error) {
    await logError(runId, "adversarial-verdict-gate", error, db);
    const fallback = {
      outcome: "InsufficientEvidence" as const,
      severity: "None" as const,
      objection: `Adversarial gate could not complete: ${error instanceof Error ? error.message : String(error)}`,
      evidence_ids: [] as string[],
      unresolved: false,
    };
    const { error: persistError } = await db.from("adversarial_verdict_gates").upsert({
      run_id: runId,
      emerging_verdict: deterministic.verdict,
      outcome: fallback.outcome,
      severity: fallback.severity,
      objection: fallback.objection,
      evidence_ids: fallback.evidence_ids,
      unresolved: false,
      status: "Incomplete",
      payload: fallback,
    }, { onConflict: "run_id" });
    if (persistError) throw persistError;
    return fallback;
  }
}

async function executeReasoningPhase(
  id: string,
  input: ResearchRequest,
  db: any,
  budget = new CostBudget(),
) {
  const reasoningStartedAt = Date.now();
  const reasoningPhaseBudgetMs = Number(
    getEnv("REASONING_PHASE_BUDGET_MS") || "115000",
  );
  const finalJudgeReserveMs = Number(
    getEnv("FINAL_JUDGE_RESERVE_MS") || "35000",
  );
  if (
    !Number.isFinite(reasoningPhaseBudgetMs) ||
    !Number.isFinite(finalJudgeReserveMs) || finalJudgeReserveMs <= 0 ||
    reasoningPhaseBudgetMs <= finalJudgeReserveMs
  ) {
    throw new Error(
      "REASONING_PHASE_BUDGET_MS must exceed the positive FINAL_JUDGE_RESERVE_MS.",
    );
  }
  await updateState(
    id,
    "Normalizing",
    75,
    "Loading structured evidence; raw sources are excluded",
    db,
  );
  const { data: opp, error: oppError } = await db.from("opportunities").select(
    "*",
  ).eq("run_id", id).maybeSingle();
  if (oppError || !opp) {
    throw oppError ||
      new Error("No normalized opportunity exists for this run.");
  }
  let [evQ, compQ, riskQ, pricingQ, mvpQ, launchQ, weightQ] = await Promise
    .all([
      db.from("evidence_items").select(
        "id,source_id,signal_type,strength,title,snippet,verified,cluster_key,supporting_count,contradicting_count,confidence,evidence_family,research_pass,source_tier,excluded,disconfirming,pain_point,author,source_domain,independent_source_count,independent_domain_count,market_size_metric,market_size_figure,sources(title,url,source_type,source_tier,excluded)",
      ).eq("run_id", id),
      db.from("competitors").select(
        "id,name,positioning,pricing,target,strength,gap",
      ).eq("opportunity_id", opp.id),
      db.from("risks").select("id,category,severity,description,mitigation").eq(
        "opportunity_id",
        opp.id,
      ),
      db.from("pricing_models").select("*").eq("opportunity_id", opp.id)
        .maybeSingle(),
      db.from("mvp_plans").select("*,mvp_scope_items(*)").eq(
        "opportunity_id",
        opp.id,
      ).maybeSingle(),
      db.from("launch_plans").select("*,launch_strategies(*)").eq(
        "opportunity_id",
        opp.id,
      ).maybeSingle(),
      db.from("scoring_weights").select("criterion,weight"),
    ]);
  for (const q of [evQ, compQ, riskQ, pricingQ, mvpQ, launchQ, weightQ]) {
    if (q.error) throw q.error;
  }
  const evidence = evQ.data || [];
  if (!evidence.length) {
    throw new Error("Reasoning requires persisted evidence_items.");
  }
  try {
    assertNormalizedOpportunityRows({
      competitors: compQ.data,
      risks: riskQ.data,
      pricing_model: pricingQ.data,
      mvp_plan: mvpQ.data,
      launch_plan: launchQ.data,
    });
  } catch {
    await updateState(
      id,
      "Normalizing",
      74,
      "Backfilling required opportunity analysis rows from persisted evidence",
      db,
    );
    await generateAndPersistOpportunityArtifacts(
      id,
      input,
      opp.id,
      evidence,
      db,
      budget,
    );
    [compQ, riskQ, pricingQ, mvpQ, launchQ] = await Promise.all([
      db.from("competitors").select(
        "id,name,positioning,pricing,target,strength,gap",
      ).eq("opportunity_id", opp.id),
      db.from("risks").select("id,category,severity,description,mitigation").eq(
        "opportunity_id",
        opp.id,
      ),
      db.from("pricing_models").select("*").eq("opportunity_id", opp.id)
        .maybeSingle(),
      db.from("mvp_plans").select("*,mvp_scope_items(*)").eq(
        "opportunity_id",
        opp.id,
      ).maybeSingle(),
      db.from("launch_plans").select("*,launch_strategies(*)").eq(
        "opportunity_id",
        opp.id,
      ).maybeSingle(),
    ]);
    for (const q of [compQ, riskQ, pricingQ, mvpQ, launchQ]) {
      if (q.error) throw q.error;
    }
  }
  const allowed = new Set<string>(evidence.filter((e: any) =>
    e.id && e.source_id && !e.excluded && e.source_tier !== 4 && e.sources?.url
  ).map((e: any) => e.id));
  if (!allowed.size) {
    throw new Error("Reasoning requires evidence citations that resolve to persisted source rows.");
  }
  const [passQ, coverageQ] = await Promise.all([
    db.from("research_passes").select("pass_number,objective,query_count,evidence_count,sufficient,coverage,coverage_gaps,budget_limited").eq("run_id", id).order("pass_number"),
    db.from("research_runs").select("retrieval_sufficient,retrieval_coverage,retrieval_coverage_gaps,retrieval_budget_limited").eq("id", id).single(),
  ]);
  if (passQ.error || coverageQ.error) throw passQ.error || coverageQ.error;
  const structured = {
    opportunity: opp,
    evidence,
    competitors: compQ.data || [],
    risks: riskQ.data || [],
    pricing_model: pricingQ.data,
    mvp_plan: mvpQ.data,
    launch_plan: launchQ.data,
    retrieval: { passes: passQ.data || [], ...coverageQ.data },
  };
  assertNormalizedOpportunityRows(structured);
  const factors = computeFactors({
    evidence,
    risks: riskQ.data || [],
    competitors: compQ.data || [],
    hasPricingModel: !!pricingQ.data,
    launchStrategyCount: launchQ.data?.launch_strategies?.length || 0,
  });
  const weights = (weightQ.data || []).map((w: any) => ({
    criterion: w.criterion,
    weight: Number(w.weight),
  })) as WeightRow[];
  const total = calculateDeterministicScore(factors, weights);
  const verdict = verdictFor(total);
  // Starts early and sees no specialist output; this keeps the one-shot kill attempt
  // inside the existing 115-second phase without consuming Final Judge reserve.
  const adversarialGatePromise = runAdversarialVerdictGate(
    id,
    { total, verdict, factors },
    structured,
    allowed,
    budget,
    db,
  );
  const names = Object.keys(specialistSchemas) as SpecialistName[];
  const outputs: any = {};
  const checkerComparisons: any[] = [];
  const specialistBudgetMs = Number(
    getEnv("REASONING_SPECIALIST_BUDGET_MS") || "90000",
  );
  if (!Number.isFinite(specialistBudgetMs) || specialistBudgetMs <= 0) {
    throw new Error("REASONING_SPECIALIST_BUDGET_MS must be positive.");
  }
  const agentPacingMs = Number(
    getEnv("REASONING_AGENT_PACING_MS") || "8000",
  );
  if (!Number.isFinite(agentPacingMs) || agentPacingMs < 0) {
    throw new Error("REASONING_AGENT_PACING_MS must be zero or greater.");
  }
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    await updateState(
      id,
      "Scoring",
      78 + i * 2,
      `Running ${name[0].toUpperCase() + name.slice(1)} Agent with an isolated independent checker`,
      db,
    );
    const specialistDeadlineMs = Math.min(
      specialistBudgetMs,
      reasoningPhaseBudgetMs - finalJudgeReserveMs,
    );
    let checkerResult: any;
    if (Date.now() - reasoningStartedAt >= specialistDeadlineMs) {
      const error = new Error(
        `Skipped ${name} specialist after the bounded specialist-phase time budget was exhausted.`,
      );
      await logError(id, `reasoning-agent:${name}`, error, db);
      const output = { claims: [], limitations: [error.message] };
      await db.from("reasoning_agent_outputs").upsert({
        run_id: id,
        agent_name: name,
        status: "Incomplete",
        attempt_count: 1,
        payload: output,
      }, { onConflict: "run_id,agent_name" });
      outputs[name] = { status: "Incomplete", output };
      checkerResult = {
        status: "Incomplete",
        attemptCount: 1,
        output: {
          claims: [],
          limitations: ["Checker was not started because the bounded specialist window was exhausted."],
          verdict_direction: "Insufficient",
        },
      };
    } else {
      const isolatedInput = specialistInput(name, structured);
      const checkerEvidenceInput = {
        opportunity: isolatedInput.opportunity,
        evidence: isolatedInput.evidence,
      };
      [outputs[name], checkerResult] = await Promise.all([
        runSpecialist(name, isolatedInput, allowed, id, budget, db),
        runIndependentChecker(name, checkerEvidenceInput, allowed, id, budget, db),
      ]);
    }
    const comparison = compareSpecialistAndChecker(
      name,
      outputs[name],
      checkerResult,
    );
    checkerComparisons.push(comparison);
    const { error: checkerPersistError } = await db.from("specialist_checks").upsert({
      run_id: id,
      specialist_name: name,
      status: checkerResult.status,
      attempt_count: checkerResult.attemptCount || 1,
      specialist_direction: comparison.specialistDirection,
      checker_direction: comparison.checkerDirection,
      disputed: comparison.disputed,
      dispute_reason: comparison.reason,
      checker_payload: checkerResult.output,
    }, { onConflict: "run_id,specialist_name" });
    if (checkerPersistError) throw checkerPersistError;
    if (name === "competition") {
      outputs[name].output.metrics = deterministicCompetitionMetrics(
        compQ.data || [],
      );
      await db.from("reasoning_agent_outputs").update({
        payload: outputs[name].output,
      }).eq("run_id", id).eq("agent_name", name);
    }
    if (
      outputs[name].status === "Complete" && i < names.length - 1 &&
      agentPacingMs > 0
    ) {
      await wait(agentPacingMs);
    }
  }
  await updateState(
    id,
    "Scoring",
    89,
    "Finalizing the one-shot adversarial verdict kill attempt",
    db,
  );
  const adversarialGate = await adversarialGatePromise;
  const gatedVerdict = gateVerdict(verdict, adversarialGate);
  await updateState(
    id,
    "Scoring",
    90,
    "Computing 12-factor score without provider access",
    db,
  );
  if (
    Date.now() - reasoningStartedAt >=
      reasoningPhaseBudgetMs - finalJudgeReserveMs
  ) {
    throw new Error(
      "Reasoning phase exhausted its bounded specialist/scoring window before Final Judge; reserved finalization time was preserved.",
    );
  }
  const citedFactors = factors.filter((f) => f.evidenceIds.length > 0).length;
  const usableEvidence = evidence.filter((e: any) => !e.excluded && e.source_tier !== 4);
  const qualityShare = usableEvidence.length
    ? usableEvidence.filter((e: any) => e.source_tier <= 2).length / usableEvidence.length
    : 0;
  const corroboration = Math.max(0, ...usableEvidence.map((e: any) => Number(e.independent_source_count || 1)));
  let confidence = Math.round(
    citedFactors / factors.length * 55 + qualityShare * 30 + Math.min(1, corroboration / 3) * 15,
  );
  if (!coverageQ.data?.retrieval_sufficient) confidence = Math.min(confidence, 60);
  if (coverageQ.data?.retrieval_budget_limited) confidence = Math.min(confidence, 50);
  const disputedCount = checkerComparisons.filter((item) => item.disputed).length;
  confidence = Math.max(0, confidence - Math.min(30, disputedCount * 5));
  if (checkerComparisons.some((item) => item.checkerDirection === "Unavailable")) {
    confidence = Math.min(confidence, 55);
  }
  if (adversarialGate.outcome === "StrongObjection") confidence = Math.min(confidence, 45);
  if (adversarialGate.outcome === "InsufficientEvidence") confidence = Math.min(confidence, 50);
  const { data: score, error: scoreError } = await db.from("opportunity_scores")
    .upsert({ opportunity_id: opp.id, total, confidence, verdict }, {
      onConflict: "opportunity_id",
    }).select("id").single();
  if (scoreError || !score) {
    throw scoreError || new Error("Score persistence failed");
  }
  await db.from("score_breakdowns").delete().eq("score_id", score.id);
  const breakdowns: any[] = [];
  for (const f of factors) {
    const weight = weights.find((w) => w.criterion === f.criterion)?.weight ??
      0;
    const { data: row, error } = await db.from("score_breakdowns").insert({
      score_id: score.id,
      criterion: f.criterion,
      score: f.score,
      notes: f.note,
      weight,
    }).select("id").single();
    if (error || !row) throw error || new Error("Breakdown insert failed");
    for (const evidence_id of f.evidenceIds) {
      const { error: refError } = await db.from("score_evidence_refs").insert({
        score_breakdown_id: row.id,
        evidence_id,
      });
      if (refError) throw refError;
    }
    breakdowns.push({ ...f, id: row.id, weight });
  }
  if (
    Date.now() - reasoningStartedAt >=
      reasoningPhaseBudgetMs - finalJudgeReserveMs
  ) {
    throw new Error(
      "Reasoning phase reached the reserved Final Judge boundary while persisting deterministic scores.",
    );
  }
  await updateState(
    id,
    "Generating",
    94,
    "Final Judge is writing traceable narrative prose",
    db,
  );
  const judgeInput = {
    specialist_outputs: outputs,
    independent_checks: checkerComparisons,
    adversarial_gate: adversarialGate,
    retrieval_coverage: structured.retrieval,
    effective_verdict_from_code: gatedVerdict.effectiveVerdict,
    deterministic_score: {
      total,
      confidence,
      verdict,
      breakdowns: breakdowns.map((b) => ({
        criterion: b.criterion,
        score: b.score,
        note: b.note,
        evidence_ids: b.evidenceIds,
      })),
    },
  };
  let judge: any;
  let judgeLast: unknown;
  let judgeAttempt = 0;
  const { data: reusableJudge } = await db.from("reasoning_agent_outputs")
    .select("payload,attempt_count").eq("run_id", id).eq(
      "agent_name",
      "final_judge",
    ).eq("status", "Complete").maybeSingle();
  if (reusableJudge?.payload) {
    const parsedJudge = finalJudgeSchema.safeParse(reusableJudge.payload);
    if (parsedJudge.success) {
      assertCitationsBelongToRun(parsedJudge.data, allowed);
      judge = parsedJudge.data;
      judgeAttempt = reusableJudge.attempt_count || 1;
    }
  }
  for (let attempt = 1; !judge && attempt <= 3; attempt++) {
    if (Date.now() - reasoningStartedAt >= reasoningPhaseBudgetMs - 5_000) {
      judgeLast = new Error(
        "Final Judge exhausted the bounded reasoning-phase time budget.",
      );
      break;
    }
    judgeAttempt = attempt;
    try {
      const provider = createAnalysisProvider(attempt >= 2);
      judge = await callProvider(
        id,
        provider,
        "final_judge",
        budget,
        db,
        () =>
          provider.generateStructured(
            'Write concise report prose using only the supplied specialist outputs, independent checks, adversarial gate, and deterministic score. The official verdict is supplied by code; do not improve or soften it. Return exactly this JSON shape with exactly two executive_summary objects and exactly one methodology object: {"written_verdict":"Build Now|Validate First|Niche Down|Weak Signal|Avoid","executive_summary":[{"text":"One sentence.","evidence_ids":["UUID"],"score_criteria":[]},{"text":"One different sentence.","evidence_ids":["UUID"],"score_criteria":["criterionName"]}],"methodology":[{"text":"One sentence.","evidence_ids":["UUID"],"score_criteria":["criterionName"]}]}. Every narrative item must cite at least one exact evidence UUID; score criteria are supplemental and never replace source citations. Surface disputed checks and the adversarial objection rather than resolving them rhetorically. Never output, calculate, restate, or explain a numeric score; describe deterministic results categorically.',
            JSON.stringify(judgeInput),
            finalJudgeSchema,
          ),
        1,
      );
      assertCitationsBelongToRun(judge, allowed);
      break;
    } catch (error) {
      judgeLast = error;
      if (attempt < 3) {
        const delay = retryDelay(error, attempt);
        if (
          Date.now() - reasoningStartedAt + delay >=
            reasoningPhaseBudgetMs - 5_000
        ) break;
        await wait(delay);
      }
    }
  }
  if (!judge) throw judgeLast;
  const citationValidation = validateNarrativeCitations(judge, evidence);
  const { error: citationPersistError } = await db.from("citation_integrity_validations").upsert({
    run_id: id,
    valid: citationValidation.valid,
    claims_checked: citationValidation.claimsChecked,
    claims_removed: citationValidation.claimsRemoved,
    invalid_claims: citationValidation.invalidClaims,
    payload: citationValidation,
  }, { onConflict: "run_id" });
  if (citationPersistError) throw citationPersistError;
  if (!citationValidation.executiveSummary.length) {
    throw new Error(
      "Citation integrity removed every Final Judge conclusion; no sourced narrative remains to support a verdict.",
    );
  }
  if (citationValidation.claimsRemoved > 0) {
    confidence = Math.max(0, confidence - citationValidation.claimsRemoved * 10);
    const { error: confidenceError } = await db.from("opportunity_scores")
      .update({ confidence }).eq("id", score.id);
    if (confidenceError) throw confidenceError;
  }
  await db.from("reasoning_agent_outputs").upsert({
    run_id: id,
    agent_name: "final_judge",
    status: "Complete",
    attempt_count: judgeAttempt,
    payload: judge,
  }, { onConflict: "run_id,agent_name" });
  const verdictConsistency = checkVerdictConsistency(
    verdict,
    gatedVerdict.effectiveVerdict,
    judge.written_verdict,
  );
  const judgeScoreMismatch = verdictConsistency.finalJudgeScoreMismatch;
  const judgeEffectiveMismatch = verdictConsistency.finalJudgeEffectiveMismatch;
  const reasoningFlags: any[] = [
    ...checkerComparisons.filter((item) => item.disputed).map((item) => ({
      type: "DisputedInterpretation",
      severity: "Warning",
      message: `${item.specialist}: ${item.reason}`,
      evidenceIds: [],
    })),
  ];
  if (adversarialGate.outcome === "StrongObjection") {
    reasoningFlags.push({
      type: "AdversarialObjection",
      severity: adversarialGate.unresolved ? "Blocking" : "Warning",
      message: adversarialGate.objection,
      evidenceIds: adversarialGate.evidence_ids,
    });
  } else if (adversarialGate.outcome === "InsufficientEvidence") {
    reasoningFlags.push({
      type: "AdversarialGateIncomplete",
      severity: "Warning",
      message: adversarialGate.objection,
      evidenceIds: [],
    });
  }
  if (judgeScoreMismatch) {
    reasoningFlags.push({
      type: "FinalJudgeVerdictMismatch",
      severity: "Warning",
      message: `Final Judge wrote ${judge.written_verdict}; provider-free scoring mapped ${total} to ${verdict}. The written verdict was not allowed to override code.`,
      evidenceIds: [],
    });
  }
  if (citationValidation.claimsRemoved) {
    reasoningFlags.push({
      type: "CitationIntegrityFailure",
      severity: "Warning",
      message: `${citationValidation.claimsRemoved} unresolvable narrative claim(s) were removed before persistence.`,
      evidenceIds: [],
    });
  }
  const executiveSummaryBase = citationValidation.executiveSummary.map((x: any) => x.text).join(" ");
  const executiveSummary = gatedVerdict.adversarialDowngrade
    ? `${executiveSummaryBase} Decision blocked at Weak Signal until the adversarial objection is resolved.`
    : executiveSummaryBase;
  const gaps = coverageQ.data?.retrieval_coverage_gaps || [];
  const tierOneCount = usableEvidence.filter((e: any) => e.source_tier === 1).length;
  const coverageStatement = coverageQ.data?.retrieval_sufficient
    ? "Retrieval covered problem space, solution space, adversarial evidence, and independent corroboration."
    : `Retrieval incomplete: ${gaps.length ? gaps.join("; ") : "sufficiency was not established"}.`;
  const tierOneTwoCount = usableEvidence.filter((e: any) => e.source_tier <= 2).length;
  const qualityStatement = tierOneCount
    ? `${tierOneCount} Tier 1 willingness-to-pay signal${tierOneCount === 1 ? " was" : "s were"} found; ${tierOneTwoCount} Tier 1/2 evidence rows and up to ${corroboration} independent corroborating sources produced ${confidence}% confidence after integrity modifiers.`
    : `We found discussion but zero willingness-to-pay Tier 1 signals; ${tierOneTwoCount} Tier 1/2 rows and up to ${corroboration} independent corroborating sources limited confidence to ${confidence}%.`;
  const checkerStatement = disputedCount
    ? `${disputedCount} of six specialist interpretations were disputed or not independently reproduced.`
    : "All six specialist directions were independently reproduced by isolated checkers.";
  const gateStatement = adversarialGate.outcome === "StrongObjection"
    ? `Adversarial gate objection: ${adversarialGate.objection}`
    : adversarialGate.objection;
  const verdictIntegrityStatement = judgeScoreMismatch
    ? `Final Judge verdict mismatch: it wrote ${judge.written_verdict}, while provider-free scoring produced ${verdict}; code retained the gated verdict ${gatedVerdict.effectiveVerdict}.`
    : `Final Judge's written verdict was consistent with provider-free scoring${gatedVerdict.adversarialDowngrade ? ", before the explicit adversarial safety downgrade" : ""}.`;
  const citationStatement = citationValidation.claimsRemoved
    ? `${citationValidation.claimsRemoved} narrative claim(s) failed source resolution and were removed.`
    : "All Final Judge narrative claims resolved to persisted evidence and source rows.";
  const methodology = `${citationValidation.methodology.map((x: any) => x.text).join(" ")} ${coverageStatement} ${qualityStatement} ${checkerStatement} ${gateStatement} ${verdictIntegrityStatement} ${citationStatement}`;
  const { data: report, error: reportError } = await db.from("reports").upsert({
    run_id: id,
    opportunity_id: opp.id,
    status: "Published",
    executive_summary: executiveSummary,
    methodology,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "run_id" }).select("id").single();
  if (reportError || !report) {
    throw reportError || new Error("Report persistence failed");
  }
  const { data: lastVersion } = await db.from("report_versions").select(
    "version_number",
  ).eq("report_id", report.id).order("version_number", { ascending: false })
    .limit(1).maybeSingle();
  const version = (lastVersion?.version_number || 0) + 1;
  const marketSizing = groundedMarketSizing(evidence);
  assertGroundedMarketSizing(marketSizing, allowed);
  const payload = {
    id,
    version: "1.0",
    versionNumber: version,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    reasoningFlags,
    specialistDisputes: checkerComparisons,
    adversarialGate,
    citationValidation,
    decisionIntegrity: {
      deterministicVerdict: verdict,
      effectiveVerdict: gatedVerdict.effectiveVerdict,
      finalJudgeWrittenVerdict: judge.written_verdict,
      finalJudgeScoreMismatch: judgeScoreMismatch,
      finalJudgeEffectiveMismatch: judgeEffectiveMismatch,
      adversarialDowngrade: gatedVerdict.adversarialDowngrade,
      reason: gatedVerdict.reason,
    },
    marketSizing,
    retrieval: structured.retrieval,
    opportunity: {
      id: opp.id,
      name: opp.name,
      oneLiner: opp.one_liner,
      targetCustomer: opp.target_customer,
      corePain: opp.core_pain,
      market: opp.market,
      scorecard: {
        scores: Object.fromEntries(factors.map((f) => [f.criterion, f.score])),
        notes: Object.fromEntries(factors.map((f) => [f.criterion, f.note])),
        evidenceRefs: Object.fromEntries(
          factors.map((f) => [f.criterion, f.evidenceIds]),
        ),
        weights: Object.fromEntries(
          weights.map((w) => [w.criterion, w.weight]),
        ),
        total,
        confidence,
        verdict: gatedVerdict.effectiveVerdict,
        deterministicVerdict: verdict,
        decisionStatus: gatedVerdict.adversarialDowngrade ? "Challenged" : "Passed",
      },
      evidence: evidence.map((item: any) => ({
        id: item.id,
        source: item.sources?.title || "Structured evidence",
        sourceType: item.sources?.source_type || "web",
        title: item.title,
        snippet: item.snippet,
        url: item.sources?.url || "",
        signal: item.signal_type,
        strength: item.strength,
        evidenceFamily: item.evidence_family,
        researchPass: item.research_pass,
        sourceTier: item.source_tier,
        excluded: item.excluded,
        disconfirming: item.disconfirming,
        painPoint: item.pain_point,
        independentSourceCount: item.independent_source_count,
        independentDomainCount: item.independent_domain_count,
        date: new Date().toISOString().slice(0, 10),
      })),
      competitors: compQ.data || [],
      pricing: {
        model: pricingQ.data.model,
        pricePoint: pricingQ.data.price_point,
        rationale: pricingQ.data.rationale,
        firstOffer: pricingQ.data.first_offer,
        targetCustomers: pricingQ.data.target_customers,
      },
      mvp: {
        outcome: mvpQ.data.outcome,
        scope: (mvpQ.data.mvp_scope_items || []).filter((item: any) =>
          item.item_type === "Scope"
        ).map((item: any) => item.description),
        exclusions: (mvpQ.data.mvp_scope_items || []).filter((item: any) =>
          item.item_type === "Exclusion"
        ).map((item: any) => item.description),
        buildEstimate: mvpQ.data.build_estimate,
        buildComplexity: mvpQ.data.build_complexity,
      },
      launch: {
        firstCustomerChannel: launchQ.data.first_customer_channel,
        outreachMessage: launchQ.data.outreach_message,
        successMetric: launchQ.data.success_metric,
        weekOne: (launchQ.data.launch_strategies || []).filter((item: any) =>
          item.strategy_type === "WeekOne"
        ).map((item: any) => item.description),
        firstTenStrategy: (launchQ.data.launch_strategies || []).filter((
          item: any,
        ) => item.strategy_type === "FirstTen").map((item: any) =>
          item.description
        ),
      },
      risks: riskQ.data || [],
      createdAt: new Date().toISOString(),
    },
    methodology,
    narrativeCitations: {
      written_verdict: judge.written_verdict,
      executive_summary: citationValidation.executiveSummary,
      methodology: citationValidation.methodology,
    },
    specialistSections: outputs,
  };
  const { data: rv, error: rvError } = await db.from("report_versions").insert({
    report_id: report.id,
    version_number: version,
    payload,
    market_sizing: marketSizing,
    specialist_disputes: checkerComparisons,
    adversarial_gate: adversarialGate,
    citation_validation: citationValidation,
    reasoning_flags: reasoningFlags,
    verdict_score_mismatch: judgeScoreMismatch || gatedVerdict.adversarialDowngrade,
  }).select("id").single();
  if (rvError || !rv) {
    throw rvError || new Error("Report version insert failed");
  }
  await updateState(
    id,
    "Generating",
    97,
    "Generating JSON, Markdown, CSV, and PDF exports",
    db,
  );
  const exportInput: ExportBundleInput = {
    runId: id,
    ideaName: opp.name,
    total,
    verdict: gatedVerdict.effectiveVerdict,
    confidence,
    executiveSummary,
    methodology,
    breakdowns: breakdowns.map((b) => ({
      criterion: b.criterion,
      score: b.score,
      weight: b.weight,
      note: b.note,
      evidenceIds: b.evidenceIds,
    })),
    payload,
  };
  const { data: run } = await db.from("research_runs").select(
    "projects(team_id)",
  ).eq("id", id).single();
  const teamId = run?.projects?.team_id;
  if (!teamId) throw new Error("Unable to resolve export tenant path.");
  const artifacts: any = {
    json: {
      body: new TextEncoder().encode(renderJson(exportInput)),
      type: "application/json",
    },
    markdown: {
      body: new TextEncoder().encode(renderMarkdown(exportInput)),
      type: "text/markdown",
    },
    csv: {
      body: new TextEncoder().encode(renderCsv(exportInput)),
      type: "text/csv",
    },
    pdf: { body: renderPdf(exportInput), type: "application/pdf" },
  };
  for (const [format, file] of Object.entries(artifacts) as any) {
    const ext = format === "markdown" ? "md" : format;
    const path = `${teamId}/${id}/v${version}/report.${ext}`;
    const { error: uploadError } = await db.storage.from("exports").upload(
      path,
      file.body,
      { contentType: file.type, upsert: false },
    );
    if (uploadError) {
      throw new Error(`Failed ${format} export upload: ${uploadError.message}`);
    }
    const digest = await sha256(file.body);
    const { error: metaError } = await db.from("report_exports").insert({
      report_version_id: rv.id,
      format,
      storage_path: path,
      byte_size: file.body.length,
      sha256: digest,
    });
    if (metaError) throw metaError;
  }
  await updateState(
    id,
    "Completed",
    100,
    "Reasoning report and four immutable exports completed",
    db,
  );
  return {
    total,
    verdict: gatedVerdict.effectiveVerdict,
    deterministicVerdict: verdict,
    confidence,
    reportVersionId: rv.id,
  };
}

export async function runReasoningPhase(
  id: string,
  input: ResearchRequest,
  db: any,
  budget?: CostBudget,
) {
  try {
    return await executeReasoningPhase(
      id,
      input,
      db,
      budget || await costBudgetForRun(id, db),
    );
  } catch (error) {
    await logError(id, `reasoning-worker:${id}`, error, db);
    try {
      await updateState(
        id,
        "Failed",
        100,
        error instanceof Error ? error.message : String(error),
        db,
      );
    } catch (stateError) {
      console.error("Failed to persist reasoning terminal state", stateError);
    }
    throw new PipelineError(
      error instanceof Error ? error.message : String(error),
      id,
      { cause: error },
    );
  }
}

export async function runResearchPipeline(
  id: string,
  input: ResearchRequest,
  db?: any,
) {
  try {
    if (!db) {
      throw new Error(
        "A database client is required; offline execution is disabled.",
      );
    }
    const budget = await costBudgetForRun(id, db);
    await acquireAndNormalize(id, input, db, budget);
    return await executeReasoningPhase(id, input, db, budget);
  } catch (error) {
    if (db) {
      await logError(id, `research-worker:${id}`, error, db);
      try {
        await updateState(
          id,
          "Failed",
          100,
          error instanceof Error ? error.message : String(error),
          db,
        );
      } catch (stateError) {
        console.error("Failed to persist terminal state", stateError);
      }
    }
    throw new PipelineError(
      error instanceof Error ? error.message : String(error),
      id,
      { cause: error },
    );
  }
}
