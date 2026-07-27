import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Supabase service configuration is required.");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: alertSummary, error: alertError } = await db.rpc(
  "collect_research_operational_alerts",
);
if (alertError) throw alertError;

const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

const [
  { data: alerts, error: openError },
  { data: usage, error: usageError },
  { count: queueDepth, error: queueError },
  { count: stuckRuns, error: stuckError },
  { data: completedRuns, error: completedError },
  { count: pendingReservations, error: resError },
] = await Promise.all([
  db.from("operational_alerts").select(
    "alert_type,severity,run_id,details,created_at",
  ).eq("status", "open").order("created_at", { ascending: false }).limit(100),
  db.from("api_usage_logs").select(
    "provider,cost,prompt_tokens,completion_tokens,status",
  ).gte("created_at", since),
  db.from("research_jobs").select("id", { count: "exact", head: true }).eq(
    "status",
    "pending",
  ),
  db.from("research_runs").select("id", { count: "exact", head: true }).in(
    "status",
    ["Queued", "Running"],
  ).lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString()),
  db.from("research_runs").select(
    "id,reports!inner(id,report_versions!inner(id,report_exports(format)))",
  ).eq("status", "Completed").gte("terminal_at", since),
  db.from("credit_reservations").select("id", { count: "exact", head: true })
    .eq("status", "reserved").lt(
      "created_at",
      new Date(Date.now() - 2 * 3600_000).toISOString(),
    ),
]);

if (
  openError || usageError || queueError || stuckError || completedError ||
  resError
) {
  throw openError ?? usageError ?? queueError ?? stuckError ?? completedError ??
    resError;
}

const costUsd = (usage || []).reduce(
  (sum, item) => sum + Number(item.cost || 0),
  0,
);
const tokens = (usage || []).reduce(
  (sum, item) =>
    sum + Number(item.prompt_tokens || 0) + Number(item.completion_tokens || 0),
  0,
);

// Export completeness check: every completed run in 24h must have 4 exports
let incompleteExportRuns = 0;
if (completedRuns) {
  for (const run of completedRuns) {
    const reports = run.reports
      ? (Array.isArray(run.reports) ? run.reports : [run.reports])
      : [];
    const versions = reports.flatMap((r) =>
      r.report_versions
        ? (Array.isArray(r.report_versions)
          ? r.report_versions
          : [r.report_versions])
        : []
    );
    const exports = versions.flatMap((v) =>
      v.report_exports
        ? (Array.isArray(v.report_exports)
          ? v.report_exports
          : [v.report_exports])
        : []
    );
    const formats = new Set(exports.map((e) => e.format));
    if (formats.size < 4) incompleteExportRuns += 1;
  }
}

const isCritical = (alerts || []).some((alert) =>
  alert.severity === "critical"
);
const isDegraded = (stuckRuns ?? 0) > 0 || incompleteExportRuns > 0 ||
  (alerts || []).length > 0;
const status = isCritical ? "failed" : (isDegraded ? "degraded" : "healthy");

const result = {
  status,
  schedulerHealthy: true,
  checkedAt: new Date().toISOString(),
  queueDepth: queueDepth ?? 0,
  stuckRuns: stuckRuns ?? 0,
  staleReservations: pendingReservations ?? 0,
  incompleteExportRuns,
  last24Hours: {
    providerCalls: usage?.length ?? 0,
    costUsd: Number(costUsd.toFixed(4)),
    tokens,
    failedCalls:
      (usage || []).filter((item) => item.status === "failed").length,
  },
  alertCollection: alertSummary,
  openAlerts: alerts ?? [],
};

if (
  process.env.OPERATIONAL_ALERT_WEBHOOK_URL &&
  ((alerts || []).length > 0 || process.env.OPERATIONAL_ALERT_TEST === "1")
) {
  const secret = process.env.OPERATIONAL_ALERT_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "OPERATIONAL_ALERT_WEBHOOK_SECRET is required when alert delivery is configured.",
    );
  }
  const payload = JSON.stringify({
    event: process.env.OPERATIONAL_ALERT_TEST === "1"
      ? "shouldbuild.alert.test"
      : "shouldbuild.alert.open",
    sentAt: new Date().toISOString(),
    status,
    openAlerts: alerts ?? [],
    queueDepth: result.queueDepth,
    stuckRuns: result.stuckRuns,
  });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const response = await fetch(process.env.OPERATIONAL_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shouldbuild-signature": `sha256=${signature}`,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Operational alert webhook returned ${response.status}.`);
  }
  result.alertDelivery = {
    delivered: true,
    event: JSON.parse(payload).event,
    statusCode: response.status,
  };
}

console.log(JSON.stringify(result, null, 2));
process.exitCode = 0;
