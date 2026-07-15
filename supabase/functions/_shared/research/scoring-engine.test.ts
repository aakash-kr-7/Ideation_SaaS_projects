import {
  calculateDeterministicScore,
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
