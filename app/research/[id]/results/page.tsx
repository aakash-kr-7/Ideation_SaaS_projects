import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ValidationReport } from "@/components/report/ValidationReport";
import { loadReportForRun } from "@/lib/report-data";

export const dynamic = "force-dynamic";

export default async function DynamicResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const loaded=await loadReportForRun(id);
    if(!loaded)return notFound();

    return (
      <AppShell title="Validation report">
        <div className="page-content">
          <ValidationReport report={loaded.report} runId={id} />
        </div>
      </AppShell>
    );
  } catch (err) {
    console.error("Failed to fetch report from database:", err);
    throw err;
  }
}
