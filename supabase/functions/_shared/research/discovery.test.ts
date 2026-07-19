import { canonicalUrl, dedupeDiscovered, rankCandidate } from "./discovery.ts";
import { buildIdeaAwareQueries } from "./retrieval-strategy.ts";
import { cacheTtlSeconds, sourceAcceptance, usableCache } from "./retrieval.ts";
function assertEquals(actual: unknown, expected: unknown) { if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`); }

Deno.test("canonical URLs remove tracking and normalize host", () => {
  assertEquals(canonicalUrl("https://WWW.Example.com/a/?utm_source=x&fbclid=y#part"), "https://example.com/a");
});
Deno.test("discovery dedupes tracking variants", () => {
  const results = dedupeDiscovered([{ id: "1", title: "One", url: "https://example.com/a?utm_source=x", source: "x", snippet: "", sourceType: "web" }, { id: "2", title: "Two", url: "https://example.com/a", source: "x", snippet: "", sourceType: "web" }]);
  assertEquals(results.length, 1);
});
Deno.test("full validation plans broader traceable query families", () => {
  const plan = buildIdeaAwareQueries({ ideaName: "OpsPilot", ideaDescription: "Help clinics reduce manual insurance follow up", targetCustomer: "clinic operators", marketType: "B2B", targetRegion: "United States", mode: "full_validation" });
  assertEquals(plan.some((q) => q.queryFamily === "pricing"), true);
  assertEquals(plan.some((q) => q.queryFamily === "regulatory_risk"), true);
  assertEquals(plan.some((q) => /reddit/i.test(q.query)), false);
});
Deno.test("candidate rank penalizes an overrepresented domain", () => {
  const base = { url: "https://data.gov/report", title: "Clinic workflow report", snippet: "manual workflow", query: "clinic manual workflow", sourceTier: 1 };
  assertEquals(rankCandidate({ ...base, domainCount: 1 }).score > rankCandidate({ ...base, domainCount: 5 }).score, true);
});
Deno.test("public cache respects expiry and source checks reject claimless pages", () => {
  assertEquals(usableCache({ canonical_url: "https://x.test", text_content: "x".repeat(60), content_hash: "a", expires_at: "2999-01-01T00:00:00Z" }), true);
  assertEquals(usableCache({ canonical_url: "https://x.test", text_content: "x".repeat(60), content_hash: "a", expires_at: "2000-01-01T00:00:00Z" }), false);
  assertEquals(sourceAcceptance({ retrieved: true, readable: true, relevance: .8, claimCount: 0, attributable: true, excluded: false, duplicate: false }).reason, "no_extractable_claim");
  assertEquals(cacheTtlSeconds("https://example.com/pricing") < cacheTtlSeconds("https://example.com/annual-report"), true);
});
