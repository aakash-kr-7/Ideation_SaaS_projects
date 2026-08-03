import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { DataResolve } from "@/components/ui/data-resolve";
import { ScoreDisplay } from "@/components/ui/score-display";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { countEvidenceSources } from "@/lib/report-mode-ui";
import { getReportModeConfig } from "@/lib/report-modes";
import type { ResearchRun } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProjectCardProps = {
  run: ResearchRun;
  rank?: number;
  featured?: boolean;
  className?: string;
};

export function ProjectCard({ run, rank, featured = false, className }: ProjectCardProps) {
  const opportunity = run.opportunity;
  const mode = getReportModeConfig(run.mode);
  const href = run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
  const sourceCount = opportunity ? countEvidenceSources(opportunity.evidence) : 0;

  return (
    <SpotlightCard className={cn(
      "group min-w-0 transition-colors duration-sb-fast ease-sb-standard hover:border-sb-border-hairline-strong",
      className,
    )}>
      <BorderBeam />
      <div className={cn(
        "grid h-full content-between gap-sb-6",
        featured ? "p-sb-6 sm:p-sb-8" : "p-sb-5",
      )}>
        <div className="grid gap-sb-5">
          <div className="flex items-start justify-between gap-sb-4">
            <div className="flex flex-wrap items-center gap-sb-2">
              <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">
                {rank ? String(rank).padStart(2, "0") : "—"}
              </span>
              {opportunity
                ? <VerdictBadge verdict={opportunity.verdict}/>
                : <span className="w-fit rounded-sb-pill border border-dashed border-sb-border-hairline-strong px-sb-3 py-sb-1 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">{run.status}</span>}
            </div>
            {opportunity ? (
              <DataResolve
                resolveKey={`dashboard:project:${run.id}:score`}
                isResolved
                durationMs={220}
              >
                <ScoreDisplay score={opportunity.score.total} size={featured ? "lg" : "sm"} animate={false}/>
              </DataResolve>
            ) : <span className="font-sb-mono text-sm text-sb-text-tertiary">—</span>}
          </div>

          <div className="min-w-0">
            <Link
              className={cn(
                "rounded-sb-sm font-sb-display font-[480] tracking-[-0.01em] text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus",
                featured ? "text-2xl sm:text-3xl" : "text-lg",
              )}
              href={href}
            >
              {run.ideaName}
            </Link>
            <p className={cn(
              "mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary",
              featured ? "line-clamp-3 max-w-2xl" : "line-clamp-2",
            )}>{run.ideaDescription}</p>
          </div>
        </div>

        <div className="flex flex-col gap-sb-3 border-t border-sb-border-hairline pt-sb-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="m-0 text-xs leading-relaxed text-sb-text-tertiary">
            {mode.label} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(run.createdAt))}
            {opportunity ? ` · ${sourceCount} cited source${sourceCount === 1 ? "" : "s"}` : ""}
          </p>
          <Link className="inline-flex w-fit shrink-0 items-center gap-sb-1 rounded-sb-sm text-xs text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={href}>
            {run.status === "Completed" ? "Open report" : "View progress"}<ArrowRight size={12}/>
          </Link>
        </div>
      </div>
    </SpotlightCard>
  );
}
