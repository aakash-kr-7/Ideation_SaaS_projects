import { z } from "zod";
declare const Deno: any;
import {
  createSearchProvider,
  createPageExtractor,
  createEmbeddingProvider,
  createAnalysisProvider,
  getEnv,
  finalReportLLMSchema,
  type ProviderUsage,
} from "./providers.ts";
import type { ResearchRequest } from "./types.ts";
import type { ResearchStatus } from "./status.ts";
import type { CriterionScores } from "../types.ts";
import { defaultWeights, calculateWeightedScore, calculateConfidenceScore, getVerdictFromScore, scoringCriteria } from "../scoring.ts";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class PipelineError extends Error {
  constructor(message: string, readonly runId: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PipelineError";
  }
}

class CostBudget {
  private reserved = 0;
  readonly cap = Number(getEnv("RESEARCH_RUN_COST_CAP_USD") || "1.00");

  reserve(estimatedCost: number) {
    if (!Number.isFinite(this.cap) || this.cap <= 0) {
      throw new Error("RESEARCH_RUN_COST_CAP_USD must be a positive number.");
    }
    if (this.reserved + estimatedCost > this.cap) {
      throw new Error(`Per-run provider cost cap of $${this.cap.toFixed(4)} would be exceeded.`);
    }
    this.reserved += estimatedCost;
  }
}

const ESTIMATED_COST_USD: Record<string, number> = {
  tavily: 0.008,
  firecrawl: 0.001,
  cohere: 0.0002,
  groq: 0.02,
  openrouter: 0,
};

// Log success/failure cost details per API call to api_usage_logs
async function logApiUsage(
  runId: string,
  provider: string,
  operation: string,
  status: "success" | "failed",
  tokens: { prompt?: number; completion?: number } = {},
  cost = 0,
  errorMsg?: string,
  supabaseClient?: any,
) {
  const { error } = await supabaseClient.from("api_usage_logs").insert({
      run_id: runId,
      provider,
      operation,
      prompt_tokens: tokens.prompt || null,
      completion_tokens: tokens.completion || null,
      cost,
      status,
      error_message: errorMsg || null
    });
  if (error) throw new Error(`Failed to persist provider usage: ${error.message}`);
}

async function callProvider<T>(
  runId: string,
  provider: { name: string; lastUsage?: ProviderUsage },
  operation: string,
  budget: CostBudget,
  supabaseClient: any,
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  const estimatedCost = ESTIMATED_COST_USD[provider.name] ?? 0;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    budget.reserve(estimatedCost);
    try {
      const result = await fn();
      await logApiUsage(runId, provider.name, operation, "success", provider.lastUsage || {}, estimatedCost, undefined, supabaseClient);
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      await logApiUsage(runId, provider.name, operation, "failed", {}, estimatedCost, message, supabaseClient);
      if (attempt < retries) await wait(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

// Cosine similarity for embeddings deduplication
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fallback Jaccard similarity for character level comparison
function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// Persist both the current run state and an append-only transition row.
async function updateState(
  id: string,
  stage: ResearchStatus,
  progress: number,
  message: string,
  supabaseClient: any,
) {
    const updateData: Record<string, unknown> = {
      status: stage,
      progress: progress,
      updated_at: new Date().toISOString()
    };
    if (stage === "Failed") {
      updateData.error_message = message;
    }
    const { error: runError } = await supabaseClient
      .from("research_runs")
      .update(updateData)
      .eq("id", id);
    if (runError) throw new Error(`Failed to persist run status ${stage}: ${runError.message}`);

    const { data: latestStage, error: latestStageError } = await supabaseClient
      .from("research_stages")
      .select("status")
      .eq("run_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestStageError) throw new Error(`Failed to read stage history: ${latestStageError.message}`);
    if (latestStage?.status === stage) return;

    const now = new Date().toISOString();
    const { error: stageError } = await supabaseClient.from("research_stages").insert({
      run_id: id,
      stage_name: stage,
      status: stage,
      error_message: stage === "Failed" ? message : null,
      started_at: now,
      completed_at: now,
    });
    if (stageError) throw new Error(`Failed to persist stage transition ${stage}: ${stageError.message}`);
}

// Relational DB Persistence Flow
async function saveReportToDatabase(
  runId: string,
  report: z.infer<typeof finalReportLLMSchema>,
  evidenceRecords: any[],
  sourceUrlsMap: Map<string, string>,
  supabaseClient: any
): Promise<any> {
  const o = report.opportunity;

  // 1. Insert Opportunity
  const { data: dbOpp, error: oppErr } = await supabaseClient
    .from("opportunities")
    .insert({
      run_id: runId,
      name: o.name,
      one_liner: o.one_liner,
      target_customer: o.target_customer,
      core_pain: o.core_pain,
      market: o.market
    })
    .select("id")
    .single();
  if (oppErr || !dbOpp) throw oppErr || new Error("Failed to insert opportunity");
  const oppId = dbOpp.id;

  // 2. Insert Scorecard
  const scores = o.scorecard.scores as CriterionScores;
  const totalScore = calculateWeightedScore(scores, defaultWeights);
  const verdict = getVerdictFromScore(totalScore);
  const scorecardIncomplete = {
    scores,
    notes: o.scorecard.notes,
    evidenceRefs: {},
    weights: defaultWeights,
    total: totalScore,
    confidence: 0,
    verdict
  };
  const confidenceScore = calculateConfidenceScore(scorecardIncomplete);

  const { data: score, error: scoreErr } = await supabaseClient
    .from("opportunity_scores")
    .insert({
      opportunity_id: oppId,
      total: totalScore,
      confidence: confidenceScore,
      verdict: verdict
    })
    .select("id")
    .single();
  if (scoreErr || !score) throw scoreErr || new Error("Failed to insert opportunity scorecard");
  const scoreId = score.id;

  // 3. Insert Evidence Items & Map to source_id
  const insertedEvidenceIdsMap = new Map<string, string>();
  for (let i = 0; i < evidenceRecords.length; i++) {
    const e = evidenceRecords[i];
    const sourceDbId = sourceUrlsMap.get(e.url) || null;

    const { data: dbEvidence, error: eErr } = await supabaseClient
      .from("evidence_items")
      .insert({
        run_id: runId,
        opportunity_id: oppId,
        source_id: sourceDbId,
        signal_type: e.signal_type,
        strength: e.strength,
        title: e.title,
        snippet: e.snippet,
        verified: true
      })
      .select("id")
      .single();
    
    if (eErr || !dbEvidence) throw eErr || new Error("Evidence insert returned no row.");
    insertedEvidenceIdsMap.set(e.id, dbEvidence.id);
  }

  // 4. Insert Score Breakdowns & Evidence Refs
  for (const criterion of scoringCriteria) {
    const key = criterion.key;
    const scoreVal = o.scorecard.scores[key] ?? 50;
    const notesVal = o.scorecard.notes[key] ?? "";
    const weightVal = defaultWeights[key];

    const { data: breakdown, error: bdErr } = await supabaseClient
      .from("score_breakdowns")
      .insert({
        score_id: scoreId,
        criterion: key,
        score: scoreVal,
        notes: notesVal,
        weight: weightVal
      })
      .select("id")
      .single();

    if (bdErr || !breakdown) throw bdErr || new Error("Score breakdown insert returned no row.");
    {
      const matchedEvIds = evidenceRecords
        .filter(ev => {
          const type = ev.signal_type;
          if (key === "painSeverity" || key === "purchaseUrgency") return type === "Pain";
          if (key === "willingnessToPay" || key === "speedToFirstRevenue") return type === "Pricing";
          if (key === "platformDependencyRisk" || key === "regulatoryRisk") return type === "Risk";
          if (key === "buyerReachability" || key === "distributionClarity") return type === "Demand";
          return false;
        })
        .map(ev => insertedEvidenceIdsMap.get(ev.id))
        .filter(Boolean) as string[];

      for (const realEvId of matchedEvIds) {
        const { error: refError } = await supabaseClient
          .from("score_evidence_refs")
          .insert({
            score_breakdown_id: breakdown.id,
            evidence_id: realEvId
          });
        if (refError) throw refError;
      }
    }
  }

  // 5. Insert Competitors
  for (const comp of o.competitors) {
    const { error } = await supabaseClient
      .from("competitors")
      .insert({
        opportunity_id: oppId,
        name: comp.name,
        positioning: comp.positioning,
        pricing: comp.pricing,
        target: comp.target,
        strength: comp.strength,
        gap: comp.gap
      });
    if (error) throw error;
  }

  // 6. Insert Risks
  for (const risk of o.risks) {
    const { error } = await supabaseClient
      .from("risks")
      .insert({
        opportunity_id: oppId,
        category: risk.category,
        severity: risk.severity,
        description: risk.description,
        mitigation: risk.mitigation
      });
    if (error) throw error;
  }

  // 7. Insert Pricing Models
  const { error: pricingError } = await supabaseClient
    .from("pricing_models")
    .insert({
      opportunity_id: oppId,
      model: o.pricing.model,
      price_point: o.pricing.pricePoint,
      rationale: o.pricing.rationale,
      first_offer: o.pricing.firstOffer,
      target_customers: o.pricing.targetCustomers
    });
  if (pricingError) throw pricingError;

  // 8. Insert MVP Plans
  const { data: mvpPlan, error: mvpErr } = await supabaseClient
    .from("mvp_plans")
    .insert({
      opportunity_id: oppId,
      outcome: o.mvp.outcome,
      build_estimate: o.mvp.buildEstimate,
      build_complexity: o.mvp.buildComplexity
    })
    .select("id")
    .single();

  if (mvpErr || !mvpPlan) throw mvpErr || new Error("MVP plan insert returned no row.");
  {
    for (const item of o.mvp.scope) {
      const { error } = await supabaseClient.from("mvp_scope_items").insert({
        mvp_plan_id: mvpPlan.id,
        item_type: "Scope",
        description: item
      });
      if (error) throw error;
    }
    for (const item of o.mvp.exclusions) {
      const { error } = await supabaseClient.from("mvp_scope_items").insert({
        mvp_plan_id: mvpPlan.id,
        item_type: "Exclusion",
        description: item
      });
      if (error) throw error;
    }
  }

  // 9. Insert Launch Plans
  const { data: launchPlan, error: launchErr } = await supabaseClient
    .from("launch_plans")
    .insert({
      opportunity_id: oppId,
      first_customer_channel: o.launch.firstCustomerChannel,
      outreach_message: o.launch.outreachMessage,
      success_metric: o.launch.successMetric
    })
    .select("id")
    .single();

  if (launchErr || !launchPlan) throw launchErr || new Error("Launch plan insert returned no row.");
  {
    for (const item of o.launch.weekOne) {
      const { error } = await supabaseClient.from("launch_strategies").insert({
        launch_plan_id: launchPlan.id,
        strategy_type: "WeekOne",
        description: item
      });
      if (error) throw error;
    }
    for (const item of o.launch.firstTenStrategy) {
      const { error } = await supabaseClient.from("launch_strategies").insert({
        launch_plan_id: launchPlan.id,
        strategy_type: "FirstTen",
        description: item
      });
      if (error) throw error;
    }
  }

  // 10. Generate full frontend payload representation to store in report_versions
  const finalReportPayload = {
    id: runId,
    version: "1.0" as const,
    generatedAt: new Date().toISOString(),
    executiveSummary: report.executiveSummary,
    opportunity: {
      id: oppId,
      name: o.name,
      oneLiner: o.one_liner,
      targetCustomer: o.target_customer,
      corePain: o.core_pain,
      market: o.market,
      scorecard: {
        scores: o.scorecard.scores,
        notes: o.scorecard.notes,
        evidenceRefs: {
          painSeverity: evidenceRecords.filter(ev => ev.signal_type === "Pain").map(ev => ev.id),
          purchaseUrgency: evidenceRecords.filter(ev => ev.signal_type === "Pain").map(ev => ev.id),
          willingnessToPay: evidenceRecords.filter(ev => ev.signal_type === "Pricing").map(ev => ev.id),
          buyerReachability: evidenceRecords.filter(ev => ev.signal_type === "Demand").map(ev => ev.id),
          competitionGap: evidenceRecords.filter(ev => ev.signal_type === "Pain").map(ev => ev.id),
          distributionClarity: evidenceRecords.filter(ev => ev.signal_type === "Demand").map(ev => ev.id),
          speedToFirstRevenue: evidenceRecords.filter(ev => ev.signal_type === "Pricing").map(ev => ev.id)
        },
        weights: defaultWeights,
        total: totalScore,
        confidence: confidenceScore,
        verdict: verdict
      },
      evidence: evidenceRecords.map(e => ({
        id: e.id,
        source: e.source,
        sourceType: e.source,
        title: e.title,
        snippet: e.snippet,
        url: e.url,
        signal: e.signal_type,
        strength: e.strength,
        date: new Date().toISOString().slice(0, 10)
      })),
      competitors: o.competitors.map((comp: any, index: number) => ({ id: `c-${index}`, ...comp })),
      pricing: {
        model: o.pricing.model,
        pricePoint: o.pricing.pricePoint,
        rationale: o.pricing.rationale,
        first_offer: o.pricing.firstOffer,
        target_customers: o.pricing.targetCustomers
      },
      mvp: {
        outcome: o.mvp.outcome,
        scope: o.mvp.scope,
        exclusions: o.mvp.exclusions,
        buildEstimate: o.mvp.buildEstimate,
        buildComplexity: o.mvp.buildComplexity
      },
      launch: {
        firstCustomerChannel: o.launch.firstCustomerChannel,
        weekOne: o.launch.weekOne,
        outreachMessage: o.launch.outreachMessage,
        successMetric: o.launch.successMetric,
        firstTenStrategy: o.launch.firstTenStrategy
      },
      risks: o.risks.map((risk: any, index: number) => ({ id: `r-${index}`, ...risk })),
      createdAt: new Date().toISOString()
    },
    methodology: report.methodology
  };

  const { data: dbReport, error: repErr } = await supabaseClient
    .from("reports")
    .insert({
      run_id: runId,
      opportunity_id: oppId,
      status: "Published",
      executive_summary: report.executiveSummary,
      methodology: report.methodology
    })
    .select("id")
    .single();
  if (repErr || !dbReport) throw repErr || new Error("Failed to insert report");

  const { error: versionError } = await supabaseClient
    .from("report_versions")
    .insert({
      report_id: dbReport.id,
      version_number: 1,
      payload: finalReportPayload
    });
  if (versionError) throw versionError;

  return finalReportPayload;
}

// Check if production environment is fully configured
function checkProductionApiKeys() {
  const tavily = getEnv("TAVILY_API_KEY");
  const firecrawl = getEnv("FIRECRAWL_API_KEY");
  const groq = getEnv("GROQ_API_KEY");
  const cohere = getEnv("COHERE_API_KEY");
  
  const isProduction = typeof Deno !== "undefined" || getEnv("NODE_ENV") === "production";
  if (isProduction && (!tavily || !firecrawl || !groq || !cohere)) {
    throw new Error(
      `Fail-fast: Missing required production API keys. Tavily=${!!tavily}, Firecrawl=${!!firecrawl}, Groq=${!!groq}, Cohere=${!!cohere}`
    );
  }
}

// Chunk scraped markdown contents
function chunkContent(text: string, chunkSize = 4000): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    chunks.push(text.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return chunks;
}

// Main runner for pipeline runs
export async function runResearchPipeline(id: string, input: ResearchRequest, supabaseClient?: any) {
  try {
    if (!supabaseClient) throw new Error("A database client is required; offline and mock execution are disabled.");
    // 1. Fail fast on startup check in production
    checkProductionApiKeys();

    const budget = new CostBudget();

    const searchProvider = createSearchProvider();
    const pageExtractor = createPageExtractor();
    const embeddingProvider = createEmbeddingProvider();
    let reasoningProvider = createAnalysisProvider(false);

    // 2. Searching Step
    await updateState(id, "Searching", 10, `Formulating queries for "${input.ideaName}"`, supabaseClient);
    
    // Search queries generated
    const subject = `${input.ideaName} ${input.targetCustomer}`;
    const templates = [
      `${subject} complaints`,
      `${input.ideaName} alternative`,
      `${subject} manual workaround`,
      `${input.ideaName} pricing`,
      `site:reddit.com ${subject}`
    ];
    
    // Hard Limit: Max 5 queries per run
    const activeQueries = templates.slice(0, 5);
    const searchResults: any[] = [];

    await updateState(id, "Searching", 20, `Scouting public sources using Tavily Search`, supabaseClient);

    for (const q of activeQueries) {
      try {
        const results = await callProvider(id, searchProvider, "search", budget, supabaseClient, () => searchProvider.search(q));
        searchResults.push(...results);
      } catch (err: any) {
        console.warn(`Search query failed after retries: ${q}`, err);
      }
      await wait(500);
    }

    if (searchResults.length === 0) {
      throw new Error("No search results found from the search provider.");
    }

    // 3. Extracting Step
    await updateState(id, "Extracting", 45, `Reading buyer conversations using Firecrawl page extractor`, supabaseClient);

    // Hard Limit: Max 3 unique URLs extracted per run
    const uniqueUrls = [...new Set(searchResults.map(r => r.url))].slice(0, 3);
    const extractedMarkdownContents: Array<{ url: string; title: string; markdown: string; source: string }> = [];

    for (const url of uniqueUrls) {
      try {
        const originalResult = searchResults.find(r => r.url === url);
        const markdown = await callProvider(id, pageExtractor, "extract", budget, supabaseClient, () => pageExtractor.extract(url));
        extractedMarkdownContents.push({
          url,
          title: originalResult?.title || "Web Source",
          markdown,
          source: originalResult?.source || "Web"
        });

        // Persist raw source to Postgres database
        if (supabaseClient) {
          const { data: dbSource, error: sourceError } = await supabaseClient
            .from("sources")
            .insert({
              run_id: id,
              title: originalResult?.title || "Web Source",
              url: url,
              source_type: originalResult?.sourceType || "web",
              text_content: markdown.slice(0, 20000) // cap to avoid oversized text content
            })
            .select("id")
            .single();
          if (sourceError || !dbSource) throw sourceError || new Error("Source insert returned no row.");
          if (dbSource) {
            originalResult.dbId = dbSource.id;
          }
        }
      } catch (err: any) {
        console.warn(`Extraction failed after retries: ${url}`, err);
      }
      await wait(500);
    }

    if (extractedMarkdownContents.length === 0) {
      throw new Error("Failed to extract content from any retrieved search URLs.");
    }
    const unpersistedSource = extractedMarkdownContents.find((content) =>
      !searchResults.find((result) => result.url === content.url)?.dbId
    );
    if (unpersistedSource) {
      throw new Error(`Extracted source was not persisted: ${unpersistedSource.url}`);
    }

    // 4. Normalizing Step (Chunk reasoning & deduplication)
    await updateState(id, "Normalizing", 65, `Extracting pain indicators, pricing anchors, and platform risks`, supabaseClient);

    const rawEvidenceRecords: any[] = [];
    let llmCallCount = 0;
    
    // Chunking text and running extraction
    for (const source of extractedMarkdownContents) {
      const chunks = chunkContent(source.markdown, 4000);
      
      for (const chunk of chunks) {
        // Hard Limit: Max 5 LLM calls per run total (save 1 call for final synthesis)
        if (llmCallCount >= 4) break;
        
        try {
          llmCallCount++;
          let extractionRes;
          try {
            extractionRes = await callProvider(id, reasoningProvider, "evidence_extraction", budget, supabaseClient, () => reasoningProvider.extractEvidence(input.ideaName, input.targetCustomer, chunk));
          } catch (err) {
            // Fallback Reasoning Provider on Groq Failure
            console.warn("Groq reasoning failed, falling back to OpenRouter:", err);
            reasoningProvider = createAnalysisProvider(true);
            extractionRes = await callProvider(id, reasoningProvider, "evidence_extraction", budget, supabaseClient, () => reasoningProvider.extractEvidence(input.ideaName, input.targetCustomer, chunk));
          }

          if (extractionRes?.evidence) {
            extractionRes.evidence.forEach((ev: any, idx: number) => {
              rawEvidenceRecords.push({
                id: `ev-${rawEvidenceRecords.length + 1}-${Date.now()}`,
                url: source.url,
                source: source.source,
                ...ev
              });
            });
          }
        } catch (err: any) {
          console.warn("Evidence extraction failed on both primary and fallback providers.", err);
        }
      }
    }

    if (rawEvidenceRecords.length === 0) {
      throw new Error("No evidence records could be structured from source files.");
    }

    // Embeddings Deduplication
    await updateState(id, "Normalizing", 80, `Deduplicating pain signals and concept overlaps using embeddings`, supabaseClient);
    
    let deduplicatedEvidence: any[] = [];
    try {
      const snippets = rawEvidenceRecords.map(e => e.snippet);
      let embeddings: number[][] = [];
      
      try {
        embeddings = await callProvider(id, embeddingProvider, "embeddings", budget, supabaseClient, () => embeddingProvider.embed(snippets));
      } catch (err: any) {
        throw err;
      }

      const uniqueIndices: any[] = [];
      for (let i = 0; i < rawEvidenceRecords.length; i++) {
        let isDup = false;
        for (let j = 0; j < uniqueIndices.length; j++) {
          const sim = cosineSimilarity(embeddings[i], embeddings[uniqueIndices[j].idx]);
          if (sim > 0.85) {
            isDup = true;
            break;
          }
        }
        if (!isDup) {
          uniqueIndices.push({ idx: i, item: rawEvidenceRecords[i] });
        }
      }
      deduplicatedEvidence = uniqueIndices.map(u => u.item);
    } catch (e) {
      // Fallback text Jaccard similarity deduplication on embeddings failure
      console.warn("Embeddings deduplication failed, falling back to string Jaccard similarity.");
      const uniqueItems: any[] = [];
      for (let i = 0; i < rawEvidenceRecords.length; i++) {
        let isDup = false;
        const textA = rawEvidenceRecords[i].snippet.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (let j = 0; j < uniqueItems.length; j++) {
          const textB = uniqueItems[j].snippet.toLowerCase().replace(/[^a-z0-9]/g, "");
          const sim = jaccardSimilarity(textA, textB);
          if (sim > 0.6) {
            isDup = true;
            break;
          }
        }
        if (!isDup) {
          uniqueItems.push(rawEvidenceRecords[i]);
        }
      }
      deduplicatedEvidence = uniqueItems;
    }

    // 5. Scoring & Synthesis Step
    await updateState(id, "Scoring", 90, `Assembling verdict and scoring 12 validation dimensions`, supabaseClient);

    let synthesisReport: z.infer<typeof finalReportLLMSchema>;
    try {
      synthesisReport = await callProvider(id, reasoningProvider, "report_synthesis", budget, supabaseClient, () =>
        reasoningProvider.synthesizeReport({
          ideaName: input.ideaName,
          ideaDescription: input.ideaDescription,
          targetCustomer: input.targetCustomer,
          marketType: input.marketType,
          targetRegion: input.targetRegion,
          evidence: deduplicatedEvidence.map(e => ({
            title: e.title,
            snippet: e.snippet,
            signal_type: e.signal_type,
            strength: e.strength,
            url: e.url,
            source: e.source
          }))
        }),
      );
    } catch (err) {
      console.warn("Groq report synthesis failed, falling back to OpenRouter:", err);
      reasoningProvider = createAnalysisProvider(true);
      synthesisReport = await callProvider(id, reasoningProvider, "report_synthesis", budget, supabaseClient, () =>
        reasoningProvider.synthesizeReport({
          ideaName: input.ideaName,
          ideaDescription: input.ideaDescription,
          targetCustomer: input.targetCustomer,
          marketType: input.marketType,
          targetRegion: input.targetRegion,
          evidence: deduplicatedEvidence.map(e => ({
            title: e.title,
            snippet: e.snippet,
            signal_type: e.signal_type,
            strength: e.strength,
            url: e.url,
            source: e.source
          }))
        }),
      );
    }

    // 6. Report Assembly Step
    await updateState(id, "Generating", 95, `Structuring final reports and blueprint layout`, supabaseClient);
    await wait(600);

    // Persist full report payload relationally
    {
      const sourceUrlsMap = new Map<string, string>();
      for (const content of extractedMarkdownContents) {
        const originalResult = searchResults.find(r => r.url === content.url);
        if (originalResult?.dbId) {
          sourceUrlsMap.set(content.url, originalResult.dbId);
        }
      }

      await saveReportToDatabase(id, synthesisReport, deduplicatedEvidence, sourceUrlsMap, supabaseClient);
    }

    await updateState(id, "Completed", 100, "Research memo compiled successfully", supabaseClient);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Pipeline failure:", error);
    if (supabaseClient) {
      const { data: run } = await supabaseClient.from("research_runs").select("created_by").eq("id", id).maybeSingle();
      await supabaseClient.from("error_logs").insert({
        user_id: run?.created_by || null,
        context: `research-worker:${id}`,
        error_message: message,
        stack_trace: error instanceof Error ? error.stack || null : null,
      });
      try {
        await updateState(id, "Failed", 100, message, supabaseClient);
      } catch (stateError) {
        console.error("Failed to persist terminal run failure:", stateError);
      }
    }
    throw new PipelineError(message, id, { cause: error });
  }
}
