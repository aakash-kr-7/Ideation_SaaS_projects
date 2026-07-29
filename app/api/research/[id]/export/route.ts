import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isExportAllowed, reportModeSchema, type ReportExportFormat } from "@/lib/report-modes";
import { z } from "zod";
import { loadReportForRun } from "@/lib/report-data";
import { renderPdf } from "@/supabase/functions/_shared/research/exports";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsedFormat = z.enum(["pdf", "markdown", "md", "csv", "json"]).safeParse(body.format);
  if (!parsedFormat.success) return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  const requested: ReportExportFormat = parsedFormat.data === "md" ? "markdown" : parsedFormat.data;
  const { data, error } = await supabase
    .from("research_runs")
    .select("idea_name, mode")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The export could not be prepared." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  const mode = reportModeSchema.parse(data.mode);
  if (!isExportAllowed(mode, requested)) {
    return NextResponse.json({ error: `${requested.toUpperCase()} export is not included with this report type.` }, { status: 403 });
  }
  const loaded = await loadReportForRun(id);
  if (loaded.state === "access_denied") return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  if (loaded.state === "pending") {
    return NextResponse.json(
      { error: "Stored export is still becoming available", retryable: true },
      { status: 409, headers: { "Retry-After": "2" } },
    );
  }
  const safeName = String(data.idea_name).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "shouldbuild";
  const metadata: Record<string,{type:string;ext:string}> = { json:{type:"application/json; charset=utf-8",ext:"json"}, markdown:{type:"text/markdown; charset=utf-8",ext:"md"}, csv:{type:"text/csv; charset=utf-8",ext:"csv"}, pdf:{type:"application/pdf",ext:"pdf"} };
  const meta = metadata[requested] || metadata.json;

  if (requested === "pdf") {
    const report = loaded.value.report;
    const scorecard = report.opportunity.scorecard;
    const breakdowns = Object.entries(scorecard.scores).map(([criterion, score]) => {
      const key = criterion as keyof typeof scorecard.scores;
      const factor = scorecard.factorEvidence?.[key];
      return {
        criterion,
        score,
        weight: Number(scorecard.weights?.[key] ?? 0),
        note: scorecard.notes[key],
        evidenceIds: factor?.supportingEvidenceIds ?? [],
        rawScore: factor?.rawScore,
        evidenceCoefficient: factor?.evidenceCoefficient,
        effectiveScore: factor?.effectiveScore,
        evidenceState: factor?.evidenceState,
        supportingEvidenceIds: factor?.supportingEvidenceIds ?? [],
        confidenceDeductions: factor?.confidenceDeductions ?? [],
        unresolvedGaps: factor?.unresolvedGaps ?? [],
      };
    });
    const pdf = renderPdf({
      runId: id,
      reportMode: report.reportMode,
      ideaName: report.opportunity.name,
      total: scorecard.total,
      verdict: scorecard.verdict,
      confidence: scorecard.confidence,
      executiveSummary: report.executiveSummary,
      methodology: report.methodology,
      breakdowns,
      payload: report,
    });
    const pdfBuffer = Uint8Array.from(pdf).buffer;
    return new NextResponse(await new Blob([pdfBuffer], { type: meta.type }).arrayBuffer(), {
      headers: {
        "Content-Type": meta.type,
        "Content-Disposition": `attachment; filename="${safeName}-report.${meta.ext}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const stored = loaded.value.exports.find((item) => item.format === requested);
  if (!stored) return NextResponse.json({ error: "Stored export is not ready" }, { status: 409 });
  const { data: file, error: downloadError } = await supabase.storage.from("exports").download(stored.storagePath);
  if (downloadError || !file) return NextResponse.json({ error: "The export is temporarily unavailable." }, { status: 503 });
  return new NextResponse(await file.arrayBuffer(), { headers: { "Content-Type": meta.type, "Content-Disposition": `attachment; filename="${safeName}-report.${meta.ext}"` } });
}
