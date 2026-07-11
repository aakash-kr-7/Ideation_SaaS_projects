"use client";

import { ArrowDown, ArrowUp, BadgeCheck, CircleHelp, ShieldAlert } from "lucide-react";
import { scoringCriteria } from "@/lib/scoring";
import { OpportunityScorecard } from "@/lib/types";
import { ScoreGuide } from "./ScoreGuide";

export function ScoreBreakdown({ scorecard, previousScore }: { scorecard: OpportunityScorecard; previousScore?: number }) {
  const delta = previousScore === undefined ? 0 : Math.round((scorecard.total - previousScore) * 10) / 10;

  return <section className="engine-card score-breakdown">
    <header><div><p className="eyebrow">Weighted decision</p><h3>Evidence-adjusted score</h3></div><div className="engine-score"><b>{scorecard.total}</b><span>/100</span></div></header>
    <div className="score-summary"><span className={`engine-verdict ${scorecard.verdict.toLowerCase().replaceAll(" ", "-")}`}>{scorecard.verdict}</span><span><BadgeCheck size={14}/>{scorecard.confidence}% evidence confidence</span>{delta !== 0 && <span className={delta > 0 ? "score-up" : "score-down"}>{delta > 0 ? <ArrowUp size={14}/> : <ArrowDown size={14}/>} {Math.abs(delta)} vs prior weighting</span>}</div>
    <div className="score-guide-wrap"><ScoreGuide score={scorecard.total} compact/></div>
    <div className="criterion-bars">{scoringCriteria.map((criterion) => {
      const raw = scorecard.scores[criterion.key];
      const effective = criterion.risk ? 100 - raw : raw;
      const evidence = scorecard.evidenceRefs[criterion.key] ?? [];
      return <article key={criterion.key}><div><b title={criterion.description}>{criterion.label}<CircleHelp size={12}/></b><span>{criterion.risk ? `${raw} risk → ${effective} effective` : `${raw}/100`}</span></div><i><em style={{width: `${effective}%`}}/></i><p>{scorecard.notes[criterion.key]}</p>{evidence.length ? <small>{evidence.length} linked evidence item{evidence.length === 1 ? "" : "s"}</small> : <small className="missing"><ShieldAlert size={12}/>Needs evidence</small>}</article>;
    })}</div>
  </section>;
}
