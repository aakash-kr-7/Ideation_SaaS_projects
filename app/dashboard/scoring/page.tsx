import { AppShell } from "@/components/layout/app-shell";
import { ScoringWorkbench } from "@/components/scoring/ScoringWorkbench";
import { loadCompletedScorecards } from "@/lib/report-data";
export const dynamic="force-dynamic";
export default async function ScoringPage(){const reports=await loadCompletedScorecards();return <AppShell title="Scoring model"><div className="page-content"><ScoringWorkbench reports={reports}/></div></AppShell>}
