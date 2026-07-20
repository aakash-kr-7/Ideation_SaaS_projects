"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, LoaderCircle, OctagonX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deriveProgressSteps } from "@/lib/report-mode-ui";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";
import type { ResearchStatus } from "@/supabase/functions/_shared/research/status";

type ProgressResponse = {
  id: string;
  mode: ReportMode;
  stage: ResearchStatus;
  progress: number;
  message: string;
  evidenceCount: number;
  sourceCount: number;
  competitorCount: number;
  reportReady: boolean;
  creditState: string | null;
  creditRestored: boolean;
  error: string | null;
};

const TERMINAL = new Set<ResearchStatus>(["Completed", "Failed", "Cancelled"]);

export function ResearchProgress({ id }: { id: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<ProgressResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/research/${id}/progress`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load research progress.");
    setState(payload);
    setRequestError(null);
    if (payload.stage === "Completed" && payload.reportReady) router.replace(`/research/${id}/results`);
  }, [id, router]);

  useEffect(() => {
    void refresh().catch((error) => setRequestError(error instanceof Error ? error.message : String(error)));
    const timer = setInterval(() => void refresh().catch(() => undefined), 3_000);
    const channel = supabase.channel(`research-run-${id}`).on(
      "postgres_changes", { event: "UPDATE", schema: "public", table: "research_runs", filter: `id=eq.${id}` },
      () => void refresh().catch(() => undefined),
    ).subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [id, refresh, supabase]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const response = await fetch(`/api/research/${id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("Cancellation could not be completed.");
      await refresh();
    } catch (error) { setRequestError(error instanceof Error ? error.message : String(error)); }
    finally { setCancelling(false); }
  };

  if (!state) return <section className="research-room-loading"><LoaderCircle className="spin"/><p>{requestError || "Loading durable job state…"}</p></section>;
  const config = getReportModeConfig(state.mode);
  const steps = deriveProgressSteps(config, { stage: state.stage, progress: state.progress });
  const active = !TERMINAL.has(state.stage);

  return <div className="research-room">
    <section className="research-room-hero">
      <div><p className="eyebrow">{config.label.toUpperCase()} · GEMINI HYBRID PIPELINE</p><h1>{state.message}</h1><p>The worker persists each transition, so this page can be closed safely while research continues.</p></div>
      <div className="research-room-score"><strong>{Math.max(0, Math.min(100, state.progress))}%</strong><span>{state.stage}</span></div>
    </section>

    <section className="research-room-progress" aria-label="Research pipeline stages">
      <ol className="mode-progress-sequence">
        {steps.map((step) => <li key={step.key} data-state={step.state}>
          {step.state === "complete" ? <CheckCircle2 size={18}/> : step.state === "active" ? <LoaderCircle className="spin" size={18}/> : <CircleDashed size={18}/>}
          <span>{step.label}</span>
        </li>)}
      </ol>
    </section>

    <section className="research-room-metrics">
      <article><strong>{state.sourceCount}</strong><span>grounded sources</span></article>
      <article><strong>{state.evidenceCount}</strong><span>validated evidence items</span></article>
      <article><strong>{state.competitorCount}</strong><span>competitors normalized</span></article>
    </section>

    {requestError && <p className="error-box">{requestError}</p>}
    {state.stage === "Failed" && <section className="research-terminal-card failure"><OctagonX/><h2>Research failed safely</h2><p>{state.error}</p><p>{state.creditRestored ? "The reserved credit was restored." : `Credit state: ${state.creditState || "unknown"}.`}</p><button type="button" onClick={() => router.push(`/research/new?mode=${state.mode}&retryFrom=${id}`)}>Retry with the same brief</button></section>}
    {state.stage === "Cancelled" && <section className="research-terminal-card"><h2>Research cancelled</h2><p>The durable queue has been terminalized and the reservation restoration path has run.</p><button type="button" onClick={() => router.push(`/research/new?mode=${state.mode}&retryFrom=${id}`)}>Start again</button></section>}
    {active && <div className="research-room-actions"><button className="button ghost" type="button" disabled={cancelling} onClick={cancel}>{cancelling ? "Cancelling…" : "Cancel research"}</button></div>}
  </div>;
}
