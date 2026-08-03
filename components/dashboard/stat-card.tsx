import { Card } from "@/components/ui/card";
import { DataResolve } from "@/components/ui/data-resolve";
import { ScoreDisplay } from "@/components/ui/score-display";

export function StatCard({ label, value, detail, resolveKey, score = false }: { label: string; value: string; detail: string; resolveKey: string; score?: boolean }) {
  const numericValue = Number(value);
  const canResolve = Number.isFinite(numericValue);
  return (
    <Card className="grid gap-sb-2 p-sb-4">
      <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{label}</span>
      {canResolve ? (
        <DataResolve resolveKey={resolveKey} isResolved durationMs={220}>
          {score
            ? <ScoreDisplay score={numericValue} size="sm" animate={false}/>
            : <b className="text-xl font-semibold text-sb-text-primary">{value}</b>}
        </DataResolve>
      ) : (
        <b className="font-sb-mono text-xl font-semibold tabular-nums text-sb-text-primary">{value}</b>
      )}
      <small className="text-xs leading-relaxed text-sb-text-secondary">{detail}</small>
    </Card>
  );
}
