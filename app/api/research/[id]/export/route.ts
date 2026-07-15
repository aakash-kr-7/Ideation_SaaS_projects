import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await request.json().catch(() => ({ format: "json" }));
  const requested = body.format === "md" ? "markdown" : body.format ?? "json";
  const { data, error } = await supabase
    .from("research_runs")
    .select("idea_name, reports(report_versions(version_number, report_exports(format, storage_path)))")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const reports = asArray((data as any)?.reports);
  const versions = asArray(reports[0]?.report_versions).sort((a: any,b: any) => b.version_number-a.version_number);
  const stored = asArray(versions[0]?.report_exports).find((item: any) => item.format === requested);
  if (!data || !stored) return NextResponse.json({ error: "Stored export is not ready" }, { status: 409 });
  const { data: file, error: downloadError } = await supabase.storage.from("exports").download(stored.storage_path);
  if (downloadError || !file) return NextResponse.json({ error: downloadError?.message || "Export unavailable" }, { status: 403 });
  const safeName = String(data.idea_name).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "signalfit";
  const metadata: Record<string,{type:string;ext:string}> = { json:{type:"application/json",ext:"json"}, markdown:{type:"text/markdown",ext:"md"}, csv:{type:"text/csv",ext:"csv"}, pdf:{type:"application/pdf",ext:"pdf"} };
  const meta = metadata[requested] || metadata.json;
  return new NextResponse(await file.arrayBuffer(), { headers: { "Content-Type": meta.type, "Content-Disposition": `attachment; filename="${safeName}-report.${meta.ext}"`, "X-SignalFit-Storage-Path": stored.storage_path } });
}
