"use client";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { validationReports } from "@/lib/report-mocks";
import { calculateConfidenceScore, calculateWeightedScore, getVerdictFromScore, defaultWeights } from "@/lib/scoring";
import { ScoringWeights } from "@/lib/types";
import { WeightEditor } from "./WeightEditor";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { ValidationReport } from "@/components/report/ValidationReport";

export function ScoringWorkbench(){
  const [reportId,setReportId]=useState(validationReports[2].id);
  const [weights,setWeights]=useState<ScoringWeights>(defaultWeights);
  const [showReport,setShowReport]=useState(false);
  const report=validationReports.find(r=>r.id===reportId)??validationReports[0];

  const scorecard=useMemo(()=>{
    const total=calculateWeightedScore(report.opportunity.scorecard.scores,weights);
    const partial={...report.opportunity.scorecard,weights,total,verdict:getVerdictFromScore(total)};
    return {...partial,confidence:calculateConfidenceScore(partial)};
  },[report,weights]);

  return <div className="scoring-workbench">
    <div className="workbench-intro">
      <div>
        <p className="eyebrow">Interactive decision model</p>
        <h2>Test your decision criteria.</h2>
        <p>Adjust validation weights to see how they impact the overall score and verdict, anchored by real market evidence.</p>
      </div>
      <label className="report-select">
        Select idea
        <select value={reportId} onChange={e=>setReportId(e.target.value)}>
          {validationReports.map(r=><option value={r.id} key={r.id}>{r.opportunity.name}</option>)}
        </select>
        <ChevronDown size={15}/>
      </label>
    </div>
    
    <div className="workbench-grid">
      <WeightEditor weights={weights} onChange={setWeights}/>
      <ScoreBreakdown scorecard={scorecard} previousScore={report.opportunity.scorecard.total}/>
    </div>
    
    <button className="report-reveal" onClick={()=>setShowReport(s=>!s)}>
      {showReport ? "Hide full validation report" : "Open complete validation report"}
      <ArrowRight size={16}/>
    </button>
    {showReport && <ValidationReport report={report} scorecard={scorecard}/>}
  </div>;
}
