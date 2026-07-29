"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { CompletedScorecard } from "@/lib/report-data";
import type { ScoringWeights } from "@/lib/types";
import { recalculateScorecard } from "@/lib/recalculate-scorecard";
import { WeightEditor } from "./WeightEditor";
import { ScoreBreakdown } from "./ScoreBreakdown";

export function ScoringWorkbench({reports}:{reports:CompletedScorecard[]}){
  const [reportId,setReportId]=useState(reports[0]?.id??"");
  const report=reports.find(item=>item.id===reportId)??reports[0];
  const [weightsByReport,setWeightsByReport]=useState<Record<string,ScoringWeights>>({});
  const weights=report?(weightsByReport[report.id]??report.scorecard.weights):undefined;
  const scorecard=useMemo(()=>report&&weights?recalculateScorecard(report.scorecard,weights):null,[report,weights]);
  if(!report||!weights||!scorecard)return <div className="scoring-workbench"><div className="workbench-intro"><div><p className="eyebrow">Decision physics</p><h2>A score should never be a black box.</h2><p>Complete one validation to open the model, inspect every factor, and see what is actually carrying the verdict.</p><Link className="button button-small" href="/research/new">Create the first decision file <ArrowRight size={14}/></Link></div></div></div>;
  const setWeights=(next:ScoringWeights)=>setWeightsByReport(previous=>({...previous,[report.id]:next}));
  return <div className="scoring-workbench">
    <div className="workbench-intro"><div><p className="eyebrow">Decision physics</p><h2>See what is carrying the verdict.</h2><p>Change the weight of each factor and watch the decision move—without hiding the market evidence underneath it.</p></div><label className="report-select">Decision file<select value={report.id} onChange={e=>setReportId(e.target.value)}>{reports.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={15}/></label></div>
    <div className="workbench-grid"><WeightEditor weights={weights} defaultValue={report.scorecard.weights} onChange={setWeights}/><ScoreBreakdown scorecard={scorecard} previousScore={report.scorecard.total}/></div>
  </div>;
}
