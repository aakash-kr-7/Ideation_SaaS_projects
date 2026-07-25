import { buildResearchPacks, discoverCandidates, retrieveCandidates } from "./external-retrieval.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

class FakeDb {
  rows: Record<string, unknown[]> = {};
  from(table: string) {
    const append = (value: unknown) => {
      this.rows[table] = [...(this.rows[table] || []), ...(Array.isArray(value) ? value : [value])];
    };
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      gt() { return builder; },
      async maybeSingle() { return { data: null, error: null }; },
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
    return new Response('<a class="result__a" href="https://vendor.test/pricing">Vendor pricing</a>', { status: 200, headers: { "content-type": "text/html" } });
  }
  if (url.includes("wikipedia.org/w/api.php")) {
    return Response.json({ query: { search: [{ title: "Request for proposal", snippet: "Procurement workflow" }] } });
  }
  if (url.includes("hn.algolia.com")) {
    return Response.json({ hits: [{ title: "RFP automation launch", url: "https://launch.test/rfp" }] });
  }
  if (url.includes("api.github.com")) {
    return Response.json({ items: [{ full_name: "open/rfp-tool", html_url: "https://github.com/open/rfp-tool", description: "Questionnaire automation", stargazers_count: 42 }] });
  }
  return new Response(`<html><body>Public product evidence from ${url} describing workflow pain, pricing options, adoption limits, customer alternatives, measurable outcomes, and contradictory adoption signals in sufficient detail for attributable extraction.</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
};

Deno.test("provider-mocked hybrid discovery retrieves and audits real-shaped source dossiers", async () => {
  const db = new FakeDb();
  const packs = buildResearchPacks({
    idea_name: "Auditable RFP assistant",
    idea_description: "Security questionnaire evidence and stale claim detection",
    target_customer: "Cybersecurity proposal teams",
    target_region: "Global",
  }, "quick_scan");
  const discovery = await discoverCandidates({ runId: crypto.randomUUID(), packs, db, technical: true, fetcher: mockedFetch });
  assert(discovery.externalSearchCalls === 4, `unexpected provider count ${discovery.externalSearchCalls}`);
  assert(discovery.candidates.length >= 3, "candidate discovery was empty");
  const retrieval = await retrieveCandidates({
    runId: crypto.randomUUID(),
    candidates: discovery.candidates,
    db,
    limit: 6,
    fetcher: mockedFetch,
  });
  assert(retrieval.accepted.length >= 3, "direct retrieval did not accept sources");
  assert((db.rows.api_usage_logs || []).length >= 7, "provider usage was not persisted");
  assert((db.rows.source_retrieval_audit || []).length >= 3, "retrieval audit was not persisted");
  assert(retrieval.accepted.every((source) => source.text.includes("Public product evidence")), "retrieved dossier did not use fetched page text");
});
