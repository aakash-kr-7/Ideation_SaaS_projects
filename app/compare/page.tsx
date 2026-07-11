import { AppShell } from "@/components/layout/app-shell";
import { CompareMatrix } from "@/components/opportunity/CompareMatrix";
import { researchStore } from "@/lib/research/store";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  const reports = researchStore.list()
    .filter(run => run.stage === "complete" && run.report)
    .map(run => run.report!);

  return <AppShell title="Compare"><div className="page-content"><CompareMatrix allReports={reports}/></div></AppShell>;
}

