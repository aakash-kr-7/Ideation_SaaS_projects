import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select("*, reports(report_versions(payload))")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  return NextResponse.json({
    run: data,
    report: (data as any).reports?.[0]?.report_versions?.[0]?.payload ?? null,
  });
}
