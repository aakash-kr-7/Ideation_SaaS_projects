import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ValidationReport } from "@/components/report/ValidationReport";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DynamicResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const supabase = await createClient();
    
    // Fetch latest report version payload
    const { data: report, error } = await supabase
      .from("reports")
      .select(`
        id,
        report_versions (
          payload
        )
      `)
      .eq("run_id", id)
      .maybeSingle();

    if (error || !report) {
      return notFound();
    }

    const versions = report.report_versions as any[];
    const payload = versions?.[0]?.payload;

    if (!payload) {
      return notFound();
    }

    return (
      <AppShell title="Validation report">
        <div className="page-content">
          <ValidationReport report={payload} />
        </div>
      </AppShell>
    );
  } catch (err) {
    console.error("Failed to fetch report from database:", err);
    return notFound();
  }
}
