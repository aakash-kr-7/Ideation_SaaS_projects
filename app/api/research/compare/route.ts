import { NextResponse } from "next/server";
import { compareOpportunities } from "@/lib/scoring";
import { validationReportSchema, type ValidationReport } from "@/lib/report-schema";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 4).map(String) : [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data, error } = await supabase
    .from("reports")
    .select("run_id, report_versions(payload, created_at)")
    .in("run_id", ids)
    .order("created_at", { referencedTable: "report_versions", ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payloads: ValidationReport[] = (data || []).flatMap((row: any) => {
    const parsed = validationReportSchema.safeParse(row.report_versions?.[0]?.payload);
    return parsed.success ? [parsed.data as unknown as ValidationReport] : [];
  });
  const reports = payloads.map(({ opportunity }) => ({
    id: opportunity.id, name: opportunity.name, scorecard: opportunity.scorecard,
  }));
  return NextResponse.json({
    opportunities: compareOpportunities(reports),
    reportModes: payloads.map(report => ({ id: report.opportunity.id, mode: report.reportMode })),
    mixedResearchDepth: new Set(payloads.map(report => report.reportMode)).size > 1,
  });
}
