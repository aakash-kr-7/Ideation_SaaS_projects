"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CircleDashed, Clock3, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";
import type { ResearchStatus } from "@/supabase/functions/_shared/research/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state-message";

type Stage = {
  id: string;
  name: string;
  status: string;
  detail: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type Task = {
  id: string;
  stage: string;
  status: string;
  purpose: string;
  attempt: number;
  maxAttempts: number;
};

type ProgressSnapshot = {
  id: string;
  mode: ReportMode;
  status: ResearchStatus;
  currentStage: string;
  progress: number;
  progressDetail: string;
  lastProgressAt: string | null;
  publicFailureReason: string | null;
  creditRestored: boolean;
  researchOutcome?: "research_unavailable" | "insufficient_evidence" | "research_completed" | null;
  retryAfter?: string | null;
  stages: Stage[];
  tasks: Task[];
  metrics: {
    pagesFetched?: number;
    sourcesAccepted?: number;
    independentDomains?: number;
    evidenceItemsExtracted?: number;
    retries?: number;
    groundingDegraded?: boolean;
    degradedProviders?: string[];
  };
  reportState: { ready: boolean };
};

const TERMINAL = new Set<ResearchStatus>(["Completed", "Failed", "Cancelled"]);
const STAGE_LABELS: Record<string, string> = {
  plan: "Planning the research",
  grounded_research: "Finding and checking sources",
  evidence_boosters: "Filling evidence gaps",
  validate_normalize: "Reviewing accepted evidence",
  analyze_score: "Applying the persisted scorecard",
  generate_report: "Writing the report from accepted findings",
  generate_exports: "Preparing report exports",
  complete: "Research complete",
};

function labelStage(value: string) {
  return STAGE_LABELS[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stageComplete(stage: Stage) {
  const state = stage.status.toLowerCase();
  return Boolean(stage.completedAt) || state === "complete" || state === "completed";
}

function formatTime(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ResearchProgress({ id }: { id: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "realtime" | "polling">("connecting");
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequenceRef.current;
    const response = await fetch(`/api/research/${id}/progress`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Research status could not be loaded.");
    }
    if (sequence !== refreshSequenceRef.current) return;
    setSnapshot(payload);
    setRequestError(null);
    if (payload.status === "Completed" && payload.reportState?.ready) {
      router.replace(`/research/${id}/results`);
    }
  }, [id, router]);

  useEffect(() => {
    void refresh().catch((error) => setRequestError(error instanceof Error ? error.message : String(error)));
    const timer = window.setInterval(() => void refresh().catch(() => setConnection("polling")), 5_000);
    const channel = supabase.channel(`research-run-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "research_runs", filter: `id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "research_stages", filter: `run_id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "research_jobs", filter: `run_id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "evidence_items", filter: `run_id=eq.${id}` }, () => void refresh())
      .subscribe((status) => setConnection(status === "SUBSCRIBED" ? "realtime" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "polling" : "connecting"));
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [id, refresh, supabase]);

  async function cancel() {
    setCancelling(true);
    try {
      const response = await fetch(`/api/research/${id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("The research run could not be cancelled.");
      await refresh();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The research run could not be cancelled.");
    } finally {
      setCancelling(false);
    }
  }

  if (!snapshot) {
    if (requestError) {
      return (
        <ErrorState
          message={`${requestError} Recheck the saved run status to continue.`}
          action={<Button variant="secondary" onClick={() => void refresh()}>Recheck status</Button>}
        />
      );
    }
    return (
      <Card className="grid gap-sb-3 p-sb-6" role="status" aria-live="polite">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Research status</p>
        <h1 className="m-0 font-sb-display text-2xl font-[480]">Connecting to the saved research run…</h1>
        <p className="m-0 text-sm text-sb-text-secondary">The current pipeline stage will appear as soon as its persisted status is available.</p>
      </Card>
    );
  }

  const config = getReportModeConfig(snapshot.mode);
  const active = !TERMINAL.has(snapshot.status);
  const progress = Math.max(0, Math.min(100, Number.isFinite(snapshot.progress) ? snapshot.progress : 0));
  const narration = snapshot.progressDetail?.trim() || `${labelStage(snapshot.currentStage)} is in progress.`;
  const completedStages = snapshot.stages.filter(stageComplete).length;
  const currentTask = [...snapshot.tasks].reverse().find((task) => task.status === "claimed" || task.status === "pending");
  const longRunning = active && snapshot.lastProgressAt && Date.now() - new Date(snapshot.lastProgressAt).getTime() > 120_000;

  if (snapshot.status === "Failed") {
    const retryBlocked = Boolean(snapshot.retryAfter && new Date(snapshot.retryAfter).getTime() > Date.now());
    const happened = snapshot.publicFailureReason
      ?? (snapshot.researchOutcome === "research_unavailable"
        ? "Required research capacity was unavailable, so no market verdict was produced."
        : "Research stopped before the report could be completed.");
    const next = retryBlocked
      ? `Retry after ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.retryAfter!))}.`
      : "Retry with the same brief to start a new evidence run.";
    return (
      <ErrorState
        message={`${happened} ${snapshot.creditRestored ? "The reserved credit was restored. " : ""}${next}`}
        action={<Button variant="secondary" disabled={retryBlocked} onClick={() => router.push(`/research/new?mode=${snapshot.mode}&retryFrom=${id}`)}>Retry with the same brief</Button>}
      />
    );
  }

  if (snapshot.status === "Cancelled") {
    return (
      <EmptyState
        message={`${snapshot.publicFailureReason ?? "This research run was cancelled."} Start again with the saved brief when you are ready.`}
        action={<Button variant="secondary" onClick={() => router.push(`/research/new?mode=${snapshot.mode}&retryFrom=${id}`)}>Start again</Button>}
      />
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-sb-6" aria-live="polite">
      <Card className="grid gap-sb-6 p-sb-6 sm:p-sb-8">
        <div className="flex flex-col gap-sb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-sb-2">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{config.label} · {snapshot.status}</p>
            <h1 className="m-0 max-w-2xl font-sb-display text-3xl font-[480] tracking-[-0.02em]">{narration}</h1>
            <p className="m-0 text-sm text-sb-text-secondary">You can close this page. The persisted research run continues in the background.</p>
          </div>
          <span className="w-fit rounded-sb-pill border border-sb-border-hairline bg-sb-bg-surface-2 px-sb-3 py-sb-1 font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-secondary">
            {labelStage(snapshot.currentStage)}
          </span>
        </div>

        <div className="grid gap-sb-2">
          <div className="flex items-center justify-between gap-sb-4 font-sb-mono text-xs tabular-nums text-sb-text-tertiary">
            <span>{completedStages} of {snapshot.stages.length || 1} recorded stages complete</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-sb-pill bg-sb-bg-surface-3" role="progressbar" aria-label="Persisted research progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <div className="h-full bg-sb-text-secondary transition-[width] duration-sb-base ease-sb-standard" style={{ width: `${progress}%` }}/>
          </div>
        </div>
      </Card>

      {requestError && (
        <ErrorState
          message={`${requestError} The background run is unchanged; recheck its saved status.`}
          action={<Button variant="secondary" onClick={() => void refresh()}>Recheck status</Button>}
        />
      )}

      {(snapshot.metrics.groundingDegraded || (snapshot.metrics.degradedProviders?.length ?? 0) > 0) && (
        <Card className="flex gap-sb-3 border-dashed p-sb-4" role="status">
          <AlertTriangle className="mt-0.5 shrink-0 text-sb-text-tertiary" size={16}/>
          <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">A research provider reported reduced capacity. The persisted run is continuing with the fallback state recorded by the pipeline.</p>
        </Card>
      )}

      {longRunning && (
        <Card className="flex gap-sb-3 border-dashed p-sb-4" role="status">
          <Clock3 className="mt-0.5 shrink-0 text-sb-text-tertiary" size={16}/>
          <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">No new pipeline progress has been recorded since {formatTime(snapshot.lastProgressAt)}. The run still reports {snapshot.status.toLowerCase()}.</p>
        </Card>
      )}

      <section className="grid gap-sb-3" aria-labelledby="research-steps-title">
        <div className="flex items-end justify-between gap-sb-4">
          <div>
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Narrated progress</p>
            <h2 id="research-steps-title" className="mb-0 mt-sb-1 font-sb-display text-2xl font-[480]">Recorded research steps</h2>
          </div>
          <span className="font-sb-mono text-xs text-sb-text-tertiary">{connection === "realtime" ? "Live updates" : connection === "polling" ? "Polling" : "Connecting"}</span>
        </div>

        <div className="grid items-start gap-sb-4">
          <div className="grid gap-sb-2">
            {snapshot.stages.length ? snapshot.stages.map((stage) => {
              const complete = stageComplete(stage);
              const current = stage.name === snapshot.currentStage && !complete;
              return (
                <Card className={`grid grid-cols-[auto_1fr] gap-sb-3 p-sb-4 ${current ? "border-sb-border-hairline-strong bg-sb-bg-surface-2" : ""}`} key={stage.id}>
                  <span className="mt-0.5 text-sb-text-tertiary" aria-hidden="true">{complete ? <Check size={16}/> : current ? <CircleDashed size={16}/> : <span className="block h-4 w-4 rounded-full border border-sb-border-hairline-strong"/>}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-sb-2">
                      <h3 className="m-0 text-sm font-medium">{labelStage(stage.name)}</h3>
                      <span className="font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">{complete ? "Complete" : current ? "In progress" : stage.status}</span>
                    </div>
                    {(stage.detail || current) && <p className="mb-0 mt-sb-1 text-sm leading-relaxed text-sb-text-secondary">{stage.detail || narration}</p>}
                  </div>
                </Card>
              );
            }) : (
              <Card className="p-sb-4">
                <h3 className="m-0 text-sm font-medium">{labelStage(snapshot.currentStage)}</h3>
                <p className="mb-0 mt-sb-1 text-sm text-sb-text-secondary">{narration}</p>
              </Card>
            )}
          </div>
        </div>
      </section>

      <Card className="grid gap-sb-4 p-sb-5 sm:grid-cols-4" aria-label="Persisted research counts">
        <Metric value={snapshot.metrics.pagesFetched ?? 0} label="pages fetched"/>
        <Metric value={snapshot.metrics.sourcesAccepted ?? 0} label="sources accepted"/>
        <Metric value={snapshot.metrics.independentDomains ?? 0} label="independent domains"/>
        <Metric value={snapshot.metrics.evidenceItemsExtracted ?? 0} label="findings extracted"/>
      </Card>

      <footer className="flex flex-col gap-sb-3 border-t border-sb-border-hairline pt-sb-4 text-xs text-sb-text-tertiary sm:flex-row sm:items-center sm:justify-between">
        <span>{currentTask ? `${labelStage(currentTask.stage)} · attempt ${currentTask.attempt} of ${currentTask.maxAttempts}` : snapshot.status}</span>
        {active && <Button variant="ghost" disabled={cancelling} onClick={() => void cancel()}><X size={14}/>{cancelling ? "Cancelling…" : "Cancel research"}</Button>}
      </footer>
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <b className="block font-sb-mono text-xl font-semibold tabular-nums">{value.toLocaleString()}</b>
      <span className="text-xs text-sb-text-tertiary">{label}</span>
    </div>
  );
}
