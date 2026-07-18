import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isExportAllowed, reportModeSchema, type ReportExportFormat } from "@/lib/report-modes";
import { z } from "zod";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsedFormat = z.enum(["pdf", "markdown", "md", "csv", "json"]).safeParse(body.format);
  if (!parsedFormat.success) return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  const requested = (parsedFormat.data === "md" ? "markdown" : parsedFormat.data) as ReportExportFormat;
  const { data, error } = await supabase
    .from("research_runs")
    .select("idea_name, mode, reports(report_versions(version_number, report_exports(format, storage_path)))")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  const mode = reportModeSchema.parse(data.mode);
  if (!isExportAllowed(mode, requested)) {
    return NextResponse.json({ error: `${requested.toUpperCase()} export is not included with this report type.` }, { status: 403 });
  }
  const reports = asArray((data as any)?.reports);
  const versions = asArray(reports[0]?.report_versions).sort((a: any,b: any) => b.version_number-a.version_number);
  const stored = asArray(versions[0]?.report_exports).find((item: any) => item.format === requested);
  if (!stored) return NextResponse.json({ error: "Stored export is not ready" }, { status: 409 });
  const { data: file, error: downloadError } = await supabase.storage.from("exports").download(stored.storage_path);
  if (downloadError || !file) return NextResponse.json({ error: downloadError?.message || "Export unavailable" }, { status: 403 });
  const safeName = String(data.idea_name).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "shouldbuild";
  const metadata: Record<string,{type:string;ext:string}> = { json:{type:"application/json",ext:"json"}, markdown:{type:"text/markdown",ext:"md"}, csv:{type:"text/csv",ext:"csv"}, pdf:{type:"application/pdf",ext:"pdf"} };
  const meta = metadata[requested] || metadata.json;
  return new NextResponse(await file.arrayBuffer(), { headers: { "Content-Type": meta.type, "Content-Disposition": `attachment; filename="${safeName}-report.${meta.ext}"`, "X-ShouldBuild-Storage-Path": stored.storage_path } });
}
