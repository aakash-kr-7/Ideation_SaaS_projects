import {
  buildAdversarialQueries,
  buildBroadQueries,
  buildTargetedQueries,
  classifySourceTier,
  clusterBySimilarity,
  evaluateSufficiency,
} from "./retrieval-strategy.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const idea = {
  ideaName: "Async Client Approval Tracker",
  ideaDescription: "Track client feedback and approvals across email and time zones",
  targetCustomer: "boutique creative agencies",
  marketType: "B2B",
  targetRegion: "United States",
  depth: "deep" as const,
};

Deno.test("constructs separate broad, evidence-triggered targeted, and adversarial passes", () => {
  const broad = buildBroadQueries(idea);
  assert(broad.some((q) => q.family === "problem"), "missing problem family");
  assert(broad.some((q) => q.family === "solution"), "missing solution family");
  assert(broad.some((q) => q.objective === "market-sizing"), "missing grounded sizing query");
  const seeds = [{ entity: "Notion", evidenceIds: ["ev-1"], family: "problem" as const, painLanguage: "approval status gets lost in email" }];
  const targeted = buildTargetedQueries(seeds);
  assert(targeted.every((q) => q.triggeredByEvidenceIds.includes("ev-1")), "follow-up lost its evidence trigger");
  assert(targeted.some((q) => /Notion.*complaints.*pricing/i.test(q.query)), "missing entity complaint query");
  assert(buildAdversarialQueries(idea, seeds).some((q) => /failed OR shut down/i.test(q.query)), "missing failure search");
});

Deno.test("tiers willingness-to-pay above specific community pain and excludes listicles", () => {
  assert(classifySourceTier("https://vendor.test/pricing", "Pricing", "Paid plan is $49 per user per month", "solution").tier === 1, "pricing page not Tier 1");
  assert(classifySourceTier("https://reddit.com/r/agency/x", "Approval mess", "Every week we lose 3 hours to this manual spreadsheet workaround", "problem").tier === 2, "specific pain not Tier 2");
  const farm = classifySourceTier("https://example.test/post", "10 Best Approval Tools", "Our solution helps every team. Book a demo", "problem");
  assert(farm.tier === 4 && farm.excluded, "listicle not excluded");
});

Deno.test("semantic clusters expose independent corroboration to sufficiency", () => {
  const base = [
    { id: "p1", evidence_family: "problem" as const, research_pass: 1 as const, source_tier: 2 as const, excluded: false, signal_type: "Pain" as const, snippet: "approvals disappear in email", source_id: "s1", source_domain: "reddit.com", author: "alice", pain_point: "approval status loss" },
    { id: "p2", evidence_family: "problem" as const, research_pass: 2 as const, source_tier: 2 as const, excluded: false, signal_type: "Pain" as const, snippet: "feedback gets lost across inboxes", source_id: "s2", source_domain: "news.ycombinator.com", author: "bob", pain_point: "approval status loss" },
    { id: "s1", evidence_family: "solution" as const, research_pass: 1 as const, source_tier: 1 as const, excluded: false, signal_type: "Pricing" as const, snippet: "$49 paid plan", source_id: "s3", source_domain: "vendor.test", author: null, pain_point: "paid competitor" },
    { id: "s2", evidence_family: "solution" as const, research_pass: 2 as const, source_tier: 3 as const, excluded: false, signal_type: "Demand" as const, snippet: "Notion alternative", source_id: "s4", source_domain: "g2.com", author: "carol", pain_point: "incumbent complexity" },
    { id: "d1", evidence_family: "solution" as const, research_pass: 3 as const, source_tier: 3 as const, excluded: false, signal_type: "Risk" as const, snippet: "category is saturated", source_id: "s5", source_domain: "analysis.test", author: "dan", pain_point: "saturation", disconfirming: true },
  ];
  const vectors = [[1, 0], [.99, .01], [0, 1], [-1, 0], [0, -1]];
  const cosine = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
  const clustered = clusterBySimilarity(base, vectors, cosine);
  const coverage = evaluateSufficiency(clustered);
  assert(clustered[0].independent_source_count === 2, "corroboration did not count independent sources");
  assert(coverage.sufficient, `unexpected gaps: ${coverage.gaps.join(", ")}`);
  const tierThreeOnly = clustered.map((e) => ({ ...e, source_tier: 3 as const }));
  assert(evaluateSufficiency(tierThreeOnly).gaps.some((g) => g.includes("willingness-to-pay")), "Tier 3 volume hid missing WTP");
});
