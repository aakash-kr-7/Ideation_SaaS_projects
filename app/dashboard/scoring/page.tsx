import { AppShell } from "@/components/layout/app-shell";
import { ScoringWorkbench, type ScoringWorkbenchReport } from "@/components/scoring/ScoringWorkbench";
import { loadCompletedReports } from "@/lib/report-data";

export const dynamic = "force-dynamic";

export default async function ScoringPage() {
  const completed = await loadCompletedReports();
  const reports: ScoringWorkbenchReport[] = completed.map(({ report }) => ({
    id: report.id,
    name: report.opportunity.name,
    scorecard: report.opportunity.scorecard,
    evidence: report.opportunity.evidence,
  }));

  return (
    <AppShell title="Scoring workbench">
      <div className="px-sb-4 py-sb-5 sm:px-sb-6 sm:py-sb-6">
        <ScoringWorkbench reports={reports}/>
      </div>
    </AppShell>
  );
}
