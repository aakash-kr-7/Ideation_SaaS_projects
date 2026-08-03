import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ResearchRun } from "@/lib/types";
import { getReportModeConfig } from "@/lib/report-modes";
import { countEvidenceSources } from "@/lib/report-mode-ui";
import { Card } from "@/components/ui/card";
import { DataResolve } from "@/components/ui/data-resolve";
import { ScoreDisplay } from "@/components/ui/score-display";
import { VerdictBadge } from "@/components/ui/verdict-badge";

export function ProjectCard({ run, rank }: { run: ResearchRun; rank?: number }) {
  const opportunity = run.opportunity;
  const mode = getReportModeConfig(run.mode);
  const href = run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
  const sourceCount = opportunity ? countEvidenceSources(opportunity.evidence) : 0;

  return (
    <Card className="group grid gap-sb-3 rounded-sb-md p-sb-4 transition-colors duration-sb-fast ease-sb-standard hover:border-sb-border-hairline-strong hover:bg-sb-bg-surface-2 md:grid-cols-[2rem_auto_minmax(0,1fr)_auto_auto] md:items-center">
      <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{rank ? String(rank).padStart(2, "0") : "—"}</span>

      {opportunity
        ? <VerdictBadge verdict={opportunity.verdict}/>
        : <span className="w-fit rounded-sb-pill border border-dashed border-sb-border-hairline-strong px-sb-3 py-sb-1 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">{run.status}</span>}

      <div className="min-w-0">
        <Link className="rounded-sb-sm text-sm font-medium text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={href}>{run.ideaName}</Link>
        <p className="mb-0 mt-sb-1 truncate text-xs text-sb-text-secondary">{run.ideaDescription}</p>
        <p className="mb-0 mt-sb-1 text-xs text-sb-text-tertiary">
          {mode.label} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(run.createdAt))}
          {opportunity ? ` · ${sourceCount} cited source${sourceCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <div className="md:text-right">
        {opportunity ? (
          <DataResolve
            resolveKey={`dashboard:project:${run.id}:score`}
            isResolved
            durationMs={220}
          >
            <ScoreDisplay score={opportunity.score.total} size="sm" animate={false}/>
          </DataResolve>
        ) : <span className="font-sb-mono text-sm text-sb-text-tertiary">—</span>}
      </div>

      <Link className="inline-flex w-fit items-center gap-sb-1 rounded-sb-sm text-xs text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={href}>
        {run.status === "Completed" ? "Open report" : "View progress"}<ArrowRight size={12}/>
      </Link>
    </Card>
  );
}
