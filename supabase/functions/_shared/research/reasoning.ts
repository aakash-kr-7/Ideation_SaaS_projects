import { z } from "zod";
import { CRITERIA } from "./scoring-engine.ts";

export const citedClaimSchema = z.object({
  claim: z.string().min(1),
  evidence_ids: z.array(z.string().uuid()).min(1),
});

const citedRecommendationSchema = z.object({
  evidence_ids: z.array(z.string().uuid()).min(1),
});

const recommendationListSchema = z.union([
  z.array(z.string().min(1)).min(1).max(5),
  z.string().min(1).transform((value) => [value]),
]);

export const normalizedOpportunityArtifactsSchema = z.object({
  competitors: z.array(citedRecommendationSchema.extend({
    name: z.string().min(1),
    positioning: z.string().min(1),
    pricing: z.string().min(1),
    target: z.string().min(1),
    strength: z.string().min(1),
    gap: z.string().min(1),
  })).min(1).max(3),
  risks: z.array(citedRecommendationSchema.extend({
    category: z.enum(["Market", "Execution", "Platform", "Regulatory"]),
    severity: z.enum(["High", "Medium", "Low"]),
    description: z.string().min(1),
    mitigation: z.string().min(1),
  })).min(1).max(3),
  pricing_model: citedRecommendationSchema.extend({
    model: z.string().min(1),
    price_point: z.string().min(1),
    rationale: z.string().min(1),
    first_offer: z.string().min(1),
    target_customers: z.number().int().positive(),
  }),
  mvp_plan: citedRecommendationSchema.extend({
    outcome: z.string().min(1),
    build_estimate: z.string().min(1),
    build_complexity: z.enum(["Low", "Medium", "High"]),
    scope: recommendationListSchema,
    exclusions: recommendationListSchema,
  }),
  launch_plan: citedRecommendationSchema.extend({
    first_customer_channel: z.string().min(1),
    outreach_message: z.string().min(1),
    success_metric: z.string().min(1),
    week_one: recommendationListSchema,
    first_ten: recommendationListSchema,
  }),
});

export function assertNormalizedOpportunityRows(value: {
  competitors?: unknown[] | null;
  risks?: unknown[] | null;
  pricing_model?: unknown | null;
  mvp_plan?: { mvp_scope_items?: Array<{ item_type?: string }> } | null;
  launch_plan?: {
    launch_strategies?: Array<{ strategy_type?: string }>;
  } | null;
}) {
  const missing: string[] = [];
  if (!value.competitors?.length) missing.push("competitors");
  if (!value.risks?.length) missing.push("risks");
  if (!value.pricing_model) missing.push("pricing_models");
  const scope = value.mvp_plan?.mvp_scope_items || [];
  if (
    !value.mvp_plan || !scope.some((item) => item.item_type === "Scope") ||
    !scope.some((item) => item.item_type === "Exclusion")
  ) {
    missing.push("mvp_plans/mvp_scope_items");
  }
  const strategies = value.launch_plan?.launch_strategies || [];
  if (
    !value.launch_plan ||
    !strategies.some((item) => item.strategy_type === "WeekOne") ||
    !strategies.some((item) => item.strategy_type === "FirstTen")
  ) {
    missing.push("launch_plans/launch_strategies");
  }
  if (missing.length) {
    throw new Error(
      `Required normalized research rows are missing: ${missing.join(", ")}.`,
    );
  }
}

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
  ).length(2),
  methodology: z.array(
    z.object({
      text: z.string().min(1),
      evidence_ids: z.array(z.string().uuid()).default([]),
      score_criteria: z.array(z.enum([...CRITERIA])).default([]),
    }).refine(
      (v) => v.evidence_ids.length > 0 || v.score_criteria.length > 0,
      "Methodology sentence must be traceable",
    ),
  ).length(1),
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
