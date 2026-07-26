import { createClient } from "@supabase/supabase-js";
import { buildDecisionCharts, buildDecisionProduct } from "../supabase/functions/_shared/research/decision-product.ts";
import { validationReportSchema } from "../supabase/functions/_shared/report-schema.ts";
import { renderCsv, renderJson, renderMarkdown, renderPdf, sha256 } from "../supabase/functions/_shared/research/exports.ts";

await loadEnv(".env");
const runIds: string[] = Deno.args;
if (!runIds.length || runIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
  throw new Error("Usage: upgrade-report-quality.ts <run-id> [run-id...]");
}

async function loadEnv(path: string) {
  const text = await Deno.readTextFile(path);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match || Deno.env.get(match[1])) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    Deno.env.set(match[1], value);
  }
}
const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Local Supabase service configuration is required.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
for (const runId of runIds) results.push(await upgrade(runId));
console.log(JSON.stringify({ providerCalls: 0, upgraded: results }, null, 2));

async function upgrade(runId: string) {
  const [{ data: report, error: reportError }, { data: confidence, error: confidenceError }] = await Promise.all([
    db.from("reports").select("id,opportunity_id,report_versions(id,version_number,report_mode,payload,market_sizing,adversarial_gate,citation_validation,reasoning_flags,report_exports(format,storage_path),report_chart_datasets(chart_key,chart_type,source_data,chart_config,supporting_evidence_ids))").eq("run_id", runId).single(),
    db.from("evidence_confidence_results").select("band,score,reasons").eq("run_id", runId).single(),
  ]);
  if (reportError || !report) throw reportError || new Error(`Report not found for ${runId}`);
  if (confidenceError || !confidence) throw confidenceError || new Error(`Evidence confidence missing for ${runId}`);
  const versions = [...(report.report_versions || [])].sort((a: any, b: any) => b.version_number - a.version_number);
  const baseline: any = versions[0];
  if (!baseline?.payload) throw new Error(`No report version for ${runId}`);
  const mapCharts = (rows: any[]) => (rows || []).map((item: any) => ({
    chartKey: item.chart_key,
    chartType: item.chart_type,
    sourceData: item.source_data || {},
    chartConfig: item.chart_config || {},
    supportingEvidenceIds: item.supporting_evidence_ids || [],
  }));
  let reportVersionId: string;
  let versionNumber: number;
  const existingV2: any = versions.find((item: any) => item.payload?.version === "2.0" && item.payload?.decisionProduct);
  let payload: any;
  let charts: any[];
  if (existingV2) {
    reportVersionId = existingV2.id;
    versionNumber = existingV2.version_number;
    payload = existingV2.payload;
    charts = mapCharts(existingV2.report_chart_datasets || []);
  } else {
    payload = {
      ...baseline.payload,
      version: "2.0",
      generatedAt: new Date().toISOString(),
    };
    charts = buildDecisionCharts(payload, mapCharts(baseline.report_chart_datasets || []));
    payload.decisionProduct = buildDecisionProduct(payload, charts, confidence);
    versionNumber = Math.max(0, ...versions.map((item: any) => Number(item.version_number || 0))) + 1;
    const { data: inserted, error } = await db.from("report_versions").insert({
      report_id: report.id,
      version_number: versionNumber,
      report_mode: baseline.report_mode,
      payload,
      adversarial_gate: baseline.adversarial_gate || payload.adversarialGate || null,
      citation_validation: baseline.citation_validation || payload.citationValidation || null,
      reasoning_flags: baseline.reasoning_flags || [],
      verdict_score_mismatch: false,
      market_sizing: baseline.market_sizing || { reason: "No attributable market-sizing metric was accepted." },
    }).select("id").single();
    if (error || !inserted) throw error || new Error(`Could not create report version ${versionNumber}`);
    reportVersionId = inserted.id;
  }
  validationReportSchema.parse(payload);

  const existingChartKeys = new Set((existingV2?.report_chart_datasets || []).map((item: any) => item.chart_key));
  for (const item of charts) {
    if (existingChartKeys.has(item.chartKey)) continue;
    const encoded = new TextEncoder().encode(JSON.stringify(item.sourceData));
    const { error } = await db.from("report_chart_datasets").insert({
      report_version_id: reportVersionId,
      run_id: runId,
      chart_key: item.chartKey,
      chart_type: item.chartType,
      schema_version: 1,
      source_data: item.sourceData,
      chart_config: item.chartConfig || {},
      supporting_evidence_ids: item.supportingEvidenceIds || [],
      sha256: await sha256(encoded),
    });
    if (error) throw new Error(`Chart ${item.chartKey}: ${error.message}`);
  }

  const scorecard = payload.opportunity.scorecard;
  const breakdowns = Object.keys(scorecard.scores).map((criterion) => ({
    criterion,
    score: Number(scorecard.scores[criterion]),
    weight: Number(scorecard.weights[criterion]),
    note: String(scorecard.notes[criterion]),
    evidenceIds: scorecard.evidenceRefs[criterion] || [],
  }));
  const exportInput = {
    runId,
    reportMode: payload.reportMode,
    ideaName: payload.opportunity.name,
    total: scorecard.total,
    verdict: scorecard.verdict,
    confidence: scorecard.confidence,
    executiveSummary: payload.executiveSummary,
    methodology: payload.methodology,
    breakdowns,
    payload,
  };
  const renderers = {
    pdf: () => renderPdf(exportInput),
    markdown: () => renderMarkdown(exportInput),
    csv: () => renderCsv(exportInput),
    json: () => renderJson(exportInput),
  } as const;
  const storagePrefix = String(baseline.report_exports?.[0]?.storage_path || "").split("/")[0];
  if (!storagePrefix) throw new Error(`Cannot determine storage owner for ${runId}`);
  const exportChecks = [];
  for (const format of ["pdf", "markdown", "csv", "json"] as const) {
    const content = renderers[format]();
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const checksum = await sha256(bytes);
    const storagePath = `${storagePrefix}/${runId}/v${versionNumber}/report.${format}`;
    const { error: uploadError } = await db.storage.from("exports").upload(storagePath, bytes, {
      contentType: format === "pdf" ? "application/pdf" : format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown",
      upsert: true,
    });
    if (uploadError) throw new Error(`Upload ${format}: ${uploadError.message}`);
    const { error: metadataError } = await db.from("report_exports").upsert({
      report_version_id: reportVersionId,
      format,
      storage_path: storagePath,
      byte_size: bytes.length,
      sha256: checksum,
    }, { onConflict: "report_version_id,format" });
    if (metadataError) throw new Error(`Export metadata ${format}: ${metadataError.message}`);
    exportChecks.push({ format, sha256: checksum, bytes: bytes.length });
  }
  return {
    runId,
    reportVersionId,
    versionNumber,
    mode: payload.reportMode,
    sections: payload.decisionProduct.sections.length,
    specialists: payload.decisionProduct.specialistOutputs.length,
    charts: charts.length,
    exports: exportChecks,
  };
}
