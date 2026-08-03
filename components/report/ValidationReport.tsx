"use client";

import { useRouter } from "next/navigation";
import type { ValidationReport as ReportPayload } from "@/lib/report-schema";
import type { EvidenceItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EvidenceBadge, type EvidenceTier } from "@/components/ui/evidence-badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { useFirstSessionMotion } from "@/components/ui/session-stagger";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { FullValidationReportExperience } from "@/components/report/FullValidationReportExperience";
import type { ReportChartDataset } from "@/components/report/ReportCharts";

export type ValidationReportProps = {
  report: ReportPayload;
  scorecard?: ReportPayload["opportunity"]["scorecard"];
  publicMode?: boolean;
  previewMode?: boolean;
  runId?: string;
  chartDatasets?: ReportChartDataset[];
};

export function ValidationReport(props: ValidationReportProps) {
  if (props.report.reportMode === "full_validation" && props.report.fullValidationDecision) {
    return <FullValidationReportExperience {...props}/>;
  }

  return <QuickScanReport {...props}/>;
}

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

function evidenceMetadata(report: ReportPayload, evidence: EvidenceItem | undefined) {
  if (!evidence) return null;
  const factorEvidence = report.opportunity.scorecard.factorEvidence;
  const factorEntries = Object.entries(factorEvidence ?? {});
  const factorKey = evidence.associatedFactorIds?.find((key) => factorEvidence?.[key as keyof typeof factorEvidence]);
  const linkedFactor = factorKey
    ? factorEvidence?.[factorKey as keyof typeof factorEvidence]
    : factorEntries.find(([, factor]) => factor?.supportingEvidenceIds.includes(evidence.id) || factor?.challengingEvidenceIds.includes(evidence.id))?.[1];
  const tier = tierFromState(linkedFactor?.evidenceState);
  if (!tier) return null;

  return {
    tier,
    whatWasFound: evidence.atomicClaim ?? evidence.snippet,
    sourceCount: evidence.independentSourceCount ?? (evidence.url ? 1 : 0),
    independenceGrouping: evidence.independenceKey ?? evidence.canonicalDomain ?? "Independence group not persisted",
    freshnessDate: evidence.publishedOrUpdatedAt ?? evidence.date ?? evidence.retrievedAt ?? "Source date not persisted",
  };
}

function QuickScanReport({ report, scorecard, publicMode = false, runId }: ValidationReportProps) {
  const router = useRouter();
  const motionReportId = runId ?? report.id;
  const animateReportEntrance = useFirstSessionMotion(`report:${motionReportId}:v1`);
  const opportunity = { ...report.opportunity, scorecard: scorecard ?? report.opportunity.scorecard };
  const evidence = opportunity.evidence.filter((item) => !item.excluded);
  const strongestFor = evidence.find((item) => item.id === report.strongestPositiveEvidenceId)
    ?? evidence.find((item) => item.evidenceRole === "supporting" && !item.disconfirming)
    ?? evidence.find((item) => !item.disconfirming);
  const strongestAgainst = evidence.find((item) => item.id === report.strongestNegativeEvidenceId)
    ?? evidence.find((item) => item.evidenceRole === "challenging" || item.disconfirming)
    ?? evidence.find((item) => item.signal === "Risk");
  const forMetadata = evidenceMetadata(report, strongestFor);
  const againstMetadata = evidenceMetadata(report, strongestAgainst);
  const nextHref = publicMode
    ? "/sign-in"
    : `/research/new?mode=full_validation&upgradeFrom=${runId ?? report.id}`;

  return (
    <main className="validation-report mx-auto grid w-full max-w-4xl gap-sb-8 py-sb-6 sm:py-sb-10">
      <header className="grid gap-sb-3">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
          Quick Scan · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(report.generatedAt))}
        </p>
        <h1 className="m-0 font-sb-display text-3xl font-[480] tracking-[-0.02em] sm:text-4xl">{opportunity.name}</h1>
      </header>

      <Card className="grid gap-sb-6 p-sb-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-sb-8">
        <ScoreDisplay score={opportunity.scorecard.total} size="xl" showMax animationKey={`quick-scan-${motionReportId}`}/>
        <div className="grid gap-sb-3">
          <VerdictBadge verdict={opportunity.scorecard.verdict}/>
          <p className="m-0 text-base leading-relaxed text-sb-text-secondary">
            {firstSentence(report.executiveSummary)}
          </p>
        </div>
      </Card>

      <div className="grid gap-sb-4 md:grid-cols-2">
        <EvidencePoint
          label="Strongest for"
          evidence={strongestFor}
          metadata={forMetadata}
          animateSettle={animateReportEntrance}
          background="bg-sb-prosecution-bg"
          empty="No accepted supporting evidence was persisted."
        />
        <EvidencePoint
          label="Strongest against"
          evidence={strongestAgainst}
          metadata={againstMetadata}
          animateSettle={animateReportEntrance}
          background="bg-sb-defence-bg"
          empty="No accepted challenging evidence was persisted."
        />
      </div>

      <Card className="flex flex-col gap-sb-5 p-sb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="m-0 font-sb-display text-xl font-[480]">Need a decision dossier?</h2>
          <p className="mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary">
            Full Validation adds the evidence trail, adversarial case, twelve factors, and a validation plan.
          </p>
        </div>
        <Button onClick={() => router.push(nextHref)} className="shrink-0">
          {publicMode ? "Run your Quick Scan" : "Upgrade to Full Validation"}
        </Button>
      </Card>
    </main>
  );
}

function EvidencePoint({
  label,
  evidence,
  metadata,
  animateSettle,
  background,
  empty,
}: {
  label: string;
  evidence: EvidenceItem | undefined;
  metadata: ReturnType<typeof evidenceMetadata>;
  animateSettle: boolean;
  background: string;
  empty: string;
}) {
  return (
    <Card className={`grid content-start gap-sb-4 p-sb-6 ${background}`}>
      <div className="flex flex-wrap items-center justify-between gap-sb-3">
        <h2 className="m-0 font-sb-display text-lg font-[480]">{label}</h2>
        {metadata
          ? <EvidenceBadge {...metadata} animateSettle={animateSettle}/>
          : <span className="rounded-sb-pill border border-dotted border-sb-border-hairline-strong px-sb-3 py-sb-1 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">Tier not persisted</span>}
      </div>
      <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{evidence?.snippet ?? empty}</p>
      {evidence?.url && (
        <a
          className="w-fit text-xs text-sb-text-tertiary underline decoration-sb-border-hairline-strong underline-offset-4 hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
          href={evidence.url}
          target="_blank"
          rel="noreferrer"
        >
          {evidence.canonicalDomain ?? evidence.source}
        </a>
      )}
    </Card>
  );
}
