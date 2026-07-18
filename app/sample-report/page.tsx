import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SampleReportExperience } from "@/components/report/sample-report-experience";
import { sampleFullValidation, sampleQuickScan } from "@/lib/sample-reports";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";

export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const initialMode = mode === "full_validation" ? "full_validation" : "quick_scan";
  return <main className="sample-report-page">
    <header className="sample-report-header">
      <Link href="/" className="sample-report-back"><ArrowLeft size={15}/>Back to home</Link>
      <Brand />
      <span className="sample-report-label">Public sample report</span>
    </header>
    <SampleReportExperience quick={sampleQuickScan} full={sampleFullValidation} initialMode={initialMode}/>
    <LegalFooter />
  </main>;
}
