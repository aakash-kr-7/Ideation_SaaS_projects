import { materializeAcceptedFamilyGaps, type GapSource } from "./evidence-family-gap.ts";

function assert(value: unknown, message = "assertion failed") {
  if (!value) throw new Error(message);
}
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

const source = (overrides: Partial<GapSource>): GapSource => ({
  sourceId: crypto.randomUUID(),
  url: "https://example.com/approval",
  title: "Client approval workflow",
  sourceTier: 2,
  domain: "example.com",
  relevanceScore: 0.82,
  relevanceClass: "directly_relevant",
  matchedBriefDimensions: ["target_buyer", "user_workflow", "proposed_solution"],
  acceptanceDecision: "accepted_core",
  retrievedText: "Agency teams use a client approval workflow to preserve an audit trail and reduce ambiguous sign-off.",
  queryFamily: "segments",
  ...overrides,
});

Deno.test("materializes distinct accepted families without inventing payment or contradiction", () => {
  const additions = materializeAcceptedFamilyGaps([
    source({ queryFamily: "segments", domain: "segments.test" }),
    source({ queryFamily: "alternatives", domain: "alternatives.test" }),
    source({ queryFamily: "market_regulatory_gtm", domain: "market.test" }),
    source({ queryFamily: "reviews_complaints", domain: "reviews.test" }),
  ], [{ evidenceTopic: "customer_pain", sourceId: "existing" }]);

  assert(additions.some((claim) => claim.evidenceTopic === "segments"));
  assert(additions.some((claim) => claim.evidenceTopic === "alternatives"));
  assert(additions.some((claim) => claim.evidenceTopic === "market_context"));
  assert(!additions.some((claim) => claim.evidenceTopic === "willingness_to_pay"));
  assert(!additions.some((claim) => claim.evidenceTopic === "contradiction"));
  assert(additions.every((claim) => claim.numericValue === "" && claim.disconfirming === false));
});

Deno.test("rejects non-core and numeric-only excerpts", () => {
  const additions = materializeAcceptedFamilyGaps([
    source({ acceptanceDecision: "rejected", queryFamily: "segments" }),
    source({ queryFamily: "alternatives", retrievedText: "Approval plan costs $29 per month." }),
  ], []);
  assertEquals(additions, []);
});
