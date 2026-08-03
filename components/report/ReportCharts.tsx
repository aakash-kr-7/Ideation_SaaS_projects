"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { ValidationReport } from "@/lib/report-schema";
import { scoringCriteria } from "@/lib/scoring";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { EvidenceBadge, type EvidenceTier } from "@/components/ui/evidence-badge";
import { DataResolve } from "@/components/ui/data-resolve";
import { PanelTransition } from "@/components/ui/panel-transition";
import { SpotlightCard } from "@/components/ui/spotlight-card";

export type ReportChartDataset = {
  chartKey: string;
  chartType: string;
  sourceData: Record<string, unknown>;
  chartConfig: Record<string, unknown>;
  supportingEvidenceIds: string[];
};

export type FactorAnalysisItem = {
  criterion: string;
  rawScore: number;
  effectiveScore: number;
  evidenceCoefficient: number;
  evidenceState: string;
  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];
  buyerSegmentApplicability: string[];
  unresolvedAssumptions: string[];
  scoreSensitivity?: { lower: number; current: number; upper: number; explanation: string };
};

type Datum = { label: string; value: number };

function human(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tierFromState(state: string | undefined): EvidenceTier | null {
  if (state === "EVIDENCED") return "evidenced";
  if (state === "SUGGESTIVE") return "suggestive";
  if (state === "ASSUMED") return "assumed";
  return null;
}

function sourceKey(evidence: ValidationReport["opportunity"]["evidence"][number]) {
  return evidence.canonicalSourceId ?? evidence.url ?? evidence.source;
}

function independenceKey(evidence: ValidationReport["opportunity"]["evidence"][number]) {
  return evidence.independenceKey ?? evidence.syndicationGroup ?? evidence.canonicalDomain ?? sourceKey(evidence);
}

function evidenceDate(evidence: ValidationReport["opportunity"]["evidence"][number]) {
  return evidence.publishedOrUpdatedAt ?? evidence.date ?? evidence.retrievedAt ?? null;
}

function newestDate(items: ValidationReport["opportunity"]["evidence"]) {
  const dated = items.map(evidenceDate).filter((value): value is string => Boolean(value));
  if (!dated.length) return "No source date persisted";
  return [...dated].sort((a, b) => {
    const aTime = new Date(a).getTime();
    const bTime = new Date(b).getTime();
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0;
    return bTime - aTime;
  })[0];
}

export function FactorEvidenceList({ report, factors = [], motionKey, animateEntrance }: { report: ValidationReport; factors?: FactorAnalysisItem[]; motionKey: string; animateEntrance: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const scorecard = report.opportunity.scorecard;
  const evidenceById = new Map(report.opportunity.evidence.map((item) => [item.id, item]));

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="grid gap-sb-3">
      {scoringCriteria.map((criterion, index) => {
        const persisted = scorecard.factorEvidence?.[criterion.key];
        const analysis = factors.find((item) => item.criterion === criterion.key);
        const supportingIds = persisted?.supportingEvidenceIds ?? analysis?.supportingEvidenceIds ?? [];
        const challengingIds = persisted?.challengingEvidenceIds ?? analysis?.challengingEvidenceIds ?? [];
        const evidenceIds = [...new Set([...supportingIds, ...challengingIds])];
        const evidence = evidenceIds.map((id) => evidenceById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
        const sources = new Set(evidence.map(sourceKey));
        const groups = [...new Set(evidence.map(independenceKey))];
        const state = persisted?.evidenceState ?? analysis?.evidenceState;
        const tier = tierFromState(state);
        const isOpen = expanded.has(criterion.key);
        const detailId = `factor-evidence-${criterion.key}`;
        const effectiveScore = persisted?.effectiveScore ?? analysis?.effectiveScore ?? scorecard.scores[criterion.key];
        const unresolved = persisted?.unresolvedGaps ?? analysis?.unresolvedAssumptions ?? [];

        return (
          <SpotlightCard className="grid gap-sb-4 p-sb-4 sm:p-sb-5" key={criterion.key}>
            <div className="grid gap-sb-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-sb-2">
                  <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="m-0 text-base font-medium">{criterion.label}</h3>
                  <span className="text-xs text-sb-text-tertiary"><DataResolve resolveKey={`report:${motionKey}:factor:${criterion.key}:weight`} isResolved durationMs={220}>{scorecard.weights[criterion.key]}</DataResolve>% weight contribution</span>
                </div>
                <p className="mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary">{scorecard.notes[criterion.key]}</p>
              </div>

              {tier ? (
                <EvidenceBadge
                  tier={tier}
                  whatWasFound={scorecard.notes[criterion.key]}
                  sourceCount={sources.size}
                  independenceGrouping={groups.length ? groups.join(", ") : "No independent group persisted"}
                  freshnessDate={newestDate(evidence)}
                  settleDelayMs={index * 30}
                  animateSettle={animateEntrance}
                />
              ) : (
                <span className="w-fit rounded-sb-pill border border-dotted border-sb-border-hairline-strong px-sb-3 py-sb-1 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">Tier not persisted</span>
              )}

              <div className="flex items-center justify-between gap-sb-3 lg:justify-end">
                <DataResolve
                  resolveKey={`report:${motionKey}:factor:${criterion.key}:effective-score`}
                  isResolved
                  durationMs={220}
                  className="text-lg font-semibold text-sb-text-primary"
                  aria-label={`${criterion.label} score ${effectiveScore} out of 100`}
                >
                  {effectiveScore}
                </DataResolve>
                <Button
                  variant="ghost"
                  className="min-h-9 px-sb-3 text-xs"
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  onClick={() => toggle(criterion.key)}
                >
                  {isOpen ? "Hide evidence" : "View evidence"}
                  <ChevronDown className={`transition-transform duration-sb-fast ease-sb-standard ${isOpen ? "rotate-180" : ""}`} size={14}/>
                </Button>
              </div>
            </div>

            <PanelTransition isOpen={isOpen} id={detailId}>
              <div className="grid gap-sb-3 border-t border-sb-border-hairline pt-sb-4">
                {evidence.length ? evidence.map((item) => {
                  const role = challengingIds.includes(item.id) ? "Challenging" : "Supporting";
                  return (
                    <article className="grid gap-sb-2 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-4" key={item.id}>
                      <div className="flex flex-wrap items-center justify-between gap-sb-2 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">
                        <span>{role} source</span>
                        <span className="font-sb-mono normal-case tabular-nums">{evidenceDate(item) ?? "Source date not persisted"}</span>
                      </div>
                      <h4 className="m-0 text-sm font-medium">{item.title}</h4>
                      <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{item.atomicClaim ?? item.snippet}</p>
                      <div className="flex flex-wrap items-center justify-between gap-sb-2 text-xs text-sb-text-tertiary">
                        <span>Independence: {independenceKey(item)}</span>
                        {item.url && (
                          <a className="inline-flex items-center gap-sb-1 hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={item.url} target="_blank" rel="noreferrer">
                            {item.canonicalDomain ?? item.source}<ExternalLink size={11}/>
                          </a>
                        )}
                      </div>
                    </article>
                  );
                }) : (
                  <p className="m-0 rounded-sb-md border border-dashed border-sb-border-hairline p-sb-4 text-sm leading-relaxed text-sb-text-secondary">
                    No source is linked to this factor in the immutable report.{unresolved.length ? ` Next evidence needed: ${unresolved.join(" ")}` : " Review the factor note before acting on it."}
                  </p>
                )}
              </div>
            </PanelTransition>
          </SpotlightCard>
        );
      })}
    </div>
  );
}

function chartData(chart: ReportChartDataset): Datum[] {
  const labels = chart.sourceData.labels;
  const values = chart.sourceData.values;
  if (!Array.isArray(labels) || !Array.isArray(values)) return [];
  return labels.flatMap((label, index) => {
    const value = values[index];
    return typeof value === "number" && Number.isFinite(value) ? [{ label: String(label), value }] : [];
  });
}

function isGenuineTrend(chart: ReportChartDataset) {
  const type = chart.chartType.toLowerCase();
  return ["line", "area", "trend", "timeline"].some((candidate) => type.includes(candidate))
    || chart.chartConfig.purpose === "trend"
    || chart.chartConfig.isTrend === true;
}

export function ReportCharts({ datasets = [] }: { report: ValidationReport; datasets?: ReportChartDataset[] }) {
  const trends = datasets.filter(isGenuineTrend).map((chart) => ({ chart, data: chartData(chart) })).filter(({ data }) => data.length > 1);
  if (!trends.length) return null;

  return (
    <section className="grid gap-sb-4" aria-labelledby="report-trends-title">
      <header>
        <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Persisted trends</p>
        <h2 id="report-trends-title" className="mb-0 mt-sb-1 font-sb-display text-2xl font-[480]">Change over time</h2>
      </header>
      <div className="grid gap-sb-4 lg:grid-cols-2">
        {trends.map(({ chart, data }) => {
          const minimum = Math.min(...data.map((item) => item.value));
          const maximum = Math.max(...data.map((item) => item.value));
          const range = maximum - minimum || 1;
          const points = data.map((item, index) => {
            const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
            const y = 28 - ((item.value - minimum) / range) * 24;
            return `${x},${y}`;
          }).join(" ");
          return (
            <Card className="grid gap-sb-4 p-sb-5" key={chart.chartKey}>
              <div>
                <h3 className="m-0 text-sm font-medium">{String(chart.chartConfig.title ?? human(chart.chartKey))}</h3>
                <p className="mb-0 mt-sb-1 text-xs text-sb-text-tertiary">{chart.supportingEvidenceIds.length} linked evidence item{chart.supportingEvidenceIds.length === 1 ? "" : "s"}</p>
              </div>
              <svg className="h-24 w-full overflow-visible" viewBox="0 0 100 32" role="img" aria-label={data.map((item) => `${item.label}: ${item.value}`).join(", ")} preserveAspectRatio="none">
                <polyline points={points} fill="none" stroke="var(--sb-text-secondary)" strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>
              </svg>
              <div className="flex justify-between gap-sb-3 font-sb-mono text-xs tabular-nums text-sb-text-tertiary"><span>{data[0].label}: {data[0].value}</span><span>{data.at(-1)?.label}: {data.at(-1)?.value}</span></div>
              <Disclosure
                className="text-xs text-sb-text-secondary"
                panelClassName="pt-sb-3"
                summary="Accessible values"
              >
                <dl className="m-0 grid grid-cols-[1fr_auto] gap-sb-2">{data.map((item) => <div className="contents" key={item.label}><dt>{item.label}</dt><dd className="m-0 font-sb-mono tabular-nums">{item.value}</dd></div>)}</dl>
              </Disclosure>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
