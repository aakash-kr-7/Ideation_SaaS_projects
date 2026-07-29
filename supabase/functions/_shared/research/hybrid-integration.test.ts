import {
  buildResearchPacks,
  discoverCandidates,
  retrieveCandidates,
} from "./external-retrieval.ts";
import {
  assessSemanticRelevance,
  buildCanonicalResearchBrief,
} from "./research-brief.ts";
import { materializeCatalogClaims } from "./stage-executors/gemini-hybrid/validate-normalize.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

class FakeDb {
  rows: Record<string, unknown[]> = {};
  from(table: string) {
    const append = (value: unknown) => {
      this.rows[table] = [
        ...(this.rows[table] || []),
        ...(Array.isArray(value) ? value : [value]),
      ];
    };
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      gt() {
        return builder;
      },
      async maybeSingle() {
        return { data: null, error: null };
      },
      async insert(value: unknown) {
        append(value);
        return { data: null, error: null };
      },
      async upsert(value: unknown) {
        append(value);
        return { data: null, error: null };
      },
    };
    return builder;
  }
}

const mockedFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("duckduckgo.com")) {
    return new Response(
      '<a class="result__a" href="https://vendor.test/pricing">Vendor pricing</a>',
      { status: 200, headers: { "content-type": "text/html" } },
    );
  }
  if (url.includes("wikipedia.org/w/api.php")) {
    return Response.json({
      query: {
        search: [{
          title: "Request for proposal",
          snippet: "Procurement workflow",
        }],
      },
    });
  }
  if (url.includes("hn.algolia.com")) {
    return Response.json({
      hits: [{
        title: "RFP automation launch",
        url: "https://launch.test/rfp",
      }],
    });
  }
  if (url.includes("api.github.com")) {
    return Response.json({
      items: [{
        full_name: "open/rfp-tool",
        html_url: "https://github.com/open/rfp-tool",
        description: "Questionnaire automation",
        stargazers_count: 42,
      }],
    });
  }
  return new Response(
    `<html><body>Public product evidence from ${url} describing cybersecurity proposal teams using a security questionnaire evidence workflow with stale claim detection, pricing options, adoption limits, customer alternatives, measurable outcomes, and contradictory adoption signals in sufficient detail for attributable extraction.</body></html>`,
    {
      status: 200,
      headers: { "content-type": "text/html" },
    },
  );
};

Deno.test("provider-mocked hybrid discovery retrieves and audits real-shaped source dossiers", async () => {
  const db = new FakeDb();
  const run = {
    idea_name: "Auditable RFP assistant",
    idea_description:
      "Security questionnaire evidence and stale claim detection",
    target_customer: "Cybersecurity proposal teams",
    target_region: "Global",
  };
  const brief = buildCanonicalResearchBrief(run);
  const packs = buildResearchPacks(run, "quick_scan", brief);
  const discovery = await discoverCandidates({
    runId: crypto.randomUUID(),
    packs,
    db,
    technical: true,
    fetcher: mockedFetch,
  });
  assert(
    discovery.externalSearchCalls === 9,
    `unexpected provider count ${discovery.externalSearchCalls}`,
  );
  assert(discovery.candidates.length >= 3, "candidate discovery was empty");
  const retrieval = await retrieveCandidates({
    runId: crypto.randomUUID(),
    candidates: discovery.candidates,
    db,
    limit: 6,
    brief,
    fetcher: mockedFetch,
  });
  assert(
    retrieval.accepted.length >= 3,
    "direct retrieval did not accept sources",
  );
  assert(
    (db.rows.api_usage_logs || []).length >= 7,
    "provider usage was not persisted",
  );
  assert(
    (db.rows.source_retrieval_audit || []).length >= 3,
    "retrieval audit was not persisted",
  );
  assert(
    retrieval.accepted.every((source) =>
      source.text.includes("Public product evidence")
    ),
    "retrieved dossier did not use fetched page text",
  );
});

Deno.test("a synthesis miss materializes only exact semantically accepted catalog excerpts", async () => {
  const brief = buildCanonicalResearchBrief({
    idea_name: "API error triage assistant",
    idea_description:
      "An AI developer tool that groups API errors and suggests reproducible debugging steps",
    target_customer: "Backend engineering teams",
    target_region: "Global",
  });
  const text =
    "Backend engineering teams investigate API errors by grouping repeated failures and preserving reproducible debugging steps. The workflow can still fail when logs omit request context.";
  const relevance = assessSemanticRelevance(brief, text, "customer_pain");
  const claims = await materializeCatalogClaims([{
    sourceId: crypto.randomUUID(),
    url: "https://docs.example.test/api-errors",
    title: "API error investigation guide",
    excerpt: text,
    sourceTier: 2,
    domain: "docs.example.test",
    sourceClass: "primary",
    pageType: "official_documentation",
    relevanceScore: relevance.score,
    relevanceClass: relevance.classification,
    matchedBriefDimensions: relevance.matchedDimensions,
    mismatchReasons: relevance.mismatchReasons,
    acceptanceDecision: relevance.acceptanceDecision,
    retrievedText: text,
    queryFamily: "customer_pain",
  }], brief);
  assert(claims.length === 1, "accepted catalog evidence was not materialized");
  assert(
    text.includes(claims[0].excerpt),
    "fallback evidence was not an exact retrieved excerpt",
  );
  assert(claims[0].numericValue === "", "fallback invented a numeric claim");
});

Deno.test("consumer and local fallback uses bounded directories and stops zero-yield adapters", async () => {
  const db = new FakeDb();
  const run = {
    idea_name: "Apartment AC Rescue",
    idea_description:
      "A local service matching apartment renters with same-day air-conditioning repair providers.",
    target_customer: "Apartment renters and local home-service buyers",
    target_region: "India",
  };
  const brief = buildCanonicalResearchBrief(run);
  const packs = buildResearchPacks(run, "quick_scan", brief);
  const emptySearch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("duckduckgo.com")) {
      return new Response("<html><body>No matching result links</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    throw new Error(`Unexpected adapter call: ${url}`);
  };
  const discovery = await discoverCandidates({
    runId: crypto.randomUUID(),
    packs,
    db,
    technical: false,
    fetcher: emptySearch,
  });
  const usage = (db.rows.api_usage_logs || []) as Array<{ provider?: string }>;
  assert(discovery.externalSearchCalls === 2, `zero-yield adapters were repeated ${discovery.externalSearchCalls} times`);
  assert(usage.some((row) => row.provider === "public_directory_discovery"), "local directory discovery did not run");
  assert(!usage.some((row) => row.provider === "hacker_news" || row.provider === "github"), "technical adapters ran for a local-service idea");
});
