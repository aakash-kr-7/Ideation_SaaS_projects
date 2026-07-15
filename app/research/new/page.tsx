import { AppShell } from "@/components/layout/app-shell";
import { ResearchForm } from "@/components/research/research-form";
import { getProjects } from "@/lib/actions/research";
export default async function NewResearchPage(){const projects=await getProjects();return <AppShell title="Validate idea"><div className="page-content narrow"><div className="page-lead"><p className="eyebrow">New validation</p><h2>Describe the idea you want to validate.</h2><p>Tell us the product, who would pay for it, and what problem it solves. We&apos;ll analyze real market signals and deliver a verdict in minutes.</p></div><ResearchForm projectId={projects[0]?.id}/></div></AppShell>}
