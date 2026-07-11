"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Database, LoaderCircle, Search, ShieldCheck, Swords, Target, Users } from "lucide-react";
import { ResearchStage } from "@/lib/research/types";
import { productCopy } from "@/lib/copy";
const stages:Array<{key:ResearchStage;label:string;detail:string;icon:typeof Target}>=[{key:"generating_queries",label:"Frame the research",detail:"Converting your brief into structured market queries.",icon:Target},{key:"searching_web",label:"Scan market signals",detail:"Searching public source categories and competitive intelligence.",icon:Search},{key:"extracting_sources",label:"Extract source context",detail:"Isolating relevant text, dates, and source classifications.",icon:Swords},{key:"filtering_evidence",label:"Filter evidence",detail:"Removing duplicates and low-confidence signals.",icon:ShieldCheck},{key:"analyzing",label:"Map the opportunity",detail:"Connecting pain signals, competitive gaps, pricing, and risks.",icon:Database},{key:"scoring",label:"Apply decision model",detail:"Weighting strengths and inverting risk factors.",icon:ShieldCheck},{key:"generating_report",label:"Assemble the memo",detail:"Producing a structured decision document.",icon:Users}];
export function ResearchProgress({id,idea="the opportunity"}:{id:string;idea?:string}){
  const router=useRouter();
  const [state,setState]=useState({stage:"queued" as ResearchStage,progress:0,message:"Queued for analysis",evidenceCount:0,sourceCount:0,competitorCount:0,reportReady:false});
  const [logs, setLogs] = useState<Array<{ time: string; text: string }>>([]);

  useEffect(()=>{
    let cancelled=false;
    const poll=async()=>{
      const response=await fetch(`/api/research/${id}/progress`,{cache:"no-store"});
      if(!response.ok)return;
      const next=await response.json();
      if(!cancelled)setState(next);
      if(next.reportReady){
        setTimeout(()=>router.push(`/research/${id}/results`),500);
        return;
      }
      if(next.stage!=="failed"&&next.stage!=="complete")setTimeout(poll,500);
    };
    poll();
    return()=>{cancelled=true};
  },[id,router]);

  useEffect(() => {
    if (state.message) {
      const time = new Date().toTimeString().slice(0, 8);
      setLogs(prev => {
        if (prev.length > 0 && prev[prev.length - 1].text === state.message) return prev;
        return [...prev, { time, text: state.message }];
      });
    }
  }, [state.message]);

  const active=stages.findIndex(stage=>stage.key===state.stage);

  return <div className="progress-page premium-progress">
    <div className="progress-orbit"><LoaderCircle size={28}/></div>
    <p className="eyebrow">RESEARCH IN PROGRESS</p>
    <h1>Analyzing <em>{idea}</em></h1>
    <p>{state.message}. {productCopy.microcopy.loading}</p>
    
    <div className="progress-track">
      <i style={{width:`${state.progress}%`}}/>
    </div>
    
    <div className="progress-live-metrics">
      <span><b>{state.sourceCount}</b> sources</span>
      <span><b>{state.evidenceCount}</b> evidence items</span>
      <span><b>{state.competitorCount}</b> competitors</span>
      <span className="current-stage"><b>Active</b> {state.stage.replaceAll("_"," ")}</span>
    </div>
    
    <div className="progress-list">
      {stages.map(({key,label,detail,icon:Icon},i)=><div className={i<active?"done":i===active?"running":""} key={key}>
        <span>{i<active?<Check size={14}/>:i===active?<LoaderCircle size={14}/>:<Icon size={15}/>}</span>
        <div>
          <b>{label}</b>
          <small>{detail}</small>
        </div>
        <i>{i<active?"Complete":i===active?"In progress":"Queued"}</i>
      </div>)}
    </div>

    <div className="research-terminal">
      <div className="terminal-header">
        <span className="dot red"/>
        <span className="dot yellow"/>
        <span className="dot green"/>
        <span className="terminal-title">LIVE AGENT ENGINE LOGS</span>
      </div>
      <div className="terminal-body">
        {logs.map((log, i) => (
          <div key={i} className="terminal-line">
            <span className="terminal-time">[{log.time}]</span>{" "}
            <span className="terminal-text">{log.text}</span>
          </div>
        ))}
        {state.stage !== "complete" && state.stage !== "failed" && (
          <div className="terminal-line pulsing">
            <span className="terminal-cursor">█</span>
          </div>
        )}
      </div>
    </div>

    {state.stage==="failed"&&<p className="progress-error">{productCopy.microcopy.error} {state.message}</p>}
  </div>;
}

