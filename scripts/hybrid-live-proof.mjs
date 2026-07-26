import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerToken = process.env.WEBHOOK_SECRET || serviceKey;
if (!url || !anonKey || !serviceKey || !workerToken) {
  throw new Error("Local Supabase and worker authentication configuration is required.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const requestedMode = process.argv[2] || "all";
const modes = requestedMode === "all" ? ["quick_scan", "full_validation"] : [requestedMode];
if (modes.some((mode) => !["quick_scan", "full_validation"].includes(mode))) {
  throw new Error("Usage: hybrid-live-proof.mjs [quick_scan|full_validation|all]");
}
const suffix = crypto.randomUUID().slice(0, 8);
const email = `hybrid-proof-${suffix}@localhost.test`;
const password = `HybridProof!${crypto.randomUUID()}`;
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Hybrid live proof" },
});
if (createError || !created.user) throw createError || new Error("Unable to create the proof customer.");

const { data: membership, error: membershipError } = await admin
  .from("team_members")
  .select("team_id")
  .eq("user_id", created.user.id)
  .single();
if (membershipError || !membership) throw membershipError || new Error("Proof customer onboarding did not create a team.");
await must(admin.from("team_credit_accounts").upsert({
  team_id: membership.team_id,
  paid_credits: 20,
  reserved_paid_credits: 0,
  free_quick_scans_remaining: 1,
}), "seed proof credits");
const { data: project, error: projectError } = await admin.from("projects").insert({
  team_id: membership.team_id,
  name: `Hybrid live proof ${suffix}`,
  created_by: created.user.id,
}).select("id").single();
if (projectError || !project) throw projectError || new Error("Unable to create the proof project.");

const customer = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: signInError } = await customer.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

const results = [];
for (const mode of modes) {
  const runId = await reserveRun(customer, project.id, mode);
  await enqueuePlan(runId, mode);
  const result = await driveToCompletion(runId, mode);
  results.push(result);
  console.log(JSON.stringify({ completed: result }));
}

console.log(JSON.stringify({
  authenticatedCustomerPath: true,
  groundingModeExpected: "disabled",
  databasePreserved: true,
  proofUserId: created.user.id,
  projectId: project.id,
  runs: results,
}, null, 2));

async function reserveRun(client, projectId, mode) {
  const { data, error } = await client.rpc("create_research_run_with_reservation", {
    p_project_id: projectId,
    p_idea_name: "Customer sign-off and attributable approval workspace",
    p_idea_description: "A lightweight approval and audit-trail workspace for service teams that need to collect customer sign-off, preserve attributable approval history and reduce disputes.",
    p_target_customer: "Service teams that deliver work to customers",
    p_market_type: "B2B SaaS",
    p_target_region: "United States and global English-speaking markets",
    p_assumptions: {
      buyer: "Service operations leaders, agency owners, and client-delivery leaders",
      endUser: "Project managers, account managers, and service-delivery staff who request and track customer approval",
      workflow: "Requesting, collecting, recording, and retrieving customer approval or sign-off on service deliverables",
      problem: "Customer approvals are scattered or ambiguous, leaving service teams without attributable proof and exposed to disputes",
      expectedOutcome: "Faster customer sign-off, preserved attributable approval history, and fewer delivery or billing disputes",
      industry: "Professional services and client-service operations",
      directCompetitorCategory: "Client approval, online proofing, and customer sign-off audit-trail software",
      adjacentOutOfScopeCategories: ["CI/CD pipelines", "deployment automation", "YAML pipelines", "generic DevOps workflows"],
      priceHypothesis: "Per-team monthly subscription",
    },
    p_mode: mode,
    p_idempotency_key: crypto.randomUUID(),
    p_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data).run_id;
}

async function enqueuePlan(runId, mode) {
  const { error } = await admin.rpc("enqueue_research_job", {
    p_run_id: runId,
    p_stage: "plan",
    p_input_meta: { mode },
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

async function driveToCompletion(runId, mode) {
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const { data: run, error } = await admin.from("research_runs")
      .select("status,error_message,credit_state,progress,progress_detail")
      .eq("id", runId)
      .single();
    if (error) throw error;
    if (run.status === "Completed") break;
    if (["Failed", "Cancelled"].includes(run.status)) {
      throw new Error(`${mode} ${runId} ended ${run.status}: ${run.error_message}`);
    }
    const response = await fetch(`${url}/functions/v1/research-worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "hybrid-live-proof", runId }),
    });
    if (!response.ok && response.status !== 202) {
      throw new Error(`Worker request failed (${response.status}): ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const [{ data: run }, { data: jobs }, { data: metrics }, { data: report }] = await Promise.all([
    admin.from("research_runs").select("status,credit_state").eq("id", runId).single(),
    admin.from("research_jobs").select("stage,status,attempt_count,error_class,error_message").eq("run_id", runId).order("created_at"),
    admin.from("research_pipeline_metrics").select("*").eq("run_id", runId).single(),
    admin.from("reports").select("id,report_versions(id,report_exports(format),report_chart_datasets(chart_key))").eq("run_id", runId).single(),
  ]);
  if (run?.status !== "Completed" || run.credit_state !== "consumed") {
    throw new Error(`${mode} ${runId} did not complete and consume its reservation.`);
  }
  const expectedStages = ["plan", "grounded_research", "evidence_boosters", "validate_normalize", "analyze_score", "generate_report", "generate_exports", "complete"];
  if (JSON.stringify(jobs?.map((job) => job.stage)) !== JSON.stringify(expectedStages) || jobs?.some((job) => job.status !== "completed")) {
    throw new Error(`${mode} ${runId} did not use the canonical stage path: ${JSON.stringify(jobs)}`);
  }
  const version = report?.report_versions?.[0];
  if (!version || version.report_exports?.length !== 4 || !version.report_chart_datasets?.length) {
    throw new Error(`${mode} ${runId} did not produce all required artifacts.`);
  }
  if (metrics?.grounding_mode !== "disabled" || metrics.grounded_calls_attempted !== 0) {
    throw new Error(`${mode} ${runId} was not a disabled-grounding run.`);
  }
  return {
    mode,
    runId,
    status: run.status,
    stages: jobs.map((job) => ({ stage: job.stage, status: job.status, attempts: job.attempt_count })),
    exports: version.report_exports.map((item) => item.format).sort(),
    charts: version.report_chart_datasets.map((item) => item.chart_key).sort(),
  };
}

async function must(query, operation) {
  const { error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
}
