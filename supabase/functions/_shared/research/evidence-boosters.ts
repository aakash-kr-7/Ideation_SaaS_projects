export interface BoosterResult { title: string; url: string; excerpt: string; source: "grounding" | "official_page" | "github" | "hacker_news"; }

export function canonicalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

export async function retrieveOfficialPage(url: string): Promise<BoosterResult | null> {
  const canonical = canonicalizeUrl(url);
  if (!canonical) return null;
  const response = await fetch(canonical, {
    headers: { "User-Agent": "ShouldBuildResearch/1.0", Accept: "text/html,text/plain,application/json" },
    redirect: "follow", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") || "";
  if (!/text|json|html/i.test(type)) return null;
  const body = (await response.text()).slice(0, 200_000);
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  if (text.length < 80) return null;
  return { title: new URL(canonical).hostname, url: canonical, excerpt: text.slice(0, 2_000), source: "official_page" };
}

export async function searchHackerNews(query: string): Promise<BoosterResult[]> {
  const response = await fetch(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return [];
  const payload = await response.json() as { hits?: Array<{ title?: string; url?: string; objectID?: string; story_text?: string }> };
  return (payload.hits || []).flatMap((hit) => {
    const url = canonicalizeUrl(hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`);
    return url && hit.title ? [{ title: hit.title, url, excerpt: (hit.story_text || hit.title).slice(0, 800), source: "hacker_news" as const }] : [];
  });
}

export async function searchGitHub(query: string): Promise<BoosterResult[]> {
  const response = await fetch(`https://api.github.com/search/repositories?per_page=5&q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ShouldBuildResearch/1.0" }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];
  const payload = await response.json() as { items?: Array<{ full_name?: string; html_url?: string; description?: string }> };
  return (payload.items || []).flatMap((item) => {
    const url = item.html_url ? canonicalizeUrl(item.html_url) : null;
    return url && item.full_name ? [{ title: item.full_name, url, excerpt: (item.description || item.full_name).slice(0, 800), source: "github" as const }] : [];
  });
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "::1" || host.endsWith(".local") ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
