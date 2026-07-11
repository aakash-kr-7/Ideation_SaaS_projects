import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ValidationReport } from "@/components/report/ValidationReport";
import { validationReports } from "@/lib/report-mocks";
export default function SampleReportPage(){return <main className="sample-report-page"><header><Link href="/"><ArrowLeft size={15}/>Back to SignalFit</Link><span>PUBLIC SAMPLE REPORT</span></header><ValidationReport report={validationReports[0]} publicMode/></main>}
