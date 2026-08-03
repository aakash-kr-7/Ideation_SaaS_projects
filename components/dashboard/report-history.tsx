"use client";

import { useState } from "react";
import Link from "next/link";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";
import { filterReportHistory, type HistoryFilter } from "@/lib/report-mode-ui";
import { Button } from "@/components/ui/button";
import { ScoreDisplay } from "@/components/ui/score-display";
import { VerdictBadge } from "@/components/ui/verdict-badge";

type HistoryRun = {
  id: string;
  ideaName: string;
  mode: ReportMode;
  status: string;
  createdAt: string;
  score?: number;
  verdict?: string;
  sourceCount: number;
  independentDomains: number;
  durationMs?: number | null;
  completedAt?: string | null;
  degraded?: boolean;
  publicReason?: string | null;
  creditRestored?: boolean;
};

const filters: Array<[HistoryFilter, string]> = [
  ["all", "All"],
  ["quick", "Quick Scan"],
  ["full", "Full Validation"],
  ["completed", "Completed"],
  ["progress", "In progress"],
  ["failed", "Failed"],
];

function humanizeStatus(status: string) {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ReportHistory({ runs }: { runs: HistoryRun[] }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const visible = filterReportHistory(runs, filter);

  return (
    <div className="grid gap-sb-3">
      <div className="flex flex-wrap gap-sb-1" role="group" aria-label="Filter report history">
        {filters.map(([value, label]) => (
          <Button
            variant={filter === value ? "secondary" : "ghost"}
            className="min-h-8 px-sb-2 text-xs"
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto border-y border-sb-border-hairline" aria-live="polite">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <caption className="sr-only">Validation report history</caption>
          <thead className="bg-sb-bg-surface-1 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">
            <tr>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col">Idea</th>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col">Type</th>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col">Result</th>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col">Evidence</th>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col">Status</th>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col">Updated</th>
              <th className="px-sb-3 py-sb-2 font-medium" scope="col"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((run) => {
              const config = getReportModeConfig(run.mode);
              const href = run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
              return (
                <tr className="border-t border-sb-border-hairline transition-colors duration-sb-fast ease-sb-standard hover:bg-sb-bg-surface-1" key={run.id}>
                  <th className="max-w-72 px-sb-3 py-sb-3 align-top font-normal" scope="row">
                    <Link className="rounded-sb-sm font-medium text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={href}>{run.ideaName}</Link>
                    {run.publicReason && <span className="mt-sb-1 block text-xs font-normal leading-relaxed text-sb-text-tertiary">{run.publicReason}{run.creditRestored ? " Credit restored." : ""}</span>}
                  </th>
                  <td className="px-sb-3 py-sb-3 align-top text-xs text-sb-text-secondary">{config.label}</td>
                  <td className="px-sb-3 py-sb-3 align-top">
                    {run.score != null || run.verdict ? (
                      <div className="flex items-center gap-sb-3">
                        {run.score != null && <ScoreDisplay score={run.score} size="sm" animate={false}/>}
                        {run.verdict && <VerdictBadge verdict={run.verdict}/>}
                      </div>
                    ) : <span className="text-xs text-sb-text-tertiary">—</span>}
                  </td>
                  <td className="px-sb-3 py-sb-3 align-top font-sb-mono text-xs tabular-nums text-sb-text-secondary">
                    {run.sourceCount} sources<br/><span className="text-sb-text-tertiary">{run.independentDomains} independent domains</span>
                  </td>
                  <td className="px-sb-3 py-sb-3 align-top text-xs text-sb-text-secondary">
                    <span>{humanizeStatus(run.status)}</span>
                    {run.degraded && <span className="mt-sb-1 block text-sb-text-tertiary">Limited source access</span>}
                    {run.durationMs != null && <span className="mt-sb-1 block font-sb-mono tabular-nums text-sb-text-tertiary">{formatDuration(run.durationMs)}</span>}
                  </td>
                  <td className="px-sb-3 py-sb-3 align-top font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{formatDate(run.completedAt ?? run.createdAt)}</td>
                  <td className="px-sb-3 py-sb-3 text-right align-top">
                    <Link className="rounded-sb-sm text-xs text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={href}>{run.status === "Completed" ? "Open report" : "View progress"}</Link>
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr className="border-t border-sb-border-hairline">
                <td className="px-sb-3 py-sb-8 text-center text-sm text-sb-text-secondary" colSpan={7}>No reports match this filter. Choose another status to continue.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
