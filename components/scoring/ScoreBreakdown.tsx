"use client";

import { scoringCriteria } from "@/lib/scoring";
import type { EvidenceItem, OpportunityScorecard } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { EvidenceBadge, type EvidenceTier } from "@/components/ui/evidence-badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { ScoreGuide } from "./ScoreGuide";

function tierFromState(state: string | undefined): EvidenceTier | null {
  if (state === "EVIDENCED") return "evidenced";
  if (state === "SUGGESTIVE") return "suggestive";
  if (state === "ASSUMED") return "assumed";
  return null;
}

function sourceKey(item: EvidenceItem) {
  return item.canonicalSourceId ?? item.url ?? item.source;
}

function independenceKey(item: EvidenceItem) {
  return item.independenceKey ?? item.syndicationGroup ?? item.canonicalDomain ?? sourceKey(item);
}

function freshness(item: EvidenceItem) {
  return item.publishedOrUpdatedAt ?? item.date ?? item.retrievedAt ?? null;
}

function newestDate(items: EvidenceItem[]) {
  const values = items.map(freshness).filter((value): value is string => Boolean(value));
  if (!values.length) return "No source date persisted";
  return [...values].sort((left, right) => {
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
    return rightTime - leftTime;
  })[0];
}

export function ScoreBreakdown({
  scorecard,
  evidence = [],
  previousScore,
}: {
  scorecard: OpportunityScorecard;
  evidence?: EvidenceItem[];
  previousScore?: number;
}) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const delta = previousScore == null ? 0 : scorecard.total - previousScore;
  const states = scoringCriteria.reduce((counts, criterion) => {
    const state = scorecard.factorEvidence?.[criterion.key]?.evidenceState;
    if (state) counts[state] += 1;
    return counts;
  }, { EVIDENCED: 0, SUGGESTIVE: 0, ASSUMED: 0 });

  return (
    <Card className="overflow-visible">
      <header className="flex flex-col gap-sb-4 border-b border-sb-border-hairline p-sb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Weighted decision</p>
          <h2 className="mb-0 mt-sb-1 text-base font-medium">Twelve-factor breakdown</h2>
          <p className="mb-0 mt-sb-1 text-xs text-sb-text-tertiary">{states.EVIDENCED} evidenced · {states.SUGGESTIVE} suggestive · {states.ASSUMED} assumed</p>
        </div>
        <div className="flex flex-wrap items-end gap-sb-3">
          <ScoreDisplay score={scorecard.total} size="md" showMax animate={false}/>
          <div className="grid gap-sb-1">
            <VerdictBadge verdict={scorecard.verdict}/>
            <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">
              {delta === 0 ? "Baseline" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} from baseline`}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-sb-border-hairline p-sb-3 sm:p-sb-4">
        <ScoreGuide score={scorecard.total} compact/>
      </div>

      <div className="grid gap-sb-2 p-sb-2 sm:p-sb-3" aria-label="Twelve-factor evidence breakdown">
        {scoringCriteria.map((criterion, index) => {
          const integrity = scorecard.factorEvidence?.[criterion.key];
          const linkedIds = [...new Set([
            ...(integrity?.supportingEvidenceIds ?? []),
            ...(integrity?.challengingEvidenceIds ?? []),
            ...(scorecard.evidenceRefs[criterion.key] ?? []),
          ])];
          const linkedEvidence = linkedIds.map((id) => evidenceById.get(id)).filter((item): item is EvidenceItem => item !== undefined && !item.excluded);
          const sources = new Set(linkedEvidence.map(sourceKey));
          const groups = [...new Set(linkedEvidence.map(independenceKey))];
          const tier = tierFromState(integrity?.evidenceState);
          const effectiveScore = integrity?.effectiveScore ?? scorecard.scores[criterion.key];
          const limitations = [...(integrity?.confidenceDeductions ?? []), ...(integrity?.unresolvedGaps ?? [])];

          return (
            <Card className="grid gap-sb-3 rounded-sb-md p-sb-3" key={criterion.key}>
              <div className="grid gap-sb-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-sb-2">
                    <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="m-0 text-sm font-medium">{criterion.label}</h3>
                    <span className="text-xs text-sb-text-tertiary">{scorecard.weights[criterion.key]}% weight contribution</span>
                  </div>
                  <p className="mb-0 mt-sb-1 text-xs leading-relaxed text-sb-text-secondary">{scorecard.notes[criterion.key]}</p>
                </div>

                {tier ? (
                  <EvidenceBadge
                    tier={tier}
                    whatWasFound={scorecard.notes[criterion.key]}
                    sourceCount={sources.size}
                    independenceGrouping={groups.length ? groups.join(", ") : "No independent group persisted"}
                    freshnessDate={newestDate(linkedEvidence)}
                    settleDelayMs={index * 20}
                    animateSettle={false}
                  />
                ) : (
                  <span className="w-fit rounded-sb-pill border border-dotted border-sb-border-hairline-strong px-sb-3 py-sb-1 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">Tier not persisted</span>
                )}

                <div className="flex items-center justify-between gap-sb-3 md:justify-end">
                  <span className="font-sb-mono text-base font-semibold tabular-nums" aria-label={`${criterion.label} score ${effectiveScore} out of 100`}>{effectiveScore}</span>
                  <span className="min-w-24 text-right font-sb-mono text-xs tabular-nums text-sb-text-tertiary">
                    {integrity ? `${integrity.rawScore} raw → ${integrity.effectiveScore} effective` : `${linkedIds.length} evidence ref${linkedIds.length === 1 ? "" : "s"}`}
                  </span>
                </div>
              </div>

              {limitations.length > 0 && (
                <Disclosure
                  className="border-t border-sb-border-hairline pt-sb-2 text-xs text-sb-text-secondary"
                  buttonClassName="w-fit text-sb-text-tertiary hover:text-sb-text-primary"
                  panelClassName="pt-sb-2"
                  summary={`${limitations.length} evidence limitation${limitations.length === 1 ? "" : "s"}`}
                >
                  <ul className="mb-0 mt-0 grid gap-sb-1 pl-sb-5">{limitations.map((item) => <li key={item}>{item}</li>)}</ul>
                </Disclosure>
              )}
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
