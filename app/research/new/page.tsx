import { AppShell } from "@/components/layout/app-shell";
import { ResearchForm } from "@/components/research/research-form";
import { getCreditSnapshot, getProjects } from "@/lib/actions/research";
import type { ResearchMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import type { ResearchFormInitialValues } from "@/components/research/research-form";

export default async function NewResearchPage({searchParams}:{searchParams:Promise<{mode?:string;upgradeFrom?:string;retryFrom?:string}>}){
  const [projects,query,creditSnapshot]=await Promise.all([getProjects(),searchParams,getCreditSnapshot()]);
  const defaultMode:ResearchMode=query.mode==="quick_scan"?"quick_scan":"full_validation";
  let projectId=projects[0]?.id;
  let initialValues:ResearchFormInitialValues={};
  const sourceRunId=query.upgradeFrom??query.retryFrom;
  if(sourceRunId){
    const supabase=await createClient();
    let sourceQuery=supabase.from("research_runs").select("project_id,idea_name,idea_description,target_customer,target_region,market_type,assumptions,mode").eq("id",sourceRunId);
    if(query.upgradeFrom) sourceQuery=sourceQuery.eq("mode","quick_scan");
    const {data:sourceRun}=await sourceQuery.maybeSingle();
    if(sourceRun){
      projectId=sourceRun.project_id;
      initialValues={
        ideaName:sourceRun.idea_name,
        ideaDescription:sourceRun.idea_description,
        targetCustomer:sourceRun.target_customer,
        targetRegion:sourceRun.target_region,
        marketType:sourceRun.market_type as ResearchFormInitialValues["marketType"],
        assumptions:(sourceRun.assumptions ?? {}) as ResearchFormInitialValues["assumptions"],
      };
    }
  }
  const headline=query.upgradeFrom
    ?"Take the same idea deeper."
    :query.retryFrom
      ?"Run the brief again. Keep the learning."
      :"Put the idea on trial.";
  const description=query.upgradeFrom
    ?"Your original brief is already loaded. Upgrade the evidence depth, attack the weak assumptions, and leave with a fuller decision dossier."
    :query.retryFrom
      ?"The validated brief is ready. Relaunch the research without rebuilding the context from scratch."
      :"Brief the market once. ShouldBuild searches for demand, contradiction, competition, pricing pressure, and the next move worth making.";

  return <AppShell title="Validate idea">
    <div className="page-content research-intake-page">
      <section className="decision-intake-hero">
        <div className="decision-intake-copy">
          <p className="eyebrow">{sourceRunId?"Decision room / Continuing brief":"Decision room / New trial"}</p>
          <h2>{headline}</h2>
          <p>{description}</p>
        </div>
        <aside className="decision-intake-promise">
          <span>What comes back</span>
          <div><b>01</b><p><strong>A verdict</strong><small>Build, validate first, narrow, or walk away.</small></p></div>
          <div><b>02</b><p><strong>The case behind it</strong><small>Signals, contradictions, risks, and cited sources.</small></p></div>
          <div><b>03</b><p><strong>Your next move</strong><small>A concrete action that reduces uncertainty.</small></p></div>
        </aside>
      </section>
      <ResearchForm projectId={projectId} defaultMode={query.upgradeFrom?"full_validation":defaultMode} creditSnapshot={creditSnapshot} initialValues={initialValues}/>
    </div>
  </AppShell>
}
