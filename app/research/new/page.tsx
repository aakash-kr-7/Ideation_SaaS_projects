import { AppShell } from "@/components/layout/app-shell";
import { ResearchForm } from "@/components/research/research-form";
export default function NewResearchPage(){return <AppShell title="New research"><div className="page-content narrow"><div className="page-lead"><p className="eyebrow">Commission research</p><h2>Define the opportunity worth investigating.</h2><p>Frame the buyer, the workflow, and the decision context. SignalFit will produce a structured research memo with evidence, scoring, and a concrete next step.</p></div><ResearchForm/></div></AppShell>}
