import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ValidationReport } from "@/components/report/ValidationReport";
import { loadReportForRun } from "@/lib/report-data";
import { ReportRetryState } from "@/components/report/ReportRetryState";

export const dynamic = "force-dynamic";

export default async function DynamicResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const loaded = await loadReportForRun(id);
    if (loaded.state === "access_denied") return notFound();
    if (loaded.state === "pending") {
      return (
        <AppShell title="Validation report">
          <div className="page-content">
            <ReportRetryState reason={loaded.reason} />
          </div>
        </AppShell>
      );
    }

    return (
      <AppShell title="Validation report">
        <div className="page-content">
          <ValidationReport report={loaded.value.report} runId={id} chartDatasets={loaded.value.chartDatasets} />
        </div>
      </AppShell>
    );
  } catch (err) {
    console.error("Failed to fetch report from database:", err);
    throw err;
  }
}
