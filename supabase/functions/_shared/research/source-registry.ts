export type ExtractionStrategy =
  | "structured_json"
  | "structured_xml"
  | "rss_atom"
  | "domain_parser"
  | "direct_html"
  | "firecrawl_fallback";

export interface SourceRegistryEntry {
  id: string;
  name: string;
  description: string;
  domains: string[]; // Domains this applies to, or empty if it's a generic provider (like Tavily)
  defaultStrategy: ExtractionStrategy;
  baseTier: 1 | 2 | 3 | 4;
  cacheTtlSeconds: number;
  estimatedRetrievalCostUsd: number;
  historicalSuccessRate: number; // 0.0 to 1.0
  rateLimitRequestsPerMinute?: number;
  isDiscoveryProvider: boolean; // Does this source support discovery?
  enabled: boolean;
}

export const SOURCE_REGISTRY: Record<string, SourceRegistryEntry> = {
  github: {
    id: "github",
    name: "GitHub",
    description: "Code repositories, issues, and discussions.",
    domains: ["github.com"],
    defaultStrategy: "domain_parser",
    baseTier: 1,
    cacheTtlSeconds: 6 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.95,
    rateLimitRequestsPerMinute: 30, // Unauthenticated API limit
    isDiscoveryProvider: true,
    enabled: true,
  },
  hacker_news: {
    id: "hacker_news",
    name: "Hacker News",
    description: "Startup community and technical discussions.",
    domains: ["news.ycombinator.com"],
    defaultStrategy: "structured_json",
    baseTier: 2,
    cacheTtlSeconds: 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.9,
    rateLimitRequestsPerMinute: 100, // Algolia is generous
    isDiscoveryProvider: true,
    enabled: true,
  },
  stack_exchange: {
    id: "stack_exchange",
    name: "Stack Exchange",
    description: "Developer Q&A and technical problems.",
    domains: ["stackoverflow.com", "stackexchange.com"],
    defaultStrategy: "structured_json",
    baseTier: 2,
    cacheTtlSeconds: 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.85,
    rateLimitRequestsPerMinute: 30,
    isDiscoveryProvider: true,
    enabled: true,
  },
  world_bank: {
    id: "world_bank",
    name: "World Bank Data",
    description: "Global macro-economic and demographic data.",
    domains: ["worldbank.org", "data.worldbank.org"],
    defaultStrategy: "structured_json",
    baseTier: 1,
    cacheTtlSeconds: 90 * 24 * 60 * 60, // Data rarely changes
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.95,
    isDiscoveryProvider: true,
    enabled: true,
  },
  sec_edgar: {
    id: "sec_edgar",
    name: "SEC EDGAR",
    description: "US public company filings and financial disclosures.",
    domains: ["sec.gov"],
    defaultStrategy: "structured_json", // We'll use the JSON API
    baseTier: 1,
    cacheTtlSeconds: 30 * 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.8, // Can be finicky
    rateLimitRequestsPerMinute: 10,
    isDiscoveryProvider: true,
    enabled: true,
  },
  gdelt: {
    id: "gdelt",
    name: "GDELT Project",
    description: "Global news and events database.",
    domains: ["gdeltproject.org"],
    defaultStrategy: "structured_json", // Uses the GDELT DOC API
    baseTier: 2,
    cacheTtlSeconds: 7 * 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.85,
    isDiscoveryProvider: true,
    enabled: true,
  },
  common_crawl: {
    id: "common_crawl",
    name: "Common Crawl Index",
    description: "Historical web snapshots.",
    domains: [],
    defaultStrategy: "direct_html",
    baseTier: 3,
    cacheTtlSeconds: 90 * 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.6,
    isDiscoveryProvider: true,
    enabled: true,
  },
  sitemap_rss: {
    id: "sitemap_rss",
    name: "Sitemap & RSS Feeds",
    description: "Direct site feeds for content discovery.",
    domains: [],
    defaultStrategy: "rss_atom",
    baseTier: 3,
    cacheTtlSeconds: 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.0,
    historicalSuccessRate: 0.7,
    isDiscoveryProvider: true,
    enabled: true,
  },
  tavily: {
    id: "tavily",
    name: "Tavily Search",
    description: "AI-optimized general web search.",
    domains: [],
    defaultStrategy: "direct_html",
    baseTier: 3,
    cacheTtlSeconds: 30 * 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.005, // Rough estimate per search
    historicalSuccessRate: 0.95,
    isDiscoveryProvider: true,
    enabled: true,
  },
  brave: {
    id: "brave",
    name: "Brave Search",
    description: "General web search fallback.",
    domains: [],
    defaultStrategy: "direct_html",
    baseTier: 3,
    cacheTtlSeconds: 30 * 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.002,
    historicalSuccessRate: 0.9,
    isDiscoveryProvider: true,
    enabled: true,
  },
  firecrawl: {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Heavy DOM/SPA rendering fallback.",
    domains: [],
    defaultStrategy: "firecrawl_fallback",
    baseTier: 3,
    cacheTtlSeconds: 30 * 24 * 60 * 60,
    estimatedRetrievalCostUsd: 0.01,
    historicalSuccessRate: 0.85,
    isDiscoveryProvider: false, // Used for retrieval only
    enabled: true,
  },
};

export function getRegistryEntryForDomain(url: string): SourceRegistryEntry | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const entry of Object.values(SOURCE_REGISTRY)) {
      if (entry.domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
        return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}
