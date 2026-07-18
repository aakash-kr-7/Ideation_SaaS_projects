import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ValidationReport } from "@/components/report/ValidationReport";
import { validationReports } from "@/lib/sample-reports";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";

export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const report = validationReports.find(r => r.opportunity.id === id) || validationReports[0];

  return <main className="sample-report-page">
    <header className="sample-report-header">
      <Link href="/" className="sample-report-back"><ArrowLeft size={15}/>Back to home</Link>
      <Brand />
      <span className="sample-report-label">Public sample report</span>
    </header>
    <ValidationReport report={report} publicMode/>
    <LegalFooter />
  </main>;
}
