import { getEnv, type SearchProvider } from "./providers.ts";
import type { SearchResult } from "./types.ts";
import { SOURCE_REGISTRY, getRegistryEntryForDomain } from "./source-registry.ts";

export type DiscoveryProviderName = string;

export interface DiscoveryRequest {
  query: string;
  family: string;
  pass: number;
}

export interface DiscoveryProvider {
  name: DiscoveryProviderName;
  enabled(): boolean;
  discover(request: DiscoveryRequest): Promise<SearchResult[]>;
}

export class DiscoveryFailedError extends Error {
  constructor(message: string, public readonly transient: boolean = true) {
    super(message);
    this.name = "DiscoveryFailedError";
  }
}

const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
};

const result = (
  url: string,
  title: string,
  snippet = "",
  sourceType = "web",
): SearchResult => ({
  id: `${sourceType}-${url}`,
  url,
  title: title || "Untitled source",
  snippet,
  source: domain(url),
  sourceType,
});

export class TavilyDiscoveryAdapter implements DiscoveryProvider {
  name = "tavily";
  constructor(private readonly provider: SearchProvider) {}
  enabled() {
    return SOURCE_REGISTRY["tavily"].enabled;
  }
  discover(request: DiscoveryRequest) {
    return this.provider.search(request.query);
  }
}

export class BraveDiscoveryAdapter implements DiscoveryProvider {
  name = "brave";
  enabled() {
    return SOURCE_REGISTRY["brave"].enabled && !!getEnv("BRAVE_SEARCH_API_KEY");
  }
  async discover(request: DiscoveryRequest) {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${
        encodeURIComponent(request.query)
      }&count=10`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": getEnv("BRAVE_SEARCH_API_KEY")!,
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.status === 429) {
      throw new DiscoveryFailedError(`Brave search rate limit`, true);
    }
    if (!response.ok) {
      throw new DiscoveryFailedError(`Brave search failed: ${response.status}`, true);
    }
    const body = await response.json();
    return (body.web?.results || []).map((item: any) =>
      result(item.url, item.title, item.description || "", "brave")
    );
  }
}

export class CommonCrawlDiscoveryAdapter implements DiscoveryProvider {
  name = "common_crawl";
  enabled() {
    return SOURCE_REGISTRY["common_crawl"].enabled;
  }
  async discover(request: DiscoveryRequest) {
    const host = request.query.match(/site:([^\s]+)/i)?.[1];
    if (!host) return [];
    try {
      const response = await fetch(
        `https://index.commoncrawl.org/CC-MAIN-2026-18-index?url=${
          encodeURIComponent(host)
        }/*&output=json&filter=status:200&filter=mime:text/html&collapse=urlkey`,
        { signal: AbortSignal.timeout(12_000) },
      );
      if (!response.ok) return [];
      const lines = (await response.text()).trim().split("\n").slice(0, 20);
      return lines.flatMap((line) => {
        try {
          const row = JSON.parse(line);
          return [
            result(
              row.url,
              row.url,
              "Common Crawl index snapshot",
              "common_crawl",
            ),
          ];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }
}

export class SitemapRssDiscoveryAdapter implements DiscoveryProvider {
  name = "sitemap";
  enabled() {
    return SOURCE_REGISTRY["sitemap_rss"].enabled;
  }
  async discover(request: DiscoveryRequest) {
    const host = request.query.match(/site:([^\s/]+)/i)?.[1];
    if (!host) return [];
    const base = `https://${host}`;
    const urls = [`${base}/sitemap.xml`, `${base}/feed`, `${base}/rss.xml`];
    const found: SearchResult[] = [];
    for (const target of urls) {
      try {
        const response = await fetch(target, {
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/xml,application/rss+xml,text/xml" },
        });
        if (!response.ok) continue;
        const xml = await response.text();
        for (
          const match of xml.matchAll(
            /<(?:loc|link)[^>]*>([^<]+)<\/\s*(?:loc|link)>/gi,
          )
        ) {
          const url = canonicalUrl(match[1].trim());
          if (url) {
            found.push(
              result(url, url, "Sitemap or feed discovery", "sitemap"),
            );
          }
        }
      } catch {
        /* Site feeds are optional and must never block discovery. */
      }
    }
    return dedupeDiscovered(found).slice(0, 50);
  }
}

export class HackerNewsDiscoveryAdapter implements DiscoveryProvider {
  name = "hacker_news";
  enabled() {
    return SOURCE_REGISTRY["hacker_news"].enabled;
  }
  async discover(request: DiscoveryRequest) {
    // Only trigger if HN is mentioned or for problem/solution queries generally
    if (!request.query.includes("ycombinator") && !request.query.includes("hacker news")) {
        // We can optionally still query HN for general terms
        if (request.family !== "problem") return [];
    }
    const term = request.query.replace(/site:news\.ycombinator\.com/g, "").trim();
    if (!term) return [];
    
    try {
      const response = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(term)}&tags=story&hitsPerPage=10`, {
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.hits || []).map((h: any) => 
        result(`https://news.ycombinator.com/item?id=${h.objectID}`, h.title, "Hacker News discussion", "hacker_news")
      );
    } catch {
      return [];
    }
  }
}

export class GitHubDiscoveryAdapter implements DiscoveryProvider {
    name = "github";
    enabled() { return SOURCE_REGISTRY["github"].enabled; }
    async discover(request: DiscoveryRequest) {
      const term = request.query.replace(/site:github\.com/g, "").trim();
      if (!term || (!request.query.includes("github") && request.family !== "solution")) return [];
      try {
        const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(term)}&sort=stars&per_page=5`, {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Pipeline-Integration' },
            signal: AbortSignal.timeout(10000)
        });
        if (response.status === 403 || response.status === 429) return []; // rate limit
        if (!response.ok) return [];
        const data = await response.json();
        return (data.items || []).map((repo: any) => 
          result(repo.html_url, repo.full_name, repo.description, "github")
        );
      } catch {
        return [];
      }
    }
}

export class StackExchangeDiscoveryAdapter implements DiscoveryProvider {
    name = "stack_exchange";
    enabled() { return SOURCE_REGISTRY["stack_exchange"].enabled; }
    async discover(request: DiscoveryRequest) {
        if (!request.query.includes("stack")) return [];
        const term = request.query.replace(/site:stackoverflow\.com/g, "").replace(/site:stackexchange\.com/g, "").trim();
        if (!term) return [];
        try {
            const response = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(term)}&site=stackoverflow&filter=default`, {
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) return [];
            const data = await response.json();
            return (data.items || []).slice(0, 5).map((q: any) => 
                result(q.link, q.title, "StackOverflow question", "stack_exchange")
            );
        } catch {
            return [];
        }
    }
}

export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function dedupeDiscovered(results: SearchResult[]) {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = canonicalUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    item.url = key;
    return true;
  });
}

export async function discoverWithAvailableProviders(
  providers: DiscoveryProvider[],
  request: DiscoveryRequest,
) {
  const activeProviders = providers.filter((p) => p.enabled());
  if (activeProviders.length === 0) {
    throw new DiscoveryFailedError("No discovery providers are enabled", false);
  }

  const settled = await Promise.allSettled(
    activeProviders.map((p) => p.discover(request)),
  );
  
  const results = settled.flatMap((entry) =>
    entry.status === "fulfilled" ? entry.value : []
  );

  const errors = settled.filter((e) => e.status === "rejected").map(e => (e as PromiseRejectedResult).reason);
  
  if (results.length === 0 && errors.length === activeProviders.length) {
    // Complete discovery failure
    const isTransient = errors.some(err => err instanceof DiscoveryFailedError ? err.transient : true);
    throw new DiscoveryFailedError(`Total discovery failure. Errors: ${errors.map(e => e.message).join(', ')}`, isTransient);
  }

  return dedupeDiscovered(results);
}

export interface CandidateRankInput {
  url: string;
  title: string;
  snippet?: string;
  query: string;
  queryFamily?: string | null;
  sourceTier?: number | null;
  domainCount?: number;
  geography?: string;
  publishedAt?: string | null;
  missingFamilies?: string[];
  candidateFamily?: string;
}

/**
 * Transparent pre-fetch score: higher quality/need/directness and lower concentration/cost win.
 */
export function rankCandidate(candidate: CandidateRankInput) {
  const text = `${candidate.title} ${candidate.snippet || ""}`.toLowerCase();
  const terms = candidate.query.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const relevance = Math.min(
    1,
    terms.filter((term) => text.includes(term)).length /
      Math.max(1, terms.length),
  );
  
  const registryEntry = getRegistryEntryForDomain(candidate.url);

  const primary = /\.gov|\.edu|worldbank\.org|sec\.gov|github\.com/i.test(candidate.url) ? 1 : 0;
  const geo = candidate.geography && text.includes(candidate.geography.toLowerCase()) ? 1 : 0.5;
  const recency = candidate.publishedAt && Date.now() - Date.parse(candidate.publishedAt) < 1000 * 60 * 60 * 24 * 730 ? 1 : 0.5;
  
  // Use source registry for default tiers if available
  const effectiveTier = candidate.sourceTier || (registryEntry?.baseTier ?? 3);
  const quality = (5 - effectiveTier) / 4;
  
  // High penalty for same domain concentration (diminishing return)
  const diversityPenalty = Math.min(0.45, Math.max(0, (candidate.domainCount || 0) - 1) * 0.15);
  
  const costPenalty = Math.min(0.2, registryEntry?.estimatedRetrievalCostUsd || 0);
  const success = registryEntry?.historicalSuccessRate ?? 0.5;
  
  // Boost if the candidate provides evidence for a missing family
  const missingFamilyBoost = candidate.missingFamilies?.includes(candidate.candidateFamily || "") ? 0.15 : 0;
  
  // Syndicated/duplicate penalty
  const syndicatedPenalty = /syndicated|republished|press release/i.test(text) ? 0.2 : 0;

  const score = (relevance * 0.25) + 
                (quality * 0.18) + 
                (primary * 0.12) + 
                (geo * 0.08) + 
                (recency * 0.07) + 
                (success * 0.10) + 
                missingFamilyBoost + 
                0.15 - 
                diversityPenalty - 
                costPenalty - 
                syndicatedPenalty;
                
  return {
    score: Math.max(0, Number(score.toFixed(4))),
    relevance,
    diversityPenalty,
    costPenalty,
    primary,
    syndicatedPenalty
  };
}
