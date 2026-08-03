import { getScoreGuidance, scoreGuidance } from "@/lib/scoring";
import { Card } from "@/components/ui/card";
import { ScoreDisplay } from "@/components/ui/score-display";
import { VerdictBadge } from "@/components/ui/verdict-badge";

export function ScoreGuide({ score, compact = false }: { score: number; compact?: boolean }) {
  const current = getScoreGuidance(score);

  if (compact) {
    return (
      <aside className="flex flex-col gap-sb-3 sm:flex-row sm:items-center" aria-label="Score interpretation">
        <div className="flex shrink-0 items-center gap-sb-3">
          <span className="font-sb-mono text-sm tabular-nums text-sb-text-tertiary">{current.min}–{current.max}</span>
          <VerdictBadge verdict={current.verdict}/>
        </div>
        <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{current.meaning} {current.action}</p>
      </aside>
    );
  }

  return (
    <Card className="grid gap-sb-5 p-sb-5" aria-label="How the ShouldBuild Readiness Score works">
      <header className="flex flex-col gap-sb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">ShouldBuild Readiness Score</p>
          <h2 className="mb-0 mt-sb-1 font-sb-display text-xl font-[480]">What this score means</h2>
        </div>
        <div className="flex items-end gap-sb-3">
          <ScoreDisplay score={score} size="md" showMax animate={false}/>
          <VerdictBadge verdict={current.verdict}/>
        </div>
      </header>

      <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{current.meaning} {current.action}</p>

      <div className="grid gap-sb-2">
        {scoreGuidance.map((band) => {
          const active = band.verdict === current.verdict;
          return (
            <article
              className={`grid gap-sb-2 rounded-sb-md border p-sb-3 sm:grid-cols-[4rem_auto_1fr] sm:items-center ${active ? "border-sb-border-hairline-strong bg-sb-bg-surface-2" : "border-sb-border-hairline bg-sb-bg-surface-1"}`}
              aria-current={active ? "true" : undefined}
              key={band.verdict}
            >
              <span className="font-sb-mono text-sm tabular-nums text-sb-text-tertiary">{band.min}–{band.max}</span>
              <VerdictBadge verdict={band.verdict}/>
              <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{band.meaning}</p>
            </article>
          );
        })}
      </div>

      <footer className="border-t border-sb-border-hairline pt-sb-3 text-sm leading-relaxed text-sb-text-tertiary">
        This score measures evidence-based decision readiness. It is not a probability of success, a revenue forecast, or a guarantee.
      </footer>
    </Card>
  );
}
