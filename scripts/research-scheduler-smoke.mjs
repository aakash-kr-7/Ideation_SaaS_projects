import "dotenv/config";
import { createIsolatedSmokeRun, removeIsolatedSmokeRun } from "./support/isolated-smoke-run.mjs";

const smoke = await createIsolatedSmokeRun("scheduler");
try {
  const endpoint = `${smoke.url}/functions/v1/research-scheduler`;
  const unauthorized = await fetch(endpoint, { method: "POST" });
  if (unauthorized.status !== 401) throw new Error(`Scheduler auth boundary failed: expected 401, got ${unauthorized.status}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${smoke.serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ runId: smoke.runId }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Scheduler failed: ${JSON.stringify(payload)}`);
  if (payload.runId !== smoke.runId) throw new Error(`Scheduler namespace mismatch: ${JSON.stringify(payload)}`);
  for (const field of ["recovered", "orphaned", "pending"]) {
    if (!Number.isInteger(payload[field]) || payload[field] < 0) throw new Error(`Invalid ${field}: ${JSON.stringify(payload)}`);
  }
  if (payload.orphaned !== 0 || payload.pending !== 1 || payload.triggered !== true) {
    throw new Error(`Scoped scheduler did not observe exactly its own queued job: ${JSON.stringify(payload)}`);
  }
  let scheduledJob;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data, error } = await smoke.admin.from("research_jobs")
      .select("run_id,status,stage,claimed_by").eq("run_id", smoke.runId).eq("stage", "plan").single();
    if (error) throw error;
    scheduledJob = data;
    if (data.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (scheduledJob?.run_id !== smoke.runId || scheduledJob.status !== "completed") {
    throw new Error(`Scheduler-triggered worker did not finish its own plan job: ${JSON.stringify(scheduledJob)}`);
  }
  console.log(JSON.stringify({
    namespace: smoke.runId,
    authenticated: true,
    unauthorizedRejected: true,
    isolatedRunOnly: true,
    recovered: payload.recovered,
    orphaned: payload.orphaned,
    pending: payload.pending,
    triggered: payload.triggered,
    workerCompletedOwnJob: true,
  }, null, 2));
} finally {
  await removeIsolatedSmokeRun(smoke);
}
