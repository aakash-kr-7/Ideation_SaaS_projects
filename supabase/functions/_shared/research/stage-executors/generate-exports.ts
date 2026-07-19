/**
 * Stage: generate_exports
 *
 * Renders export bundles (PDF, Markdown, CSV, JSON) based on mode config.
 * Uploads to Supabase Storage and persists metadata to report_exports.
 * Reuses existing export renderers from exports.ts.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { isExportAllowed, type ReportExportFormat } from "../mode-config.ts";
import { renderPdf, renderMarkdown, renderCsv, renderJson, sha256, type ExportBundleInput } from "../exports.ts";
import { updateState, logError } from "../pipeline-utils.ts";

export async function executeGenerateExports(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;

  const reportId = inputMeta.reportId as string;
  const reportVersionId = inputMeta.reportVersionId as string;
  const opportunityId = inputMeta.opportunityId as string;
  const total = inputMeta.total as number;
  const verdict = inputMeta.verdict as string;

  if (!reportId || !reportVersionId) {
    return stageFailed("permanent", "Missing reportId or reportVersionId");
  }

  // --- Idempotency: check if exports already exist ---
  const { data: existingExports } = await db
    .from("report_exports")
    .select("format")
    .eq("report_version_id", reportVersionId);

  const exportedFormats = new Set((existingExports || []).map((e: any) => e.format));
  const formatsToExport = (config.exports as ReportExportFormat[]).filter(
    (f) => !exportedFormats.has(f) && isExportAllowed(config.mode, f),
  );

  if (formatsToExport.length === 0) {
    return stageCompleted(
      "complete",
      { reason: "all_exports_exist", formats: [...exportedFormats] },
      { duration_ms: Date.now() - startedAt },
    );
  }

  await updateState(runId, "Generating", 97, `Creating ${formatsToExport.join(", ")} exports`, db);

  // --- Load report data for export ---
  const { data: report } = await db
    .from("reports")
    .select("executive_summary, methodology")
    .eq("id", reportId)
    .single();

  const { data: breakdowns } = await db
    .from("score_breakdowns")
    .select("criterion, score, weight, notes, id")
    .eq("score_id", inputMeta.scoreId);

  const { data: scoreEvRefs } = await db
    .from("score_evidence_refs")
    .select("score_breakdown_id, evidence_id");

  const { data: run } = await db
    .from("research_runs")
    .select("idea_name, project_id")
    .eq("id", runId)
    .single();

  // Get team_id for storage path
  const { data: project } = await db
    .from("projects")
    .select("team_id")
    .eq("id", run?.project_id)
    .single();

  const { data: reportVersion } = await db
    .from("report_versions")
    .select("version_number, payload")
    .eq("id", reportVersionId)
    .single();

  const { data: score } = await db
    .from("opportunity_scores")
    .select("total, confidence, verdict")
    .eq("opportunity_id", opportunityId)
    .single();

  // --- Build export input ---
  const breakdownsWithEvidence = (breakdowns || []).map((b: any) => ({
    criterion: b.criterion,
    score: b.score,
    weight: b.weight,
    note: b.notes,
    evidenceIds: (scoreEvRefs || [])
      .filter((ref: any) => ref.score_breakdown_id === b.id)
      .map((ref: any) => ref.evidence_id),
  }));

  const exportInput: ExportBundleInput = {
    runId,
    reportMode: config.mode,
    ideaName: run?.idea_name || "Untitled",
    total: score?.total || total,
    verdict: score?.verdict || verdict,
    confidence: score?.confidence || 0.5,
    executiveSummary: report?.executive_summary || "",
    methodology: report?.methodology || "",
    breakdowns: breakdownsWithEvidence,
    payload: reportVersion?.payload || {},
  };

  // --- Render and upload each format ---
  const renderers: Record<ReportExportFormat, (input: ExportBundleInput) => Promise<Uint8Array> | Uint8Array | string> = {
    pdf: (input) => renderPdf(input),
    markdown: (input) => renderMarkdown(input),
    csv: (input) => renderCsv(input),
    json: (input) => renderJson(input),
  };

  let exportCount = 0;

  for (const format of formatsToExport) {
    try {
      const renderer = renderers[format];
      if (!renderer) continue;

      const content = await renderer(exportInput);
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      const checksum = await sha256(bytes);
      const versionNumber = reportVersion?.version_number || 1;
      const storagePath = `${project?.team_id}/${runId}/v${versionNumber}/report.${format}`;

      // Upload to storage
      const { error: uploadError } = await db.storage
        .from("exports")
        .upload(storagePath, bytes, {
          contentType: format === "pdf"
            ? "application/pdf"
            : format === "json"
            ? "application/json"
            : format === "csv"
            ? "text/csv"
            : "text/markdown",
          upsert: true,
        });

      if (uploadError) {
        await logError(runId, `export:${format}:upload`, uploadError, db);
        continue;
      }

      // Persist export metadata
      await db.from("report_exports").upsert(
        {
          report_version_id: reportVersionId,
          format,
          storage_path: storagePath,
          byte_size: bytes.length || bytes.byteLength,
          sha256: checksum,
        },
        { onConflict: "report_version_id,format" },
      );

      exportCount++;
    } catch (error) {
      await logError(runId, `export:${format}`, error, db);
    }
  }

  return stageCompleted(
    "complete",
    { exportCount, formats: formatsToExport },
    { duration_ms: Date.now() - startedAt },
  );
}
