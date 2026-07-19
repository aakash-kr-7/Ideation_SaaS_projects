import { getEnv, type SearchProvider } from "./providers.ts";
import type { SearchResult } from "./types.ts";

export type DiscoveryProviderName = "tavily" | "brave" | "common_crawl" | "sitemap" | "rss" | "github" | "hacker_news" | "structured_api";
export interface DiscoveryRequest { query: string; family: string; pass: number; }
export interface DiscoveryProvider { name: DiscoveryProviderName; enabled(): boolean; discover(request: DiscoveryRequest): Promise<SearchResult[]>; }

const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "web"; } };
const result = (url: string, title: string, snippet = "", sourceType = "web"): SearchResult => ({ id: `${sourceType}-${url}`, url, title: title || "Untitled source", snippet, source: domain(url), sourceType });

export class TavilyDiscoveryAdapter implements DiscoveryProvider {
  name: DiscoveryProviderName = "tavily";
  constructor(private readonly provider: SearchProvider) {}
  enabled() { return true; }
  discover(request: DiscoveryRequest) { return this.provider.search(request.query); }
}
export class BraveDiscoveryAdapter implements DiscoveryProvider {
  name: DiscoveryProviderName = "brave";
  enabled() { return !!getEnv("BRAVE_SEARCH_API_KEY"); }
  async discover(request: DiscoveryRequest) {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(request.query)}&count=10`, { headers: { Accept: "application/json", "X-Subscription-Token": getEnv("BRAVE_SEARCH_API_KEY")! }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);
    const body = await response.json();
    return (body.web?.results || []).map((item: any) => result(item.url, item.title, item.description || "", "brave"));
  }
}
export class CommonCrawlDiscoveryAdapter implements DiscoveryProvider {
  name: DiscoveryProviderName = "common_crawl";
  enabled() { return getEnv("ENABLE_COMMON_CRAWL") !== "false"; }
  async discover(request: DiscoveryRequest) {
    // Index lookup is intentionally limited to explicit site/path queries. It is a free supplement, not a search engine.
    const host = request.query.match(/site:([^\s]+)/i)?.[1];
    if (!host) return [];
    const response = await fetch(`https://index.commoncrawl.org/CC-MAIN-2026-18-index?url=${encodeURIComponent(host)}/*&output=json&filter=status:200&filter=mime:text/html&collapse=urlkey`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return [];
    const lines = (await response.text()).trim().split("\n").slice(0, 20);
    return lines.flatMap((line) => { try { const row = JSON.parse(line); return [result(row.url, row.url, "Common Crawl index snapshot", "common_crawl")]; } catch { return []; } });
  }
}
/** Direct site feeds are low-cost discovery when a query explicitly targets a domain. */
export class SitemapRssDiscoveryAdapter implements DiscoveryProvider {
  name: DiscoveryProviderName = "sitemap";
  enabled() { return getEnv("ENABLE_SITE_FEEDS") !== "false"; }
  async discover(request: DiscoveryRequest) {
    const host = request.query.match(/site:([^\s/]+)/i)?.[1];
    if (!host) return [];
    const base = `https://${host}`;
    const urls = [`${base}/sitemap.xml`, `${base}/feed`, `${base}/rss.xml`];
    const found: SearchResult[] = [];
    for (const target of urls) {
      try {
        const response = await fetch(target, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/xml,application/rss+xml,text/xml" } });
        if (!response.ok) continue;
        const xml = await response.text();
        for (const match of xml.matchAll(/<(?:loc|link)[^>]*>([^<]+)<\/\s*(?:loc|link)>/gi)) {
          const url = canonicalUrl(match[1].trim()); if (url) found.push(result(url, url, "Sitemap or feed discovery", "sitemap"));
        }
      } catch { /* Site feeds are optional and must never block discovery. */ }
    }
    return dedupeDiscovered(found).slice(0, 50);
  }
}

export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw); url.hash = ""; url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch { return null; }
}
export function dedupeDiscovered(results: SearchResult[]) {
  const seen = new Set<string>();
  return results.filter((item) => { const key = canonicalUrl(item.url); if (!key || seen.has(key)) return false; seen.add(key); item.url = key; return true; });
}
export async function discoverWithAvailableProviders(providers: DiscoveryProvider[], request: DiscoveryRequest) {
  const settled = await Promise.allSettled(providers.filter((p) => p.enabled()).map((p) => p.discover(request)));
  return dedupeDiscovered(settled.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []));
}

export interface CandidateRankInput { url: string; title: string; snippet?: string; query: string; queryFamily?: string | null; sourceTier?: number | null; domainCount?: number; geography?: string; publishedAt?: string | null; retrievalCost?: number; historicalSuccess?: number; }
/** Transparent pre-fetch score: higher quality/need/directness and lower concentration/cost win. */
export function rankCandidate(candidate: CandidateRankInput) {
  const text = `${candidate.title} ${candidate.snippet || ""}`.toLowerCase();
  const terms = candidate.query.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const relevance = Math.min(1, terms.filter((term) => text.includes(term)).length / Math.max(1, terms.length));
  const primary = /\.gov|\.edu|worldbank\.org|sec\.gov|github\.com/i.test(candidate.url) ? 1 : 0;
  const geo = candidate.geography && text.includes(candidate.geography.toLowerCase()) ? 1 : 0.5;
  const recency = candidate.publishedAt && Date.now() - Date.parse(candidate.publishedAt) < 1000 * 60 * 60 * 24 * 730 ? 1 : 0.5;
  const quality = candidate.sourceTier ? (5 - candidate.sourceTier) / 4 : 0.5;
  const diversityPenalty = Math.min(0.45, Math.max(0, (candidate.domainCount || 0) - 1) * .12);
  const costPenalty = Math.min(.2, candidate.retrievalCost || 0);
  const success = candidate.historicalSuccess ?? .5;
  const score = relevance * .28 + quality * .18 + primary * .14 + geo * .08 + recency * .07 + success * .12 + .13 - diversityPenalty - costPenalty;
  return { score: Number(score.toFixed(4)), relevance, diversityPenalty, costPenalty, primary };
}
