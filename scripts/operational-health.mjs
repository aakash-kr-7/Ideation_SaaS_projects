import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: alertSummary, error: alertError } = await db.rpc("collect_research_operational_alerts");
if (alertError) throw alertError;
const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
const [{ data: alerts, error: openError }, { data: usage, error: usageError }, { count: queueDepth, error: queueError }] = await Promise.all([
  db.from("operational_alerts").select("alert_type,severity,run_id,details,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(100),
  db.from("api_usage_logs").select("provider,cost,prompt_tokens,completion_tokens,status").gte("created_at", since),
  db.from("research_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
]);
if (openError || usageError || queueError) throw openError ?? usageError ?? queueError;
const costUsd = (usage || []).reduce((sum, item) => sum + Number(item.cost || 0), 0);
const tokens = (usage || []).reduce((sum, item) => sum + Number(item.prompt_tokens || 0) + Number(item.completion_tokens || 0), 0);
const result = {
  schedulerHealthy: true,
  checkedAt: new Date().toISOString(),
  queueDepth: queueDepth ?? 0,
  last24Hours: { providerCalls: usage?.length ?? 0, costUsd: Number(costUsd.toFixed(4)), tokens },
  alertCollection: alertSummary,
  openAlerts: alerts ?? [],
};
console.log(JSON.stringify(result, null, 2));
if ((alerts || []).some((alert) => alert.severity === "critical")) process.exitCode = 2;
