"use client";

import type { OpportunityScorecard, ScoringWeights } from "@/lib/types";
import { defaultWeights, scoringCriteria, weightPresets } from "@/lib/scoring";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataResolve } from "@/components/ui/data-resolve";
import {
  Fulcrum,
  type FulcrumEvidenceChip,
} from "@/components/ui/fulcrum";
import { ScoreDisplay } from "@/components/ui/score-display";
import { VerdictBadge } from "@/components/ui/verdict-badge";

type Props = {
  weights: ScoringWeights;
  onChange: (weights: ScoringWeights) => void;
  defaultValue?: ScoringWeights;
  previewScore: number;
  previewResolveKey: string;
  baselineScore: number;
  previewVerdict: OpportunityScorecard["verdict"];
};

export function WeightEditor({
  weights,
  onChange,
  defaultValue = defaultWeights,
  previewScore,
  previewResolveKey,
  baselineScore,
  previewVerdict,
}: Props) {
  const delta = previewScore - baselineScore;
  const weightTotal = Object.values(weights).reduce((total, weight) => total + weight, 0);
  // scoringCriteria owns factor polarity; this view only renders the current
  // weight values and does not reproduce normalized contribution math.
  const fulcrumEntries: FulcrumEvidenceChip[] = scoringCriteria.map(
    (criterion) => ({
      id: `workbench-${criterion.key}`,
      label: criterion.label,
      side: criterion.risk ? "prosecution" : "defence",
      weight: weights[criterion.key],
      statusLabel: criterion.risk ? "risk" : "positive",
    }),
  );

  function update(key: keyof ScoringWeights, value: number) {
    onChange({ ...weights, [key]: value });
  }

  return (
    <Card className="overflow-hidden xl:sticky xl:top-sb-4">
      <section className="grid gap-sb-3 border-b border-sb-border-hairline bg-sb-bg-surface-2 p-sb-4" aria-label="Live score preview" aria-live="polite">
        <div className="flex items-start justify-between gap-sb-4">
          <div>
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Local preview</p>
            <div className="mt-sb-2 flex flex-wrap items-end gap-sb-3">
              <DataResolve
                key={previewResolveKey}
                resolveKey={previewResolveKey}
                isResolved
                durationMs={150}
              >
                <ScoreDisplay score={previewScore} size="lg" showMax animate={false}/>
              </DataResolve>
              <VerdictBadge verdict={previewVerdict}/>
            </div>
          </div>
          <span className={`font-sb-mono text-xs tabular-nums ${delta === 0 ? "text-sb-text-tertiary" : "text-sb-text-secondary"}`}>
            {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-sb-pill bg-sb-bg-surface-3" aria-hidden="true">
          <div className="h-full bg-sb-text-secondary" style={{ width: `${Math.max(0, Math.min(100, previewScore))}%` }}/>
        </div>
        <p className="m-0 text-xs leading-relaxed text-sb-text-tertiary">Updates as each slider moves. The saved report and its evidence tiers are not modified.</p>
      </section>

      <section className="grid gap-sb-4 p-sb-4" aria-labelledby="weight-editor-title">
        <header className="flex items-start justify-between gap-sb-4">
          <div>
            <h2 id="weight-editor-title" className="m-0 text-sm font-medium">Factor weights</h2>
            <p className="mb-0 mt-sb-1 text-xs leading-relaxed text-sb-text-tertiary">The scoring engine normalizes these inputs when calculating the preview.</p>
          </div>
          <Button variant="ghost" className="min-h-8 px-sb-2 text-xs" onClick={() => onChange(defaultValue)}>Reset</Button>
        </header>

        <div className="flex flex-wrap gap-sb-1" aria-label="Weight presets">
          {Object.entries(weightPresets).map(([name, preset]) => (
            <Button variant="ghost" className="min-h-8 px-sb-2 text-xs" key={name} onClick={() => onChange(preset)}>{name}</Button>
          ))}
        </div>

        <div className="grid items-start gap-sb-4 md:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="grid gap-sb-3">
            {scoringCriteria.map((criterion) => {
            const inputId = `weight-${criterion.key}`;
            return (
              <label className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-sb-3 gap-y-sb-1 border-t border-sb-border-hairline pt-sb-3 first:border-t-0 first:pt-0" htmlFor={inputId} key={criterion.key}>
                <span className="min-w-0">
                  <b className="block truncate text-xs font-medium text-sb-text-primary">{criterion.label}</b>
                  <small className="block text-xs text-sb-text-tertiary">{criterion.risk ? "Risk factor · inverted" : "Positive factor"}</small>
                </span>
                <output className="text-right font-sb-mono text-xs tabular-nums text-sb-text-secondary" htmlFor={inputId}>{Math.round(weights[criterion.key])}%</output>
                <input
                  id={inputId}
                  className="col-span-2 h-4 w-full cursor-pointer accent-sb-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
                  type="range"
                  min="0"
                  max="25"
                  step="1"
                  value={Math.round(weights[criterion.key])}
                  onChange={(event) => update(criterion.key, Number(event.target.value))}
                  aria-label={`${criterion.label} weight`}
                />
              </label>
            );
            })}
          </div>

          <aside className="grid content-start gap-sb-2 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-3" aria-label="Live scoring balance">
            <div>
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Live case balance</p>
              <p className="mb-0 mt-sb-1 text-xs leading-relaxed text-sb-text-secondary">Compares current weight allocated to risk and positive factors. Chips show the heaviest weights.</p>
            </div>
            <Fulcrum
              motionMode="readout"
              entries={fulcrumEntries}
              animate
              tallyLabel="Risk : positive"
              maxVisibleEntriesPerSide={2}
              className="w-full"
            />
          </aside>
        </div>

        <footer className="flex items-center justify-between border-t border-sb-border-hairline pt-sb-3 text-xs text-sb-text-tertiary">
          <span>Input total</span>
          <span className="font-sb-mono tabular-nums">{weightTotal.toFixed(0)}%</span>
        </footer>
      </section>
    </Card>
  );
}
