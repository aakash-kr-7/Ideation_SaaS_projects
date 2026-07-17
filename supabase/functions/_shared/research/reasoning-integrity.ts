import type { EngineVerdict } from "../types.ts";

export type VerdictDirection =
  | "SupportsOpportunity"
  | "Mixed"
  | "ChallengesOpportunity"
  | "Insufficient";

export interface SpecialistComparison {
  specialist: string;
  specialistDirection: VerdictDirection | "Unavailable";
  checkerDirection: VerdictDirection | "Unavailable";
  disputed: boolean;
  reason: string;
}

export function compareSpecialistAndChecker(
  specialist: string,
  specialistResult: any,
  checkerResult: any,
): SpecialistComparison {
  const specialistDirection = specialistResult?.status === "Complete"
    ? specialistResult.output?.verdict_direction || "Unavailable"
    : "Unavailable";
  const checkerDirection = checkerResult?.status === "Complete"
    ? checkerResult.output?.verdict_direction || "Unavailable"
    : "Unavailable";
  if (
    specialistDirection === "Unavailable" || checkerDirection === "Unavailable"
  ) {
    return {
      specialist,
      specialistDirection,
      checkerDirection,
      disputed: true,
      reason:
        "The independent interpretation could not be completed, so this specialist conclusion is not independently reproduced.",
    };
  }
  if (specialistDirection !== checkerDirection) {
    return {
      specialist,
      specialistDirection,
      checkerDirection,
      disputed: true,
      reason:
        `Disputed interpretation: specialist concluded ${specialistDirection}, while the isolated checker concluded ${checkerDirection}.`,
    };
  }
  return {
    specialist,
    specialistDirection,
    checkerDirection,
    disputed: false,
    reason:
      `Independent checker reproduced the ${specialistDirection} direction.`,
  };
}

const VERDICT_ORDER: EngineVerdict[] = [
  "Avoid",
  "Weak Signal",
  "Niche Down",
  "Validate First",
  "Build Now",
];

export function gateVerdict(
  deterministicVerdict: EngineVerdict,
  adversarialGate: { outcome?: string; severity?: string },
): {
  effectiveVerdict: EngineVerdict;
  adversarialDowngrade: boolean;
  reason: string | null;
} {
  const unresolved = adversarialGate.outcome === "StrongObjection" &&
    (adversarialGate.severity === "High" ||
      adversarialGate.severity === "Medium");
  if (
    !unresolved ||
    VERDICT_ORDER.indexOf(deterministicVerdict) <=
      VERDICT_ORDER.indexOf("Weak Signal")
  ) {
    return {
      effectiveVerdict: deterministicVerdict,
      adversarialDowngrade: false,
      reason: null,
    };
  }
  return {
    effectiveVerdict: "Weak Signal",
    adversarialDowngrade: true,
    reason:
      `The deterministic ${deterministicVerdict} tier is blocked by an unresolved evidence-cited adversarial objection.`,
  };
}

export function checkVerdictConsistency(
  deterministicVerdict: EngineVerdict,
  effectiveVerdict: EngineVerdict,
  finalJudgeWrittenVerdict: EngineVerdict,
) {
  return {
    deterministicVerdict,
    effectiveVerdict,
    finalJudgeWrittenVerdict,
    finalJudgeScoreMismatch: finalJudgeWrittenVerdict !== deterministicVerdict,
    finalJudgeEffectiveMismatch: finalJudgeWrittenVerdict !== effectiveVerdict,
    // The provider's written tier is diagnostic only; code owns the report tier.
    officialVerdict: effectiveVerdict,
  };
}

interface NarrativeClaim {
  text: string;
  evidence_ids?: string[];
  score_criteria?: string[];
}

export function validateNarrativeCitations(
  judge: { executive_summary: NarrativeClaim[]; methodology: NarrativeClaim[] },
  evidenceRows: any[],
) {
  const resolvable = new Map(
    evidenceRows.filter((row) =>
      row.id && row.source_id && !row.excluded && row.sources?.url
    ).map((row) => [row.id, row]),
  );
  const invalidClaims: Array<{
    section: "executive_summary" | "methodology";
    index: number;
    text: string;
    evidenceIds: string[];
    reason: string;
  }> = [];
  const validateSection = (
    section: "executive_summary" | "methodology",
    claims: NarrativeClaim[],
  ) =>
    claims.filter((claim, index) => {
      const ids = claim.evidence_ids || [];
      const missing = ids.filter((id) => !resolvable.has(id));
      const valid = ids.length > 0 && missing.length === 0;
      if (!valid) {
        invalidClaims.push({
          section,
          index,
          text: claim.text,
          evidenceIds: ids,
          reason: ids.length === 0
            ? "Narrative claim has no evidence citation."
            : `Unresolvable evidence citations: ${missing.join(", ")}.`,
        });
      }
      return valid;
    });
  const executiveSummary = validateSection(
    "executive_summary",
    judge.executive_summary,
  );
  const methodology = validateSection("methodology", judge.methodology);
  return {
    valid: invalidClaims.length === 0,
    claimsChecked: judge.executive_summary.length + judge.methodology.length,
    claimsRemoved: invalidClaims.length,
    invalidClaims,
    executiveSummary,
    methodology,
  };
}

export function narrativeSupportsVerdict(validation: {
  claimsRemoved: number;
  executiveSummary: unknown[];
  methodology: unknown[];
}) {
  // The judge contract is already the minimum useful narrative: two conclusion
  // claims and one method claim. Losing any one removes at least a third of its
  // cited basis, so publishing a thinned verdict would create false confidence.
  return validation.claimsRemoved === 0 &&
    validation.executiveSummary.length === 2 &&
    validation.methodology.length === 1;
}
