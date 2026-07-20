import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerToken = process.env.WEBHOOK_SECRET || serviceKey;
if (!url || !anonKey || !serviceKey || !workerToken) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and worker authentication are required.");
const requested = process.argv[2] || "all";
const modes = requested === "all" ? ["quick_scan", "full_validation"] : [requested];
if (modes.some((mode) => !["quick_scan", "full_validation"].includes(mode))) throw new Error("Usage: pipeline-integration.mjs [quick_scan|full_validation|all]");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `pipeline-${crypto.randomUUID()}@example.test`;
const password = `Pipeline!${crypto.randomUUID()}`;
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Pipeline integration" } });
if (createError || !created.user) throw createError || new Error("Unable to create integration user");
const userId = created.user.id;

try {
  const { data: membership, error: memberError } = await admin.from("team_members").select("team_id").eq("user_id", userId).single();
  if (memberError || !membership) throw memberError || new Error("Integration user was not bootstrapped");
  await must(admin.from("team_credit_accounts").upsert({ team_id: membership.team_id, paid_credits: 20, reserved_paid_credits: 0, free_quick_scans_remaining: 1 }), "seed credits");
  const { data: project, error: projectError } = await admin.from("projects").insert({ team_id: membership.team_id, name: "Gemini hybrid integration", created_by: userId }).select("id").single();
  if (projectError || !project) throw projectError || new Error("Unable to create integration project");
  const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  await verifyStaleRecovery(user, project.id);
  const results = [];
  for (const mode of modes) results.push(await runPipeline(user, project.id, mode));
  console.log(JSON.stringify({ staleRecovery: "PASS", pipelines: results }, null, 2));
} finally {
  await admin.auth.admin.deleteUser(userId);
}

async function reserve(user, projectId, mode, label) {
  const { data, error } = await user.rpc("create_research_run_with_reservation", {
    p_project_id: projectId, p_idea_name: `${label} ${mode}`,
    p_idea_description: "A workflow tool that helps small service teams collect approvals and preserve an attributable audit trail.",
    p_target_customer: "Small software and agency teams", p_market_type: "B2B", p_target_region: "Global",
    p_assumptions: {}, p_mode: mode, p_idempotency_key: crypto.randomUUID(), p_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data).run_id;
}

async function enqueuePlan(runId, mode) {
  const params = { p_run_id: runId, p_stage: "plan", p_input_meta: { mode }, p_stage_iteration: 0, p_batch_index: 0, p_batch_size: 0, p_job_purpose: "stage", p_parent_job_id: null, p_max_attempts: 3, p_visible_after: new Date().toISOString() };
  const first = await admin.rpc("enqueue_research_job", params); if (first.error) throw first.error;
  const duplicate = await admin.rpc("enqueue_research_job", params); if (duplicate.error) throw duplicate.error;
  if (first.data !== duplicate.data) throw new Error("Plan enqueue was not idempotent");
}

async function verifyStaleRecovery(user, projectId) {
  const runId = await reserve(user, projectId, "quick_scan", "Stale recovery");
  await enqueuePlan(runId, "quick_scan");
  const claimed = await admin.rpc("claim_research_job", { p_worker_id: "integration-stale", p_visibility_timeout_ms: 60_000 });
  if (claimed.error || !claimed.data?.[0]) throw claimed.error || new Error("Could not claim stale recovery fixture");
  const staleAt = new Date(Date.now() - 600_000).toISOString();
  await must(admin.from("research_jobs").update({ claimed_at: staleAt, visible_after: staleAt }).eq("id", claimed.data[0].id), "age claimed job lease");
  const recovered = await admin.rpc("recover_stale_research_jobs", { p_stale_threshold_ms: 1_000 });
  if (recovered.error || recovered.data < 1) throw recovered.error || new Error("Scheduler stale recovery did not recover the claimed job");
  const cancelled = await user.rpc("cancel_research_run", { p_run_id: runId, p_reason: "Integration stale recovery complete" });
  if (cancelled.error || cancelled.data !== "Cancelled") throw cancelled.error || new Error("Recovery fixture cancellation failed");
  const repeated = await user.rpc("cancel_research_run", { p_run_id: runId, p_reason: "Repeated cancellation" });
  if (repeated.error || repeated.data !== "Cancelled") throw repeated.error || new Error("Cancellation is not idempotent");
  const { data: reservation } = await admin.from("credit_reservations").select("status").eq("run_id", runId).single();
  if (reservation?.status !== "restored") throw new Error("Cancelled stale run did not restore its credit exactly once");
}

async function runPipeline(user, projectId, mode) {
  const runId = await reserve(user, projectId, mode, "Canonical pipeline");
  await enqueuePlan(runId, mode);
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const { data: run, error } = await admin.from("research_runs").select("status,error_message,credit_state").eq("id", runId).single();
    if (error) throw error;
    if (run.status === "Completed") break;
    if (["Failed", "Cancelled"].includes(run.status)) throw new Error(`${mode} ended ${run.status}: ${run.error_message}; credit=${run.credit_state}`);
    const response = await fetch(`${url}/functions/v1/research-worker`, { method: "POST", headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ source: "pipeline-integration" }) });
    if (!response.ok && response.status !== 202) throw new Error(`Worker request failed (${response.status}): ${await response.text()}`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  const { data: run } = await admin.from("research_runs").select("status,credit_state").eq("id", runId).single();
  if (run?.status !== "Completed" || run.credit_state !== "consumed") throw new Error(`${mode} did not complete and consume its reservation`);
  const { data: jobs } = await admin.from("research_jobs").select("stage,status").eq("run_id", runId).order("created_at");
  const expected = ["plan", "grounded_research", "evidence_boosters", "validate_normalize", "analyze_score", "generate_report", "generate_exports", "complete"];
  if (JSON.stringify(jobs?.map((job) => job.stage)) !== JSON.stringify(expected) || jobs.some((job) => job.status !== "completed")) throw new Error(`${mode} queue path was not canonical: ${JSON.stringify(jobs)}`);
  const { data: report } = await admin.from("reports").select("id,report_versions(id,report_exports(format),report_chart_datasets(chart_key))").eq("run_id", runId).single();
  const version = report?.report_versions?.[0];
  const expectedExports = mode === "quick_scan" ? 1 : 4;
  if (!version || version.report_exports?.length !== expectedExports || !version.report_chart_datasets?.length) throw new Error(`${mode} report artifacts are incomplete`);
  return { mode, runId, stages: expected.length, exports: version.report_exports.length, charts: version.report_chart_datasets.length, status: "PASS" };
}

async function must(query, operation) { const { error } = await query; if (error) throw new Error(`${operation}: ${error.message}`); }
