import { getEnv } from "./environment.ts";
import { canonicalizeUrl } from "./evidence-boosters.ts";
import {
  assessSemanticRelevance,
  type CanonicalResearchBrief,
  classifyPageAuthority,
  type PageAuthority,
  type RelevanceAssessment,
} from "./research-brief.ts";
import { buildFullValidationPacks } from "./full-validation-research-strategy.ts";
import { sanitizeUntrustedWebContent } from "./adversarial-investigation.ts";

export interface ResearchPack {
  key: string;
  query: string;
  focus: string;
  purpose?:
    | "primary"
    | "adversarial"
    | "pricing_wtp"
    | "coverage_repair"
    | "buyer_problem"
    | "alternatives_competitors"
    | "reachability"
    | "feasibility";
  conditionalTrigger?: string;
  investigationPass?: "prosecution" | "defense";
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
  publisher: string;
  sourceClass:
    | "primary"
    | "secondary"
    | "community"
    | "official"
    | "commercial";
  extractionMethod: "direct_http" | "retrieval_cache" | "firecrawl";
  retrievalDate: string;
  relevance: RelevanceAssessment;
  authority: PageAuthority;
  publishedOrUpdatedDate?: string | null;
  extractionLimitations?: string[];
  hostileTextDetected?: boolean;
}

type Fetcher = typeof fetch;
const redditSearchCache = new Map<string, {
  expiresAt: number;
  results: SourceCandidate[];
}>();

export function buildResearchPacks(
  run: {
    idea_name: string;
    idea_description: string;
    target_customer: string;
    target_region?: string;
  },
  mode: string,
  brief?: CanonicalResearchBrief,
): ResearchPack[] {
  const approvalAudit = /approval|sign-?off|audit trail/i.test(
    `${brief?.exactProductProposition || ""} ${
      brief?.directCompetitorCategory || ""
    }`,
  );
  if (mode === "full_validation") {
    if (!brief) {
      throw new Error("Full Validation requires a canonical research brief.");
    }
    return buildFullValidationPacks(brief);
  }
  const compactConcept = significantTerms(
    brief?.exactProductProposition ||
      `${run.idea_name} ${run.idea_description}`,
  ).slice(0, 4).join(" ");
  const compactBuyer = significantTerms(
    brief?.targetBuyer || run.target_customer,
  ).slice(0, 3).join(" ");
  const compactWorkflow = significantTerms(
    brief?.workflowChanged || run.idea_description,
  ).slice(0, 3).join(" ");
  const semanticAnchor = approvalAudit
    ? `client approval sign-off ${compactBuyer}`
    : `${compactConcept} ${compactBuyer} ${compactWorkflow}`;
  return [
    {
      key: "quick_primary_problem_buyer_demand",
      purpose: "primary",
      query:
        `${semanticAnchor} workflow current alternative pain frequency severity repeated demand adoption`,
      focus:
        "the exact buyer, exact workflow, current alternative, pain frequency and severity, behavioural demand, and category activity",
    },
    {
      key: "quick_adversarial",
      purpose: "adversarial",
      query:
        `${semanticAnchor} unnecessary low priority workaround free alternative failed abandoned complaint resistance switching occasional saturation`,
      focus:
        "proposition-specific disconfirmation: low urgency, low-friction workarounds, failed tools, buyer resistance, free alternatives, saturation, and occasional rather than urgent use",
    },
    {
      key: "quick_pricing_wtp_reachability",
      purpose: "pricing_wtp",
      query:
        `${semanticAnchor} official pricing plans price procurement paid pilot budget owner switching cost purchase buyer community reach`,
      focus:
        "official competitor pricing and plan names, payment behaviour, paid pilots, budget ownership, switching costs, and practical buyer reachability",
    },
  ];
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
  const stoppedAdapters = new Set<string>();
  for (const pack of args.packs) {
    const searches: Array<[string, () => Promise<SourceCandidate[]>]> = [];
    if (getEnv("TAVILY_API_KEY")) {
      searches.push(["tavily", () => searchTavily(pack, fetcher)]);
    }
    if (getEnv("BRAVE_SEARCH_API_KEY")) {
      searches.push(["brave", () => searchBrave(pack, fetcher)]);
    }
    searches.push(["duckduckgo", () => searchDuckDuckGo(pack, fetcher)]);
    if (!pack.key.startsWith("quick_")) {
      searches.push(["wikipedia", () => searchWikipedia(pack, fetcher)]);
    }
    if (args.technical) {
      searches.push(["hacker_news", () => searchHackerNews(pack, fetcher)]);
    } else if (
      pack.purpose === "primary" &&
      /consumer|local|service|home|household|neighborhood|marketplace/i.test(
        pack.query,
      )
    ) {
      searches.push([
        "public_directory_discovery",
        () => searchPublicDirectories(pack, fetcher),
      ]);
    }
    if (
      getEnv("REDDIT_BUYER_VOICE_ENABLED")?.toLowerCase() === "true" &&
      /quick_primary|quick_adversarial|quick_pricing/.test(pack.key)
    ) {
      searches.push(["reddit_optional", () => searchReddit(pack, fetcher)]);
    }
    if (args.technical) {
      searches.push(["github", () => searchGitHub(pack, fetcher)]);
    }
    for (const [provider, search] of searches) {
      if (stoppedAdapters.has(provider)) {
        await updateAdapterMetric(args.db, {
          runId: args.runId,
          adapter: provider,
          queryFamily: pack.key,
          stoppedEarly: true,
          failureReason: "zero_yield_circuit_breaker",
        });
        continue;
      }
      const started = Date.now();
      externalSearchCalls++;
      try {
        const results = await search();
        discovered.push(...results);
        await logExternalUsage(
          args.db,
          args.runId,
          provider,
          `external_search_${pack.key}`,
          "success",
          started,
          true,
          false,
        );
        await updateAdapterMetric(args.db, {
          runId: args.runId,
          adapter: provider,
          queryFamily: pack.key,
          calls: 1,
          pagesFound: results.length,
          failureReason: results.length ? null : "no_pages_found",
        });
        if (!results.length) stoppedAdapters.add(provider);
      } catch (error) {
        const failureReason = adapterFailureReason(error);
        await logExternalUsage(
          args.db,
          args.runId,
          provider,
          `external_search_${pack.key}`,
          "failed",
          started,
          true,
          false,
          failureReason,
        );
        await updateAdapterMetric(args.db, {
          runId: args.runId,
          adapter: provider,
          queryFamily: pack.key,
          calls: 1,
          failureReason,
        });
        stoppedAdapters.add(provider);
      }
    }
  }
  const unique = new Map<string, SourceCandidate>();
  for (const item of discovered) {
    const canonical = canonicalizeUrl(item.url);
    if (!canonical) continue;
    const current = unique.get(canonical);
    if (!current || item.score > current.score) {
      unique.set(canonical, { ...item, url: canonical });
    }
  }
  return {
    candidates: diversifyAndRank([...unique.values()]),
    externalSearchCalls,
  };
}

export async function discoverOfficialSitemapCandidates(args: {
  runId: string;
  seeds: Array<{ candidateName?: string; canonicalHomepage?: string }>;
  db: any;
  fetcher?: Fetcher;
}): Promise<SourceCandidate[]> {
  const fetcher = args.fetcher ?? fetch;
  const discovered: SourceCandidate[] = [];
  for (const seed of args.seeds.slice(0, 4)) {
    if (!seed.canonicalHomepage) continue;
    let origin: string;
    try {
      origin = new URL(seed.canonicalHomepage).origin;
    } catch {
      continue;
    }
    const started = Date.now();
    try {
      const response = await fetcher(`${origin}/sitemap.xml`, {
        headers: {
          "User-Agent": "ShouldBuildResearch/1.0",
          Accept: "application/xml,text/xml,text/plain",
        },
        signal: AbortSignal.timeout(7_000),
      });
      if (!response.ok) throw new Error(`sitemap ${response.status}`);
      const xml = (await response.text()).slice(0, 500_000);
      const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
        .map((match) => decodeHtml(match[1].trim()))
        .filter((url) =>
          /^https?:\/\//i.test(url) &&
          /pricing|plans|product|features|services|solutions|customers|case-stud/i
            .test(url)
        )
        .slice(0, 6);
      discovered.push(...urls.map((url, index) => ({
        title: `${
          seed.candidateName || new URL(origin).hostname
        } official page`,
        url,
        snippet:
          "Official sitemap discovery candidate; content requires live validation.",
        provider: "official_sitemap",
        queryFamily: /pricing|plans/i.test(url)
          ? "quick_pricing_wtp_reachability"
          : "quick_primary_problem_buyer_demand",
        score: 102 - index,
      })));
      await logExternalUsage(
        args.db,
        args.runId,
        "official_sitemap",
        "sitemap_discovery",
        "success",
        started,
        true,
        false,
      );
      await updateAdapterMetric(args.db, {
        runId: args.runId,
        adapter: "official_sitemap",
        queryFamily: "competitor_seed_sitemap",
        calls: 1,
        pagesFound: urls.length,
        failureReason: urls.length ? null : "no_pages_found",
      });
    } catch (error) {
      const failureReason = adapterFailureReason(error);
      await logExternalUsage(
        args.db,
        args.runId,
        "official_sitemap",
        "sitemap_discovery",
        "failed",
        started,
        true,
        false,
        failureReason,
      );
      await updateAdapterMetric(args.db, {
        runId: args.runId,
        adapter: "official_sitemap",
        queryFamily: "competitor_seed_sitemap",
        calls: 1,
        failureReason,
      });
    }
  }
  return diversifyAndRank(discovered);
}

export async function retrieveCandidates(args: {
  runId: string;
  candidates: SourceCandidate[];
  db: any;
  limit: number;
  brief: CanonicalResearchBrief;
  fetcher?: Fetcher;
}): Promise<
  {
    accepted: RetrievedSource[];
    rejected: Record<string, number>;
    pagesAttempted: number;
    pagesFetched: number;
  }
> {
  const fetcher = args.fetcher ?? fetch;
  const accepted: RetrievedSource[] = [];
  const rejected: Record<string, number> = {};
  let pagesFetched = 0;
  const chosen = balancedRank(args.candidates, args.limit);
  for (const candidate of chosen) {
    const canonical = canonicalizeUrl(candidate.url);
    if (!canonical) {
      reject("parsing_failure");
      await audit(
        args.db,
        args.runId,
        candidate,
        null,
        "rejected",
        "parsing_failure",
      );
      await updateAdapterMetric(args.db, {
        runId: args.runId,
        adapter: candidate.provider,
        queryFamily: candidate.queryFamily,
        failureReason: "parsing_failure",
      });
      continue;
    }
    const started = Date.now();
    try {
      let acceptedCanonical = canonical;
      const cached = await readCache(args.db, canonical);
      const fetched = cached || await fetchPage(canonical, fetcher);
      let fetchedForCandidate = Boolean(fetched);
      if (!fetched || fetched.text.length < 120) {
        const firecrawl = getEnv("FIRECRAWL_API_KEY")
          ? await fetchWithFirecrawl(canonical, fetcher)
          : null;
        fetchedForCandidate = fetchedForCandidate || Boolean(firecrawl);
        if (fetchedForCandidate) pagesFetched++;
        if (!firecrawl || firecrawl.text.length < 120) {
          reject("missing_excerpt");
          await audit(
            args.db,
            args.runId,
            candidate,
            canonical,
            "rejected",
            "missing_excerpt",
          );
          await logExternalUsage(
            args.db,
            args.runId,
            "direct_http",
            "page_fetch",
            "failed",
            started,
            false,
            true,
            "missing_excerpt",
          );
          await updateAdapterMetric(args.db, {
            runId: args.runId,
            adapter: candidate.provider,
            queryFamily: candidate.queryFamily,
            pagesFetched: 1,
            failureReason: "missing_excerpt",
          });
          continue;
        }
        await writeCache(
          args.db,
          canonical,
          firecrawl.text,
          firecrawl.contentType,
        );
        const relevance = assessSemanticRelevance(
          args.brief,
          `${candidate.title}\n${candidate.snippet}\n${firecrawl.text}`,
          candidate.queryFamily,
        );
        const authority = classifyPageAuthority({
          url: canonical,
          title: candidate.title,
          text: firecrawl.text,
          provider: candidate.provider,
          relevanceScore: relevance.score,
        });
        if (relevance.acceptanceDecision !== "accepted_core") {
          const reason = "semantic_mismatch";
          reject(reason);
          await audit(
            args.db,
            args.runId,
            candidate,
            canonical,
            "rejected",
            reason,
            relevance,
            authority,
          );
          await updateAdapterMetric(args.db, {
            runId: args.runId,
            adapter: candidate.provider,
            queryFamily: candidate.queryFamily,
            pagesFetched: 1,
            failureReason: reason,
          });
          continue;
        }
        accepted.push(
          toRetrieved(
            candidate,
            canonical,
            firecrawl.text,
            "firecrawl",
            relevance,
            authority,
          ),
        );
        await updateAdapterMetric(args.db, {
          runId: args.runId,
          adapter: candidate.provider,
          queryFamily: candidate.queryFamily,
          pagesFetched: 1,
          evidenceAccepted: 1,
          independentEvidenceGroupsAdded: 1,
        });
        await logExternalUsage(
          args.db,
          args.runId,
          "firecrawl",
          "page_fetch_fallback",
          "success",
          started,
          false,
          true,
        );
      } else {
        pagesFetched++;
        const fetchedFinalUrl =
          (fetched as unknown as { finalUrl?: unknown }).finalUrl;
        const finalCanonical = canonicalizeUrl(
          typeof fetchedFinalUrl === "string" ? fetchedFinalUrl : canonical,
        ) || canonical;
        if (
          /(?:^|\.)vertexaisearch\.cloud\.google\.com$/i.test(
            new URL(finalCanonical).hostname,
          )
        ) {
          reject("inaccessible_page");
          await audit(
            args.db,
            args.runId,
            candidate,
            finalCanonical,
            "rejected",
            "inaccessible_page",
          );
          await updateAdapterMetric(args.db, {
            runId: args.runId,
            adapter: candidate.provider,
            queryFamily: candidate.queryFamily,
            pagesFetched: 1,
            failureReason: "inaccessible_page",
          });
          continue;
        }
        acceptedCanonical = finalCanonical;
        if (!cached) {
          await writeCache(
            args.db,
            finalCanonical,
            fetched.text,
            fetched.contentType,
          );
        }
        const relevance = assessSemanticRelevance(
          args.brief,
          `${candidate.title}\n${candidate.snippet}\n${fetched.text}`,
          candidate.queryFamily,
        );
        const authority = classifyPageAuthority({
          url: finalCanonical,
          title: candidate.title,
          text: fetched.text,
          provider: candidate.provider,
          relevanceScore: relevance.score,
        });
        if (relevance.acceptanceDecision !== "accepted_core") {
          const reason = "semantic_mismatch";
          reject(reason);
          await audit(
            args.db,
            args.runId,
            candidate,
            finalCanonical,
            "rejected",
            reason,
            relevance,
            authority,
          );
          await updateAdapterMetric(args.db, {
            runId: args.runId,
            adapter: candidate.provider,
            queryFamily: candidate.queryFamily,
            pagesFetched: 1,
            failureReason: reason,
          });
          continue;
        }
        accepted.push(
          toRetrieved(
            candidate,
            finalCanonical,
            fetched.text,
            cached ? "retrieval_cache" : "direct_http",
            relevance,
            authority,
          ),
        );
        await updateAdapterMetric(args.db, {
          runId: args.runId,
          adapter: candidate.provider,
          queryFamily: candidate.queryFamily,
          pagesFetched: 1,
          evidenceAccepted: 1,
          independentEvidenceGroupsAdded: 1,
        });
        await logExternalUsage(
          args.db,
          args.runId,
          cached ? "retrieval_cache" : "direct_http",
          "page_fetch",
          "success",
          started,
          false,
          true,
        );
      }
      const latest = accepted.at(-1);
      if (latest?.canonicalUrl === acceptedCanonical) {
        await audit(
          args.db,
          args.runId,
          candidate,
          acceptedCanonical,
          "accepted",
          null,
          latest.relevance,
          latest.authority,
        );
      }
    } catch (error) {
      const reason = /timeout/i.test(safeMessage(error))
        ? "timeout"
        : "inaccessible_page";
      reject(reason);
      await audit(
        args.db,
        args.runId,
        candidate,
        canonical,
        "rejected",
        reason,
      );
      await logExternalUsage(
        args.db,
        args.runId,
        "direct_http",
        "page_fetch",
        "failed",
        started,
        false,
        true,
        reason,
      );
      await updateAdapterMetric(args.db, {
        runId: args.runId,
        adapter: candidate.provider,
        queryFamily: candidate.queryFamily,
        pagesFetched: 1,
        failureReason: reason,
      });
    }
  }
  return {
    accepted: deduplicateContent(accepted),
    rejected,
    pagesAttempted: chosen.length,
    pagesFetched,
  };

  function reject(reason: string) {
    rejected[reason] = (rejected[reason] || 0) + 1;
  }
}

async function searchPublicDirectories(pack: ResearchPack, fetcher: Fetcher) {
  const directoryQuery = `(${
    pack.query.split(/\s+/).slice(0, 10).join(" ")
  }) (site:yelp.com OR site:thumbtack.com OR site:angi.com OR site:tripadvisor.com OR site:producthunt.com)`;
  return searchDuckDuckGo({ ...pack, query: directoryQuery }, fetcher).then(
    (items) =>
      items.map((item) => ({
        ...item,
        provider: "public_directory_discovery",
        score: Math.min(item.score, 58),
      })),
  );
}

async function searchTavily(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: getEnv("TAVILY_API_KEY"),
      query: pack.query,
      max_results: 8,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const body = await response.json() as {
    results?: Array<
      { title?: string; url?: string; content?: string; score?: number }
    >;
  };
  return (body.results || []).flatMap((item) =>
    item.url
      ? [{
        title: item.title || item.url,
        url: item.url,
        snippet: item.content || "",
        provider: "tavily",
        queryFamily: pack.key,
        score: 80 + Number(item.score || 0) * 10,
      }]
      : []
  );
}

async function searchBrave(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(
    `https://api.search.brave.com/res/v1/web/search?q=${
      encodeURIComponent(pack.query)
    }&count=8`,
    {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": getEnv("BRAVE_SEARCH_API_KEY") || "",
      },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw new Error(`Brave ${response.status}`);
  const body = await response.json() as {
    web?: {
      results?: Array<{ title?: string; url?: string; description?: string }>;
    };
  };
  return (body.web?.results || []).flatMap((item, index) =>
    item.url
      ? [{
        title: item.title || item.url,
        url: item.url,
        snippet: item.description || "",
        provider: "brave",
        queryFamily: pack.key,
        score: 85 - index,
      }]
      : []
  );
}

async function searchDuckDuckGo(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(pack.query)}`,
    {
      headers: { "User-Agent": "ShouldBuildResearch/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw new Error(`DuckDuckGo ${response.status}`);
  const html = await response.text();
  const matches = [
    ...html.matchAll(
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ].slice(0, 10);
  return matches.flatMap((match, index) => {
    const raw = decodeHtml(match[1]);
    const redirect = raw.match(/[?&]uddg=([^&]+)/)?.[1];
    const url = redirect ? decodeURIComponent(redirect) : raw;
    const canonical = canonicalizeUrl(url);
    return canonical
      ? [{
        title: stripHtml(match[2]),
        url: canonical,
        snippet: "",
        provider: "duckduckgo",
        queryFamily: pack.key,
        score: 70 - index,
      }]
      : [];
  });
}

async function searchWikipedia(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=${
      encodeURIComponent(pack.query)
    }`,
    {
      headers: { "User-Agent": "ShouldBuildResearch/1.0" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
  const body = await response.json() as {
    query?: { search?: Array<{ title: string; snippet?: string }> };
  };
  return (body.query?.search || []).map((item, index) => ({
    title: item.title,
    url: `https://en.wikipedia.org/wiki/${
      encodeURIComponent(item.title.replaceAll(" ", "_"))
    }`,
    snippet: stripHtml(item.snippet || ""),
    provider: "wikipedia",
    queryFamily: pack.key,
    score: 65 - index,
  }));
}

async function searchHackerNews(pack: ResearchPack, fetcher: Fetcher) {
  const response = await fetcher(
    `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=${
      encodeURIComponent(pack.query)
    }`,
    {
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Hacker News ${response.status}`);
  const body = await response.json() as {
    hits?: Array<
      { title?: string; url?: string; objectID?: string; story_text?: string }
    >;
  };
  return (body.hits || []).flatMap((item, index) => {
    const url = item.url ||
      (item.objectID
        ? `https://news.ycombinator.com/item?id=${item.objectID}`
        : "");
    return url
      ? [{
        title: item.title || url,
        url,
        snippet: stripHtml(item.story_text || ""),
        provider: "hacker_news",
        queryFamily: pack.key,
        score: 68 - index,
      }]
      : [];
  });
}

async function searchReddit(pack: ResearchPack, fetcher: Fetcher) {
  const cacheKey = pack.query.toLowerCase().replace(/\s+/g, " ").trim();
  const cached = redditSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;
  const response = await fetcher(
    `https://www.reddit.com/search.json?sort=relevance&t=all&limit=5&q=${
      encodeURIComponent(pack.query)
    }`,
    {
      headers: {
        "User-Agent": "ShouldBuildResearch/1.0 (bounded buyer-voice search)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok) throw new Error(`Reddit optional ${response.status}`);
  const body = await response.json() as {
    data?: {
      children?: Array<{
        data?: {
          title?: string;
          permalink?: string;
          selftext?: string;
        };
      }>;
    };
  };
  const results = (body.data?.children || []).flatMap((child, index) => {
    const item = child.data;
    return item?.permalink
      ? [{
        title: item.title || "Reddit discussion",
        url: `https://www.reddit.com${item.permalink}`,
        snippet: String(item.selftext || "").slice(0, 600),
        provider: "reddit_optional",
        queryFamily: pack.key,
        score: 67 - index,
      }]
      : [];
  });
  redditSearchCache.set(cacheKey, {
    expiresAt: Date.now() + 15 * 60_000,
    results,
  });
  return results;
}

async function searchGitHub(pack: ResearchPack, fetcher: Fetcher) {
  const query = `${
    pack.query.split(/\s+/).slice(0, 7).join(" ")
  } in:name,description`;
  const response = await fetcher(
    `https://api.github.com/search/repositories?per_page=8&q=${
      encodeURIComponent(query)
    }`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ShouldBuildResearch/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const body = await response.json() as {
    items?: Array<
      {
        full_name?: string;
        html_url?: string;
        description?: string;
        stargazers_count?: number;
      }
    >;
  };
  return (body.items || []).flatMap((item, index) =>
    item.html_url
      ? [{
        title: item.full_name || item.html_url,
        url: item.html_url,
        snippet: item.description || "",
        provider: "github",
        queryFamily: pack.key,
        score: 72 +
          Math.min(8, Math.log10(1 + Number(item.stargazers_count || 0))) -
          index,
      }]
      : []
  );
}

async function fetchPage(url: string, fetcher: Fetcher) {
  const response = await fetcher(url, {
    headers: {
      "User-Agent": "ShouldBuildResearch/1.0",
      Accept: "text/html,text/plain,application/json,application/xml,text/xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "text/plain";
  if (!/html|text|json|xml|rss|atom/i.test(contentType)) return null;
  const body = (await response.text()).slice(0, 300_000);
  return {
    text: extractText(body).slice(0, 12_000),
    contentType,
    finalUrl: response.url || url,
  };
}

async function fetchWithFirecrawl(url: string, fetcher: Fetcher) {
  const response = await fetcher("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("FIRECRAWL_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const body = await response.json() as { data?: { markdown?: string } };
  return body.data?.markdown
    ? {
      text: body.data.markdown.slice(0, 12_000),
      contentType: "text/markdown",
    }
    : null;
}

async function readCache(db: any, canonicalUrl: string) {
  const { data } = await db.from("public_retrieval_cache").select(
    "text_content,content_type,expires_at",
  )
    .eq("canonical_url", canonicalUrl).gt(
      "expires_at",
      new Date().toISOString(),
    ).maybeSingle();
  return data?.text_content
    ? {
      text: String(data.text_content),
      contentType: String(data.content_type || "text/plain"),
    }
    : null;
}

async function writeCache(
  db: any,
  canonicalUrl: string,
  text: string,
  contentType: string,
) {
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

async function audit(
  db: any,
  runId: string,
  candidate: SourceCandidate,
  canonicalUrl: string | null,
  disposition: string,
  reason: string | null,
  relevance?: RelevanceAssessment,
  authority?: PageAuthority,
) {
  await db.from("source_retrieval_audit").insert({
    run_id: runId,
    query_family: candidate.queryFamily,
    provider: candidate.provider,
    candidate_url: candidate.url,
    canonical_url: canonicalUrl,
    disposition,
    rejection_reason: reason,
    relevance_score: candidate.score,
    deterministic_relevance_score: relevance?.score ?? null,
    relevance_class: relevance?.classification ?? null,
    matched_brief_dimensions: relevance?.matchedDimensions ?? [],
    mismatch_reasons: relevance?.mismatchReasons ?? [],
    acceptance_decision: relevance?.acceptanceDecision ?? null,
    page_type: authority?.pageType ?? null,
    source_tier: authority?.sourceTier ?? null,
    source_tier_reason: authority?.reason ?? null,
    source_domain: canonicalUrl ? new URL(canonicalUrl).hostname : null,
  });
  if (canonicalUrl && typeof db.rpc === "function") {
    const domain = new URL(canonicalUrl).hostname.toLowerCase().replace(
      /^www\./,
      "",
    );
    await db.rpc("record_source_registry_extraction", {
      p_domain: domain,
      // A page was successfully extracted when deterministic relevance could
      // be assessed, even if the page was later rejected as out of scope.
      p_succeeded: disposition === "accepted" || Boolean(relevance),
    });
  }
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

async function updateAdapterMetric(
  db: any,
  input: {
    runId: string;
    adapter: string;
    queryFamily: string;
    calls?: number;
    pagesFound?: number;
    pagesFetched?: number;
    evidenceAccepted?: number;
    independentEvidenceGroupsAdded?: number;
    failureReason?: string | null;
    stoppedEarly?: boolean;
  },
) {
  const { data: current } = await db.from("research_adapter_metrics")
    .select(
      "calls,pages_found,pages_fetched,evidence_accepted,independent_evidence_groups_added",
    )
    .eq("run_id", input.runId)
    .eq("adapter", input.adapter)
    .eq("query_family", input.queryFamily)
    .maybeSingle();
  await db.from("research_adapter_metrics").upsert({
    run_id: input.runId,
    adapter: input.adapter,
    query_family: input.queryFamily,
    calls: Number(current?.calls || 0) + Number(input.calls || 0),
    pages_found: Number(current?.pages_found || 0) +
      Number(input.pagesFound || 0),
    pages_fetched: Number(current?.pages_fetched || 0) +
      Number(input.pagesFetched || 0),
    evidence_accepted: Number(current?.evidence_accepted || 0) +
      Number(input.evidenceAccepted || 0),
    independent_evidence_groups_added:
      Number(current?.independent_evidence_groups_added || 0) +
      Number(input.independentEvidenceGroupsAdded || 0),
    failure_reason: input.failureReason ?? null,
    stopped_early: Boolean(input.stoppedEarly),
    updated_at: new Date().toISOString(),
  }, { onConflict: "run_id,adapter,query_family" });
}

function adapterFailureReason(error: unknown) {
  const message = safeMessage(error);
  if (/timeout|aborterror/i.test(message)) return "timeout";
  if (/401|403|auth|unauthor/i.test(message)) return "authentication";
  if (/429|quota|resource_exhausted/i.test(message)) return "quota";
  if (/parse|json|syntax/i.test(message)) return "parsing_failure";
  return "provider_failed";
}

function toRetrieved(
  candidate: SourceCandidate,
  canonicalUrl: string,
  text: string,
  extractionMethod: RetrievedSource["extractionMethod"],
  relevance: RelevanceAssessment,
  authority: PageAuthority,
): RetrievedSource {
  const domain = new URL(canonicalUrl).hostname.toLowerCase();
  const community = candidate.provider === "hacker_news" ||
    candidate.provider === "reddit_optional" ||
    authority.pageType === "community_discussion";
  const sourceClass: RetrievedSource["sourceClass"] =
    authority.pageType === "official_pricing"
      ? "commercial"
      : ["official_documentation", "regulatory", "market_research"].includes(
          authority.pageType,
        )
      ? "primary"
      : community
      ? "community"
      : authority.pageType === "official_product"
      ? "official"
      : "secondary";
  const sanitized = sanitizeUntrustedWebContent(text);
  return {
    ...candidate,
    url: canonicalUrl,
    canonicalUrl,
    text: sanitized.text,
    domain,
    publisher: publisherFrom(candidate.title, domain),
    sourceTier: authority.sourceTier,
    sourceClass,
    extractionMethod,
    retrievalDate: new Date().toISOString().slice(0, 10),
    relevance,
    authority,
    publishedOrUpdatedDate: extractPublishedOrUpdatedDate(sanitized.text),
    extractionLimitations: sanitized.limitations,
    hostileTextDetected: sanitized.hostileTextDetected,
  };
}

function balancedRank(candidates: SourceCandidate[], limit: number) {
  const diversified = diversifyAndRank(candidates);
  const byFamily = new Map<string, SourceCandidate[]>();
  for (const candidate of diversified) {
    byFamily.set(candidate.queryFamily, [
      ...(byFamily.get(candidate.queryFamily) || []),
      candidate,
    ]);
  }
  const result: SourceCandidate[] = [];
  let round = 0;
  while (result.length < limit) {
    let added = false;
    for (const family of byFamily.values()) {
      const candidate = family[round];
      if (candidate && result.length < limit) {
        result.push(candidate);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return result;
}

function publisherFrom(title: string, domain: string) {
  const normalized = title.replace(/\s*[|–—-]\s*[^|–—-]+$/, "").trim();
  return normalized && normalized.length <= 160 ? normalized : domain;
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
    const fingerprint = source.text.toLowerCase().replace(/\W+/g, " ").slice(
      0,
      500,
    );
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function significantTerms(value: string) {
  const stop = new Set([
    "that",
    "with",
    "from",
    "this",
    "their",
    "into",
    "each",
    "helps",
    "using",
    "produce",
    "would",
    "could",
    "should",
    "about",
  ]);
  return [...new Set(value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])]
    .filter((term) => !stop.has(term));
}

function extractText(body: string) {
  return decodeHtml(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractPublishedOrUpdatedDate(value: string) {
  const match = value.match(
    /\b(?:published|updated|last updated|effective)\s*(?:on|:)?\s*((?:19|20)\d{2}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/i,
  );
  if (!match) return null;
  const parsed = Date.parse(match[1]);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10)
    : null;
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(
    /&#x27;|&#39;/g,
    "'",
  ).replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
