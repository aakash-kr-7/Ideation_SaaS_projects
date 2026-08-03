import {
  certificationSummary,
  deterministicFingerprint,
  exportFactsAgree,
  factor,
  replayFixture,
  REPLAY_FIXTURES,
} from "./harness.ts";
import type { ReplayFixture } from "./fixtures.ts";

const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const fixture = (id: string) => {
  const found = REPLAY_FIXTURES.find((item) => item.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
};
const clone = (value: ReplayFixture): ReplayFixture => structuredClone(value);
const changed = (before: ReturnType<typeof replayFixture>, after: ReturnType<typeof replayFixture>) =>
  before.factors.filter((item) => factor(after, item.criterion).effectiveScore !== item.effectiveScore).map((item) => item.criterion);

Deno.test("certification corpus contains all required sanitized replay scenarios", () => {
  assert(REPLAY_FIXTURES.length === 8, "expected exactly eight bounded offline scenarios");
  assert(new Set(REPLAY_FIXTURES.map((item) => item.title)).size === 8, "scenario titles are not unique");
  for (const item of REPLAY_FIXTURES) {
    assert(item.provenance.providerSnapshot.containsSecrets === false, `${item.id} is not secret-free`);
    assert(item.provenance.providerSnapshot.containsPersonalData === false, `${item.id} is not personal-data-free`);
    assert(!/api[_-]?key|bearer\s|@gmail\.|@outlook\./i.test(JSON.stringify(item)), `${item.id} contains sensitive-looking data`);
  }
});

Deno.test("scenario directions, ranges, invariants, and explanation integrity hold", () => {
  for (const item of REPLAY_FIXTURES) {
    const result = replayFixture(item);
    assert(result.unsupportedClaims === 0, `${item.id} has unsupported claims`);
    assert(result.creditState === item.expected.creditState, `${item.id} credit state mismatch`);
    if (item.expected.researchOutcome === "research_unavailable") {
      assert(result.verdict === null && result.score === null, "provider failure created a verdict");
      continue;
    }
    assert(result.score !== null && result.verdict !== null, `${item.id} lacks completed decision`);
    const [minimum, maximum] = item.expected.scoreRange!;
    assert(result.score! >= minimum && result.score! <= maximum, `${item.id} score ${result.score} outside expected range`);
    assert(result.factors.every((entry) => entry.note.length > 15), `${item.id} has an unexplained factor`);
    assert(result.factors.every((entry) => entry.evidenceState !== "ASSUMED" || Math.abs(entry.effectiveScore - 50) <= 12.5), `${item.id} missing evidence did not pull toward neutral`);
  }
  const noWtp = replayFixture(fixture("demand-without-wtp"));
  assert(factor(noWtp, "willingnessToPay").effectiveScore === 50, "missing WTP did not remain neutral");
  const weak = replayFixture(fixture("completed-weak-research"));
  assert(weak.researchOutcome === "research_completed" && weak.verdict === "Do Not Build", "completed weak research did not produce an honest negative verdict");
  const contradiction = replayFixture(fixture("adversarial-contradiction"));
  assert(factor(contradiction, "buyerReachability").confidenceDeductions.some((item) => /unresolved/i.test(item)), "contradiction is not explained");
});

Deno.test("repeated domains do not inflate confidence", () => {
  const concentrated = fixture("strong-concentrated");
  const replay = replayFixture(concentrated);
  const diversified = clone(concentrated);
  diversified.evidence = diversified.evidence.map((item, index) => ({
    ...item,
    canonical_domain: `independent-${index}.test`,
    independence_key: `group:independent-${index}`,
  }));
  const diverseReplay = replayFixture(diversified);
  assert(replay.independentGroups === 1, "concentrated fixture was not concentrated");
  assert(factor(replay, "painSeverity").evidenceCoefficient <= factor(diverseReplay, "painSeverity").evidenceCoefficient, "repeated domain inflated pain confidence");
  assert(factor(replay, "willingnessToPay").evidenceCoefficient <= factor(diverseReplay, "willingnessToPay").evidenceCoefficient, "repeated domain inflated WTP confidence");
});

Deno.test("founder fit changes only from founder inputs", () => {
  const base = fixture("strong-multi-source");
  const initial = replayFixture(base);
  const evidenceOnly = clone(base);
  evidenceOnly.evidence.push({ ...evidenceOnly.evidence[0], id: "unrelated-extra", source_id: "source:unrelated-extra", independence_key: "group:extra.test", canonical_domain: "extra.test" });
  assert(factor(replayFixture(evidenceOnly), "founderFit").effectiveScore === factor(initial, "founderFit").effectiveScore, "market evidence changed founder fit");
  const founderChanged = clone(base);
  founderChanged.founderFitFactor = { ...founderChanged.founderFitFactor!, score: 20, rawScore: 20, effectiveScore: 20, note: "Confirmed founder inputs now show no relevant access." };
  assert(factor(replayFixture(founderChanged), "founderFit").effectiveScore === 20, "founder input did not change founder fit");
});

Deno.test("unrelated evidence cannot move the score", () => {
  const base = fixture("demand-without-wtp");
  const before = replayFixture(base);
  const mutated = clone(base);
  mutated.evidence.push({
    ...mutated.evidence[0],
    id: "excluded-unrelated",
    source_id: "source:excluded-unrelated",
    signal_type: "Pricing",
    evidence_topic: "weather",
    title: "Unrelated weather observation",
    snippet: "Unrelated weather observation",
    excluded: true,
  });
  assert(replayFixture(mutated).score === before.score, "excluded unrelated evidence moved score");
});

Deno.test("report PDF Markdown JSON and CSV agree and replay is byte deterministic", () => {
  for (const item of REPLAY_FIXTURES) {
    const first = replayFixture(item);
    assert(exportFactsAgree(first), `${item.id} exports disagree`);
    assert(deterministicFingerprint(first) === deterministicFingerprint(replayFixture(item)), `${item.id} replay differs`);
  }
});

Deno.test("Quick Scan remains faster and narrower while Full Validation is deeper", () => {
  const summary = certificationSummary();
  assert(summary.quickScanRegression.faster, "Quick Scan is not faster");
  assert(summary.quickScanRegression.narrower, "Quick Scan is not narrower");
  assert(summary.fullValidation.deeperPropositionAnalysis, "Full Validation proposition analysis is not deeper");
  assert(summary.fullValidation.deeperSegmentAnalysis, "Full Validation segment analysis is not deeper");
});

Deno.test("single-property mutation matrix changes only expected components and conclusions", async (test) => {
  const baseFixture = fixture("strong-multi-source");
  const run = async (
    name: string,
    mutate: (item: ReplayFixture) => void,
    expected: string[],
    assertion?: (before: ReturnType<typeof replayFixture>, after: ReturnType<typeof replayFixture>) => void,
  ) => {
    await test.step(name, () => {
      const candidate = clone(baseFixture);
      mutate(candidate);
      const before = replayFixture(baseFixture);
      const after = replayFixture(candidate);
      const actual = changed(before, after);
      assert(actual.every((criterion) => expected.includes(criterion)), `${name} unexpectedly changed ${actual.filter((item) => !expected.includes(item)).join(", ")}`);
      assert(actual.some((criterion) => expected.includes(criterion)) || name === "founder access", `${name} changed no expected component`);
      assertion?.(before, after);
    });
  };
  await run("authority", (item) => { item.evidence[0].source_authority = 0.2; }, ["painSeverity", "purchaseUrgency", "retentionPotential", "competitionGap", "speedToFirstRevenue"]);
  await run("freshness", (item) => { item.evidence[4].numeric_validation_state = "flagged"; }, ["willingnessToPay", "speedToFirstRevenue"], (_before, after) => {
    assert(factor(after, "willingnessToPay").confidenceDeductions.some((value) => /flagged/i.test(value)), "freshness conclusion missing");
  });
  await run("independence", (item) => { item.evidence[1].independence_key = item.evidence[0].independence_key; }, ["painSeverity", "purchaseUrgency", "retentionPotential"]);
  await run("contradiction", (item) => { item.evidence[2].evidence_role = "challenging"; }, ["buyerReachability", "distributionClarity", "competitionGap", "retentionPotential"]);
  await run("directness", (item) => { item.evidence[0].evidence_directness = 0.2; }, ["painSeverity", "purchaseUrgency", "retentionPotential", "competitionGap", "speedToFirstRevenue"]);
  await run("WTP", (item) => { item.evidence[4].evidence_topic = "competitor_pricing"; }, ["willingnessToPay", "speedToFirstRevenue"]);
  await run("founder access", (item) => {
    item.founderFitFactor = { ...item.founderFitFactor!, score: 30, rawScore: 30, effectiveScore: 30, note: "Confirmed founder access was removed." };
  }, ["founderFit"]);
  await run("pricing verification", (item) => { item.evidence[4].numeric_validation_state = "rejected"; }, ["willingnessToPay", "speedToFirstRevenue"]);
});
