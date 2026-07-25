import { getEnv } from "./environment.ts";
import { canonicalizeUrl } from "./evidence-boosters.ts";

export interface ResearchPack {
  key: string;
  query: string;
  focus: string;
}

export interface SourceCandidate {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  queryFamily: string;
  score: number;
}

export interface RetrievedSource extends SourceCandidate {
  canonicalUrl: string;
  text: string;
  sourceTier: number;
  domain: string;
}

type Fetcher = typeof fetch;

export function buildResearchPacks(
  run: { idea_name: string; idea_description: string; target_customer: string; target_region?: string },
  mode: string,
): ResearchPack[] {
  const concept = significantTerms(`${run.idea_name} ${run.idea_description}`).slice(0, 7).join(" ");
  const buyer = significantTerms(run.target_customer).slice(0, 5).join(" ");
  if (mode === "full_validation") {
    return [
      { key: "problem_demand", query: `${concept} ${buyer} pain workflow demand`, focus: "problem, pain, demand, workflows and buyer language" },
      { key: "competition_pricing", query: `${concept} alternatives competitors pricing software`, focus: "competition, alternatives, official pricing and switching friction" },
      { key: "market_gtm", query: `${concept} ${buyer} market segments willingness to pay GTM`, focus: "market context, segments, willingness to pay and go-to-market" },
      { key: "risk_disconfirmation", query: `${concept} failure complaints risks adoption`, focus: "risks, failed alternatives, negative evidence and disconfirmation" },
    ];
  }
  return [{
    key: "quick_scan",
    query: `${concept} ${buyer} alternatives pricing demand complaints`,
    focus: "problem demand, alternatives, pricing and disconfirming evidence",
  }];
}

export async function discoverCandidates(args: {
  runId: string;
  packs: ResearchPack[];
  db: any;
  technical: boolean;
  fetcher?: Fetcher;
}): Promise<{ candidates: SourceCandidate[]; externalSearchCalls: number }> {
  const fetcher = args.fetcher ?? fetch;
  const discovered: SourceCandidate[] = [];
  let externalSearchCalls = 0;
  for (const pack of args.packs) {
    const searches: Array<[string, () => Promise<SourceCandidate[]>]> = [];
    if (getEnv("TAVILY_API_KEY")) searches.push(["tavily", () => searchTavily(pack, fetcher)]);
    if (getEnv("BRAVE_SEARCH_API_KEY")) searches.push(["brave", () => searchBrave(pack, fetcher)]);
    searches.push(["duckduckgo", () => searchDuckDuckGo(pack, fetcher)]);
    searches.push(["wikipedia", () => searchWikipedia(pack, fetcher)]);
    searches.push(["hacker_news", () => searchHackerNews(pack, fetcher)]);
    if (args.technical) searches.push(["github", () => searchGitHub(pack, fetcher)]);
    for (const [provider, search] of searches) {
      const started = Date.now();
      externalSearchCalls++;
      try {
        const results = await search();
        discovered.push(...results);
        await logExternalUsage(args.db, args.runId, provider, `external_search_${pack.key}`, "success", started, true, false);
      } catch (error) {
        await logExternalUsage(args.db, args.runId, provider, `external_search_${pack.key}`, "failed", started, true, false, safeMessage(error));
      }
    }
  }
  const unique = new Map<string, SourceCandidate>();
  for (const item of discovered) {
    const canonical = canonicalizeUrl(item.url);
    if (!canonical) continue;
    const current = unique.get(canonical);
    if (!current || item.score > current.score) unique.set(canonical, { ...item, url: canonical });
  }
  return {
    candidates: diversifyAndRank([...unique.values()]),
    externalSearchCalls,
  };
}

export async function retrieveCandidates(args: {
  runId: string;
  candidates: SourceCandidate[];
  db: any;
  limit: number;
  fetcher?: Fetcher;
}): Promise<{ accepted: RetrievedSource[]; rejected: Record<string, number>; pagesAttempted: number }> {
  const fetcher = args.fetcher ?? fetch;
  const accepted: RetrievedSource[] = [];
  const rejected: Record<string, number> = {};
  const chosen = diversifyAndRank(args.candidates).slice(0, args.limit);
  for (const candidate of chosen) {
    const canonical = canonicalizeUrl(candidate.url);
    if (!canonical) {
      reject("invalid_url");
      await audit(args.db, args.runId, candidate, null, "rejected", "invalid_url");
      continue;
    }
    const started = Date.now();
    try {
      const cached = await readCache(args.db, canonical);
      const fetched = cached || await fetchPage(canonical, fetcher);
      if (!fetched || fetched.text.length < 120) {
        const firecrawl = getEnv("FIRECRAWL_API_KEY") ? await fetchWithFirecrawl(canonical, fetcher) : null;
        if (!firecrawl || firecrawl.text.length < 120) {
          reject("empty_or_unextractable");
          await audit(args.db, args.runId, candidate, canonical, "rejected", "empty_or_unextractable");
          await logExternalUsage(args.db, args.runId, "direct_http", "page_fetch", "failed", started, false, true, "empty_or_unextractable");
          continue;
        }
        await writeCache(args.db, canonical, firecrawl.text, firecrawl.contentType);
        accepted.push(toRetrieved(candidate, canonical, firecrawl.text));
        await logExternalUsage(args.db, args.runId, "firecrawl", "page_fetch_fallback", "success", started, false, true);
      } else {
        if (!cached) await writeCache(args.db, canonical, fetched.text, fetched.contentType);
        accepted.push(toRetrieved(candidate, canonical, fetched.text));
        await logExternalUsage(args.db, args.runId, cached ? "retrieval_cache" : "direct_http", "page_fetch", "success", started, false, true);
      }
      await audit(args.db, args.runId, candidate, canonical, "accepted", null);
    } catch (error) {
      const reason = /timeout/i.test(safeMessage(error)) ? "timeout" : "fetch_error";
      reject(reason);
      await audit(args.db, args.runId, candidate, canonical, "rejected", reason);
      await logExternalUsage(args.db, args.runId, "direct_http", "page_fetch", "failed", started, false, true, reason);
    }
  }
  return { accepted: deduplicateContent(accepted), rejected, pagesAttempted: chosen.length };

  function reject(reason: string) {
    rejected[reason] = (rejected[reason] || 0) + 1;
  }
}

async function searchTavily(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: getEnv("TAVILY_API_KEY"), query: pack.query, max_results: 8, search_depth: "basic" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const body = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
  return (body.results || []).flatMap((item) => item.url ? [{
    title: item.title || item.url,
    url: item.url,
    snippet: item.content || "",
    provider: "tavily",
    queryFamily: pack.key,
    score: 80 + Number(item.score || 0) * 10,
  }] : []);
}

async function searchBrave(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(pack.query)}&count=8`, {
    headers: { Accept: "application/json", "X-Subscription-Token": getEnv("BRAVE_SEARCH_API_KEY") || "" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Brave ${response.status}`);
  const body = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (body.web?.results || []).flatMap((item, index) => item.url ? [{
    title: item.title || item.url,
    url: item.url,
    snippet: item.description || "",
    provider: "brave",
    queryFamily: pack.key,
    score: 85 - index,
  }] : []);
}

async function searchDuckDuckGo(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(pack.query)}`, {
    headers: { "User-Agent": "ShouldBuildResearch/1.0", Accept: "text/html" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`DuckDuckGo ${response.status}`);
  const html = await response.text();
  const matches = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 10);
  return matches.flatMap((match, index) => {
    const raw = decodeHtml(match[1]);
    const redirect = raw.match(/[?&]uddg=([^&]+)/)?.[1];
    const url = redirect ? decodeURIComponent(redirect) : raw;
    const canonical = canonicalizeUrl(url);
    return canonical ? [{
      title: stripHtml(match[2]),
      url: canonical,
      snippet: "",
      provider: "duckduckgo",
      queryFamily: pack.key,
      score: 70 - index,
    }] : [];
  });
}

async function searchWikipedia(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=${encodeURIComponent(pack.query)}`, {
    headers: { "User-Agent": "ShouldBuildResearch/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
  const body = await response.json() as { query?: { search?: Array<{ title: string; snippet?: string }> } };
  return (body.query?.search || []).map((item, index) => ({
    title: item.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(" ", "_"))}`,
    snippet: stripHtml(item.snippet || ""),
    provider: "wikipedia",
    queryFamily: pack.key,
    score: 65 - index,
  }));
}

async function searchHackerNews(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=${encodeURIComponent(pack.query)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Hacker News ${response.status}`);
  const body = await response.json() as { hits?: Array<{ title?: string; url?: string; objectID?: string; story_text?: string }> };
  return (body.hits || []).flatMap((item, index) => {
    const url = item.url || (item.objectID ? `https://news.ycombinator.com/item?id=${item.objectID}` : "");
    return url ? [{
      title: item.title || url,
      url,
      snippet: stripHtml(item.story_text || ""),
      provider: "hacker_news",
      queryFamily: pack.key,
      score: 68 - index,
    }] : [];
  });
}

async function searchGitHub(pack: ResearchPack, fetcher: Fetcher) {
  const query = `${pack.query.split(/\s+/).slice(0, 7).join(" ")} in:name,description`;
  const response = await fetcher(`https://api.github.com/search/repositories?per_page=8&q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ShouldBuildResearch/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const body = await response.json() as { items?: Array<{ full_name?: string; html_url?: string; description?: string; stargazers_count?: number }> };
  return (body.items || []).flatMap((item, index) => item.html_url ? [{
    title: item.full_name || item.html_url,
    url: item.html_url,
    snippet: item.description || "",
    provider: "github",
    queryFamily: pack.key,
    score: 72 + Math.min(8, Math.log10(1 + Number(item.stargazers_count || 0))) - index,
  }] : []);
}

async function fetchPage(url: string, fetcher: Fetcher) {
  const response = await fetcher(url, {
    headers: { "User-Agent": "ShouldBuildResearch/1.0", Accept: "text/html,text/plain,application/json,application/xml,text/xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "text/plain";
  if (!/html|text|json|xml|rss|atom/i.test(contentType)) return null;
  const body = (await response.text()).slice(0, 300_000);
  return { text: extractText(body).slice(0, 12_000), contentType };
}

async function fetchWithFirecrawl(url: string, fetcher: Fetcher) {
  const response = await fetcher("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${getEnv("FIRECRAWL_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const body = await response.json() as { data?: { markdown?: string } };
  return body.data?.markdown ? { text: body.data.markdown.slice(0, 12_000), contentType: "text/markdown" } : null;
}

async function readCache(db: any, canonicalUrl: string) {
  const { data } = await db.from("public_retrieval_cache").select("text_content,content_type,expires_at")
    .eq("canonical_url", canonicalUrl).gt("expires_at", new Date().toISOString()).maybeSingle();
  return data?.text_content ? { text: String(data.text_content), contentType: String(data.content_type || "text/plain") } : null;
}

async function writeCache(db: any, canonicalUrl: string, text: string, contentType: string) {
  const hash = await sha256(text);
  await db.from("public_retrieval_cache").upsert({
    canonical_url: canonicalUrl,
    content_hash: hash,
    text_content: text,
    content_type: contentType,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    extraction_version: "lean-hybrid-v1",
    fetch_status: 200,
  }, { onConflict: "canonical_url" });
}

async function audit(db: any, runId: string, candidate: SourceCandidate, canonicalUrl: string | null, disposition: string, reason: string | null) {
  await db.from("source_retrieval_audit").insert({
    run_id: runId,
    query_family: candidate.queryFamily,
    provider: candidate.provider,
    candidate_url: candidate.url,
    canonical_url: canonicalUrl,
    disposition,
    rejection_reason: reason,
    relevance_score: candidate.score,
    source_domain: canonicalUrl ? new URL(canonicalUrl).hostname : null,
  });
}

export async function logExternalUsage(
  db: any,
  runId: string,
  provider: string,
  operation: string,
  status: "success" | "failed",
  startedAt: number,
  externalSearch: boolean,
  pageFetch: boolean,
  errorMessage: string | null = null,
) {
  const now = new Date();
  await db.from("api_usage_logs").insert({
    run_id: runId,
    provider,
    operation,
    task_type: operation,
    status,
    model: null,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost: 0,
    estimated_cost_usd: 0,
    pricing_version: "external-retrieval-v1-2026-07-25",
    start_time: new Date(startedAt).toISOString(),
    end_time: now.toISOString(),
    duration_ms: now.getTime() - startedAt,
    retry_count: 0,
    error_class: status === "failed" ? "provider" : null,
    error_message: errorMessage,
    cache_status: provider === "retrieval_cache" ? "hit" : "miss",
    grounded_search_requested: false,
    grounding_metadata_present: false,
    external_search: externalSearch,
    page_fetch: pageFetch,
    pipeline_stage: operation,
  });
}

function toRetrieved(candidate: SourceCandidate, canonicalUrl: string, text: string): RetrievedSource {
  const domain = new URL(canonicalUrl).hostname.toLowerCase();
  const official = candidate.provider === "github" || candidate.provider === "wikipedia"
    || /\/pricing(?:\/|$|\?)/i.test(canonicalUrl);
  return { ...candidate, url: canonicalUrl, canonicalUrl, text, domain, sourceTier: official ? 2 : 3 };
}

function diversifyAndRank(candidates: SourceCandidate[]) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const counts = new Map<string, number>();
  return sorted.filter((candidate) => {
    const canonical = canonicalizeUrl(candidate.url);
    if (!canonical) return false;
    const domain = new URL(canonical).hostname;
    const count = counts.get(domain) || 0;
    if (count >= 2) return false;
    counts.set(domain, count + 1);
    return true;
  });
}

function deduplicateContent(sources: RetrievedSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const fingerprint = source.text.toLowerCase().replace(/\W+/g, " ").slice(0, 500);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function significantTerms(value: string) {
  const stop = new Set(["that", "with", "from", "this", "their", "into", "each", "helps", "using", "produce", "would", "could", "should", "about"]);
  return [...new Set(value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])].filter((term) => !stop.has(term));
}

function extractText(body: string) {
  return decodeHtml(body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
