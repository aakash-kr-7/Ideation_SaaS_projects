"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Database, LoaderCircle, Search, ShieldCheck, Swords, Target, Users } from "lucide-react";
import { ResearchStage } from "@/lib/research/types";
import { productCopy } from "@/lib/copy";
const stages:Array<{key:ResearchStage;label:string;detail:string;icon:typeof Target}>=[{key:"generating_queries",label:"Understanding your idea",detail:"Parsing your brief into structured market queries.",icon:Target},{key:"searching_web",label:"Scanning Reddit, G2, Product Hunt…",detail:"Searching 10+ source categories for real market signals.",icon:Search},{key:"extracting_sources",label:"Reading buyer conversations",detail:"Extracting relevant pain signals, pricing data, and complaints.",icon:Swords},{key:"filtering_evidence",label:"Filtering noise from signal",detail:"Removing duplicates and low-confidence data points.",icon:ShieldCheck},{key:"analyzing",label:"Mapping competition & pricing",detail:"Connecting pain signals, competitive gaps, and price points.",icon:Database},{key:"scoring",label:"Scoring the opportunity",detail:"Weighting 8 criteria against your constraints.",icon:ShieldCheck},{key:"generating_report",label:"Writing your report",detail:"Assembling the verdict, evidence, and next steps.",icon:Users}];
export function ResearchProgress({id,idea="your idea"}:{id:string;idea?:string}){
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
    <p className="eyebrow">VALIDATING YOUR IDEA</p>
    <h1>Analyzing <em>{idea}</em></h1>
    <p>{state.message}. {productCopy.microcopy.loading}</p>
    
    <div className="progress-track">
      <i style={{width:`${state.progress}%`}}/>
    </div>
    
    <div className="progress-live-metrics">
      <span><b>{state.sourceCount}</b> sources scanned</span>
      <span><b>{state.evidenceCount}</b> evidence found</span>
      <span><b>{state.competitorCount}</b> competitors mapped</span>
      <span className="current-stage"><b>Now:</b> {state.stage.replaceAll("_"," ")}</span>
    </div>
    
    <div className="progress-list">
      {stages.map(({key,label,detail,icon:Icon},i)=><div className={i<active?"done":i===active?"running":""} key={key}>
        <span>{i<active?<Check size={14}/>:i===active?<LoaderCircle size={14}/>:<Icon size={15}/>}</span>
        <div>
          <b>{label}</b>
          <small>{detail}</small>
        </div>
        <i>{i<active?"Done":i===active?"Running":"Pending"}</i>
      </div>)}
    </div>

    <div className="research-terminal">
      <div className="terminal-header">
        <span className="dot red"/>
        <span className="dot yellow"/>
        <span className="dot green"/>
        <span className="terminal-title">RESEARCH LOG</span>
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
