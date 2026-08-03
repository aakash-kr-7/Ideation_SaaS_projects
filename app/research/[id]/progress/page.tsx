import { AppShell } from "@/components/layout/app-shell";
import { ResearchProgress } from "@/components/research/research-progress";

export default async function DynamicProgressPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <AppShell title="Validation in progress">
    <div className="px-sb-5 py-sb-8 sm:px-sb-8 sm:py-sb-10">
      <ResearchProgress id={id}/>
    </div>
  </AppShell>;
}
