/*
 * Real local queue smoke test. It deliberately uses the running local Supabase
 * stack and does not mock RPCs or the Edge worker.
 *
 * Required: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * WEBHOOK_SECRET is used when configured; service-role authentication is used
 * locally otherwise. Optional SMOKE_* values select a pre-existing account/project;
 * absent values create an isolated verified local smoke user, team credit account,
 * and project through the real local APIs.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing local smoke configuration: ${missing.join(", ")}`);

const url = process.env.SUPABASE_URL.replace(/\/$/, "");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID().slice(0, 8);
const mode = process.env.SMOKE_MODE ?? "quick_scan";
if (!new Set(["quick_scan", "full_validation"]).has(mode)) throw new Error("SMOKE_MODE must be quick_scan or full_validation");
const email = process.env.SMOKE_USER_EMAIL ?? `worker-smoke-${suffix}@example.test`;
const password = process.env.SMOKE_USER_PASSWORD ?? `Smoke!${crypto.randomUUID()}`;
let projectId = process.env.SMOKE_PROJECT_ID;
if (!process.env.SMOKE_USER_EMAIL) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Worker smoke" } });
  if (error || !created.user) throw error ?? new Error("Unable to create smoke user");
  const { data: membership, error: membershipError } = await admin.from("team_members").select("team_id").eq("user_id", created.user.id).single();
  if (membershipError || !membership) throw membershipError ?? new Error("Smoke user was not provisioned with a team");
  const { error: creditError } = await admin.from("team_credit_accounts").upsert({ team_id: membership.team_id, paid_credits: 10, reserved_paid_credits: 0, free_quick_scans_remaining: 1 });
  if (creditError) throw creditError;
  const { data: project, error: projectError } = await admin.from("projects").insert({ team_id: membership.team_id, name: `Worker smoke ${suffix}`, created_by: created.user.id }).select("id").single();
  if (projectError || !project) throw projectError ?? new Error("Unable to create smoke project");
  projectId = project.id;
}
if (!projectId) throw new Error("SMOKE_PROJECT_ID is required when using SMOKE_USER_EMAIL");
const user = createClient(url, process.env.SUPABASE_ANON_KEY);
const { error: signInError } = await user.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;

const requestId = crypto.randomUUID();
const idempotencyKey = crypto.randomUUID();
const { data: reservationRows, error: reserveError } = await user.rpc("create_research_run_with_reservation", {
  p_project_id: projectId, p_idea_name: "Worker smoke test", p_idea_description: "A real local staged queue smoke test that verifies claiming and the planning stage.",
  p_target_customer: "Local test operators", p_market_type: "B2B", p_target_region: "Local", p_assumptions: {}, p_mode: mode, p_idempotency_key: idempotencyKey, p_request_id: requestId,
});
if (reserveError) throw reserveError;
const reservation = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
const runId = reservation.run_id;
const { error: enqueueError } = await admin.rpc("enqueue_research_job", { p_run_id: runId, p_stage: "plan_research", p_input_meta: { smoke: true }, p_stage_iteration: 0, p_batch_index: 0, p_batch_size: 0, p_job_purpose: "stage", p_parent_job_id: null, p_max_attempts: 1, p_visible_after: new Date().toISOString() });
if (enqueueError) throw enqueueError;

const workerUrl = `${url}/functions/v1/research-worker`;
const rejected = await fetch(workerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trigger: "smoke-auth-check" }) });
if (rejected.status !== 401) throw new Error(`Worker secret validation failed: expected 401, got ${rejected.status}`);
const workerToken = process.env.WEBHOOK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const response = await fetch(workerUrl, { method: "POST", headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" }, body: JSON.stringify({ trigger: "smoke" }) });
const worker = await response.json();
if (!response.ok || worker.stage !== "plan_research") throw new Error(`Worker did not claim plan_research: ${JSON.stringify(worker)}`);
const { data: job, error: jobError } = await admin.from("research_jobs").select("status,stage,attempt_count,error_class,error_message").eq("id", worker.job_id).single();
if (jobError) throw jobError;
if (job.stage !== "plan_research" || job.attempt_count !== 1 || job.status !== "completed") throw new Error(`First stage did not execute: ${JSON.stringify(job)}`);
const { data: cancelResult, error: cancelError } = await user.rpc("cancel_research_run", { p_run_id: runId, p_reason: "Worker smoke cleanup" });
if (cancelError || cancelResult !== "Cancelled") throw cancelError ?? new Error(`Unexpected cancellation result: ${cancelResult}`);
const { data: repeatedCancel, error: repeatedCancelError } = await user.rpc("cancel_research_run", { p_run_id: runId, p_reason: "Worker smoke cleanup retry" });
if (repeatedCancelError || repeatedCancel !== "Cancelled") throw repeatedCancelError ?? new Error(`Cancellation was not idempotent: ${repeatedCancel}`);
const [{ data: cancelledRun, error: cancelledRunError }, { data: creditReservation, error: reservationError }, { count: pendingJobs, error: pendingJobsError }, { count: claimedJobs, error: claimedJobsError }] = await Promise.all([
  admin.from("research_runs").select("status,credit_state").eq("id", runId).single(),
  admin.from("credit_reservations").select("status").eq("run_id", runId).single(),
  admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending"),
  admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "claimed"),
]);
if (cancelledRunError || reservationError || pendingJobsError || claimedJobsError) throw cancelledRunError ?? reservationError ?? pendingJobsError ?? claimedJobsError;
if (cancelledRun.status !== "Cancelled" || cancelledRun.credit_state !== "restored" || creditReservation.status !== "restored" || pendingJobs !== 0) {
  throw new Error(`Cancellation did not settle exactly once: ${JSON.stringify({ cancelledRun, creditReservation, pendingJobs, claimedJobs })}`);
}
console.log(JSON.stringify({ mode, runId, jobId: worker.job_id, workerAuthRejected: true, claimed: true, stage: job.stage, jobStatus: job.status, attemptCount: job.attempt_count, cancelled: true, creditRestored: true, cancellationIdempotent: true, pendingJobsAfterCancellation: pendingJobs, claimedJobsAllowedToFinishAtomicOperation: claimedJobs }, null, 2));
