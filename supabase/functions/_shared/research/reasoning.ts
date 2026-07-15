import { z } from "zod";
import { CRITERIA } from "./scoring-engine.ts";

export const citedClaimSchema = z.object({
  claim: z.string().min(1),
  evidence_ids: z.array(z.string().uuid()).min(1),
});

const specialistBaseSchema = z.object({
  claims: z.array(citedClaimSchema),
  limitations: z.array(z.string()).default([]),
});

export const competitionAgentSchema = specialistBaseSchema;
export const marketAgentSchema = specialistBaseSchema.extend({
  demand_pattern: z.enum([
    "Growing",
    "Stable",
    "Seasonal",
    "Declining",
    "Unknown",
  ]),
});
export const pricingAgentSchema = specialistBaseSchema.extend({
  pricing_structure: z.enum([
    "Subscription",
    "Usage",
    "One-time",
    "Service",
    "Mixed",
    "Unknown",
  ]),
});
export const riskAgentSchema = specialistBaseSchema.extend({
  risks: z.array(z.object({
    category: z.enum(["Market", "Execution", "Platform", "Regulatory"]),
    severity: z.enum(["High", "Medium", "Low"]),
    claim: z.string().min(1),
    evidence_ids: z.array(z.string().uuid()).min(1),
  })),
});
export const demandAgentSchema = specialistBaseSchema.extend({
  confidence_label: z.enum(["High", "Medium", "Low"]),
  contradiction_observation: z.string().min(1),
});
export const gtmAgentSchema = specialistBaseSchema.extend({
  channels: z.array(z.object({
    channel: z.string().min(1),
    rationale: z.string().min(1),
    evidence_ids: z.array(z.string().uuid()).min(1),
  })),
});

export const finalJudgeSchema = z.object({
  executive_summary: z.array(
    z.object({
      text: z.string().min(1),
      evidence_ids: z.array(z.string().uuid()).default([]),
      score_criteria: z.array(z.enum([...CRITERIA])).default([]),
    }).refine(
      (v) => v.evidence_ids.length > 0 || v.score_criteria.length > 0,
      "Narrative sentence must be traceable",
    ),
  ),
  methodology: z.array(
    z.object({
      text: z.string().min(1),
      evidence_ids: z.array(z.string().uuid()).default([]),
      score_criteria: z.array(z.enum([...CRITERIA])).default([]),
    }).refine(
      (v) => v.evidence_ids.length > 0 || v.score_criteria.length > 0,
      "Methodology sentence must be traceable",
    ),
  ),
});

export const specialistSchemas = {
  competition: competitionAgentSchema,
  market: marketAgentSchema,
  pricing: pricingAgentSchema,
  risk: riskAgentSchema,
  demand: demandAgentSchema,
  gtm: gtmAgentSchema,
} as const;

export type SpecialistName = keyof typeof specialistSchemas;

export function assertCitationsBelongToRun(
  value: unknown,
  allowedEvidenceIds: Set<string>,
) {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (
      const [key, child] of Object.entries(node as Record<string, unknown>)
    ) {
      if (key === "evidence_ids" && Array.isArray(child)) {
        for (const id of child) {
          if (typeof id !== "string" || !allowedEvidenceIds.has(id)) {
            throw new Error(
              `Citation ${String(id)} does not belong to this research run.`,
            );
          }
        }
      } else visit(child);
    }
  };
  visit(value);
}
