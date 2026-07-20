import type { EngineVerdict } from "../types.ts";

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

interface NarrativeClaim {
  text: string;
  evidence_ids?: string[];
  score_criteria?: string[];
}

export function validateNarrativeCitations(
  judge: { executive_summary: NarrativeClaim[]; methodology: NarrativeClaim[] },
  evidenceRows: Array<{ id?: string; source_id?: string | null; excluded?: boolean; sources?: { url?: string | null } | null }>,
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
