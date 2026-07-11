import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ValidationReport } from "@/components/report/ValidationReport";
import { researchStore } from "@/lib/research/store";
export const dynamic="force-dynamic";
export default async function DynamicResultsPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const run=researchStore.get(id);if(!run?.report)return notFound();return <AppShell title="Research results"><div className="page-content"><ValidationReport report={run.report}/></div></AppShell>}
