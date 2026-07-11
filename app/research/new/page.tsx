import { AppShell } from "@/components/layout/app-shell";
import { ResearchForm } from "@/components/research/research-form";
export default function NewResearchPage(){return <AppShell title="New research"><div className="page-content narrow"><div className="page-lead"><p className="eyebrow">Research run</p><h2>Give your idea an evidence trail.</h2><p>Start with the decision context. BuildSignal will turn it into a structured research run and validation report.</p></div><ResearchForm/></div></AppShell>}
