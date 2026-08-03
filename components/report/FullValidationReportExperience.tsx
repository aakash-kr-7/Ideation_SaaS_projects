"use client";

import { useState } from "react";
import { Circle, Download, ExternalLink } from "lucide-react";
import type { ValidationReport } from "@/lib/report-schema";
import { downloadExport, reportToCsv, reportToMarkdown } from "@/lib/report-export";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { Card } from "@/components/ui/card";
import { EvidenceBadge, type EvidenceTier } from "@/components/ui/evidence-badge";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ScoreDisplay } from "@/components/ui/score-display";
import { StaggerGroup, useFirstSessionMotion } from "@/components/ui/session-stagger";
import { Toast } from "@/components/ui/toast";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { EmptyState } from "@/components/ui/state-message";
import { FactorEvidenceList, ReportCharts, type FactorAnalysisItem, type ReportChartDataset } from "./ReportCharts";
import { LivingReportControls } from "./LivingReportControls";

type Props = {
  report: ValidationReport;
  scorecard?: ValidationReport["opportunity"]["scorecard"];
  publicMode?: boolean;
  previewMode?: boolean;
  runId?: string;
  chartDatasets?: ReportChartDataset[];
};

type Decision = {
  scoreContract?: { name: string; meaning: string; doesNotMean: string; method: string };
  evidenceConfidence?: { band: string };
  scoreChange?: {
    question: string;
    answer: string;
    materialUpwardEvidence: string;
    materialDownwardEvidence: string;
    strongestKillCondition: string;
    highestLeverageUnresolvedAssumption: string;
    currentScore: number;
    targetScore: number;
  };
  factorAnalysis?: FactorAnalysisItem[];
  verdictStructure?: {
    verdict: string;
    score: number;
    scoreRange: string;
    evidenceConfidence: string;
    strongestSupportingEvidenceId: string | null;
    strongestChallengingEvidenceId: string | null;
    strongestAssumption: string;
    recommendedTargetSegment: string | null;
    recommendedProductWedge: string | null;
    upgradeCondition: string;
    downgradeCondition: string;
    killCondition: string;
  };
  founderActionPlan?: {
    highestValueHypothesis: string;
    targetBuyer: string;
    recruitmentChannel: string;
    sampleSize: number;
    testMethod: string;
    durationDays: number;
    successThreshold: string;
    failureThreshold: string;
    maximumBudget: { amount: number; currency: string; assumption: boolean };
    decisionUnlocked: string;
    days: Array<{ days: string; priority: number; action: string }>;
  };
};

type Evidence = ValidationReport["opportunity"]["evidence"][number];
type AdversarialReportView = {
  adversarialInvestigation?: {
    propositions: Array<{ supportingEvidenceIds: string[]; challengingEvidenceIds: string[] }>;
  };
};

function firstSentence(value: string) {
  const match = value.trim().match(/^.*?[.!?](?:\s|$)/);
  return match?.[0].trim() || value.trim();
}

function tierFromState(state: string | undefined): EvidenceTier | null {
  if (state === "EVIDENCED") return "evidenced";
  if (state === "SUGGESTIVE") return "suggestive";
  if (state === "ASSUMED") return "assumed";
  return null;
}

function evidenceMetadata(report: ValidationReport, decision: Decision, evidence: Evidence) {
  const scorecard = report.opportunity.scorecard;
  const factorEvidence = scorecard.factorEvidence;
  const associated = evidence.associatedFactorIds?.find((key) => factorEvidence?.[key as keyof typeof factorEvidence]);
  const factorEntry = associated
    ? factorEvidence?.[associated as keyof typeof factorEvidence]
    : Object.values(factorEvidence ?? {}).find((factor) => factor?.supportingEvidenceIds.includes(evidence.id) || factor?.challengingEvidenceIds.includes(evidence.id));
  const analysisEntry = decision.factorAnalysis?.find((factor) => factor.supportingEvidenceIds.includes(evidence.id) || factor.challengingEvidenceIds.includes(evidence.id));
  const tier = tierFromState(factorEntry?.evidenceState ?? analysisEntry?.evidenceState);
  if (!tier) return null;

  return {
    tier,
    whatWasFound: evidence.atomicClaim ?? evidence.snippet,
    sourceCount: evidence.independentSourceCount ?? (evidence.url ? 1 : 0),
    independenceGrouping: evidence.independenceKey ?? evidence.syndicationGroup ?? evidence.canonicalDomain ?? "Independence group not persisted",
    freshnessDate: evidence.publishedOrUpdatedAt ?? evidence.date ?? evidence.retrievedAt ?? "Source date not persisted",
  };
}

function uniqueEvidence(ids: Array<string | null | undefined>, byId: Map<string, Evidence>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
    .map((id) => byId.get(id))
    .filter((item): item is Evidence => item !== undefined && !item.excluded);
}

export function FullValidationReportExperience({
  report,
  scorecard,
  publicMode = false,
  previewMode = false,
  runId,
  chartDatasets,
}: Props) {
  const [toast, setToast] = useState("");
  const motionReportId = runId ?? report.id;
  const animateReportEntrance = useFirstSessionMotion(`report:${motionReportId}:v1`);
  const decision = report.fullValidationDecision as Decision;
  const opportunity = { ...report.opportunity, scorecard: scorecard ?? report.opportunity.scorecard };
  const verdict = decision.verdictStructure;
  const resolvedVerdict = verdict?.verdict ?? opportunity.scorecard.verdict;
  const factorAnalysis = decision.factorAnalysis ?? [];
  const evidenceById = new Map(opportunity.evidence.map((item) => [item.id, item]));
  const propositions = (report as ValidationReport & AdversarialReportView).adversarialInvestigation?.propositions ?? [];
  const prosecutionEvidence = uniqueEvidence([
    verdict?.strongestSupportingEvidenceId,
    report.strongestPositiveEvidenceId,
    ...propositions.flatMap((item) => item.supportingEvidenceIds),
    ...factorAnalysis.flatMap((item) => item.supportingEvidenceIds),
  ], evidenceById);
  const defenceEvidence = uniqueEvidence([
    verdict?.strongestChallengingEvidenceId,
    report.strongestNegativeEvidenceId,
    ...propositions.flatMap((item) => item.challengingEvidenceIds),
    ...factorAnalysis.flatMap((item) => item.challengingEvidenceIds),
  ], evidenceById);
  const reportDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(report.generatedAt));
  const currentScore = decision.scoreChange?.currentScore ?? opportunity.scorecard.total;
  const targetScore = decision.scoreChange?.targetScore ?? report.verdictChangeConditions?.nearestBoundary;
  const plan = decision.founderActionPlan;
  const planItems = plan?.days ?? opportunity.launch.weekOne.map((action, index) => ({ days: String(index + 1), priority: index + 1, action }));

  async function exportFile(format: "md" | "json" | "csv" | "pdf") {
    const payload = { ...report, opportunity };
    if (!publicMode && runId) {
      const response = await fetch(`/api/research/${runId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!response.ok) {
        setToast("The stored export is unavailable. Recheck the report before exporting again.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      downloadExport(disposition.match(/filename="([^"]+)"/)?.[1] ?? `${opportunity.name}-report.${format}`, blob, blob.type);
    } else if (format === "pdf") {
      window.print();
    } else if (format === "md") {
      downloadExport(`${opportunity.name}-report.md`, reportToMarkdown(payload), "text/markdown");
    } else if (format === "json") {
      downloadExport(`${opportunity.name}-report.json`, JSON.stringify(payload, null, 2), "application/json");
    } else {
      downloadExport(`${opportunity.name}-report.csv`, reportToCsv(payload), "text/csv");
    }
    setToast(`${format.toUpperCase()} export prepared from report version ${report.version}.`);
  }

  return (
    <main className="validation-report full-validation-report mx-auto grid w-full max-w-6xl gap-sb-10 pb-sb-16">
      <Toast className="report-toast" title={toast} open={Boolean(toast)}/>

      <div className="fv-document-bar flex flex-col gap-sb-3 border-b border-sb-border-hairline py-sb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="block text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Full Validation · immutable report</span>
          <b className="mt-sb-1 block text-sm font-medium">{report.version}</b>
          <small className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{reportDate} · {opportunity.evidence.filter((item) => !item.excluded).length} accepted findings</small>
        </div>
        {!previewMode && (
          <div className="fv-document-actions flex flex-wrap gap-sb-2" aria-label="Report exports">
            <Button variant="ghost" className="min-h-9 px-sb-3 text-xs" onClick={() => void exportFile("pdf")}><Download size={13}/>PDF</Button>
            <Button variant="ghost" className="min-h-9 px-sb-3 text-xs" onClick={() => void exportFile("md")}><Download size={13}/>Markdown</Button>
            <Button variant="ghost" className="min-h-9 px-sb-3 text-xs" onClick={() => void exportFile("json")}><Download size={13}/>JSON</Button>
          </div>
        )}
      </div>

      <header className="fv-decision-hero grid gap-sb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="fv-hero-copy min-w-0">
          <p className="eyebrow m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Verdict</p>
          <h1 className="mb-0 mt-sb-2 font-sb-display text-4xl font-[480] tracking-[-0.03em] sm:text-5xl">{opportunity.name}</h1>
          <p className="mb-0 mt-sb-3 max-w-3xl text-base leading-relaxed text-sb-text-secondary">{opportunity.oneLiner}</p>
        </div>
        <GlassPanel className="fv-decision-stamp grid w-full min-w-64 max-w-sm gap-sb-3 p-sb-5" aria-label="Decision outcome">
          <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{decision.scoreContract?.name ?? "ShouldBuild Readiness Score"}</span>
          <div className="flex items-end justify-between gap-sb-4">
            <ScoreDisplay score={opportunity.scorecard.total} size="xl" showMax animationKey={`full-validation-${motionReportId}`}/>
            <VerdictBadge verdict={resolvedVerdict}/>
          </div>
        </GlassPanel>
        <p className="col-span-full m-0 max-w-4xl text-lg leading-relaxed text-sb-text-primary">{firstSentence(report.executiveSummary)}</p>
        {previewMode && <CaseColumns className="fv-case-split col-span-full" report={report} decision={decision} prosecution={prosecutionEvidence} defence={defenceEvidence} animateEntrance={animateReportEntrance} limit={1}/>}
      </header>

      <section className="fv-section grid gap-sb-5" aria-labelledby="factor-grid-title">
        <SectionHeading eyebrow="01 · Factor evidence" title="Twelve factors, in comparable rows" description="Open any factor to inspect its linked sources, independence grouping, and freshness date." id="factor-grid-title"/>
        <FactorEvidenceList report={{ ...report, opportunity }} factors={factorAnalysis} motionKey={motionReportId} animateEntrance={animateReportEntrance}/>
        <ReportCharts report={{ ...report, opportunity }} datasets={chartDatasets}/>
      </section>

      <section className="fv-section grid gap-sb-5" aria-labelledby="adversarial-title">
        <SectionHeading eyebrow="02 · Adversarial case" title="Prosecution vs. Defence" description="Both sides are drawn from accepted, factor-linked findings in this immutable report." id="adversarial-title"/>
        <CaseColumns className="fv-case-split" report={report} decision={decision} prosecution={prosecutionEvidence} defence={defenceEvidence} animateEntrance={animateReportEntrance}/>
      </section>

      <section className="fv-section" aria-labelledby="movement-title">
        <GlassPanel className="relative isolate grid gap-sb-5 border-l-4 border-l-sb-accent p-sb-6 sm:p-sb-8">
          <BorderBeam persistent thickness={2}/>
          <SectionHeading
            eyebrow="03 · Decision movement"
            title={`What moves this from ${currentScore}${targetScore != null ? ` to ${targetScore}` : " to the next decision boundary"}`}
            description={decision.scoreChange?.answer ?? report.verdictChangeConditions?.upgradeCondition ?? "No score-change condition was persisted for this report."}
            id="movement-title"
          />
          <div className="grid gap-sb-4 md:grid-cols-3">
            <MovementPoint label="Moves up" value={decision.scoreChange?.materialUpwardEvidence ?? verdict?.upgradeCondition ?? report.verdictChangeConditions?.upgradeCondition}/>
            <MovementPoint label="Moves down" value={decision.scoreChange?.materialDownwardEvidence ?? verdict?.downgradeCondition ?? report.verdictChangeConditions?.downgradeCondition}/>
            <MovementPoint label="Stop condition" value={decision.scoreChange?.strongestKillCondition ?? verdict?.killCondition}/>
          </div>
        </GlassPanel>
      </section>

      <section className="fv-section grid gap-sb-5" aria-labelledby="validation-plan-title">
        <SectionHeading
          eyebrow="04 · Validation plan"
          title={plan?.highestValueHypothesis ?? "Next validation actions"}
          description={plan ? `${plan.testMethod} Target ${plan.targetBuyer} through ${plan.recruitmentChannel}.` : `Use the persisted launch plan to test the next decision before expanding scope.`}
          id="validation-plan-title"
        />
        <div className="grid gap-sb-3">
          {planItems.map((item) => (
            <Card className="grid grid-cols-[auto_1fr] gap-sb-4 p-sb-5" key={`${item.days}-${item.priority}`}>
              <Circle className="mt-0.5 text-sb-text-tertiary" size={18} aria-hidden="true"/>
              <div>
                <span className="font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">Days {item.days} · priority {item.priority}</span>
                <p className="mb-0 mt-sb-1 text-sm leading-relaxed text-sb-text-primary">{item.action}</p>
              </div>
            </Card>
          ))}
        </div>
        {plan && (
          <Card className="grid gap-sb-4 p-sb-5 text-sm text-sb-text-secondary sm:grid-cols-3">
            <PlanThreshold label="Success threshold" value={plan.successThreshold}/>
            <PlanThreshold label="Failure threshold" value={plan.failureThreshold}/>
            <PlanThreshold label="Decision unlocked" value={plan.decisionUnlocked}/>
          </Card>
        )}
      </section>

      {!publicMode && runId ? (
        <LivingReportControls runId={runId} currentAsOf={report.currentAsOf} staleEvidenceWarning={report.staleEvidenceWarning}/>
      ) : (
        <Card className="fv-section grid gap-sb-1 p-sb-4 text-xs text-sb-text-tertiary" role="status">
          <span>Living report</span>
          <span>Sample freshness is frozen at {report.currentAsOf ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(report.currentAsOf)) : reportDate}.</span>
        </Card>
      )}

      {!previewMode && (
        <footer className="fv-export flex flex-col gap-sb-4 border-t border-sb-border-hairline pt-sb-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 max-w-2xl text-xs leading-relaxed text-sb-text-tertiary">Exports are generated from immutable report version {report.version}; they do not recalculate the score or evidence tiers.</p>
          <div className="flex flex-wrap gap-sb-2">
            {(["pdf", "md", "json", "csv"] as const).map((format) => <Button variant="ghost" className="min-h-9 px-sb-3 text-xs" key={format} onClick={() => void exportFile(format)}>{format.toUpperCase()}</Button>)}
          </div>
        </footer>
      )}
    </main>
  );
}

function SectionHeading({ eyebrow, title, description, id }: { eyebrow: string; title: string; description: string; id: string }) {
  return (
    <header>
      <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{eyebrow}</p>
      <h2 id={id} className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em]">{title}</h2>
      <p className="mb-0 mt-sb-2 max-w-3xl text-sm leading-relaxed text-sb-text-secondary">{description}</p>
    </header>
  );
}

function CaseColumns({
  report,
  decision,
  prosecution,
  defence,
  className = "",
  animateEntrance,
  limit = 4,
}: {
  report: ValidationReport;
  decision: Decision;
  prosecution: Evidence[];
  defence: Evidence[];
  className?: string;
  animateEntrance: boolean;
  limit?: number;
}) {
  return (
    <div className={`${className} grid gap-sb-4 md:grid-cols-2`}>
      <CaseColumn title="Prosecution" description="The strongest persisted case for proceeding." background="bg-sb-prosecution-bg" report={report} decision={decision} evidence={prosecution.slice(0, limit)} animateEntrance={animateEntrance}/>
      <CaseColumn title="Defence" description="The strongest persisted case against committing yet." background="bg-sb-defence-bg" report={report} decision={decision} evidence={defence.slice(0, limit)} animateEntrance={animateEntrance}/>
    </div>
  );
}

function CaseColumn({ title, description, background, report, decision, evidence, animateEntrance }: { title: string; description: string; background: string; report: ValidationReport; decision: Decision; evidence: Evidence[]; animateEntrance: boolean }) {
  const tiered = evidence.flatMap((item) => {
    const metadata = evidenceMetadata(report, decision, item);
    return metadata ? [{ item, metadata }] : [];
  });
  return (
    <Card className={`grid content-start gap-sb-5 p-sb-6 sm:p-sb-8 ${background}`}>
      <header>
        <h3 className="m-0 font-sb-display text-2xl font-[480]">{title}</h3>
        <p className="mb-0 mt-sb-2 text-sm text-sb-text-tertiary">{description}</p>
      </header>
      {tiered.length ? (
        <StaggerGroup
          animateEntrance={animateEntrance}
          className="grid gap-sb-5"
          durationMs={200}
          itemClassName="border-t border-sb-border-hairline pt-sb-5 first:border-t-0 first:pt-0"
          maxItems={4}
          stepMs={55}
        >
          {tiered.map(({ item, metadata }, index) => (
            <article className="grid gap-sb-3" key={item.id}>
              <EvidenceBadge {...metadata} animateSettle={animateEntrance} settleDelayMs={index * 30}/>
              <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{item.atomicClaim ?? item.snippet}</p>
              {item.url && <a className="inline-flex w-fit items-center gap-sb-1 text-xs text-sb-text-tertiary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={item.url} target="_blank" rel="noreferrer">{item.canonicalDomain ?? item.source}<ExternalLink size={11}/></a>}
            </article>
          ))}
        </StaggerGroup>
      ) : (
        <EmptyState message="No factor-linked claim with a persisted evidence tier is available on this side. Review the factor rows for the next evidence gap."/>
      )}
    </Card>
  );
}

function MovementPoint({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-t border-sb-border-hairline pt-sb-3">
      <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{label}</span>
      <p className="mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary">{value || "No condition was persisted."}</p>
    </div>
  );
}

function PlanThreshold({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{label}</span><p className="mb-0 mt-sb-2 leading-relaxed">{value}</p></div>;
}
