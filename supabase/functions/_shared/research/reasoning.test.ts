import {
  assertCitationsBelongToRun,
  assertNormalizedOpportunityRows,
  competitionAgentSchema,
  finalJudgeSchema,
  normalizedOpportunityArtifactsSchema,
} from "./reasoning.ts";

function expectThrow(fn: () => unknown) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected validation failure");
}
Deno.test("specialist claims without citations are rejected", () => {
  expectThrow(() =>
    competitionAgentSchema.parse({
      claims: [{ claim: "unsupported", evidence_ids: [] }],
      limitations: [],
      verdict_direction: "SupportsOpportunity",
    })
  );
});
Deno.test("citations from another run are rejected", () => {
  expectThrow(() =>
    assertCitationsBelongToRun({
      claims: [{
        claim: "foreign",
        evidence_ids: ["00000000-0000-4000-8000-000000000099"],
      }],
    }, new Set(["00000000-0000-4000-8000-000000000001"]))
  );
});

Deno.test("Final Judge requires three individually traceable sentences", () => {
  const sentence = {
    text: "Traceable sentence.",
    evidence_ids: ["00000000-0000-4000-8000-000000000001"],
    score_criteria: [],
  };
  finalJudgeSchema.parse({
    written_verdict: "Validate First",
    executive_summary: [sentence, { ...sentence, text: "Second sentence." }],
    methodology: [{ ...sentence, text: "Method sentence." }],
  });
  expectThrow(() =>
    finalJudgeSchema.parse({
      written_verdict: "Validate First",
      executive_summary: [sentence],
      methodology: [sentence],
    })
  );
});

Deno.test("normalized opportunity artifacts require every cited section", () => {
  const evidenceId = "00000000-0000-4000-8000-000000000001";
  const citations = { evidence_ids: [evidenceId] };
  normalizedOpportunityArtifactsSchema.parse({
    competitors: [{
      ...citations,
      name: "Named competitor",
      positioning: "Approval workflow",
      pricing: "$20 per month",
      target: "Agencies",
      strength: "Existing workflow adoption",
      gap: "No immutable approval ledger",
    }],
    risks: [{
      ...citations,
      category: "Market",
      severity: "Medium",
      description: "Buyers already use approval tools.",
      mitigation: "Validate the audit-ledger wedge first.",
    }],
    pricing_model: {
      ...citations,
      model: "Subscription",
      price_point: "$49 per month",
      rationale: "Anchored to observed alternatives.",
      first_offer: "Paid pilot",
      target_customers: 10,
    },
    mvp_plan: {
      ...citations,
      outcome: "Prove teams pay for traceable approvals.",
      build_estimate: "Two weeks",
      build_complexity: "Medium",
      scope: ["Approval ledger"],
      exclusions: ["Asset editing"],
    },
    launch_plan: {
      ...citations,
      first_customer_channel: "Agency communities",
      outreach_message: "Test a traceable approval ledger.",
      success_metric: "Ten paid pilots",
      week_one: "Interview five agencies",
      first_ten: "Concierge onboarding",
    },
  });
  expectThrow(() => normalizedOpportunityArtifactsSchema.parse({}));
});

Deno.test("completion invariant rejects missing normalized rows", () => {
  expectThrow(() => assertNormalizedOpportunityRows({ competitors: [] }));
  assertNormalizedOpportunityRows({
    competitors: [{}],
    risks: [{}],
    pricing_model: {},
    mvp_plan: {
      mvp_scope_items: [{ item_type: "Scope" }, { item_type: "Exclusion" }],
    },
    launch_plan: {
      launch_strategies: [
        { strategy_type: "WeekOne" },
        { strategy_type: "FirstTen" },
      ],
    },
  });
});
