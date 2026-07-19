/** Deterministic adapters for integration tests. They implement production I/O contracts, never stage logic. */
import type { z } from "zod";
import type { ResearchDependencies, DiscoveryRequest } from "./dependencies.ts";
import type { SearchResult } from "./types.ts";

function generatePool(size: number, domainsCount: number, mode: "quick_scan" | "full_validation") {
  const pool: SearchResult[] = [];
  const textFeatures = [
    "manual appointment follow-up", // problem
    "RivalBook company is a competitor", // competitor
    "$79 per month", // pricing
    "I would pay gladly for this", // WTP (Tier 1 WTP regex match)
    "no-shows are costly", // high quality
    "market is growing 2B", // market context
    "restrict automation policy", // risk
    "Incumbents address the workflow", // contradiction
    "Failed to scale the local clinic", // failed product
    "Direct outreach through salons", // GTM
  ];
  
  for (let i = 0; i < size; i++) {
    const domainIdx = i % domainsCount;
    const isReject = i % 5 === 0; // some rejects
    const featureIdx = i % textFeatures.length;
    const snippet = isReject ? "Ten unrelated productivity apps. Completely irrelevant listicle." : `Clinic operators report issues with ${textFeatures[featureIdx]}. They mention this daily. I would pay for a solution.`;
    
    // Add deliberate gap token for full validation to trigger gap research
    const finalSnippet = (mode === "full_validation" && i === size - 1) ? snippet + " [GAP_RESOLUTION]" : snippet;

    let urlSuffix = `page-${i}`;
    if (textFeatures[featureIdx].includes("pricing") || textFeatures[featureIdx].includes("$79")) urlSuffix = "pricing";

    pool.push({
      id: `fixture-${mode}-${i}`,
      url: `https://domain-${domainIdx}.example.com/${urlSuffix}`,
      title: `Fixture Page ${i}`,
      source: `domain-${domainIdx}.example.com`,
      snippet: finalSnippet,
      publishedAt: "2026-07-19T00:00:00.000Z",
      sourceType: "web",
    });
  }
  // Add some duplicates
  pool.push(pool[0]);
  pool.push(pool[1]);
  return pool;
}

const QUICK_SCAN_POOL = generatePool(25, 12, "quick_scan"); // 25 sources, 12 domains, with duplicates and rejects (ensures 18+ accepted, 10+ domains)
const FULL_VALIDATION_POOL = generatePool(70, 30, "full_validation"); // 70 sources, 30 domains (ensures 55+ accepted, 25+ domains)



export interface FixtureOptions {
  failSearch?: boolean;
  failExtractUrl?: string;
  malformedGroq?: boolean;
  failGroq?: boolean;
  failCerebras?: boolean;
  failUpload?: boolean;
  failReasoning?: boolean;
  mode?: "quick_scan" | "full_validation";
  runCount?: number; // for tracking calls
}

export function createFixtureDependencies(options: FixtureOptions = {}): ResearchDependencies {
  const isFull = options.mode === "full_validation";
  const candidates = isFull ? FULL_VALIDATION_POOL : QUICK_SCAN_POOL;
  const pageContentMap = Object.fromEntries(candidates.map(c => [c.url, c.snippet]));

  let gapTriggered = false;

  const reasoning = (provider: "groq" | "cerebras") => ({
    async generate<T extends z.ZodTypeAny>(args: any): Promise<z.output<T>> {
      const { systemPrompt = "", userPrompt = "", schema, operation, content, db, runId } = args;
      if ((provider === "groq" && options.failGroq) || (provider === "cerebras" && options.failCerebras)) throw new Error(`${provider} fixture failure`);
      if (provider === "groq" && options.malformedGroq) return schema.parse({ malformed: true });
      
      let id = "00000000-0000-4000-8000-000000000001";
      if (db && runId) {
        const { data } = await db.from("evidence_items").select("id").eq("run_id", runId).limit(1);
        if (data && data.length > 0) id = data[0].id;
      }
      
      const base: any = { 
        claims: [{ claim: "Evidence supports the narrative.", evidence_ids: [id] }, { claim: "Another claim.", evidence_ids: [id] }, { claim: "A third claim.", evidence_ids: [id] }, { claim: "A fourth claim.", evidence_ids: [id] }, { claim: "A fifth claim.", evidence_ids: [id] }], 
        limitations: [], 
        verdict_direction: "Mixed" 
      };
      
      if (/adversarial/i.test(systemPrompt)) return schema.parse({ outcome: "NoStrongDisproof", severity: "None", objection: "Competition raises the bar", evidence_ids: [id] });
      
      if (/Final Judge/i.test(systemPrompt)) return schema.parse({ 
        written_verdict: "Validate First", 
        executive_summary: [{ text: "Demand evidence supports a validation test.", evidence_ids: [id], score_criteria: [] }, { text: "Competition requires a narrow wedge.", evidence_ids: [id], score_criteria: [] }], 
        methodology: [{ text: "The report uses run-scoped cited sources.", evidence_ids: [id], score_criteria: [] }] 
      });
      
      if (/market/i.test(systemPrompt)) base.demand_pattern = "Growing";
      if (/pricing/i.test(systemPrompt)) base.pricing_structure = "Subscription";
      if (/risk/i.test(systemPrompt)) base.risks = [{ category: "Platform", severity: "Medium", claim: "Policy dependency", evidence_ids: [id] }];
      if (/demand/i.test(systemPrompt)) { base.confidence_label = "Medium"; base.contradiction_observation = "Incumbents also address the workflow."; }
      if (/gtm/i.test(systemPrompt)) base.channels = [{ channel: "Direct outreach", rationale: "Operators discuss the pain", evidence_ids: [id] }];
      
      // Deliberate gap resolution for coverage check
      if (/coverage/i.test(systemPrompt)) {
        if (isFull && !gapTriggered) {
          gapTriggered = true;
          return schema.parse({ gaps: ["Missing deliberate GAP_RESOLUTION evidence"] });
        }
        return schema.parse({ gaps: [] });
      }

      if (systemPrompt.includes("Extract up to 6 pain points") || operation === "extract_evidence") {
        const text = String(content || userPrompt || "");
        let signalType: any = "Pain";
        if (/Rival|pricing|\$79/i.test(text)) signalType = "Pricing";
        else if (/risk|policy/i.test(text)) signalType = "Risk";
        else if (/market|growing/i.test(text)) signalType = "Demand";
        
        return schema.parse({ 
          evidence: [{ 
            title: "Fixture finding", 
            snippet: text.slice(0, 220), 
            signal_type: signalType, 
            strength: "High", 
            rationale: "Direct fixture excerpt", 
            pain_point: "manual appointment follow-up", 
            author: null, 
            named_entities: ["RivalBook"], 
            disconfirming: /Incumbent|restrict/i.test(text), 
            market_size_metric: "None", 
            market_size_figure: null 
          }] 
        });
      }
      
      return schema.parse(base);
    },
    async extractEvidence({ chunk }: any) { 
      const text = String(chunk);
      let signalType: any = "Pain";
      if (/Rival|pricing|\$79/i.test(text)) signalType = "Pricing";
      else if (/risk|policy/i.test(text)) signalType = "Risk";
      else if (/market|growing/i.test(text)) signalType = "Demand";
      
      return { 
        evidence: [{ 
          title: "Fixture finding", 
          snippet: text.slice(0, 220), 
          signal_type: signalType, 
          strength: "High" as const, 
          rationale: "Direct fixture excerpt", 
          pain_point: "manual appointment follow-up", 
          author: null, 
          named_entities: ["RivalBook"], 
          disconfirming: /Incumbent|restrict/i.test(text), 
          market_size_metric: "None" as const, 
          market_size_figure: null 
        }] 
      }; 
    },
  });

  const groq = reasoning("groq"), cerebras = reasoning("cerebras");

  return {
    discovery: { 
      name: "fixture-search", 
      async discover(request: DiscoveryRequest) { 
        if (options.failSearch) throw new Error("Tavily fixture failure"); 
        // Make domains unique per query to bypass domain deduplication limits across passes
        const safeQuery = (request.query || "default").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 10);
        const suffix = `--${safeQuery}`;
        return candidates.map(c => ({
          ...c,
          id: c.id + suffix,
          url: c.url.replace(".example.com", `${suffix}.example.com`),
          source: c.source.replace(".example.com", `${suffix}.example.com`),
        }));
      } 
    },
    extraction: { 
      name: "fixture-extractor", 
      async extract(url) { 
        if (url === options.failExtractUrl) throw new Error("429 fixture rate limit"); 
        const baseUrl = url.replace(/--[a-zA-Z0-9]+\.example\.com/, ".example.com");
        if (baseUrl.includes("irrelevant") || baseUrl.includes("reject")) return "Ten unrelated apps. Irrelevant listicle.".repeat(5);
        return pageContentMap[baseUrl] || "Fallback content that is long enough to pass the minimum length checks for extracted text content! This guarantees it will not be rejected as too short."; 
      } 
    },
    embeddings: { 
      name: "fixture-embeddings", 
      lastUsage: { prompt: 8 }, 
      async embed(texts) { return texts.map((_, i) => [1, i % 2, 0.5]); } 
    },
    reasoning: { 
      async generate(args: any) { 
        try { return await groq.generate(args); } 
        catch (groqError) { 
          try { return await cerebras.generate(args); } 
          catch (cerebrasError) { throw new Error(`Structured reasoning failed: ${String(groqError)}; ${String(cerebrasError)}`); } 
        } 
      }, 
      async extractEvidence(args: any) { 
        try { return await groq.extractEvidence(args); } 
        catch (groqError) { 
          try { return await cerebras.extractEvidence(args); } 
          catch (cerebrasError) { throw new Error(`Structured reasoning failed: ${String(groqError)}; ${String(cerebrasError)}`); } 
        } 
      } 
    },
    storage: { 
      async upload(path, bytes) { 
        if (options.failUpload) throw new Error("fixture storage failure"); 
        if (!bytes.length) throw new Error("empty export"); 
        return { path: `fixture/${path}` }; 
      } 
    },
  };
}
