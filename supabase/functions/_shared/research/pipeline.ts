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
  finalJudgeSchema,
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
  await updateState(
    id,
    "Searching",
    15,
    "Searching public evidence with Tavily",
    db,
  );
  const subject = `${input.ideaName} ${input.targetCustomer}`;
  const queries = [
    `${subject} complaints`,
    `${input.ideaName} alternative`,
    `${subject} manual workaround`,
    `${input.ideaName} pricing`,
    `site:reddit.com ${subject}`,
  ];
  const results: any[] = [];
  for (const q of queries) {
    try {
      results.push(
        ...await callProvider(
          id,
          search,
          "search",
          budget,
          db,
          () => search.search(q),
        ),
      );
    } catch (error) {
      console.warn("Search exhausted", q, error);
    }
  }
  if (!results.length) throw new Error("No search results found.");
  await updateState(
    id,
    "Extracting",
    45,
    "Extracting three independently addressable sources with Firecrawl",
    db,
  );
  const extracted: any[] = [];
  for (const url of [...new Set(results.map((r) => r.url))].slice(0, 3)) {
    try {
      const r = results.find((x) => x.url === url);
      const markdown = await callProvider(
        id,
        extractor,
        "extract",
        budget,
        db,
        () => extractor.extract(url),
      );
      const { data: source, error } = await db.from("sources").insert({
        run_id: id,
        title: r?.title || "Web Source",
        url,
        source_type: r?.sourceType || "web",
        text_content: markdown.slice(0, 20000),
      }).select("id").single();
      if (error || !source) throw error || new Error("Source insert failed");
      extracted.push({
        url,
        source: r?.source || "web",
        sourceId: source.id,
        markdown,
      });
    } catch (error) {
      console.warn("Extraction exhausted", url, error);
    }
  }
  if (!extracted.length) throw new Error("No extracted source was persisted.");
  await updateState(
    id,
    "Normalizing",
    62,
    "Structuring evidence into database rows",
    db,
  );
  const raw: any[] = [];
  let calls = 0;
  for (const source of extracted) {
    for (const part of chunk(source.markdown)) {
      if (calls++ >= 4) break;
      try {
        let output;
        try {
          output = await callProvider(
            id,
            reasoner,
            "evidence_extraction",
            budget,
            db,
            () =>
              reasoner.extractEvidence(
                input.ideaName,
                input.targetCustomer,
                part,
              ),
          );
        } catch {
          reasoner = createAnalysisProvider(true);
          output = await callProvider(
            id,
            reasoner,
            "evidence_extraction",
            budget,
            db,
            () =>
              reasoner.extractEvidence(
                input.ideaName,
                input.targetCustomer,
                part,
              ),
          );
        }
        for (const e of output.evidence) {
          raw.push({ ...e, source_id: source.sourceId });
        }
      } catch (error) {
        console.warn("Evidence chunk exhausted", error);
      }
    }
  }
  if (!raw.length) throw new Error("No structured evidence could be produced.");
  await updateState(
    id,
    "Normalizing",
    72,
    "Deduplicating evidence and recording contradiction inputs",
    db,
  );
  let unique = raw;
  try {
    const vectors = await callProvider(
      id,
      embedder,
      "embeddings",
      budget,
      db,
      () => embedder.embed(raw.map((e) => e.snippet)),
    );
    const keep: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (!keep.some((j) => cosine(vectors[i], vectors[j]) > .85)) keep.push(i);
    }
    unique = keep.map((i) => raw[i]);
  } catch (error) {
    console.warn(
      "Embedding dedup unavailable; using exact normalized text",
      error,
    );
    const seen = new Set<string>();
    unique = raw.filter((e) => {
      const k = e.snippet.toLowerCase().replace(/\W/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const { data: opp, error: oppError } = await db.from("opportunities").insert({
    run_id: id,
    name: input.ideaName,
    one_liner: input.ideaDescription.slice(0, 240),
    target_customer: input.targetCustomer,
    core_pain: unique.find((e) => e.signal_type === "Pain")?.title ||
      "Evidence is incomplete",
    market: input.marketType,
  }).select("id").single();
  if (oppError || !opp) {
    throw oppError || new Error("Opportunity insert failed");
  }
  for (const [index, e] of unique.entries()) {
    const { error } = await db.from("evidence_items").insert({
      run_id: id,
      opportunity_id: opp.id,
      source_id: e.source_id,
      signal_type: e.signal_type,
      strength: e.strength,
      title: e.title,
      snippet: e.snippet,
      verified: true,
      cluster_key: `cluster-${index + 1}`,
      supporting_count: 1,
      contradicting_count: 0,
      confidence: e.strength === "High"
        ? .85
        : e.strength === "Medium"
        ? .65
        : .45,
    });
    if (error) throw error;
  }
}

function specialistContract(name: SpecialistName) {
  const claims =
    '"claims":[{"claim":"One concise sentence.","evidence_ids":["UUID"]}],"limitations":[]';
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
  }. Replace example values with supported values from the input. Allowed enums: demand_pattern=Growing|Stable|Seasonal|Declining|Unknown; pricing_structure=Subscription|Usage|One-time|Service|Mixed|Unknown; risk category=Market|Execution|Platform|Regulatory; severity and confidence_label=High|Medium|Low. Every array item must be an object using exactly the shown field names. Return at most three claims, three risks, and three channels. Keep every claim, rationale, limitation, and observation to one concise sentence. Every claim, risk, and channel must cite one or more exact evidence_items UUIDs from the input. Never output a numeric score, rating number, probability, percentage, market-size estimate, competitor count, average price, or other score-like number. Categorical labels are allowed. If the evidence does not support a claim, omit it and describe the limitation.\n\nSTRUCTURED INPUT:\n${
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
    signals[name].includes(item.signal_type)
  );
  const evidence = (candidates.length ? candidates : structured.evidence)
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
    const provider: ReasoningProvider = createAnalysisProvider(attempt === 3);
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
  const [evQ, compQ, riskQ, pricingQ, mvpQ, launchQ, weightQ] = await Promise
    .all([
      db.from("evidence_items").select(
        "id,source_id,signal_type,strength,title,snippet,verified,cluster_key,supporting_count,contradicting_count,confidence,sources(title,url,source_type)",
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
  const allowed = new Set<string>(evidence.map((e: any) => e.id));
  const structured = {
    opportunity: opp,
    evidence,
    competitors: compQ.data || [],
    risks: riskQ.data || [],
    pricing_model: pricingQ.data,
    mvp_plan: mvpQ.data,
    launch_plan: launchQ.data,
  };
  const names = Object.keys(specialistSchemas) as SpecialistName[];
  const outputs: any = {};
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
      `Running ${name[0].toUpperCase() + name.slice(1)} Agent`,
      db,
    );
    const specialistDeadlineMs = Math.min(
      specialistBudgetMs,
      reasoningPhaseBudgetMs - finalJudgeReserveMs,
    );
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
    } else {
      outputs[name] = await runSpecialist(
        name,
        specialistInput(name, structured),
        allowed,
        id,
        budget,
        db,
      );
    }
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
  const citedFactors = factors.filter((f) => f.evidenceIds.length > 0).length;
  const confidence = Math.round(citedFactors / factors.length * 100);
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
  for (let attempt = 1; attempt <= 3; attempt++) {
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
            'Write concise report prose using only the supplied specialist outputs and deterministic score. Return exactly this JSON shape with exactly two executive_summary objects and exactly one methodology object: {"executive_summary":[{"text":"One sentence.","evidence_ids":["UUID"],"score_criteria":[]},{"text":"One different sentence.","evidence_ids":[],"score_criteria":["criterionName"]}],"methodology":[{"text":"One sentence.","evidence_ids":[],"score_criteria":["criterionName"]}]}. Every array item must be an object, never a string. Each item must contain text, evidence_ids, and score_criteria, with at least one non-empty citation array. Cite only IDs and criteria present in the input. Never output, calculate, restate, or explain a numeric score; describe deterministic results categorically.',
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
  await db.from("reasoning_agent_outputs").upsert({
    run_id: id,
    agent_name: "final_judge",
    status: "Complete",
    attempt_count: judgeAttempt,
    payload: judge,
  }, { onConflict: "run_id,agent_name" });
  const executiveSummary = judge.executive_summary.map((x: any) => x.text).join(
      " ",
    ),
    methodology = judge.methodology.map((x: any) => x.text).join(" ");
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
  const payload = {
    id,
    version: "1.0",
    versionNumber: version,
    generatedAt: new Date().toISOString(),
    executiveSummary,
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
        verdict,
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
        date: new Date().toISOString().slice(0, 10),
      })),
      competitors: compQ.data || [],
      pricing: pricingQ.data
        ? {
          model: pricingQ.data.model,
          pricePoint: pricingQ.data.price_point,
          rationale: pricingQ.data.rationale,
          firstOffer: pricingQ.data.first_offer,
          targetCustomers: pricingQ.data.target_customers,
        }
        : {
          model: "Incomplete",
          pricePoint: "Not established",
          rationale: "No normalized pricing model was available for this run.",
          firstOffer: "Not established",
          targetCustomers: 0,
        },
      mvp: mvpQ.data
        ? {
          outcome: mvpQ.data.outcome,
          scope: (mvpQ.data.mvp_scope_items || []).filter((item: any) =>
            item.item_type === "Scope"
          ).map((item: any) => item.description),
          exclusions: (mvpQ.data.mvp_scope_items || []).filter((item: any) =>
            item.item_type === "Exclusion"
          ).map((item: any) => item.description),
          buildEstimate: mvpQ.data.build_estimate,
          buildComplexity: mvpQ.data.build_complexity,
        }
        : {
          outcome: "Incomplete: no normalized MVP plan was available.",
          scope: ["Incomplete: no normalized MVP scope was available."],
          exclusions: [],
          buildEstimate: "Not established",
          buildComplexity: "High",
        },
      launch: launchQ.data
        ? {
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
        }
        : {
          firstCustomerChannel: "Incomplete",
          outreachMessage: "No normalized launch plan was available.",
          successMetric: "Not established",
          weekOne: ["Incomplete: no normalized launch strategy was available."],
          firstTenStrategy: [],
        },
      risks: riskQ.data || [],
      createdAt: new Date().toISOString(),
    },
    methodology,
    narrativeCitations: judge,
    specialistSections: outputs,
  };
  const { data: rv, error: rvError } = await db.from("report_versions").insert({
    report_id: report.id,
    version_number: version,
    payload,
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
    verdict,
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
  return { total, verdict, confidence, reportVersionId: rv.id };
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
