import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";
import { SampleReportExperience } from "@/components/report/sample-report-experience";
import { sampleFullValidation, sampleQuickScan } from "@/lib/sample-reports";

export default async function SampleReportPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const initialMode = mode === "full_validation" ? "full_validation" : "quick_scan";

  return (
    <main className="min-h-screen bg-sb-bg-base text-sb-text-primary">
      <header className="border-b border-sb-border-hairline bg-sb-bg-surface-1">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-sb-4 px-sb-5 py-sb-4 sm:px-sb-8">
          <Link className="inline-flex items-center gap-sb-2 rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/"><ArrowLeft size={14}/>Back to home</Link>
          <Brand/>
          <span className="font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">Public sample</span>
        </div>
      </header>
      <SampleReportExperience quick={sampleQuickScan} full={sampleFullValidation} initialMode={initialMode}/>
      <LegalFooter/>
    </main>
  );
}
