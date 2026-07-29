import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerToken = /127\.0\.0\.1|localhost/.test(url || "")
  ? serviceKey
  : process.env.WEBHOOK_SECRET || serviceKey;
if (!url || !anonKey || !serviceKey || !workerToken) {
  throw new Error("Local Supabase URL and keys are required.");
}
const localFunctionEnv = existsSync("supabase/functions/.env.local")
  ? readFileSync("supabase/functions/.env.local", "utf8")
  : "";
const configuredGroundingMode = process.env.GEMINI_GROUNDING_MODE ||
  localFunctionEnv.match(/^GEMINI_GROUNDING_MODE=(.+)$/m)?.[1]?.trim();
if (configuredGroundingMode === "disabled") {
  console.log(JSON.stringify({
    result: "SKIPPED",
    reason:
      "Grounded research is disabled; the six-category benchmark is only permitted when grounding is available.",
    runIds: [],
  }, null, 2));
  process.exit(0);
}

const IDEAS = [
  {
    category: "B2B workflow SaaS",
    name: "Client Approval Ledger",
    description:
      "A workflow tool for small agencies to collect client sign-off on deliverables and preserve an attributable approval audit trail.",
    customer: "Owners and project managers at 5-50 person digital agencies",
    marketType: "B2B SaaS",
    region: "United States and United Kingdom",
  },
  {
    category: "AI developer tool",
    name: "Regression Context Copilot",
    description:
      "An AI developer tool that links failed CI tests to the smallest likely code change and explains the relevant repository history.",
    customer: "Engineering teams maintaining TypeScript monorepos",
    marketType: "Developer SaaS",
    region: "Global",
  },
  {
    category: "Consumer product",
    name: "Pantry Expiry Coach",
    description:
      "A consumer mobile product that reminds households to use expiring groceries and suggests meals from food already at home.",
    customer: "Urban households that buy groceries weekly",
    marketType: "Consumer subscription",
    region: "India",
  },
  {
    category: "Local service",
    name: "Apartment AC Rescue",
    description:
      "A local service that gives apartment residents fixed-window air-conditioner repair appointments with upfront diagnostic pricing.",
    customer: "Apartment residents who need urgent AC repair",
    marketType: "Local service",
    region: "Bengaluru, India",
  },
  {
    category: "Marketplace",
    name: "Lab Equipment Exchange",
    description:
      "A two-sided marketplace where university labs sell or rent idle scientific equipment to nearby research teams.",
    customer: "University lab managers and research procurement teams",
    marketType: "B2B marketplace",
    region: "United States",
  },
  {
    category: "Intentionally weak idea",
    name: "Daily Random Button",
    description:
      "A paid app that shows one random colored button each day without personalization, utility, community, or a defined recurring problem.",
    customer: "All smartphone users",
    marketType: "Consumer subscription",
    region: "Global",
  },
];

const preservedBaseline = {
  id: "sample-quick_scan-v1",
  source: "lib/sample-reports.ts frozen pre-upgrade Quick Scan fixture",
  acceptedEvidence: 3,
  independentGroups: 3,
  independentDomains: 3,
  sourceFamilies: 2,
  officialPricing: 0,
  wtpEvidence: 0,
  challengingEvidence: 2,
  verifiedCompetitors: 2,
};

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `quality-proof-${crypto.randomUUID()}@example.test`;
const password = `Quality!${crypto.randomUUID()}`;
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Quick Scan quality proof" },
});
if (createError || !created.user) {
  throw createError || new Error("Unable to create quality-proof user.");
}
const userId = created.user.id;
const { data: membership, error: memberError } = await admin.from("team_members")
  .select("team_id").eq("user_id", userId).single();
if (memberError || !membership) throw memberError;
await must(admin.from("team_credit_accounts").upsert({
  team_id: membership.team_id,
  paid_credits: 100,
  reserved_paid_credits: 0,
  free_quick_scans_remaining: 0,
}), "seed credits");
const { data: project, error: projectError } = await admin.from("projects")
  .insert({
    team_id: membership.team_id,
    name: "Quick Scan decision-research proof",
    created_by: userId,
  }).select("id").single();
if (projectError || !project) throw projectError;
const user = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: signInError } = await user.auth.signInWithPassword({
  email,
  password,
});
if (signInError) throw signInError;

const results = [];
const selectedIdeas = IDEAS.slice(
  0,
  Math.max(1, Math.min(IDEAS.length, Number(process.env.QUALITY_PROOF_LIMIT || IDEAS.length))),
);
for (const idea of selectedIdeas) {
  const runId = await createRun(user, project.id, idea);
  await enqueue(runId);
  await completeRun(runId);
  results.push(await evaluate(runId, idea.category));
  process.stdout.write(`${idea.category}: ${runId} complete\n`);
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  baseline: preservedBaseline,
  runs: results,
  aggregate: {
    runCount: results.length,
    totalGroundedCalls: sum(results, "groundedCalls"),
    totalPromptTokens: sum(results, "promptTokens"),
    totalCompletionTokens: sum(results, "completionTokens"),
    totalAcceptedEvidence: sum(results, "acceptedEvidence"),
    totalIndependentGroups: sum(results, "independentGroups"),
    totalValidatedPrices: sum(results, "officialPricing"),
    totalWtpEvidence: sum(results, "wtpEvidence"),
    totalContradictions: sum(results, "contradictions"),
  },
}, null, 2));

async function createRun(client, projectId, idea) {
  const { data, error } = await client.rpc("create_research_run_with_reservation", {
    p_project_id: projectId,
    p_idea_name: idea.name,
    p_idea_description: idea.description,
    p_target_customer: idea.customer,
    p_market_type: idea.marketType,
    p_target_region: idea.region,
    p_assumptions: {},
    p_mode: "quick_scan",
    p_idempotency_key: crypto.randomUUID(),
    p_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data).run_id;
}

async function enqueue(runId) {
  const { error } = await admin.rpc("enqueue_research_job", {
    p_run_id: runId,
    p_stage: "plan",
    p_input_meta: { mode: "quick_scan" },
    p_stage_iteration: 0,
    p_batch_index: 0,
    p_batch_size: 0,
    p_job_purpose: "stage",
    p_parent_job_id: null,
    p_max_attempts: 3,
    p_visible_after: new Date().toISOString(),
  });
  if (error) throw error;
}

async function completeRun(runId) {
  const deadline = Date.now() + 18 * 60_000;
  while (Date.now() < deadline) {
    const { data: run, error } = await admin.from("research_runs")
      .select("status,error_message,current_stage").eq("id", runId).single();
    if (error) throw error;
    if (run.status === "Completed") return;
    if (["Failed", "Cancelled"].includes(run.status)) {
      throw new Error(
        `${runId} ended ${run.status} at ${run.current_stage}: ${run.error_message}`,
      );
    }
    const response = await fetch(`${url}/functions/v1/research-worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "quick-scan-quality-proof" }),
    });
    if (!response.ok && response.status !== 202) {
      throw new Error(`Worker ${response.status}: ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  throw new Error(`${runId} timed out.`);
}

async function evaluate(runId, category) {
  const [
    evidenceResult,
    contradictionResult,
    competitorResult,
    pricingResult,
    confidenceResult,
    callResult,
    usageResult,
    reportResult,
    packResult,
    adapterResult,
    rejectionResult,
    runResult,
    reservationResult,
  ] = await Promise.all([
    admin.from("evidence_items").select("*").eq("run_id", runId).eq("excluded", false),
    admin.from("evidence_contradictions").select("*").eq("run_id", runId),
    admin.from("opportunities").select("id,competitors(*)").eq("run_id", runId).single(),
    admin.from("validated_pricing_observations").select("*").eq("run_id", runId),
    admin.from("evidence_confidence_results").select("*").eq("run_id", runId).single(),
    admin.from("research_call_metrics").select("*").eq("run_id", runId),
    admin.from("api_usage_logs").select("prompt_tokens,completion_tokens,grounded_search_requested,status").eq("run_id", runId),
    admin.from("reports").select("report_versions(payload)").eq("run_id", runId).single(),
    admin.from("quick_scan_research_pack_statuses").select("*").eq("run_id", runId),
    admin.from("research_adapter_metrics").select("*").eq("run_id", runId),
    admin.from("evidence_rejection_diagnostics").select("*").eq("run_id", runId),
    admin.from("research_runs").select("research_outcome,credit_state").eq("id", runId).single(),
    admin.from("credit_reservations").select("status").eq("run_id", runId).single(),
  ]);
  for (const result of [
    evidenceResult,
    contradictionResult,
    competitorResult,
    pricingResult,
    confidenceResult,
    callResult,
    usageResult,
    reportResult,
    packResult,
    adapterResult,
    rejectionResult,
    runResult,
    reservationResult,
  ]) {
    if (result.error) throw result.error;
  }
  const evidence = evidenceResult.data || [];
  const calls = callResult.data || [];
  const usage = usageResult.data || [];
  const report = reportResult.data?.report_versions?.[0]?.payload || {};
  const independentGroups = new Set(evidence.map((item) =>
    item.independence_key || item.syndication_group || item.claim_fingerprint
  )).size;
  const sourceFamilies = new Set(evidence.map((item) => item.source_family).filter(Boolean));
  const unsupportedClaims = evidence.filter((item) =>
    !item.source_id || !item.claim_fingerprint ||
    Number(item.semantic_relevance || item.relevance_score || 0) < 0.55 ||
    item.acceptance_decision !== "accepted_core"
  ).length;
  return {
    category,
    runId,
    acceptedEvidence: evidence.length,
    independentGroups,
    independentDomains: new Set(evidence.map((item) => item.canonical_domain).filter(Boolean)).size,
    sourceFamilies: sourceFamilies.size,
    officialPricing: (pricingResult.data || []).length,
    wtpEvidence: evidence.filter((item) => item.evidence_topic === "willingness_to_pay").length,
    adversarialEvidence: evidence.filter((item) => item.disconfirming).length,
    contradictions: (contradictionResult.data || []).length,
    verifiedCompetitors: (competitorResult.data?.competitors || []).filter((item) =>
      ["live_verified_competitor", "adjacent_alternative"].includes(item.verification_status)
    ).length,
    seededCompetitors: (competitorResult.data?.competitors || []).filter((item) =>
      ["unverified_seed", "discovered_candidate"].includes(item.verification_status)
    ).length,
    confidence: confidenceResult.data?.band,
    confidenceScore: confidenceResult.data?.score,
    scoreDisplay: report.opportunity?.scorecard?.scoreBand?.display,
    verdict: report.opportunity?.scorecard?.verdict,
    verdictChangeConditions: report.verdictChangeConditions,
    researchPackStatuses: (packResult.data || []).map((item) => ({
      pack: item.pack_key,
      status: item.status,
      acceptedEvidence: item.accepted_evidence_count,
    })),
    adapterMetrics: adapterResult.data || [],
    rejectionDiagnostics: rejectionResult.data || [],
    officialSources: evidence.filter((item) =>
      ["primary", "official"].includes(item.source_class)
    ).length,
    researchOutcome: runResult.data?.research_outcome,
    creditResult: reservationResult.data?.status ||
      runResult.data?.credit_state,
    conditionalTriggers: [...new Set(calls.flatMap((item) =>
      item.conditional_call_trigger || []
    ))],
    groundedCalls: usage.filter((item) => item.grounded_search_requested).length,
    totalCalls: usage.length,
    promptTokens: usage.reduce((sumValue, item) =>
      sumValue + Number(item.prompt_tokens || 0), 0),
    completionTokens: usage.reduce((sumValue, item) =>
      sumValue + Number(item.completion_tokens || 0), 0),
    semanticAlignment:
      evidence.length
        ? Number((evidence.filter((item) =>
          Number(item.semantic_relevance || item.relevance_score || 0) >= 0.55
        ).length / evidence.length).toFixed(2))
        : 0,
    unsupportedClaims,
    insufficientEvidence: evidence.length === 0,
  };
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

async function must(query, operation) {
  const { error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
}
