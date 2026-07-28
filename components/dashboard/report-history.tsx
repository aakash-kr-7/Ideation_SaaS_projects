"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, Globe2 } from "lucide-react";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";
import { filterReportHistory, type HistoryFilter } from "@/lib/report-mode-ui";

type HistoryRun = {
  id: string; ideaName: string; mode: ReportMode; status: string; createdAt: string;
  score?: number; verdict?: string; confidence?: number; sourceCount: number; independentDomains: number;
  durationMs?: number | null; completedAt?: string | null; degraded?: boolean; publicReason?: string | null; creditRestored?: boolean;
};
const filters: Array<[HistoryFilter, string]> = [["all", "All"], ["quick", "Quick Scan"], ["full", "Full Validation"], ["completed", "Completed"], ["failed", "Failed"], ["progress", "In progress"]];

function humanizeStatus(status: string) {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function formatDate(isoString: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(isoString));
}

export function ReportHistory({ runs }: { runs: HistoryRun[] }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const visible = filterReportHistory(runs, filter);
  return <>
    <div className="report-history-filters" role="group" aria-label="Filter report history">
      {filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <div className="report-history-list" aria-live="polite">
      {visible.map((run) => {
        const config = getReportModeConfig(run.mode);
        const href = run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
        return <Link className="saved-row report-history-row" href={href} key={run.id}>
          <span className={`report-mode-badge ${run.mode}`}>{config.label}</span>
          <div className="report-history-copy">
            <b>{run.ideaName}</b>
            <small>{humanizeStatus(run.status)}{run.completedAt ? ` · completed ${formatDate(run.completedAt)}` : ` · started ${formatDate(run.createdAt)}`}</small>
            <span>
              <i><Globe2 size={11}/>{run.sourceCount} accepted sources · {run.independentDomains} independent domains</i>
              {run.durationMs != null && <i><Clock3 size={11}/>{formatDuration(run.durationMs)}</i>}
              {run.degraded && <i className="history-degraded"><AlertTriangle size={11}/>Limited source access</i>}
              {run.publicReason && <i>{run.publicReason}{run.creditRestored ? " · credit restored" : ""}</i>}
            </span>
          </div>
          <div className="report-history-result">{run.score != null && <b>{run.score}</b>}{run.verdict && <small>{run.verdict}</small>}{run.confidence != null && <small>{run.confidence}% confidence</small>}</div>
          <ArrowRight size={14}/>
        </Link>;
      })}
      {visible.length === 0 && <div className="saved-empty"><p>No reports match this filter.</p></div>}
    </div>
  </>;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
