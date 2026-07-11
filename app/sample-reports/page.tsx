import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { validationReports } from "@/lib/report-mocks";

export default function SampleReportsPage() {
  return <AppShell title="Sample validation reports">
    <div className="page-content">
      <div className="page-lead">
        <p className="eyebrow">Explore the framework</p>
        <h2>Sample validation reports. Verified signal structures.</h2>
        <p>Explore the structure of a complete SignalFit validation report. See exactly how buyer pain, competitor pricing, risks, and next-step actions are presented.</p>
      </div>
      <div className="sample-library-grid">
        {validationReports.map(report => <article key={report.id}>
          <div>
            <span className="sample-mark">SAMPLE DATA</span>
            <b>{report.opportunity.scorecard.total}/100</b>
          </div>
          <h3>{report.opportunity.name}</h3>
          <p>{report.opportunity.oneLiner}</p>
          <small>{report.opportunity.targetCustomer}</small>
          <footer>
            <span><ShieldCheck size={13}/> {report.opportunity.scorecard.confidence}% confidence</span>
            <Link href={`/sample-report?id=${report.opportunity.id}`}>Open sample <ArrowRight size={14}/></Link>
          </footer>
        </article>)}
      </div>
    </div>
  </AppShell>;
}
