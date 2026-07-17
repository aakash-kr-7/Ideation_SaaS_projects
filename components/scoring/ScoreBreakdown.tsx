"use client";

import { BadgeCheck, CircleHelp, ShieldAlert } from "lucide-react";
import { scoringCriteria } from "@/lib/scoring";
import { OpportunityScorecard } from "@/lib/types";
import { ScoreGuide } from "./ScoreGuide";
import { ScoreBadge } from "./score-badge";
import { AnimatedNumber } from "@/components/ui/animated-number";

export function ScoreBreakdown({ scorecard }: { scorecard: OpportunityScorecard; previousScore?: number }) {
  return <section className="engine-card score-breakdown">
    <header>
      <div>
        <p className="eyebrow">Weighted decision</p>
        <h3>Evidence-adjusted score</h3>
      </div>
      <div className="engine-score" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ScoreBadge score={scorecard.total} size="lg" />
        <div>
          <b style={{ fontSize: 24, fontFamily: 'var(--mono)', fontWeight: 700 }}><AnimatedNumber value={scorecard.total}/></b>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 2 }}>/100</span>
        </div>
      </div>
    </header>
    <div className="score-summary">
      <span className={`engine-verdict ${scorecard.verdict.toLowerCase().replaceAll(" ", "-")}`}>{scorecard.verdict}</span>
      <span><BadgeCheck size={14}/>{scorecard.confidence}% evidence confidence</span>
    </div>
    <div className="score-guide-wrap"><ScoreGuide score={scorecard.total} compact/></div>
    <div className="criterion-bars">{scoringCriteria.map((criterion) => {
      const raw = scorecard.scores[criterion.key];
      const effective = criterion.risk ? 100 - raw : raw;
      const scoreClass = effective >= 70 ? "score-high" : effective >= 45 ? "score-mid" : "score-low";
      const evidence = scorecard.evidenceRefs[criterion.key] ?? [];
      return <article key={criterion.key}>
        <div>
          <b title={criterion.description}>{criterion.label}<CircleHelp size={12}/></b>
          <span>{criterion.risk ? `${raw} risk → ${effective} effective` : `${raw}/100`}</span>
        </div>
        <i><em className={scoreClass} style={{width: `${effective}%`}}/></i>
        <p>{scorecard.notes[criterion.key]}</p>
        {evidence.length ? <small>{evidence.length} linked evidence item{evidence.length === 1 ? "" : "s"}</small> : <small className="missing"><ShieldAlert size={12}/>Needs evidence</small>}
      </article>;
    })}</div>
  </section>;
}
