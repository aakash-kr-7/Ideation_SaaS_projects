"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";
import { filterReportHistory, type HistoryFilter } from "@/lib/report-mode-ui";

type HistoryRun = {
  id: string; ideaName: string; mode: ReportMode; status: string; createdAt: string;
  score?: number; verdict?: string; sourceCount: number;
};
const filters: Array<[HistoryFilter, string]> = [["all", "All"], ["quick", "Quick Scan"], ["full", "Full Validation"], ["completed", "Completed"], ["failed", "Failed"], ["progress", "In progress"]];

export function ReportHistory({ runs }: { runs: HistoryRun[] }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const visible = filterReportHistory(runs, filter);
  return <>
    <div className="report-history-filters" role="group" aria-label="Filter report history">
      {filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    <div className="report-history-list" aria-live="polite">
      {visible.map(run => {
        const config = getReportModeConfig(run.mode);
        const href = run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
        return <Link className="saved-row report-history-row" href={href} key={run.id}>
          <span className={`report-mode-badge ${run.mode}`}>{config.label}</span>
          <div><b>{run.ideaName}</b><small>{run.createdAt} · {run.status}{run.status === "Completed" ? ` · ${run.sourceCount} sources` : ""}</small></div>
          <div className="report-history-result">{run.score != null && <b>{run.score}</b>}{run.verdict && <small>{run.verdict}</small>}</div>
          <ArrowRight size={14}/>
        </Link>;
      })}
      {visible.length === 0 && <div className="saved-empty"><p>No reports match this filter.</p></div>}
    </div>
  </>;
}
