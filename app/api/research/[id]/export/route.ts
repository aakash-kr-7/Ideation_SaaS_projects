import { NextResponse } from "next/server";
import { reportToCsv, reportToMarkdown } from "@/lib/report-export";
import type { ValidationReport } from "@/lib/report-schema";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select("idea_name, reports(report_versions(payload))")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const report = (data as any)?.reports?.[0]?.report_versions?.[0]?.payload as ValidationReport | undefined;
  if (!data || !report) return NextResponse.json({ error: "Report is not ready" }, { status: 409 });

  const body = await request.json().catch(() => ({ format: "json" }));
  const format = body.format ?? "json";
  const safeName = String(data.idea_name).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "signalfit";
  if (format === "markdown") {
    return new NextResponse(reportToMarkdown(report), {
      headers: { "Content-Type": "text/markdown", "Content-Disposition": `attachment; filename="${safeName}-report.md"` },
    });
  }
  if (format === "csv") {
    return new NextResponse(reportToCsv(report), {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${safeName}-summary.csv"` },
    });
  }
  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${safeName}-report.json"` },
  });
}
