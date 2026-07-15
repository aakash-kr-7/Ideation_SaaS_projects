import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ValidationReport } from "@/components/report/ValidationReport";
import { validationReports } from "@/lib/sample-reports";

export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const report = validationReports.find(r => r.opportunity.id === id) || validationReports[0];

  return <main className="sample-report-page"><header><Link href="/"><ArrowLeft size={15}/>Back to SignalFit</Link><span>PUBLIC SAMPLE REPORT</span></header><ValidationReport report={report} publicMode/></main>;
}
