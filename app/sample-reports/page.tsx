import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { validationReports } from "@/lib/report-mocks";
export default function SampleReportsPage(){return <AppShell title="Sample report library"><div className="page-content"><div className="page-lead"><p className="eyebrow">Explore the framework</p><h2>Five sample reports. No fake proof.</h2><p>These are high-quality illustrative reports that demonstrate the structure of a SignalFit decision document. They are not customer reports or verified market research.</p></div><div className="sample-library-grid">{validationReports.map(report=><article key={report.id}><div><span className="sample-mark">SAMPLE DATA</span><b>{report.opportunity.scorecard.total}/100</b></div><h3>{report.opportunity.name}</h3><p>{report.opportunity.oneLiner}</p><small>{report.opportunity.targetCustomer}</small><footer><span><ShieldCheck size={13}/> {report.opportunity.scorecard.confidence}% confidence</span><Link href={`/sample-report?id=${report.opportunity.id}`}>Open sample <ArrowRight size={14}/></Link></footer></article>)}</div></div></AppShell>}

