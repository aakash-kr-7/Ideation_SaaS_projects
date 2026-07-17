"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Database, LoaderCircle, Search, ShieldCheck, Swords, Target, Users } from "lucide-react";
import type { ResearchStatus } from "@/supabase/functions/_shared/research/status";
import { productCopy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/client";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getStaggerDelay, revealUpClass, stateChangeKey } from "@/lib/motion";

const stages:Array<{key:ResearchStatus;label:string;detail:string;icon:typeof Target}>=[
  {key:"Searching",label:"Understanding your idea",detail:"Parsing brief and searching 10+ source categories.",icon:Search},
  {key:"Extracting",label:"Reading buyer conversations",detail:"Extracting relevant pain signals, pricing data, and complaints.",icon:Swords},
  {key:"Normalizing",label:"Filtering noise from signal",detail:"Normalizing evidence, removing duplicates, and mapping competition.",icon:ShieldCheck},
  {key:"Scoring",label:"Scoring the opportunity",detail:"Weighting 12 criteria against your constraints.",icon:Database},
  {key:"Generating",label:"Writing your report",detail:"Assembling the verdict, evidence, and next steps.",icon:Users}
];

type ProgressState={stage:ResearchStatus;progress:number;message:string;evidenceCount:number;sourceCount:number;competitorCount:number;idea:string};
type StageLog={id:string;created_at:string;progress_detail:string|null;error_message:string|null;stage_name:string};

export function ResearchProgress({id}:{id:string}){
  const router=useRouter();
  const [state,setState]=useState<ProgressState>({stage:"Queued",progress:0,message:"Queued for analysis",evidenceCount:0,sourceCount:0,competitorCount:0,idea:"your idea"});
  const [logs,setLogs]=useState<StageLog[]>([]);
  const [connectionError,setConnectionError]=useState("");

  useEffect(()=>{
    const supabase=createClient();
    let active=true;

    const refreshCounts=async()=>{
      const [sources,evidence,opportunity]=await Promise.all([
        supabase.from("sources").select("id",{count:"exact",head:true}).eq("run_id",id),
        supabase.from("evidence_items").select("id",{count:"exact",head:true}).eq("run_id",id),
        supabase.from("opportunities").select("id").eq("run_id",id).maybeSingle()
      ]);
      let competitorCount=0;
      if(opportunity.data?.id){const competitors=await supabase.from("competitors").select("id",{count:"exact",head:true}).eq("opportunity_id",opportunity.data.id);competitorCount=competitors.count??0}
      if(active)setState(previous=>({...previous,sourceCount:sources.count??0,evidenceCount:evidence.count??0,competitorCount}));
    };

    const refreshStages=async()=>{
      const {data,error}=await (supabase.from("research_stages") as any).select("id,created_at,progress_detail,error_message,stage_name").eq("run_id",id).order("created_at",{ascending:true});
      if(error){if(active)setConnectionError(error.message);return}
      if(active)setLogs((data??[]) as StageLog[]);
    };

    const applyRun=(run:any)=>{
      if(!active)return;
      const message=run.status==="Failed"?(run.error_message||run.progress_detail||"Research failed"):(run.progress_detail||run.status);
      setState(previous=>({...previous,stage:run.status,progress:run.progress??0,message,idea:run.idea_name??previous.idea}));
      if(run.status==="Completed")router.push(`/research/${id}/results`);
    };

    const hydrate=async()=>{
      const {data,error}=await supabase.from("research_runs").select("id,idea_name,status,progress,progress_detail,error_message").eq("id",id).single();
      if(error){if(active)setConnectionError(error.message);return}
      applyRun(data);
      await Promise.all([refreshCounts(),refreshStages()]);
    };

    const channel=supabase.channel(`research-run-${id}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"research_runs",filter:`id=eq.${id}`},payload=>{applyRun(payload.new);void refreshCounts()})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"research_stages",filter:`run_id=eq.${id}`},()=>{void refreshStages();void refreshCounts()})
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"research_stages",filter:`run_id=eq.${id}`},()=>{void refreshStages();void refreshCounts()})
      .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")setConnectionError("Live database updates are unavailable.")});
    void hydrate();
    return()=>{active=false;void supabase.removeChannel(channel)};
  },[id,router]);

  const activeIndex=state.stage==="Completed"?stages.length:stages.findIndex(stage=>stage.key===state.stage);
  return <div className="progress-page premium-progress">
    <div className="progress-orbit"><LoaderCircle size={28}/></div>
    <p className="eyebrow">VALIDATING YOUR IDEA</p>
    <h1>Analyzing <em>{state.idea}</em></h1>
    <p>{state.message}. {productCopy.microcopy.loading}</p>
    <div className="progress-track"><i style={{width:`${state.progress}%`}}/></div>
    <div className="progress-live-metrics">
      <span><b><AnimatedNumber value={state.sourceCount}/></b> sources scanned</span><span><b><AnimatedNumber value={state.evidenceCount}/></b> evidence found</span><span><b><AnimatedNumber value={state.competitorCount}/></b> competitors mapped</span><span key={stateChangeKey(state.stage)} className="current-stage sf-state-ack"><b>Now:</b> {state.stage.replaceAll("_"," ")}</span>
    </div>
    <div className="progress-list">{stages.map(({key,label,detail,icon:Icon},i)=><div className={`${i<activeIndex?"done":i===activeIndex?"running sf-state-ack":""} ${revealUpClass}`} style={getStaggerDelay(i)} key={`${key}-${i===activeIndex}`}><span>{i<activeIndex?<Check size={14}/>:i===activeIndex?<LoaderCircle size={14}/>:<Icon size={15}/>}</span><div><b>{label}</b><small>{detail}</small></div><i>{i<activeIndex?"Done":i===activeIndex?"Running":"Pending"}</i></div>)}</div>
    <div className="research-terminal"><div className="terminal-header"><span className="dot red"/><span className="dot yellow"/><span className="dot green"/><span className="terminal-title">RESEARCH LOG</span></div><div className="terminal-body">{logs.map(log=><div key={log.id} className="terminal-line"><span className="terminal-time">[{new Date(log.created_at).toLocaleTimeString()}]</span>{" "}<span className="terminal-text">{log.error_message||log.progress_detail||log.stage_name}</span></div>)}{state.stage!=="Completed"&&state.stage!=="Failed"&&<div className="terminal-line pulsing"><span className="terminal-cursor">â–ˆ</span></div>}</div></div>
    {(state.stage==="Failed"||connectionError)&&<p className="progress-error">{productCopy.microcopy.error} {state.stage==="Failed"?state.message:connectionError}</p>}
  </div>;
}
