import { ResearchProgress } from "@/components/research/research-progress";
export default async function DynamicProgressPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ResearchProgress id={id}/>}
