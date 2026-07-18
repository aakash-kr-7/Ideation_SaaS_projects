import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validationReportSchema } from "@/lib/report-schema";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data, error } = await supabase
    .from("research_runs")
    .select("*, reports(report_versions(version_number,payload))")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  const versions = ((data as any).reports?.[0]?.report_versions ?? [])
    .sort((a: any, b: any) => b.version_number - a.version_number);
  const report = versions[0]?.payload ? validationReportSchema.parse(versions[0].payload) : null;
  return NextResponse.json({
    run: data,
    report,
  });
}
