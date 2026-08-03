import { BorderBeam } from "@/components/ui/border-beam";
import { DataResolve } from "@/components/ui/data-resolve";
import { ScoreDisplay } from "@/components/ui/score-display";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  resolveKey: string;
  score?: boolean;
  featured?: boolean;
  className?: string;
};

export function StatCard({
  label,
  value,
  detail,
  resolveKey,
  score = false,
  featured = false,
  className,
}: StatCardProps) {
  const numericValue = Number(value);
  const canResolve = Number.isFinite(numericValue);

  return (
    <SpotlightCard className={cn("group min-w-0", className)}>
      <BorderBeam />
      <div className={cn(
        "grid h-full content-between gap-sb-5",
        featured ? "p-sb-6 sm:p-sb-8" : "p-sb-5",
      )}>
        <div className="grid gap-sb-2">
          <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{label}</span>
          <small className="text-xs leading-relaxed text-sb-text-secondary">{detail}</small>
        </div>
        {canResolve ? (
          <DataResolve resolveKey={resolveKey} isResolved durationMs={220}>
            {score
              ? <ScoreDisplay score={numericValue} size={featured ? "lg" : "sm"} animate={false}/>
              : <b className={cn(
                "font-sb-mono font-semibold tabular-nums text-sb-text-primary",
                featured ? "text-5xl" : "text-3xl",
              )}>{value}</b>}
          </DataResolve>
        ) : (
          <b className={cn(
            "font-sb-mono font-semibold tabular-nums text-sb-text-primary",
            featured ? "text-5xl" : "text-3xl",
          )}>{value}</b>
        )}
      </div>
    </SpotlightCard>
  );
}
