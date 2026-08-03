"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EvidenceItem, OpportunityScorecard, ScoringWeights } from "@/lib/types";
import { recalculateScorecard } from "@/lib/recalculate-scorecard";
import { EmptyState } from "@/components/ui/state-message";
import { WeightEditor } from "./WeightEditor";
import { ScoreBreakdown } from "./ScoreBreakdown";

export type ScoringWorkbenchReport = {
  id: string;
  name: string;
  scorecard: OpportunityScorecard;
  evidence: EvidenceItem[];
};

export function ScoringWorkbench({ reports }: { reports: ScoringWorkbenchReport[] }) {
  const [reportId, setReportId] = useState(reports[0]?.id ?? "");
  const [weightsByReport, setWeightsByReport] = useState<Record<string, ScoringWeights>>({});
  const report = reports.find((item) => item.id === reportId) ?? reports[0];
  const weights = report ? weightsByReport[report.id] ?? report.scorecard.weights : undefined;
  const scorecard = useMemo(
    () => report && weights ? recalculateScorecard(report.scorecard, weights) : null,
    [report, weights],
  );

  if (!report || !weights || !scorecard) {
    return (
      <main className="mx-auto max-w-3xl py-sb-10">
        <EmptyState
          message="No completed scorecards are available. Run a validation to open its factors in the scoring workbench."
          action={
            <Link className="inline-flex min-h-10 items-center rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/research/new?mode=quick_scan">
              Run a Quick Scan
            </Link>
          }
        />
      </main>
    );
  }

  function setWeights(next: ScoringWeights) {
    setWeightsByReport((previous) => ({ ...previous, [report.id]: next }));
  }

  return (
    <main className="mx-auto grid w-full max-w-screen-2xl gap-sb-5">
      <header className="flex flex-col gap-sb-4 border-b border-sb-border-hairline pb-sb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Scoring model</p>
          <h1 className="mb-0 mt-sb-1 font-sb-display text-2xl font-[480] tracking-[-0.02em]">Inspect what carries the verdict</h1>
          <p className="mb-0 mt-sb-1 text-sm leading-relaxed text-sb-text-secondary">Adjust factor weights locally and audit the persisted evidence behind each score. The immutable report remains unchanged.</p>
        </div>

        <label className="grid min-w-64 gap-sb-1 text-xs text-sb-text-secondary" htmlFor="scorecard-report">
          <span>Decision file</span>
          <select
            id="scorecard-report"
            value={report.id}
            onChange={(event) => setReportId(event.target.value)}
            className="min-h-10 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 px-sb-3 py-sb-2 text-sm text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard focus:border-sb-border-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
          >
            {reports.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
      </header>

      <div className="grid items-start gap-sb-4 xl:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
        <WeightEditor
          weights={weights}
          defaultValue={report.scorecard.weights}
          previewScore={scorecard.total}
          previewResolveKey={`workbench:${report.id}:preview-score:${scorecard.total}`}
          baselineScore={report.scorecard.total}
          previewVerdict={scorecard.verdict}
          onChange={setWeights}
        />
        <ScoreBreakdown
          scorecard={scorecard}
          evidence={report.evidence}
          previousScore={report.scorecard.total}
        />
      </div>
    </main>
  );
}
