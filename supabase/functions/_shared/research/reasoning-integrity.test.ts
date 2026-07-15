import {
  checkVerdictConsistency,
  compareSpecialistAndChecker,
  gateVerdict,
  validateNarrativeCitations,
} from "./reasoning-integrity.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("isolated checker disagreement is surfaced, never silently resolved", () => {
  const comparison = compareSpecialistAndChecker(
    "pricing",
    { status: "Complete", output: { verdict_direction: "SupportsOpportunity" } },
    { status: "Complete", output: { verdict_direction: "ChallengesOpportunity" } },
  );
  assert(comparison.disputed, "opposing directions were not disputed");
  assert(comparison.reason.includes("Disputed interpretation"), "dispute was not explicit");
});

Deno.test("Final Judge cannot override the code-owned verdict tier", () => {
  const consistency = checkVerdictConsistency("Weak Signal", "Weak Signal", "Build Now");
  assert(consistency.finalJudgeScoreMismatch, "mismatch was not flagged");
  assert(consistency.officialVerdict === "Weak Signal", "narrative overrode deterministic code");
});

Deno.test("strong unresolved adversarial objection applies a code-owned safety downgrade", () => {
  const gated = gateVerdict("Build Now", { outcome: "StrongObjection", severity: "High" });
  assert(gated.effectiveVerdict === "Weak Signal", "strong objection did not block optimistic verdict");
  assert(gated.adversarialDowngrade, "downgrade flag missing");
  const survived = gateVerdict("Validate First", { outcome: "NoStrongDisproof", severity: "None" });
  assert(survived.effectiveVerdict === "Validate First", "no-disproof gate changed deterministic verdict");
});

Deno.test("post-generation citation validation strips unresolvable claims", () => {
  const goodId = "00000000-0000-4000-8000-000000000001";
  const badId = "00000000-0000-4000-8000-000000000099";
  const validation = validateNarrativeCitations({
    executive_summary: [
      { text: "Resolved", evidence_ids: [goodId] },
      { text: "Missing source", evidence_ids: [badId] },
    ],
    methodology: [{ text: "Uncited", evidence_ids: [] }],
  }, [{ id: goodId, source_id: "source-1", excluded: false, sources: { url: "https://example.test/evidence" } }]);
  assert(!validation.valid, "invalid citations passed");
  assert(validation.claimsRemoved === 2, "wrong removal count");
  assert(validation.executiveSummary.length === 1, "valid claim was not preserved");
});
