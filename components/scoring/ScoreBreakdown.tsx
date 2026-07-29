"use client";

import { BadgeCheck, CircleHelp, ShieldAlert } from "lucide-react";
import { scoringCriteria } from "@/lib/scoring";
import { EvidenceItem, OpportunityScorecard } from "@/lib/types";
import { ScoreGuide } from "./ScoreGuide";
import { ScoreBadge } from "./score-badge";
import { AnimatedNumber } from "@/components/ui/animated-number";

export function ScoreBreakdown({ scorecard, evidence = [] }: { scorecard: OpportunityScorecard; evidence?: EvidenceItem[]; previousScore?: number }) {
  const showExact = !scorecard.scoreBand || scorecard.scoreBand.label === "High Evidence Confidence";
  const states = scoringCriteria.reduce((counts, criterion) => {
    const state = scorecard.factorEvidence?.[criterion.key]?.evidenceState ?? "ASSUMED";
    counts[state] += 1;
    return counts;
  }, { EVIDENCED: 0, SUGGESTIVE: 0, ASSUMED: 0 });
  const groupCount = (ids: readonly string[]) => new Set(
    evidence.filter((item) => ids.includes(item.id) && !item.excluded)
      .map((item) => item.independenceKey || item.canonicalSourceId || item.canonicalDomain || item.id)
  ).size;

  return <section className="engine-card score-breakdown">
    <header>
      <div><p className="eyebrow">Weighted decision</p><h3>Evidence-adjusted score</h3></div>
      <div className="engine-score" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showExact && <ScoreBadge score={scorecard.total} size="lg" />}
        <div>{showExact
          ? <><b style={{ fontSize: 24, fontFamily: "var(--mono)", fontWeight: 700 }}><AnimatedNumber value={scorecard.total}/></b><span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 2 }}>/100</span></>
          : <b style={{ fontSize: 20, fontFamily: "var(--mono)", fontWeight: 700 }}>{scorecard.scoreBand?.display}</b>}
        </div>
      </div>
    </header>
    <div className="score-summary">
      <span className={`engine-verdict ${scorecard.verdict.toLowerCase().replaceAll(" ", "-")}`}>{scorecard.verdict}</span>
      <span><BadgeCheck size={14}/>{scorecard.confidence}% evidence confidence</span>
    </div>
    <div className="score-guide-wrap"><ScoreGuide score={scorecard.total} compact/></div>
    <div className="factor-evidence-summary" role="img" aria-label={`${states.EVIDENCED} evidenced factors, ${states.SUGGESTIVE} suggestive factors, and ${states.ASSUMED} assumed factors`}>
      {(["EVIDENCED", "SUGGESTIVE", "ASSUMED"] as const).map((state) => <div key={state}>
        <span><b>{state}</b><em>{states[state]} of 12</em></span>
        <i><em data-state={state.toLowerCase()} style={{ width: `${states[state] / 12 * 100}%` }}/></i>
      </div>)}
    </div>
    <div className="criterion-bars">{scoringCriteria.map((criterion) => {
      const legacyScore = scorecard.scores[criterion.key];
      const integrity = scorecard.factorEvidence?.[criterion.key];
      const adjusted = integrity?.effectiveScore ?? legacyScore;
      const contribution = criterion.risk ? 100 - adjusted : adjusted;
      const scoreClass = contribution >= 70 ? "score-high" : contribution >= 45 ? "score-mid" : "score-low";
      const refs = scorecard.evidenceRefs[criterion.key] ?? [];
      const independentGroups = groupCount(integrity?.supportingEvidenceIds ?? refs);
      return <article key={criterion.key}>
        <div>
          <b title={criterion.description}>{criterion.label}<CircleHelp size={12}/></b>
          <span>{integrity ? `${integrity.rawScore} raw → ${integrity.effectiveScore} effective` : `${legacyScore}/100`}</span>
        </div>
        <i><em className={scoreClass} style={{width: `${contribution}%`}}/></i>
        <p>{scorecard.notes[criterion.key]}</p>
        {integrity && <small className={`factor-state factor-state-${integrity.evidenceState.toLowerCase()}`}><b>{integrity.evidenceState}</b> · {Math.round(integrity.evidenceCoefficient * 100)}% evidence confidence · {independentGroups} independent supporting group{independentGroups === 1 ? "" : "s"}</small>}
        {integrity?.confidenceDeductions.map((item) => <small className="missing" key={item}>{item}</small>)}
        {integrity?.unresolvedGaps.map((item) => <small className="missing" key={item}>{item}</small>)}
        {refs.length ? <small>{refs.length} linked evidence item{refs.length === 1 ? "" : "s"}</small> : <small className="missing"><ShieldAlert size={12}/>Needs evidence</small>}
      </article>;
    })}</div>
    <div className="factor-evidence-table-wrap">
      <table className="factor-evidence-table">
        <caption>Factor evidence details</caption>
        <thead><tr><th>Factor</th><th>Evidence state</th><th>Effective score</th><th>Evidence confidence</th><th>Independent supporting groups</th></tr></thead>
        <tbody>{scoringCriteria.map((criterion) => {
          const integrity = scorecard.factorEvidence?.[criterion.key];
          const refs = scorecard.evidenceRefs[criterion.key] ?? [];
          return <tr key={criterion.key}>
            <th scope="row">{criterion.label}</th><td>{integrity?.evidenceState ?? "ASSUMED"}</td>
            <td>{integrity?.effectiveScore ?? scorecard.scores[criterion.key]}/100</td>
            <td>{Math.round((integrity?.evidenceCoefficient ?? 0) * 100)}%</td>
            <td>{groupCount(integrity?.supportingEvidenceIds ?? refs)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}
