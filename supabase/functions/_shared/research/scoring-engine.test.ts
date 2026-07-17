import {
  calculateDeterministicScore,
  computeFactors,
  CRITERIA,
  verdictFor,
} from "./scoring-engine.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("all verdict bands and off-by-one boundaries", () => {
  const cases: Array<[number, string]> = [
    [0, "Avoid"],
    [39, "Avoid"],
    [40, "Weak Signal"],
    [54, "Weak Signal"],
    [55, "Niche Down"],
    [69, "Niche Down"],
    [70, "Validate First"],
    [84, "Validate First"],
    [85, "Build Now"],
    [100, "Build Now"],
  ];
  for (const [score, verdict] of cases) {
    assertEquals(verdictFor(score), verdict);
  }
});

Deno.test("Tier 3 volume cannot match Tier 1/2 evidence quality", () => {
  const base = {
    risks: [],
    competitors: [],
    hasPricingModel: true,
    launchStrategyCount: 0,
  };
  const tierThree = Array.from({ length: 12 }, (_, i) => ({
    id: `t3-${i}`,
    signal_type: "Pricing" as const,
    strength: "High" as const,
    title: "General category discussion",
    snippet: "Pricing is discussed",
    source_tier: 3 as const,
  }));
  const tierOne = [{
    id: "t1",
    signal_type: "Pricing" as const,
    strength: "High" as const,
    title: "Paid plan",
    snippet: "$49 per month",
    source_tier: 1 as const,
  }];
  const weak = computeFactors({ ...base, evidence: tierThree }).find((f) =>
    f.criterion === "willingnessToPay"
  )!;
  const strong = computeFactors({ ...base, evidence: tierOne }).find((f) =>
    f.criterion === "willingnessToPay"
  )!;
  if (weak.score >= strong.score) {
    throw new Error(
      `Tier 3 volume (${weak.score}) outweighed Tier 1 (${strong.score})`,
    );
  }
  assertEquals(weak.evidenceIds.length, 0);

  const generalDemand = Array.from({ length: 12 }, (_, i) => ({
    id: `discussion-${i}`,
    signal_type: "Demand" as const,
    strength: "High" as const,
    title: "General trend article",
    snippet: "The category is attracting discussion",
    source_tier: 3 as const,
    independent_source_count: 1,
  }));
  const specificDemand = Array.from({ length: 4 }, (_, i) => ({
    id: `pain-${i}`,
    signal_type: "Demand" as const,
    strength: "High" as const,
    title: "Specific buyer workflow",
    snippet: "Every week this manual workaround costs hours",
    source_tier: 2 as const,
    independent_source_count: 2,
  }));
  const generalReach = computeFactors({ ...base, evidence: generalDemand })
    .find((f) => f.criterion === "buyerReachability")!;
  const specificReach = computeFactors({ ...base, evidence: specificDemand })
    .find((f) => f.criterion === "buyerReachability")!;
  if (generalReach.score >= specificReach.score) {
    throw new Error(
      `Tier 3 discussion volume (${generalReach.score}) outweighed fewer Tier 2 demand rows (${specificReach.score})`,
    );
  }
});

Deno.test("weighted score is pure and deterministic", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Scoring attempted a provider/network call");
  };
  const weights = CRITERIA.map((criterion) => ({ criterion, weight: 1 }));
  const factors = CRITERIA.map((criterion) => ({
    criterion,
    score: criterion.includes("Risk") ? 20 : 80,
    evidenceIds: [],
    note: "test",
  }));
  assertEquals(calculateDeterministicScore(factors, weights), 80);
  assertEquals(calculateDeterministicScore(factors, weights), 80);
  globalThis.fetch = originalFetch;
});
