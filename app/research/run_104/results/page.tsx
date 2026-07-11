import { AppShell } from "@/components/layout/app-shell";
import { ValidationReport } from "@/components/report/ValidationReport";
import { validationReports } from "@/lib/report-mocks";
export default function ResultsPage(){return <AppShell title="Research results"><div className="page-content"><ValidationReport report={validationReports[2]}/></div></AppShell>}
