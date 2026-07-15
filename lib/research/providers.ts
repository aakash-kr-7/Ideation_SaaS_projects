import { z } from "zod";
import { ExtractedSource, SearchResult } from "./types";

declare const Deno: any;

// Helper to get environment variables across Next.js and Deno
export function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get(key);
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

// Zod schema definitions for structured reasoning outputs
export const evidenceItemLLMSchema = z.object({
  title: z.string().min(1),
  snippet: z.string().min(1),
  signal_type: z.enum(["Pain", "Demand", "Pricing", "Risk"]),
  strength: z.enum(["High", "Medium", "Low"]),
  rationale: z.string().min(1)
});

export const evidenceListLLMSchema = z.object({
  evidence: z.array(evidenceItemLLMSchema)
});

export const finalReportLLMSchema = z.object({
  opportunity: z.object({
    name: z.string().min(1),
    one_liner: z.string().min(1),
    target_customer: z.string().min(1),
    core_pain: z.string().min(1),
    market: z.string().min(1),
    scorecard: z.object({
      scores: z.object({
        painSeverity: z.number().min(0).max(100),
        purchaseUrgency: z.number().min(0).max(100),
        willingnessToPay: z.number().min(0).max(100),
        buyerReachability: z.number().min(0).max(100),
        mvpSpeed: z.number().min(0).max(100),
        competitionGap: z.number().min(0).max(100),
        retentionPotential: z.number().min(0).max(100),
        platformDependencyRisk: z.number().min(0).max(100),
        regulatoryRisk: z.number().min(0).max(100),
        founderFit: z.number().min(0).max(100),
        distributionClarity: z.number().min(0).max(100),
        speedToFirstRevenue: z.number().min(0).max(100)
      }),
      notes: z.object({
        painSeverity: z.string().min(1),
        purchaseUrgency: z.string().min(1),
        willingnessToPay: z.string().min(1),
        buyerReachability: z.string().min(1),
        mvpSpeed: z.string().min(1),
        competitionGap: z.string().min(1),
        retentionPotential: z.string().min(1),
        platformDependencyRisk: z.string().min(1),
        regulatoryRisk: z.string().min(1),
        founderFit: z.string().min(1),
        distributionClarity: z.string().min(1),
        speedToFirstRevenue: z.string().min(1)
      })
    }),
    competitors: z.array(z.object({
      name: z.string().min(1),
      positioning: z.string().min(1),
      pricing: z.string().min(1),
      target: z.string().min(1),
      strength: z.string().min(1),
      gap: z.string().min(1)
    })).max(3),
    pricing: z.object({
      model: z.string().min(1),
      pricePoint: z.string().min(1),
      rationale: z.string().min(1),
      firstOffer: z.string().min(1),
      targetCustomers: z.number().int().nonnegative()
    }),
    mvp: z.object({
      outcome: z.string().min(1),
      buildEstimate: z.string().min(1),
      buildComplexity: z.enum(["Low", "Medium", "High"]),
      scope: z.array(z.string()).min(1),
      exclusions: z.array(z.string())
    }),
    launch: z.object({
      firstCustomerChannel: z.string().min(1),
      outreachMessage: z.string().min(1),
      successMetric: z.string().min(1),
      weekOne: z.array(z.string()).min(1),
      firstTenStrategy: z.array(z.string()).min(1)
    }),
    risks: z.array(z.object({
      category: z.enum(["Market", "Execution", "Platform", "Regulatory"]),
      severity: z.enum(["High", "Medium", "Low"]),
      description: z.string().min(1),
      mitigation: z.string().min(1)
    })).max(4)
  }),
  executiveSummary: z.string().min(1),
  methodology: z.string().min(1)
});

// Interfaces
export interface SearchProvider {
  name: string;
  search(query: string): Promise<SearchResult[]>;
}

export interface PageExtractor {
  name: string;
  extract(url: string): Promise<string>;
}

export interface EmbeddingProvider {
  name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface ReasoningProvider {
  name: string;
  extractEvidence(idea: string, customer: string, chunk: string): Promise<z.infer<typeof evidenceListLLMSchema>>;
  synthesizeReport(input: {
    ideaName: string;
    ideaDescription: string;
    targetCustomer: string;
    marketType: string;
    targetRegion: string;
    evidence: Array<{
      title: string;
      snippet: string;
      signal_type: "Pain" | "Demand" | "Pricing" | "Risk";
      strength: "High" | "Medium" | "Low";
      url: string;
      source: string;
    }>;
  }): Promise<z.infer<typeof finalReportLLMSchema>>;
}

// 1. Tavily Search Implementation
export class TavilySearchProvider implements SearchProvider {
  name = "tavily";
  constructor(private apiKey: string) {}

  async search(query: string): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: query,
        search_depth: "basic",
        max_results: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily search request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return (data.results || []).map((r: any, idx: number): SearchResult => ({
      id: `tav-${idx}-${Date.now()}`,
      title: r.title || "Untitled source",
      url: r.url || "",
      source: new URL(r.url).hostname.replace("www.", "") || "web",
      snippet: r.content || "",
      publishedAt: new Date().toISOString(),
      sourceType: "web"
    }));
  }
}

// 2. Firecrawl Scrape Implementation
export class FirecrawlExtractor implements PageExtractor {
  name = "firecrawl";
  constructor(private apiKey: string) {}

  async extract(url: string): Promise<string> {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: url,
        formats: ["markdown"]
      })
    });

    if (!response.ok) {
      throw new Error(`Firecrawl scrape request failed: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();
    if (!res.success || !res.data?.markdown) {
      throw new Error(`Firecrawl failed to scrape: ${res.error || "unknown error"}`);
    }

    return res.data.markdown;
  }
}

// 3. Cohere Embeddings Implementation
export class CohereEmbeddingProvider implements EmbeddingProvider {
  name = "cohere";
  constructor(private apiKey: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    const response = await fetch("https://api.cohere.com/v1/embed", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        texts: texts,
        model: "embed-english-v3.0",
        input_type: "search_document"
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere embedding request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error("Invalid response format from Cohere embeddings API");
    }

    return data.embeddings;
  }
}

// 4. Groq Reasoning Provider
export class GroqReasoningProvider implements ReasoningProvider {
  name = "groq";
  constructor(private apiKey: string) {}

  async extractEvidence(idea: string, customer: string, chunk: string): Promise<z.infer<typeof evidenceListLLMSchema>> {
    const systemPrompt = `You are a critical market validation agent.
Analyze the provided web source text chunk to extract concrete, real-world evidence for validating a startup idea.
Startup Idea Name & Description: "${idea}"
Target Customer: "${customer}"

Look for:
- User complaints, frustrations, or specific pain points (Pain).
- Demand, search queries, buying signals, or requests for solutions (Demand).
- Competitor pricing details, pricing issues, or budget spent (Pricing).
- Execution risks, platform rules, compliance hurdles, or user hesitation (Risk).

Only extract actual quotes or specific facts mentioned in the text. Do not invent or exaggerate signals.
You must output a JSON object containing a list of evidence items. Each item must match this JSON schema:
{
  "evidence": [
    {
      "title": "short descriptive title",
      "snippet": "the exact quote or verbatim excerpt from the text containing the signal",
      "signal_type": "Pain" | "Demand" | "Pricing" | "Risk",
      "strength": "High" | "Medium" | "Low",
      "rationale": "brief reason linking this quote to the idea's validation"
    }
  ]
}
Return only the valid JSON structure.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the text chunk:\n\n${chunk}` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq evidence extraction failed: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();
    const content = res.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty message content returned from Groq");

    const parsed = JSON.parse(content);
    return evidenceListLLMSchema.parse(parsed);
  }

  async synthesizeReport(input: Parameters<ReasoningProvider["synthesizeReport"]>[0]): Promise<z.infer<typeof finalReportLLMSchema>> {
    const systemPrompt = `You are an expert venture planning analyst.
Synthesize a comprehensive market validation report based on the collected real-world evidence items.
Startup Idea Name: "${input.ideaName}"
Description: "${input.ideaDescription}"
Target Customer: "${input.targetCustomer}"
Market Type: "${input.marketType}"
Target Region: "${input.targetRegion}"

Evidence items collected:
${JSON.stringify(input.evidence, null, 2)}

You must analyze this data and generate a structured JSON object representing the final validation report.
For each of the 12 criteria (painSeverity, purchaseUrgency, willingnessToPay, buyerReachability, mvpSpeed, competitionGap, retentionPotential, platformDependencyRisk, regulatoryRisk, founderFit, distributionClarity, speedToFirstRevenue):
- Assign a score from 0 to 100 based on the evidence (for platformDependencyRisk and regulatoryRisk, assign a higher number if the risk is high).
- Write a short note string explaining the score referencing the evidence.

Provide pricing recommendations, a competitor threat audit, risks, a staged MVP blueprint, and launch strategies.
Critically evaluate the evidence for any contradictions or disagreements (e.g. conflicting pricing models, differing views on urgency/pain, or disputes on channels). If a contradiction is detected, document it explicitly as a Risk item of category 'Market' or 'Execution' with a description starting with 'Contradiction: [details]' and a constructive mitigation strategy.
You must output a JSON object matching this schema:
{
  "opportunity": {
    "name": "startup name",
    "one_liner": "one sentence pitch",
    "target_customer": "refined target customer description",
    "core_pain": "the primary verified pain points",
    "market": "e.g. B2B, D2C, etc.",
    "scorecard": {
      "scores": {
        "painSeverity": number, "purchaseUrgency": number, "willingnessToPay": number, "buyerReachability": number, "mvpSpeed": number, "competitionGap": number, "retentionPotential": number, "platformDependencyRisk": number, "regulatoryRisk": number, "founderFit": number, "distributionClarity": number, "speedToFirstRevenue": number
      },
      "notes": {
        "painSeverity": "note...", "purchaseUrgency": "note...", "willingnessToPay": "note...", "buyerReachability": "note...", "mvpSpeed": "note...", "competitionGap": "note...", "retentionPotential": "note...", "platformDependencyRisk": "note...", "regulatoryRisk": "note...", "founderFit": "note...", "distributionClarity": "note...", "speedToFirstRevenue": "note..."
      }
    },
    "competitors": [
      { "name": "name", "positioning": "positioning", "pricing": "pricing", "target": "target audience", "strength": "strengths", "gap": "gaps/weaknesses" }
    ],
    "pricing": {
      "model": "pricing model details", "pricePoint": "recommended price", "rationale": "explanation", "firstOffer": "validation pilot price", "targetCustomers": number
    },
    "mvp": {
      "outcome": "intended MVP outcome", "buildEstimate": "build duration, e.g. 2 weeks", "buildComplexity": "Low" | "Medium" | "High", "scope": ["scope items..."], "exclusions": ["out of scope items..."]
    },
    "launch": {
      "firstCustomerChannel": "outreach channel description", "outreachMessage": "cold template", "successMetric": "success target metric", "weekOne": ["tasks..."], "firstTenStrategy": ["strategies..."]
    },
    "risks": [
      { "category": "Market" | "Execution" | "Platform" | "Regulatory", "severity": "High" | "Medium" | "Low", "description": "risk description", "mitigation": "mitigation strategy" }
    ]
  },
  "executiveSummary": "brief high-level summary of the opportunity viability and recommendation",
  "methodology": "brief description of validation methodology and sources analyzed"
}
Return only the valid JSON structure.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analyze the evidence and compile the validation report." }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq report synthesis failed: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();
    const content = res.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty message content returned from Groq");

    const parsed = JSON.parse(content);
    return finalReportLLMSchema.parse(parsed);
  }
}

// 5. OpenRouter Fallback Reasoning Provider
export class OpenRouterReasoningProvider implements ReasoningProvider {
  name = "openrouter";
  constructor(private apiKey: string) {}

  async extractEvidence(idea: string, customer: string, chunk: string): Promise<z.infer<typeof evidenceListLLMSchema>> {
    const systemPrompt = `You are a critical market validation agent.
Analyze the provided web source text chunk to extract concrete, real-world evidence for validating a startup idea.
Startup Idea Name & Description: "${idea}"
Target Customer: "${customer}"

You must output a JSON object containing a list of evidence items. Each item must match this JSON schema:
{
  "evidence": [
    {
      "title": "short descriptive title",
      "snippet": "the exact quote or verbatim excerpt from the text containing the signal",
      "signal_type": "Pain" | "Demand" | "Pricing" | "Risk",
      "strength": "High" | "Medium" | "Low",
      "rationale": "brief reason linking this quote to the idea's validation"
    }
  ]
}
Return only the valid JSON structure.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SignalFit"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the text chunk:\n\n${chunk}` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter evidence extraction failed: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();
    const content = res.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty message content returned from OpenRouter");

    const parsed = JSON.parse(content);
    return evidenceListLLMSchema.parse(parsed);
  }

  async synthesizeReport(input: Parameters<ReasoningProvider["synthesizeReport"]>[0]): Promise<z.infer<typeof finalReportLLMSchema>> {
    const systemPrompt = `You are an expert venture planning analyst.
Synthesize a comprehensive market validation report based on the collected real-world evidence items.
Startup Idea Name: "${input.ideaName}"
Description: "${input.ideaDescription}"
Target Customer: "${input.targetCustomer}"
Market Type: "${input.marketType}"
Target Region: "${input.targetRegion}"

Evidence items collected:
${JSON.stringify(input.evidence, null, 2)}

Provide pricing recommendations, a competitor threat audit, risks, a staged MVP blueprint, and launch strategies.
Critically evaluate the evidence for any contradictions or disagreements (e.g. conflicting pricing models, differing views on urgency/pain, or disputes on channels). If a contradiction is detected, document it explicitly as a Risk item of category 'Market' or 'Execution' with a description starting with 'Contradiction: [details]' and a constructive mitigation strategy.
You must output a JSON object matching this schema:
{
  "opportunity": {
    "name": "startup name",
    "one_liner": "one sentence pitch",
    "target_customer": "refined target customer description",
    "core_pain": "the primary verified pain points",
    "market": "e.g. B2B, D2C, etc.",
    "scorecard": {
      "scores": {
        "painSeverity": number, "purchaseUrgency": number, "willingnessToPay": number, "buyerReachability": number, "mvpSpeed": number, "competitionGap": number, "retentionPotential": number, "platformDependencyRisk": number, "regulatoryRisk": number, "founderFit": number, "distributionClarity": number, "speedToFirstRevenue": number
      },
      "notes": {
        "painSeverity": "note...", "purchaseUrgency": "note...", "willingnessToPay": "note...", "buyerReachability": "note...", "mvpSpeed": "note...", "competitionGap": "note...", "retentionPotential": "note...", "platformDependencyRisk": "note...", "regulatoryRisk": "note...", "founderFit": "note...", "distributionClarity": "note...", "speedToFirstRevenue": "note..."
      }
    },
    "competitors": [
      { "name": "name", "positioning": "positioning", "pricing": "pricing", "target": "target audience", "strength": "strengths", "gap": "gaps/weaknesses" }
    ],
    "pricing": {
      "model": "pricing model details", "pricePoint": "recommended price", "rationale": "explanation", "firstOffer": "validation pilot price", "targetCustomers": number
    },
    "mvp": {
      "outcome": "intended MVP outcome", "buildEstimate": "build duration, e.g. 2 weeks", "buildComplexity": "Low" | "Medium" | "High", "scope": ["scope items..."], "exclusions": ["out of scope items..."]
    },
    "launch": {
      "firstCustomerChannel": "outreach channel description", "outreachMessage": "cold template", "successMetric": "success target metric", "weekOne": ["tasks..."], "firstTenStrategy": ["strategies..."]
    },
    "risks": [
      { "category": "Market" | "Execution" | "Platform" | "Regulatory", "severity": "High" | "Medium" | "Low", "description": "risk description", "mitigation": "mitigation strategy" }
    ]
  },
  "executiveSummary": "brief high-level summary of the opportunity viability and recommendation",
  "methodology": "brief description of validation methodology and sources analyzed"
}
Return only the valid JSON structure.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SignalFit"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analyze the evidence and compile the validation report." }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter report synthesis failed: ${response.status} ${response.statusText}`);
    }

    const res = await response.json();
    const content = res.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty message content returned from OpenRouter");

    const parsed = JSON.parse(content);
    return finalReportLLMSchema.parse(parsed);
  }
}

// 6. Mock Implementations for Offline Local Fallback
export class MockSearchProvider implements SearchProvider {
  name = "mock-search";
  search(query: string): Promise<SearchResult[]> {
    console.warn(`[WARNING] API keys are missing. Falling back to MockSearchProvider for query: "${query}"`);
    return Promise.resolve([
      {
        id: `mock-1-${Date.now()}`,
        title: `Community feedback on ${query}`,
        url: `https://mock.buildsignal.local/source/reddit`,
        source: "Reddit (mock)",
        snippet: `Users express recurring issues when trying to solve this manually. Excel spreadsheets are the common workaround, but they are highly error-prone.`,
        publishedAt: new Date().toISOString(),
        sourceType: "Community"
      },
      {
        id: `mock-2-${Date.now()}`,
        title: `Pricing pages for adjacent products`,
        url: `https://mock.buildsignal.local/source/pricing`,
        source: "Competitor Page (mock)",
        snippet: `Alternative software platforms charge $49/month per operator, indicating an established willingness to pay for automation in this space.`,
        publishedAt: new Date().toISOString(),
        sourceType: "Pricing"
      }
    ]);
  }
}

export class MockPageExtractor implements PageExtractor {
  name = "mock-extractor";
  extract(url: string): Promise<string> {
    console.warn(`[WARNING] API keys are missing. Falling back to MockPageExtractor for URL: "${url}"`);
    return Promise.resolve(`# Mock Content for ${url}\nThis is a mock text body simulating scraped and extracted markdown content. It discusses the core workflow friction and user workarounds.`);
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  name = "mock-embedding";
  embed(texts: string[]): Promise<number[][]> {
    console.warn(`[WARNING] API keys are missing. Falling back to MockEmbeddingProvider.`);
    return Promise.resolve(texts.map(() => Array.from({ length: 384 }, () => Math.random() - 0.5)));
  }
}

export class MockReasoningProvider implements ReasoningProvider {
  name = "mock-reasoning";
  extractEvidence(idea: string, customer: string, chunk: string): Promise<z.infer<typeof evidenceListLLMSchema>> {
    console.warn(`[WARNING] API keys are missing. Falling back to MockReasoningProvider.extractEvidence.`);
    return Promise.resolve({
      evidence: [
        {
          title: "Spreadsheet workarounds are error-prone",
          snippet: "Excel spreadsheets are the common workaround, but they are highly error-prone.",
          signal_type: "Pain",
          strength: "High",
          rationale: "Confirms that target users are active in searching for error-free automation."
        },
        {
          title: "Competitors charge $49/mo",
          snippet: "Alternative software platforms charge $49/month per operator",
          signal_type: "Pricing",
          strength: "Medium",
          rationale: "Shows budget allocation exists for the problem space."
        }
      ]
    });
  }

  synthesizeReport(input: Parameters<ReasoningProvider["synthesizeReport"]>[0]): Promise<z.infer<typeof finalReportLLMSchema>> {
    console.warn(`[WARNING] API keys are missing. Falling back to MockReasoningProvider.synthesizeReport.`);
    return Promise.resolve({
      opportunity: {
        name: input.ideaName,
        one_liner: `Mock pitch for ${input.ideaName}`,
        target_customer: input.targetCustomer,
        core_pain: "Manual error-prone tracking spreadsheets.",
        market: input.marketType,
        scorecard: {
          scores: {
            painSeverity: 80, purchaseUrgency: 70, willingnessToPay: 75, buyerReachability: 70, mvpSpeed: 85, competitionGap: 72, retentionPotential: 80, platformDependencyRisk: 20, regulatoryRisk: 10, founderFit: 90, distributionClarity: 75, speedToFirstRevenue: 80
          },
          notes: {
            painSeverity: "Pain is highly severe based on manual workbook friction.",
            purchaseUrgency: "High urgency due to month-end deadlines.",
            willingnessToPay: "Budgets are already aligned for spreadsheets.",
            buyerReachability: "Outreach channels are readily identifiable.",
            mvpSpeed: "Can be verified with spreadsheet templates in weeks.",
            competitionGap: "Incumbents ignore custom micro-workflows.",
            retentionPotential: "Core daily recurring routine task.",
            platformDependencyRisk: "Runs independently without heavy platform lock-in.",
            regulatoryRisk: "Standard operating data; no heavy compliance audits required.",
            founderFit: "Equipped to interview pilot buyers.",
            distributionClarity: "Clear outreach paths to online operator groups.",
            speedToFirstRevenue: "Concierge pilots can charge setup costs upfront."
          }
        },
        competitors: [
          { name: "Enterprise SaaS Inc", positioning: "All-in-one platform", pricing: "$150/user/mo", target: "Enterprise", strength: "Broad features", gap: "Overwhelming complexity" },
          { name: "Spreadsheet Workarounds", positioning: "DIY custom spreadsheets", pricing: "Internal labor", target: "Small operators", strength: "Free and customizable", gap: "No automated sync or reporting" }
        ],
        pricing: {
          model: "Subscription", pricePoint: "$49/mo", rationale: "Based on competitor anchor pricing.", firstOffer: "$199 concierge pilot", targetCustomers: 100
        },
        mvp: {
          outcome: "Prove pain reduction through workflow automation.", buildEstimate: "2 weeks", buildComplexity: "Low", scope: ["Core automation link", "CSV intake"], exclusions: ["Integrations", "Auth logs"]
        },
        launch: {
          firstCustomerChannel: "Niche online communities", outreachMessage: "Hey, saw you complain about spreadsheets...", successMetric: "3 signed pilots", weekOne: ["Create landing page", "Cold outreach"], firstTenStrategy: ["Provide concierge service for first 10 customers"]
        },
        risks: [
          { category: "Execution", severity: "Medium", description: "User adoption friction", mitigation: "Provide high-touch setup onboarding service" }
        ]
      },
      executiveSummary: "This mock report viability score is high; recommend validating immediately via pilot interviews.",
      methodology: "Simulated research analysis using local mock providers."
    });
  }
}

// 7. Factory Functions
export function createSearchProvider(): SearchProvider {
  const key = getEnv("TAVILY_API_KEY");
  return key ? new TavilySearchProvider(key) : new MockSearchProvider();
}

export function createPageExtractor(): PageExtractor {
  const key = getEnv("FIRECRAWL_API_KEY");
  return key ? new FirecrawlExtractor(key) : new MockPageExtractor();
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const key = getEnv("COHERE_API_KEY");
  return key ? new CohereEmbeddingProvider(key) : new MockEmbeddingProvider();
}

export function createAnalysisProvider(useFallback = false): ReasoningProvider {
  const groqKey = getEnv("GROQ_API_KEY");
  const orKey = getEnv("OPENROUTER_API_KEY") || getEnv("OPEN_ROUTER_API_KEY");
  
  if (useFallback && orKey) {
    return new OpenRouterReasoningProvider(orKey);
  }
  
  if (groqKey) {
    return new GroqReasoningProvider(groqKey);
  }
  
  return new MockReasoningProvider();
}
