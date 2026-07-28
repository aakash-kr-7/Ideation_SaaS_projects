import "dotenv/config";
import { createIsolatedSmokeRun, removeIsolatedSmokeRun } from "./support/isolated-smoke-run.mjs";

const smoke = await createIsolatedSmokeRun("worker");
try {
  const endpoint = `${smoke.url}/functions/v1/research-worker`;
  const unauthorized = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (unauthorized.status !== 401) throw new Error(`Worker auth boundary failed: expected 401, got ${unauthorized.status}`);

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("WEBHOOK_SECRET is required");
  const badAuth = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer wrong_secret`, "content-type": "application/json" }, body: JSON.stringify({ trigger: "isolated-smoke", runId: smoke.runId }) });
  if (badAuth.status !== 401) throw new Error(`Worker auth boundary failed: expected 401, got ${badAuth.status} for wrong secret`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${webhookSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ trigger: "isolated-smoke", runId: smoke.runId }),
  });
  const payload = await response.json();
  if (!response.ok || payload.run_id !== smoke.runId || payload.stage !== "plan") {
    throw new Error(`Wrong job claimed. Expected run ${smoke.runId}; received ${JSON.stringify(payload)}`);
  }
  const { data: job, error } = await smoke.admin.from("research_jobs")
    .select("run_id,status,stage,attempt_count,error_class,error_message")
    .eq("id", payload.job_id).single();
  if (error) throw error;
  if (job.run_id !== smoke.runId || job.stage !== "plan" || job.status !== "completed" || job.attempt_count !== 1) {
    throw new Error(`Scoped worker execution failed: ${JSON.stringify(job)}`);
  }
  console.log(JSON.stringify({
    namespace: smoke.runId,
    runId: smoke.runId,
    jobId: payload.job_id,
    unauthorizedRejected: true,
    claimedOnlyOwnRun: true,
    stage: job.stage,
    jobStatus: job.status,
    attemptCount: job.attempt_count,
  }, null, 2));
} finally {
  await removeIsolatedSmokeRun(smoke);
}
