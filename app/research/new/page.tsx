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
  return <AppShell title="Validate idea"><div className="page-content narrow"><div className="page-lead"><p className="eyebrow">{sourceRunId?"Continue the same idea":"New validation"}</p><h2>{query.upgradeFrom?"Run Full Validation without re-entering your brief.":query.retryFrom?"Retry with the same validated brief.":"Choose the right depth before research begins."}</h2><p>Quick Scan screens whether the idea deserves more research. Full Validation stress-tests the decision before you commit meaningful time or money.</p></div><ResearchForm projectId={projectId} defaultMode={query.upgradeFrom?"full_validation":defaultMode} creditSnapshot={creditSnapshot} initialValues={initialValues}/></div></AppShell>
}
