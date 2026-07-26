"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BarChart3, Check, CheckCircle2, CircleDashed, Clock3, Database,
  FileCheck2, Globe2, LoaderCircle, OctagonX, RefreshCw, Search, ShieldCheck,
  Telescope, XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";
import type { ResearchStatus } from "@/supabase/functions/_shared/research/status";

type Stage = { id: string; name: string; status: string; detail: string | null; startedAt: string | null; completedAt: string | null };
type Task = { id: string; stage: string; status: string; attempt: number; maxAttempts: number; batchIndex: number; batchSize: number; purpose: string; createdAt: string; completedAt: string | null };
type Retrieval = { id: string; queryFamily: string; provider: string; url: string | null; domain: string | null; disposition: "discovered" | "accepted" | "rejected"; rejectionReason: string | null; relevance: number | null; relevanceClass?: string | null; acceptanceDecision?: string | null; mismatchReasons?: string[]; matchedDimensions?: string[]; createdAt: string };
type Source = { id: string; title: string; url: string; sourceType: string; createdAt: string };
type Evidence = { id: string; sourceId: string | null; title: string; snippet: string; signal: string; strength: string; family: string | null; sourceTier: number | null; sourceDomain: string | null; excluded: boolean; disconfirming: boolean; relevanceClass?: string | null; acceptanceDecision?: string | null; topic?: string | null; createdAt: string };
type Cluster = { id: string; type: string; claim: string; supportingCount: number; contradictingCount: number; independentDomains: number; confidence: number; unresolved: boolean };
type QueryActivity = { id: string; objective: string; family: string; query: string; status: string; resultCount: number; createdAt: string; completedAt: string | null };
type ContradictionActivity = { id: string; claim: string; relationship: string; resolution: string; supportingCount: number; challengingCount: number; createdAt: string };
type SpecialistActivity = { id: string; specialist: string; status: string; attemptCount: number; createdAt: string };
type Metrics = {
  candidatesDiscovered?: number; pagesAttempted?: number; pagesFetched?: number; sourcesAccepted?: number;
  sourcesRejectedByReason?: Record<string, number>; independentDomains?: number; evidenceItemsExtracted?: number;
  retries?: number; providerFallbacks?: number; groundedCallsAttempted?: number; groundedCallsCompleted?: number;
  groundedCallsQuotaBlocked?: number; externalSearchCalls?: number; synthesisCalls?: number;
  degradedProviders?: string[]; groundingMode?: string; groundingDegraded?: boolean; durationMs?: number;
};
type ProgressSnapshot = {
  id: string; mode: ReportMode; status: ResearchStatus; currentStage: string; progressDetail: string;
  createdAt: string; updatedAt: string; stageStartedAt: string | null; lastProgressAt: string | null; terminalAt: string | null;
  creditState: string | null; creditRestored: boolean; publicFailureReason: string | null;
  stages: Stage[]; tasks: Task[]; metrics: Metrics; retrieval: Retrieval[]; sources: Source[]; evidence: Evidence[];
  clusters: Cluster[]; confidence: { band?: string; score?: number; reasons?: string[] };
  queries?: QueryActivity[]; contradictions?: ContradictionActivity[]; specialists?: SpecialistActivity[];
  brief?: { product: string; buyer: string; workflow: string; problem: string; outcome: string } | null;
  reportState: { ready: boolean; chartsPrepared: number; exportsPrepared: number };
};

const TERMINAL = new Set<ResearchStatus>(["Completed", "Failed", "Cancelled"]);
const STAGE_LABELS: Record<string, string> = {
  plan: "Research plan", grounded_research: "Gemini grounded research", evidence_boosters: "Evidence boosters",
  validate_normalize: "Gemini synthesis", analyze_score: "Evidence scoring", generate_report: "Report generation",
  generate_exports: "Export generation", complete: "Completion",
};
const REJECTION_LABELS: Record<string, string> = {
  invalid_url: "Invalid or unsafe URL", empty_or_unextractable: "No usable page content",
  timeout: "Retrieval timed out", fetch_error: "Page could not be retrieved",
};

function labelStage(value: string) {
  return STAGE_LABELS[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function humanize(value: string | null | undefined) {
  if (!value) return "";
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function decisionFor(item: Retrieval) {
  const decision = item.acceptanceDecision?.toLowerCase();
  if (decision === "quarantined" || decision === "quarantine") return "quarantined";
  if (decision === "rejected" || item.disposition === "rejected") return "rejected";
  if (decision === "accepted" || item.disposition === "accepted") return "accepted";
  return "fetching";
}
function domainFor(url: string | null, fallback: string | null) {
  if (!url) return fallback ?? "Domain unavailable";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return fallback ?? "Domain unavailable"; }
}
function faviconFor(url: string | null) {
  if (!url) return null;
  try { return `${new URL(url).origin}/favicon.ico`; } catch { return null; }
}
function timeLabel(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
function elapsedLabel(start: string | null, end?: string | null) {
  if (!start) return "Not started";
  const milliseconds = Math.max(0, new Date(end ?? Date.now()).getTime() - new Date(start).getTime());
  if (milliseconds < 60_000) return `${Math.floor(milliseconds / 1000)}s`;
  const minutes = Math.floor(milliseconds / 60_000);
  return minutes < 60 ? `${minutes}m ${Math.floor((milliseconds % 60_000) / 1000)}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ResearchProgress({ id }: { id: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "realtime" | "polling">("connecting");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/research/${id}/progress`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load research activity.");
    setSnapshot(payload);
    setRequestError(null);
    if (payload.status === "Completed" && payload.reportState?.ready) router.replace(`/research/${id}/results`);
  }, [id, router]);

  useEffect(() => {
    void refresh().catch((error) => setRequestError(error instanceof Error ? error.message : String(error)));
    const timer = window.setInterval(() => void refresh().catch(() => setConnection("polling")), 5_000);
    const channel = supabase.channel(`research-run-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "research_runs", filter: `id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "research_stages", filter: `run_id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "sources", filter: `run_id=eq.${id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "evidence_items", filter: `run_id=eq.${id}` }, () => void refresh())
      .subscribe((status) => setConnection(status === "SUBSCRIBED" ? "realtime" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "polling" : "connecting"));
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [id, refresh, supabase]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const response = await fetch(`/api/research/${id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("Cancellation could not be completed.");
      await refresh();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Cancellation could not be completed.");
    } finally { setCancelling(false); }
  };

  if (!snapshot) return <section className="research-room-loading" aria-live="polite" aria-busy="true"><LoaderCircle className="spin" /><p>{requestError || "Loading persisted research activity…"}</p></section>;

  const config = getReportModeConfig(snapshot.mode);
  const active = !TERMINAL.has(snapshot.status);
  const currentTask = [...snapshot.tasks].reverse().find((task) => task.status === "claimed" || task.status === "pending");
  const completedTasks = snapshot.tasks.filter((task) => task.status === "completed").length;
  const completedStages = snapshot.stages.filter((stage) => stage.status === "Completed" || stage.status === "Complete").length;
  const acceptedEvidence = snapshot.evidence.filter((item) => !item.excluded);
  const contradictions = snapshot.contradictions?.length ?? acceptedEvidence.filter((item) => item.disconfirming).length;
  const families = new Set(acceptedEvidence.map((item) => item.family).filter(Boolean));
  const sourceMap = new Map(snapshot.sources.map((source) => [source.id, source]));
  const latestActivity = snapshot.retrieval.slice(0, 18);
  const longRunning = active && snapshot.lastProgressAt && Date.now() - new Date(snapshot.lastProgressAt).getTime() > 120_000;

  return <div className="research-room" data-testid="research-room">
    <section className="research-room-hero">
      <div className="research-room-pulse" aria-hidden="true"><Telescope size={24} /><i /><i /></div>
      <div>
        <p className="eyebrow">{config.label.toUpperCase()} · LIVE RESEARCH ROOM</p>
        <h1>{snapshot.progressDetail}</h1>
        <p className="research-room-message">This workspace reflects persisted pipeline events. You can close it safely and return later.</p>
        {snapshot.brief && <p className="research-room-objective"><b>Research objective:</b> {snapshot.brief.product} for {snapshot.brief.buyer}, focused on {snapshot.brief.workflow}.</p>}
      </div>
      <span className="research-room-stage">
        {active ? <LoaderCircle /> : snapshot.status === "Completed" ? <Check /> : <AlertTriangle />}
        {labelStage(snapshot.currentStage)}
      </span>
    </section>

    <section className="research-room-progress" aria-label="Factual research progress">
      <div className="research-stage-flow">
        {snapshot.stages.length ? snapshot.stages.map((stage) => <span key={stage.id} data-state={stage.status.toLowerCase()}>
          {stage.completedAt ? <CheckCircle2 size={13} /> : stage.name === snapshot.currentStage || stage.status === snapshot.status ? <LoaderCircle size={13} /> : <CircleDashed size={13} />}
          {labelStage(stage.name)}
        </span>) : <span><LoaderCircle size={13} />{labelStage(snapshot.currentStage)}</span>}
      </div>
      <strong>{completedStages} stages complete · {completedTasks}/{snapshot.tasks.length} tasks</strong>
    </section>

    <section className="research-room-metrics" aria-label="Persisted research metrics" aria-live="polite">
      <Metric icon={Database} value={snapshot.metrics.pagesFetched ?? 0} label="pages fetched" />
      <Metric icon={ShieldCheck} value={snapshot.metrics.sourcesAccepted ?? acceptedEvidence.length} label="accepted sources" />
      <Metric icon={Globe2} value={snapshot.metrics.independentDomains ?? 0} label="independent domains" />
      <Metric icon={Search} value={families.size} label="evidence families" />
      <Metric icon={AlertTriangle} value={contradictions} label="contradictions" />
      <Metric icon={RefreshCw} value={snapshot.metrics.retries ?? 0} label="retries" />
    </section>

    {(snapshot.metrics.groundingDegraded || (snapshot.metrics.degradedProviders?.length ?? 0) > 0) && <section className="research-degraded" role="status">
      <AlertTriangle size={17} />
      <div><b>Grounding or retrieval is degraded</b><p>{snapshot.metrics.groundedCallsQuotaBlocked ? "Grounding quota was unavailable; configured external retrieval is carrying the evidence pass." : "One or more configured providers are unavailable; the pipeline is using persisted fallback paths."}</p></div>
    </section>}
    {longRunning && <section className="research-long-running" role="status"><Clock3 size={16} /><span>This stage has had no persisted transition for {elapsedLabel(snapshot.lastProgressAt)}. The polling fallback remains active.</span></section>}

    <section className="research-room-grid">
      <aside className="research-pass-panel">
        <PanelHeading kicker="Pipeline" title="Stage ledger" trailing={`${completedTasks}/${snapshot.tasks.length}`} />
        <div className="research-pass-list">
          {snapshot.tasks.length ? snapshot.tasks.map((task, index) => <article key={task.id} className={task.id === currentTask?.id ? "pass-running" : ""}>
            <div className="research-pass-index"><span>{String(index + 1).padStart(2, "0")}</span>{task.status === "completed" ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}</div>
            <div className="research-pass-copy">
              <div className="research-pass-title"><h3>{labelStage(task.stage)}</h3><span>{task.status}</span></div>
              <p>{task.purpose === "stage" ? "Canonical pipeline task" : task.purpose.replaceAll("_", " ")}</p>
              <div className="research-pass-stats">
                {task.batchSize > 0 && <span>batch {task.batchIndex + 1} · {task.batchSize} items</span>}
                <span>attempt {task.attempt}/{task.maxAttempts}</span>
                <span>{elapsedLabel(task.createdAt, task.completedAt)}</span>
              </div>
            </div>
          </article>) : <p className="research-empty-state">The first durable task has not been persisted yet.</p>}
        </div>
      </aside>

      <section className="research-evidence-panel">
        <PanelHeading kicker="Retrieval" title="Source activity" trailing={<span className="research-live-mark"><i />{connection === "realtime" ? "Realtime" : "Polling"}</span>} />
        <div className="research-query-families" aria-label="Queries being explored">
          {(snapshot.queries ?? []).slice(-6).map((query) => <span key={query.id} title={query.query}>{humanize(query.objective)} · {query.query}</span>)}
          {!(snapshot.queries?.length) && [...new Set(latestActivity.map((item) => item.queryFamily).filter(Boolean))].map((family) => <span key={family}>{humanize(family)}</span>)}
        </div>
        <div className="research-source-feed">
          {latestActivity.length ? latestActivity.map((item) => {
            const domain = domainFor(item.url, item.domain);
            const favicon = faviconFor(item.url);
            const status = decisionFor(item);
            return <article key={item.id} className={`source-${status}`}>
              <div className="source-favicon">{favicon ? <img src={favicon} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Globe2 size={15} />}</div>
              <div className="source-activity-body">
                <div><b>{domain}</b><span>{humanize(item.queryFamily)}</span></div>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>{item.url}</a> : <p>URL unavailable</p>}
                <small>{status === "rejected" ? item.mismatchReasons?.[0] ?? REJECTION_LABELS[item.rejectionReason ?? ""] ?? "Did not meet relevance or retrieval requirements" : status === "quarantined" ? item.mismatchReasons?.[0] ?? "Adjacent context quarantined from core scoring" : status === "accepted" ? `Accepted as ${humanize(item.relevanceClass) || "relevant"} evidence` : "Page discovered and fetching for evaluation"}</small>
              </div>
              <span className={`source-status status-${status}`}>{status === "accepted" ? <CheckCircle2 size={13} /> : status === "rejected" || status === "quarantined" ? <XCircle size={13} /> : <LoaderCircle size={13} />}{humanize(status)}</span>
            </article>;
          }) : <p className="research-empty-state">No source discovery event has been persisted yet.</p>}
        </div>

        <PanelHeading kicker="Evidence" title="Accepted findings" trailing={`${acceptedEvidence.length} items`} />
        <div className="research-evidence-feed">
          {acceptedEvidence.slice(0, 8).map((evidence) => {
            const source = evidence.sourceId ? sourceMap.get(evidence.sourceId) : undefined;
            return <article className={evidence.disconfirming ? "is-disconfirming" : ""} key={evidence.id}>
              <div className="evidence-feed-topline"><div><span className={`tier-${evidence.sourceTier ?? 4}`}>Tier {evidence.sourceTier ?? "—"}</span><span>{humanize(evidence.topic ?? evidence.family ?? evidence.signal)}</span><span>{humanize(evidence.relevanceClass)}</span>{evidence.disconfirming && <span className="evidence-negative">Contradicting</span>}</div><time>{timeLabel(evidence.createdAt)}</time></div>
              <h3>{evidence.title}</h3><p>{evidence.snippet}</p>
              <footer><span className="evidence-source-line">{source?.url ? <a href={source.url} target="_blank" rel="noreferrer">{evidence.sourceDomain ?? source.title}</a> : evidence.sourceDomain ?? "Source pending"}</span><span className="corroboration-chip">{evidence.strength} quality</span></footer>
            </article>;
          })}
          {!acceptedEvidence.length && <p className="research-empty-state">Evidence appears here only after it is persisted and accepted.</p>}
        </div>
      </section>

      <aside className="research-verification-panel">
        <PanelHeading kicker="Verification" title="Evidence integrity" trailing={<ShieldCheck size={16} />} />
        <section className="corroboration-board">
          <h3>Evidence clusters</h3>
          {snapshot.clusters.slice(0, 6).map((cluster) => <article key={cluster.id}><div><p>{cluster.claim}</p><b>{Math.round(cluster.confidence)}%</b></div><span><i style={{ width: `${Math.max(0, Math.min(100, cluster.confidence))}%` }} /></span><small>{cluster.supportingCount} supporting · {cluster.contradictingCount} contradicting · {cluster.independentDomains} domains</small></article>)}
          {!snapshot.clusters.length && <p className="research-empty-state">Clusters have not been persisted yet.</p>}
        </section>
        <section className="checker-board">
          <h3>Production outputs</h3>
          <article><BarChart3 size={15} /><div><b>Charts</b><small>{snapshot.reportState.chartsPrepared} persisted datasets prepared</small></div></article>
          <article><FileCheck2 size={15} /><div><b>Exports</b><small>{snapshot.reportState.exportsPrepared} stored exports prepared</small></div></article>
          <article><Telescope size={15} /><div><b>Gemini synthesis</b><small>{snapshot.metrics.synthesisCalls ?? 0} persisted synthesis calls completed</small></div></article>
          <article><ShieldCheck size={15} /><div><b>Specialist reviews</b><small>{snapshot.specialists?.length ? `${snapshot.specialists.filter((item) => item.status === "Complete").length}/${snapshot.specialists.length} evidence reviews complete` : "Waiting for evidence-bound reviews"}</small></div></article>
        </section>
        {!!snapshot.contradictions?.length && <section className="corroboration-board"><h3>Proposition challenges</h3>{snapshot.contradictions.slice(0, 3).map((item) => <article key={item.id}><div><p>{item.claim}</p><b>{humanize(item.resolution)}</b></div><small>{item.supportingCount} supporting · {item.challengingCount} challenging · {item.relationship}</small></article>)}</section>}
        {snapshot.confidence.band && <section className="citation-card"><ShieldCheck size={18} /><div><h3>Evidence Confidence: {snapshot.confidence.band}</h3><p>Persisted confidence score {snapshot.confidence.score ?? "—"}</p></div></section>}
      </aside>
    </section>

    <section className="research-observability" aria-label="Provider and connection status">
      <div><span>Connection</span><b>{connection === "realtime" ? "Realtime connected" : connection === "polling" ? "Realtime unavailable · polling fallback active" : "Connecting · polling active"}</b></div>
      <div><span>Grounding</span><b>{snapshot.metrics.groundingMode ?? "Not reported"}{snapshot.metrics.groundingDegraded ? " · degraded" : ""}</b></div>
      <div><span>Current task</span><b>{currentTask ? `${labelStage(currentTask.stage)} · attempt ${currentTask.attempt}/${currentTask.maxAttempts}` : snapshot.status}</b></div>
    </section>

    {requestError && <p className="progress-error" role="alert">{requestError}</p>}
    {snapshot.status === "Failed" && <TerminalCard icon={<OctagonX />} title="Research failed safely" copy={snapshot.publicFailureReason ?? "Research stopped before completion."} creditRestored={snapshot.creditRestored} action="Retry with the same brief" onAction={() => router.push(`/research/new?mode=${snapshot.mode}&retryFrom=${id}`)} />}
    {snapshot.status === "Cancelled" && <TerminalCard icon={<XCircle />} title="Research cancelled" copy={snapshot.publicFailureReason ?? "This run was cancelled."} creditRestored={snapshot.creditRestored} action="Start again" onAction={() => router.push(`/research/new?mode=${snapshot.mode}&retryFrom=${id}`)} />}
    {active && <div className="research-room-actions"><button className="button ghost" type="button" disabled={cancelling} onClick={cancel}>{cancelling ? "Cancelling…" : "Cancel research"}</button></div>}
  </div>;
}

function Metric({ icon: Icon, value, label }: { icon: typeof Database; value: number; label: string }) {
  return <article><Icon size={17} /><div><b>{value.toLocaleString()}</b><span>{label}</span></div></article>;
}
function PanelHeading({ kicker, title, trailing }: { kicker: string; title: string; trailing: React.ReactNode }) {
  return <header className="research-panel-heading"><div><span>{kicker}</span><h2>{title}</h2></div>{trailing}</header>;
}
function TerminalCard({ icon, title, copy, creditRestored, action, onAction }: { icon: React.ReactNode; title: string; copy: string; creditRestored: boolean; action: string; onAction: () => void }) {
  return <section className="research-terminal-card"><span>{icon}</span><h2>{title}</h2><p>{copy}</p>{creditRestored && <p><CheckCircle2 size={15} /> The reserved credit was restored.</p>}<button type="button" onClick={onAction}>{action}</button></section>;
}
