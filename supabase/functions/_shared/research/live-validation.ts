import {
  discoverWithAvailableProviders,
  rankCandidate,
  TavilyDiscoveryAdapter,
  BraveDiscoveryAdapter,
  CommonCrawlDiscoveryAdapter,
  SitemapRssDiscoveryAdapter,
  HackerNewsDiscoveryAdapter,
  GitHubDiscoveryAdapter,
  StackExchangeDiscoveryAdapter,
} from "./discovery.ts";
import { SOURCE_REGISTRY } from "./source-registry.ts";

const mockProvider = {
  name: "tavily",
  search: async (query: string) => {
    return [
      { url: "https://example.com/1", title: "Test 1", snippet: "Snippet 1", source: "example.com", sourceType: "web", id: "1" },
      { url: "https://github.com/test", title: "Test 2", snippet: "Snippet 2", source: "github.com", sourceType: "web", id: "2" },
    ];
  }
};

const providers = [
  new TavilyDiscoveryAdapter(mockProvider),
  new HackerNewsDiscoveryAdapter(),
  new GitHubDiscoveryAdapter(),
  new StackExchangeDiscoveryAdapter(),
];

const queries = [
  // Quick Scan (3 queries)
  { query: "B2B SaaS churn reduction site:news.ycombinator.com", family: "problem", pass: 1 },
  { query: "CRM software alternatives site:github.com", family: "solution", pass: 1 },
  { query: "database scaling complaints site:stackoverflow.com", family: "problem", pass: 1 },
  
  // Full Validation (2 queries)
  { query: "CRM market size statistics", family: "official_statistics", pass: 2 },
  { query: "Salesforce pricing plans", family: "pricing", pass: 2 },
];

async function runValidation() {
  console.log("=== LIVE VALIDATION START ===");
  
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`\nQuery ${i + 1}: ${q.query} (${q.family})`);
    try {
      const results = await discoverWithAvailableProviders(providers, q);
      console.log(`Discovered ${results.length} results.`);
      
      const ranked = results.map(r => rankCandidate({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        query: q.query,
        candidateFamily: q.family
      }));
      
      const top = ranked.sort((a, b) => b.score - a.score)[0];
      if (top) {
          console.log(`Top Candidate Score: ${top.score.toFixed(3)} | Diversity Penalty: ${top.diversityPenalty.toFixed(3)} | Cost Penalty: ${top.costPenalty.toFixed(3)} | Syndicated: ${top.syndicatedPenalty.toFixed(3)}`);
      }
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
    }
  }
  
  console.log("\n=== LIVE VALIDATION END ===");
}

runValidation();
