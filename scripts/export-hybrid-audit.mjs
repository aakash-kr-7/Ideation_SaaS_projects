import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const runId = process.argv[2];
if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Usage: node scripts/export-hybrid-audit.mjs <run-id>");
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service configuration is required.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const outDir = path.resolve("artifacts", "hybrid-audit", runId);
const exportDir = path.join(outDir, "exports");
await mkdir(exportDir, { recursive: true });

const one = async (table, select = "*") => {
  const { data, error } = await db.from(table).select(select).eq(table === "research_runs" ? "id" : "run_id", runId).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
};
const many = async (table, select = "*", order = "created_at") => {
  let query = db.from(table).select(select).eq("run_id", runId);
  if (order) query = query.order(order);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
};

const run = await one("research_runs");
if (run.status !== "Completed") throw new Error(`Run is ${run.status}, not Completed.`);
const [jobs, stages, metrics, usage, sources, evidence, confidence, retrievalAudit, reservation, ledger, graphNodes, graphEdges] = await Promise.all([
  many("research_jobs"),
  many("research_stages"),
  one("research_pipeline_metrics"),
  many("api_usage_logs"),
  many("sources"),
  many("evidence_items"),
  one("evidence_confidence_results"),
  many("source_retrieval_audit"),
  one("credit_reservations"),
  many("credit_ledger"),
  many("evidence_graph_nodes"),
  many("evidence_graph_edges"),
]);
const { data: opportunity, error: opportunityError } = await db.from("opportunities")
  .select("*,opportunity_scores(*,score_breakdowns(*,score_evidence_refs(*))),competitors(*),pricing_models(*),risks(*)")
  .eq("run_id", runId).single();
if (opportunityError) throw new Error(`opportunity: ${opportunityError.message}`);
const { data: report, error: reportError } = await db.from("reports")
  .select("*,report_versions(*,report_exports(*),report_chart_datasets(*))")
  .eq("run_id", runId).single();
if (reportError) throw new Error(`report: ${reportError.message}`);
const version = report.report_versions?.sort((a, b) => b.version_number - a.version_number)[0];
if (!version) throw new Error("No report version.");

const exportChecks = [];
for (const item of version.report_exports || []) {
  const { data, error } = await db.storage.from("exports").download(item.storage_path);
  if (error || !data) throw new Error(`download ${item.format}: ${error?.message || "empty"}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== item.sha256) throw new Error(`${item.format} checksum mismatch`);
  validateExport(item.format, bytes);
  const filename = `report.${item.format === "markdown" ? "md" : item.format}`;
  await writeFile(path.join(exportDir, filename), bytes);
  exportChecks.push({ format: item.format, storagePath: item.storage_path, sha256: checksum, bytes: bytes.length, opened: true });
}
if (new Set(exportChecks.map((item) => item.format)).size !== 4) throw new Error("Four distinct exports were not produced.");
if (sources.some((source) => /(?:^|\.)example\.com$/i.test(new URL(source.url).hostname))) throw new Error("Synthetic example.com source detected.");

const sourceById = new Map(sources.map((source) => [source.id, source]));
const claimMappings = evidence.slice(0, 5).map((item) => ({
  evidenceId: item.id,
  claim: item.snippet,
  signal: item.signal_type,
  disconfirming: item.disconfirming,
  sourceId: item.source_id,
  sourceUrl: sourceById.get(item.source_id)?.url,
  sourceDomain: sourceById.get(item.source_id)?.source_domain,
}));
const score = opportunity.opportunity_scores;
const charts = version.report_chart_datasets || [];
const summary = {
  runId,
  status: run.status,
  mode: run.mode,
  groundingMode: metrics.grounding_mode,
  groundingDegraded: metrics.grounding_degraded,
  groundedCallsAttempted: metrics.grounded_calls_attempted,
  groundedCallsCompleted: metrics.grounded_calls_completed,
  groundedCallsQuotaBlocked: metrics.grounded_calls_quota_blocked,
  externalSearchCalls: metrics.external_search_calls,
  pagesFetched: metrics.pages_fetched,
  sourcesAccepted: metrics.sources_accepted,
  independentDomains: metrics.independent_domains,
  evidenceCount: evidence.length,
  providerCalls: metrics.provider_calls,
  synthesisCalls: metrics.synthesis_calls,
  tokens: { input: metrics.input_tokens, output: metrics.output_tokens, total: metrics.input_tokens + metrics.output_tokens },
  estimatedCostUsd: metrics.total_provider_cost_usd,
  pricingVersion: metrics.pricing_version,
  degradedProviders: metrics.degraded_providers,
  cacheHits: metrics.cache_hits,
  cacheMisses: metrics.cache_misses,
  durationMs: metrics.total_duration_ms,
  retryCount: metrics.retry_count,
  score: score?.total,
  verdict: score?.verdict,
  scoreConfidence: score?.confidence,
  evidenceConfidence: confidence,
  positiveEvidence: evidence.filter((item) => !item.disconfirming).length,
  negativeEvidence: evidence.filter((item) => item.disconfirming).length,
  domains: [...new Set(sources.map((source) => source.source_domain))].sort(),
  claimMappings,
  chartMappings: charts.map((chart) => ({ chartKey: chart.chart_key, supportingEvidenceIds: chart.supporting_evidence_ids, sourceData: chart.source_data })),
  exportChecks,
  credit: {
    reservationStatus: reservation.status,
    reserveEvents: ledger.filter((entry) => entry.event_type === "reserve").length,
    consumeEvents: ledger.filter((entry) => entry.event_type === "consume").length,
  },
};

await Promise.all([
  save("run.json", run),
  save("stage-history.json", { jobs, stages }),
  save("metrics.json", metrics),
  save("api-usage.json", usage),
  save("sources.json", sources),
  save("evidence.json", evidence),
  save("evidence-graph.json", { nodes: graphNodes, edges: graphEdges, confidence }),
  save("score.json", opportunity),
  save("report.json", report),
  save("charts.json", charts),
  save("export-metadata.json", exportChecks),
  save("retrieval-audit.json", retrievalAudit),
  save("credit.json", { reservation, ledger }),
  save("summary.json", summary),
]);
console.log(JSON.stringify(summary, null, 2));

async function save(name, value) {
  await writeFile(path.join(outDir, name), `${JSON.stringify(sanitize(value), null, 2)}\n`, "utf8");
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([keyName]) => !/api.?key|service.?role|authorization|password|secret/i.test(keyName))
      .map(([keyName, child]) => [keyName, sanitize(child)]));
  }
  return typeof value === "string"
    ? value.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    : value;
}

function validateExport(format, bytes) {
  const text = bytes.toString("utf8");
  if (format === "pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("PDF could not be opened.");
  if (format === "json") JSON.parse(text);
  if (format === "markdown" && !/^#\s/m.test(text)) throw new Error("Markdown could not be opened.");
  if (format === "csv" && !text.includes(",")) throw new Error("CSV could not be opened.");
}
