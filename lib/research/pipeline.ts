import { z } from "zod";
import { ValidationReport } from "../report-schema";

declare const Deno: any;
import {
  createSearchProvider,
  createPageExtractor,
  createEmbeddingProvider,
  createAnalysisProvider,
  getEnv,
  finalReportLLMSchema
} from "./providers";
import { ResearchRequest, PipelineRun, ResearchStage, ExtractedSource } from "./types";
import { researchStore } from "./store";
import { defaultWeights, calculateWeightedScore, calculateConfidenceScore, getVerdictFromScore, scoringCriteria } from "../scoring";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry-with-backoff on transient failures
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 1) throw err;
    console.warn(`Transient request failed. Retrying in ${delay}ms... Error:`, err);
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(fn, retries - 1, delay * 2);
  }
}

// Log success/failure cost details per API call to api_usage_logs
async function logApiUsage(
  runId: string,
  provider: string,
  operation: string,
  status: "success" | "failed",
  tokens: { prompt?: number; completion?: number } = {},
  errorMsg?: string,
  supabaseClient?: any
) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from("api_usage_logs").insert({
      run_id: runId,
      provider,
      operation,
      prompt_tokens: tokens.prompt || null,
      completion_tokens: tokens.completion || null,
      status,
      error_message: errorMsg || null
    });
  } catch (err) {
    console.error("Failed to log API usage to database:", err);
  }
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

// Update the database or mock store stage/progress/error_message states
async function updateState(
  id: string,
  stage: ResearchStage,
  progress: number,
  message: string,
  extra: Partial<PipelineRun> = {},
  supabaseClient?: any
) {
  if (supabaseClient) {
    const updateData: any = {
      status: stage,
      progress: progress,
      updated_at: new Date().toISOString()
    };
    if (stage === "Failed") {
      updateData.error_message = message;
    }
    await supabaseClient
      .from("research_runs")
      .update(updateData)
      .eq("id", id);

    if (stage !== "Queued" && stage !== "Cancelled") {
      const isFinal = stage === "Completed" || stage === "Failed";
      if (isFinal) {
        await supabaseClient
          .from("research_stages")
          .update({
            status: stage === "Completed" ? "Completed" : "Failed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("run_id", id)
          .eq("status", "Active");
      } else {
        await supabaseClient
          .from("research_stages")
          .update({
            status: "Completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("run_id", id)
          .eq("status", "Active");

        await supabaseClient
          .from("research_stages")
          .insert({
            run_id: id,
            stage_name: stage,
            status: "Active",
            started_at: new Date().toISOString()
          });
      }
    }
  } else {
    researchStore.update(id, { stage, progress, message, ...extra });
  }
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
  const totalScore = calculateWeightedScore(o.scorecard.scores, defaultWeights);
  const verdict = getVerdictFromScore(totalScore);
  const scorecardIncomplete = {
    scores: o.scorecard.scores,
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
    
    if (!eErr && dbEvidence) {
      insertedEvidenceIdsMap.set(e.id, dbEvidence.id);
    }
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

    if (!bdErr && breakdown) {
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
        await supabaseClient
          .from("score_evidence_refs")
          .insert({
            score_breakdown_id: breakdown.id,
            evidence_id: realEvId
          });
      }
    }
  }

  // 5. Insert Competitors
  for (const comp of o.competitors) {
    await supabaseClient
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
  }

  // 6. Insert Risks
  for (const risk of o.risks) {
    await supabaseClient
      .from("risks")
      .insert({
        opportunity_id: oppId,
        category: risk.category,
        severity: risk.severity,
        description: risk.description,
        mitigation: risk.mitigation
      });
  }

  // 7. Insert Pricing Models
  await supabaseClient
    .from("pricing_models")
    .insert({
      opportunity_id: oppId,
      model: o.pricing.model,
      price_point: o.pricing.pricePoint,
      rationale: o.pricing.rationale,
      first_offer: o.pricing.firstOffer,
      target_customers: o.pricing.targetCustomers
    });

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

  if (!mvpErr && mvpPlan) {
    for (const item of o.mvp.scope) {
      await supabaseClient.from("mvp_scope_items").insert({
        mvp_plan_id: mvpPlan.id,
        item_type: "Scope",
        description: item
      });
    }
    for (const item of o.mvp.exclusions) {
      await supabaseClient.from("mvp_scope_items").insert({
        mvp_plan_id: mvpPlan.id,
        item_type: "Exclusion",
        description: item
      });
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

  if (!launchErr && launchPlan) {
    for (const item of o.launch.weekOne) {
      await supabaseClient.from("launch_strategies").insert({
        launch_plan_id: launchPlan.id,
        strategy_type: "WeekOne",
        description: item
      });
    }
    for (const item of o.launch.firstTenStrategy) {
      await supabaseClient.from("launch_strategies").insert({
        launch_plan_id: launchPlan.id,
        strategy_type: "FirstTen",
        description: item
      });
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

  await supabaseClient
    .from("report_versions")
    .insert({
      report_id: dbReport.id,
      version_number: 1,
      payload: finalReportPayload
    });

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
    // 1. Fail fast on startup check in production
    checkProductionApiKeys();

    const searchProvider = createSearchProvider();
    const pageExtractor = createPageExtractor();
    const embeddingProvider = createEmbeddingProvider();
    let reasoningProvider = createAnalysisProvider(false);

    const isMockRun = searchProvider.name.startsWith("mock");

    // 2. Searching Step
    await updateState(id, "Searching", 10, `Formulating queries for "${input.ideaName}"`, {}, supabaseClient);
    
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

    await updateState(id, "Searching", 20, `Scouting 10+ source categories using Tavily Search`, {}, supabaseClient);

    for (const q of activeQueries) {
      try {
        const results = await fetchWithRetry(() => searchProvider.search(q));
        searchResults.push(...results);
        await logApiUsage(id, searchProvider.name, "search", "success", {}, undefined, supabaseClient);
      } catch (err: any) {
        await logApiUsage(id, searchProvider.name, "search", "failed", {}, err.message || String(err), supabaseClient);
      }
      await wait(500);
    }

    if (searchResults.length === 0) {
      throw new Error("No search results found from the search provider.");
    }

    // 3. Extracting Step
    await updateState(id, "Extracting", 45, `Reading buyer conversations using Firecrawl page extractor`, {}, supabaseClient);

    // Hard Limit: Max 3 unique URLs extracted per run
    const uniqueUrls = [...new Set(searchResults.map(r => r.url))].slice(0, 3);
    const extractedMarkdownContents: Array<{ url: string; title: string; markdown: string; source: string }> = [];

    for (const url of uniqueUrls) {
      try {
        const originalResult = searchResults.find(r => r.url === url);
        const markdown = await fetchWithRetry(() => pageExtractor.extract(url));
        extractedMarkdownContents.push({
          url,
          title: originalResult?.title || "Web Source",
          markdown,
          source: originalResult?.source || "Web"
        });

        // Persist raw source to Postgres database
        if (supabaseClient) {
          const { data: dbSource } = await supabaseClient
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
          
          if (dbSource) {
            originalResult.dbId = dbSource.id;
          }
        }

        await logApiUsage(id, pageExtractor.name, "extract", "success", {}, undefined, supabaseClient);
      } catch (err: any) {
        await logApiUsage(id, pageExtractor.name, "extract", "failed", {}, err.message || String(err), supabaseClient);
      }
      await wait(500);
    }

    if (extractedMarkdownContents.length === 0) {
      throw new Error("Failed to extract content from any retrieved search URLs.");
    }

    // 4. Normalizing Step (Chunk reasoning & deduplication)
    await updateState(id, "Normalizing", 65, `Extracting pain indicators, pricing anchors, and platform risks`, {}, supabaseClient);

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
            extractionRes = await fetchWithRetry(() => reasoningProvider.extractEvidence(input.ideaName, input.targetCustomer, chunk));
            await logApiUsage(id, reasoningProvider.name, "evidence_extraction", "success", {}, undefined, supabaseClient);
          } catch (err) {
            // Fallback Reasoning Provider on Groq Failure
            console.warn("Groq reasoning failed, falling back to OpenRouter:", err);
            reasoningProvider = createAnalysisProvider(true);
            extractionRes = await fetchWithRetry(() => reasoningProvider.extractEvidence(input.ideaName, input.targetCustomer, chunk));
            await logApiUsage(id, reasoningProvider.name, "evidence_extraction", "success", {}, undefined, supabaseClient);
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
          await logApiUsage(id, reasoningProvider.name, "evidence_extraction", "failed", {}, err.message || String(err), supabaseClient);
        }
      }
    }

    if (rawEvidenceRecords.length === 0) {
      throw new Error("No evidence records could be structured from source files.");
    }

    // Embeddings Deduplication
    await updateState(id, "Normalizing", 80, `Deduplicating pain signals and concept overlaps using embeddings`, {}, supabaseClient);
    
    let deduplicatedEvidence: any[] = [];
    try {
      const snippets = rawEvidenceRecords.map(e => e.snippet);
      let embeddings: number[][] = [];
      
      try {
        embeddings = await fetchWithRetry(() => embeddingProvider.embed(snippets));
        await logApiUsage(id, embeddingProvider.name, "embeddings", "success", {}, undefined, supabaseClient);
      } catch (err: any) {
        await logApiUsage(id, embeddingProvider.name, "embeddings", "failed", {}, err.message || String(err), supabaseClient);
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
    await updateState(id, "Scoring", 90, `Assembling verdict and scoring 12 validation dimensions`, {}, supabaseClient);

    let synthesisReport: z.infer<typeof finalReportLLMSchema>;
    try {
      synthesisReport = await fetchWithRetry(() =>
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
        })
      );
      await logApiUsage(id, reasoningProvider.name, "report_synthesis", "success", {}, undefined, supabaseClient);
    } catch (err) {
      console.warn("Groq report synthesis failed, falling back to OpenRouter:", err);
      reasoningProvider = createAnalysisProvider(true);
      synthesisReport = await fetchWithRetry(() =>
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
        })
      );
      await logApiUsage(id, reasoningProvider.name, "report_synthesis", "success", {}, undefined, supabaseClient);
    }

    // 6. Report Assembly Step
    await updateState(id, "Generating", 95, `Structuring final reports and blueprint layout`, {}, supabaseClient);
    await wait(600);

    // Persist full report payload relationally
    if (supabaseClient) {
      const sourceUrlsMap = new Map<string, string>();
      for (const content of extractedMarkdownContents) {
        const originalResult = searchResults.find(r => r.url === content.url);
        if (originalResult?.dbId) {
          sourceUrlsMap.set(content.url, originalResult.dbId);
        }
      }

      await saveReportToDatabase(id, synthesisReport, deduplicatedEvidence, sourceUrlsMap, supabaseClient);
    } else {
      // Offline fallback state update in-memory
      const assembledMockReport: ValidationReport = {
        id: id,
        version: "1.0" as const,
        generatedAt: new Date().toISOString(),
        executiveSummary: synthesisReport.executiveSummary,
        opportunity: {
          id: `opp-${id}`,
          name: synthesisReport.opportunity.name,
          oneLiner: synthesisReport.opportunity.one_liner,
          targetCustomer: synthesisReport.opportunity.target_customer,
          corePain: synthesisReport.opportunity.core_pain,
          market: synthesisReport.opportunity.market,
          scorecard: {
            scores: synthesisReport.opportunity.scorecard.scores,
            notes: synthesisReport.opportunity.scorecard.notes,
            evidenceRefs: {
              painSeverity: deduplicatedEvidence.filter(ev => ev.signal_type === "Pain").map(ev => ev.id),
              purchaseUrgency: deduplicatedEvidence.filter(ev => ev.signal_type === "Pain").map(ev => ev.id),
              willingnessToPay: deduplicatedEvidence.filter(ev => ev.signal_type === "Pricing").map(ev => ev.id),
              buyerReachability: deduplicatedEvidence.filter(ev => ev.signal_type === "Demand").map(ev => ev.id),
              competitionGap: deduplicatedEvidence.filter(ev => ev.signal_type === "Pain").map(ev => ev.id),
              distributionClarity: deduplicatedEvidence.filter(ev => ev.signal_type === "Demand").map(ev => ev.id),
              speedToFirstRevenue: deduplicatedEvidence.filter(ev => ev.signal_type === "Pricing").map(ev => ev.id)
            },
            weights: defaultWeights,
            total: calculateWeightedScore(synthesisReport.opportunity.scorecard.scores, defaultWeights),
            confidence: calculateConfidenceScore({
              scores: synthesisReport.opportunity.scorecard.scores,
              evidenceRefs: {}
            }),
            verdict: getVerdictFromScore(calculateWeightedScore(synthesisReport.opportunity.scorecard.scores, defaultWeights))
          },
          evidence: deduplicatedEvidence.map(e => ({
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
          competitors: synthesisReport.opportunity.competitors.map((c: any, index: number) => ({ id: `c-${index}`, ...c })),
          pricing: {
            model: synthesisReport.opportunity.pricing.model,
            pricePoint: synthesisReport.opportunity.pricing.pricePoint,
            rationale: synthesisReport.opportunity.pricing.rationale,
            firstOffer: synthesisReport.opportunity.pricing.firstOffer,
            targetCustomers: synthesisReport.opportunity.pricing.targetCustomers
          },
          mvp: {
            outcome: synthesisReport.opportunity.mvp.outcome,
            scope: synthesisReport.opportunity.mvp.scope,
            exclusions: synthesisReport.opportunity.mvp.exclusions,
            buildEstimate: synthesisReport.opportunity.mvp.buildEstimate,
            buildComplexity: synthesisReport.opportunity.mvp.buildComplexity
          },
          launch: {
            firstCustomerChannel: synthesisReport.opportunity.launch.firstCustomerChannel,
            weekOne: synthesisReport.opportunity.launch.weekOne,
            outreachMessage: synthesisReport.opportunity.launch.outreachMessage,
            successMetric: synthesisReport.opportunity.launch.successMetric,
            firstTenStrategy: synthesisReport.opportunity.launch.firstTenStrategy
          },
          risks: synthesisReport.opportunity.risks.map((risk: any, index: number) => ({ id: `r-${index}`, ...risk })),
          createdAt: new Date().toISOString()
        },
        methodology: synthesisReport.methodology
      };

      // Wrap EvidenceItem representation
      const mockEvidence = assembledMockReport.opportunity.evidence;
      const mockSources = extractedMarkdownContents.map((content, idx) => ({
        id: `mock-src-${idx}`,
        title: content.title,
        url: content.url,
        source: content.source,
        snippet: content.markdown.slice(0, 300),
        sourceType: "web",
        text: content.markdown,
        date: new Date().toISOString().slice(0, 10)
      }));

      researchStore.update(id, {
        stage: "Completed",
        progress: 100,
        message: "Research memo compiled successfully",
        report: assembledMockReport,
        evidence: mockEvidence as any,
        sources: mockSources
      });
    }

    await updateState(id, "Completed", 100, "Research memo compiled successfully", {}, supabaseClient);
  } catch (error: any) {
    console.error("Pipeline failure:", error);
    await updateState(id, "Failed", 100, error.message || "Unknown pipeline error", {}, supabaseClient);
  }
}
