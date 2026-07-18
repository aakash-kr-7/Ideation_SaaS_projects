"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Check,
  CircleAlert,
  FileCheck2,
  Globe2,
  Layers3,
  LoaderCircle,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { ResearchStatus } from "@/supabase/functions/_shared/research/status";
import { productCopy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/client";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getStaggerDelay, revealUpClass, stateChangeKey } from "@/lib/motion";
import { getReportModeConfig, type ReportMode } from "@/lib/report-modes";

type ProgressState = {
  mode: ReportMode;
  stage: ResearchStatus;
  progress: number;
  message: string;
  evidenceCount: number;
  sourceCount: number;
  competitorCount: number;
  idea: string;
  creditState: "legacy" | "reserved" | "consumed" | "restored";
};

type StageLog = {
  id: string;
  created_at: string;
  progress_detail: string | null;
  error_message: string | null;
  stage_name: string;
};

type ResearchPass = {
  id: string;
  pass_number: number;
  objective: "broad" | "targeted" | "disconfirming";
  query_count: number;
  evidence_count: number;
  sufficient: boolean;
  coverage_gaps: string[];
  budget_limited: boolean;
  status: "Running" | "Complete" | "BudgetLimited";
  started_at: string;
  completed_at: string | null;
};

type ResearchQuery = {
  id: string;
  pass_number: number;
  evidence_family: "problem" | "solution";
  objective: string;
  query: string;
  triggered_by_evidence_ids: string[];
  status: "Running" | "Complete" | "Failed";
  result_count: number;
  created_at: string;
};

type EvidenceSource = {
  title: string | null;
  url: string | null;
  source_type: string | null;
  source_domain: string | null;
};

type LiveEvidence = {
  id: string;
  title: string;
  snippet: string;
  signal_type: string;
  strength: string;
  evidence_family: "problem" | "solution" | null;
  research_pass: number | null;
  source_tier: number | null;
  tier_reason: string | null;
  excluded: boolean;
  disconfirming: boolean;
  pain_point: string | null;
  cluster_key: string | null;
  independent_source_count: number;
  independent_domain_count: number;
  source_domain: string | null;
  created_at: string;
  sources: EvidenceSource | EvidenceSource[] | null;
};

type SpecialistCheck = {
  id: string;
  specialist_name: string;
  status: "Complete" | "Incomplete";
  checker_direction: string;
  disputed: boolean;
  dispute_reason: string;
  created_at: string;
};

type AdversarialGate = {
  id: string;
  outcome: "StrongObjection" | "NoStrongDisproof" | "InsufficientEvidence";
  severity: "High" | "Medium" | "Low" | "None";
  objection: string;
  evidence_ids: string[];
  unresolved: boolean;
  status: "Complete" | "Incomplete";
  created_at: string;
};

type CitationValidation = {
  id: string;
  valid: boolean;
  claims_checked: number;
  claims_removed: number;
  created_at: string;
};

const PASS_META = {
  1: {
    label: "Broad sweep",
    detail: "Problem and solution space",
    icon: Radar,
  },
  2: {
    label: "Targeted follow-up",
    detail: "Entities and language surfaced earlier",
    icon: Target,
  },
  3: {
    label: "Adversarial search",
    detail: "Evidence against the opportunity",
    icon: ShieldAlert,
  },
} as const;

function asSource(value: LiveEvidence["sources"]) {
  return Array.isArray(value) ? value[0] : value;
}

function domainFor(item: LiveEvidence) {
  const source = asSource(item.sources);
  if (item.source_domain || source?.source_domain) {
    return item.source_domain || source?.source_domain || "";
  }
  try {
    return source?.url
      ? new URL(source.url).hostname.replace(/^www\./, "")
      : "";
  } catch {
    return "";
  }
}

function compactLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

export function ResearchProgress({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<ProgressState>({
    mode: "full_validation",
    stage: "Queued",
    progress: 0,
    message: "Queued for analysis",
    evidenceCount: 0,
    sourceCount: 0,
    competitorCount: 0,
    idea: "your idea",
    creditState: "reserved",
  });
  const [logs, setLogs] = useState<StageLog[]>([]);
  const [passes, setPasses] = useState<ResearchPass[]>([]);
  const [queries, setQueries] = useState<ResearchQuery[]>([]);
  const [evidence, setEvidence] = useState<LiveEvidence[]>([]);
  const [checks, setChecks] = useState<SpecialistCheck[]>([]);
  const [gate, setGate] = useState<AdversarialGate | null>(null);
  const [citation, setCitation] = useState<CitationValidation | null>(null);
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refreshCounts = async () => {
      const [sources, evidenceRows, opportunity] = await Promise.all([
        supabase.from("sources").select("id", { count: "exact", head: true })
          .eq("run_id", id),
        supabase.from("evidence_items").select("id", {
          count: "exact",
          head: true,
        }).eq("run_id", id),
        supabase.from("opportunities").select("id").eq("run_id", id)
          .maybeSingle(),
      ]);
      let competitorCount = 0;
      if (opportunity.data?.id) {
        const competitors = await supabase.from("competitors").select("id", {
          count: "exact",
          head: true,
        }).eq("opportunity_id", opportunity.data.id);
        competitorCount = competitors.count ?? 0;
      }
      if (active) {
        setState((previous) => ({
          ...previous,
          sourceCount: sources.count ?? 0,
          evidenceCount: evidenceRows.count ?? 0,
          competitorCount,
        }));
      }
    };

    const refreshStages = async () => {
      const { data, error } = await (supabase.from("research_stages") as any)
        .select("id,created_at,progress_detail,error_message,stage_name")
        .eq("run_id", id).order("created_at", { ascending: true });
      if (error) {
        if (active) setConnectionError(error.message);
        return;
      }
      if (active) setLogs((data ?? []) as StageLog[]);
    };

    const refreshResearch = async () => {
      const [
        passResult,
        queryResult,
        evidenceResult,
        checkResult,
        gateResult,
        citationResult,
      ] = await Promise.all([
        (supabase.from("research_passes") as any).select(
          "id,pass_number,objective,query_count,evidence_count,sufficient,coverage_gaps,budget_limited,status,started_at,completed_at",
        ).eq("run_id", id).order("pass_number"),
        (supabase.from("research_queries") as any).select(
          "id,pass_number,evidence_family,objective,query,triggered_by_evidence_ids,status,result_count,created_at",
        ).eq("run_id", id).order("created_at", { ascending: false }).limit(18),
        (supabase.from("evidence_items") as any).select(
          "id,title,snippet,signal_type,strength,evidence_family,research_pass,source_tier,tier_reason,excluded,disconfirming,pain_point,cluster_key,independent_source_count,independent_domain_count,source_domain,created_at,sources(title,url,source_type,source_domain)",
        ).eq("run_id", id).order("created_at", { ascending: false }).limit(24),
        (supabase as any).from("specialist_checks").select(
          "id,specialist_name,status,checker_direction,disputed,dispute_reason,created_at",
        ).eq("run_id", id).order("created_at"),
        (supabase as any).from("adversarial_verdict_gates").select(
          "id,outcome,severity,objection,evidence_ids,unresolved,status,created_at",
        ).eq("run_id", id).maybeSingle(),
        (supabase as any).from("citation_integrity_validations").select(
          "id,valid,claims_checked,claims_removed,created_at",
        ).eq("run_id", id).maybeSingle(),
      ]);

      const firstError = [
        passResult,
        queryResult,
        evidenceResult,
        checkResult,
        gateResult,
        citationResult,
      ].find((result) => result.error)?.error;
      if (firstError) {
        if (active) setConnectionError(firstError.message);
        return;
      }
      if (!active) return;
      setPasses((passResult.data ?? []) as ResearchPass[]);
      setQueries((queryResult.data ?? []) as ResearchQuery[]);
      setEvidence((evidenceResult.data ?? []) as LiveEvidence[]);
      setChecks((checkResult.data ?? []) as SpecialistCheck[]);
      setGate((gateResult.data ?? null) as AdversarialGate | null);
      setCitation((citationResult.data ?? null) as CitationValidation | null);
    };

    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void Promise.all([refreshResearch(), refreshCounts(), refreshStages()]);
      }, 120);
    };

    const applyRun = (run: any) => {
      if (!active) return;
      const message = run.status === "Failed"
        ? run.error_message || run.progress_detail || "Research failed"
        : run.progress_detail || run.status;
      setState((previous) => ({
        ...previous,
        stage: run.status,
        progress: run.progress ?? 0,
        message,
        idea: run.idea_name ?? previous.idea,
        mode: run.mode ?? previous.mode,
        creditState: run.credit_state ?? previous.creditState,
      }));
      if (run.status === "Completed") router.push(`/research/${id}/results`);
    };

    const hydrate = async () => {
      const { data, error } = await supabase.from("research_runs").select(
        "id,idea_name,mode,status,progress,progress_detail,error_message,credit_state",
      ).eq("id", id).single();
      if (error) {
        if (active) setConnectionError(error.message);
        return;
      }
      applyRun(data);
      await Promise.all([refreshCounts(), refreshStages(), refreshResearch()]);
    };

    const channel = supabase.channel(`research-room-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "research_runs",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          applyRun(payload.new);
          queueRefresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "research_stages",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "research_passes",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "research_queries",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evidence_items",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "specialist_checks",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adversarial_verdict_gates",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "citation_integrity_validations",
          filter: `run_id=eq.${id}`,
        },
        queueRefresh,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionError("Live database updates are unavailable.");
        }
      });

    void hydrate();
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [id, router]);

  const clusters = useMemo(() => {
    const grouped = new Map<string, {
      label: string;
      sources: number;
      domains: number;
      evidence: number;
    }>();
    for (const item of evidence) {
      const key = item.pain_point || item.cluster_key;
      if (!key || item.excluded) continue;
      const previous = grouped.get(key);
      grouped.set(key, {
        label: item.pain_point || item.title,
        sources: Math.max(
          previous?.sources ?? 0,
          item.independent_source_count,
        ),
        domains: Math.max(
          previous?.domains ?? 0,
          item.independent_domain_count,
        ),
        evidence: (previous?.evidence ?? 0) + 1,
      });
    }
    return [...grouped.values()].sort((a, b) =>
      b.sources - a.sources || b.evidence - a.evidence
    ).slice(0, 5);
  }, [evidence]);

  const disputedCount = checks.filter((check) => check.disputed).length;
  const config = getReportModeConfig(state.mode);
  const isRunning = !["Completed", "Failed", "Cancelled"].includes(state.stage);
  const statusOrder: ResearchStatus[] = ["Queued", "Searching", "Extracting", "Normalizing", "Scoring", "Generating", "Completed"];
  const currentStatusIndex = statusOrder.indexOf(state.stage);

  return (
    <div className={`research-room premium-progress mode-${state.mode}`} aria-live="polite">
      <header className="research-room-hero">
        <div className="research-room-pulse" aria-hidden="true">
          <Radar size={30} />
          <i />
          <i />
        </div>
        <div>
          <p className="eyebrow">{config.label.toUpperCase()} · LIVE RESEARCH ROOM</p>
          <h1>
            Building the case for <em>{state.idea}</em>
          </h1>
          <p
            className="research-room-message"
            key={stateChangeKey(state.message)}
          >
            {state.message}
          </p>
        </div>
        <div className="research-room-stage">
          {isRunning ? <LoaderCircle size={14} /> : <Check size={14} />}
          <span>{compactLabel(state.stage)}</span>
        </div>
      </header>

      <section
        className="research-room-progress"
        aria-label={`${state.progress}% complete`}
      >
        <div className="research-room-track">
          <i style={{ width: `${state.progress}%` }} />
        </div>
        <span>
          <AnimatedNumber value={state.progress} />%
        </span>
      </section>

      <ol className="mode-progress-sequence" aria-label={`${config.label} progress stages`}>
        {config.progress.map((step, index) => {
          const stepStatusIndex = statusOrder.indexOf(step.status);
          const complete = currentStatusIndex > stepStatusIndex || state.stage === "Completed";
          const active = state.stage === step.status && !complete;
          return <li key={`${step.status}-${index}`} className={complete ? "complete" : active ? "active" : "pending"}>
            <span>{complete ? <Check size={12} /> : index + 1}</span><b>{step.label}</b>
          </li>;
        })}
      </ol>

      <section
        className="research-room-metrics"
        aria-label="Live research totals"
      >
        <article>
          <Globe2 size={15} />
          <div>
            <b>
              <AnimatedNumber value={state.sourceCount} />
            </b>
            <span>sources read</span>
          </div>
        </article>
        <article>
          <Layers3 size={15} />
          <div>
            <b>
              <AnimatedNumber value={state.evidenceCount} />
            </b>
            <span>evidence rows</span>
          </div>
        </article>
        <article>
          <Target size={15} />
          <div>
            <b>
              <AnimatedNumber value={state.competitorCount} />
            </b>
            <span>competitors mapped</span>
          </div>
        </article>
        <article>
          <BadgeCheck size={15} />
          <div>
            <b>
              <AnimatedNumber value={checks.length} />
            </b>
            <span>independent checks</span>
          </div>
        </article>
      </section>

      <div className="research-room-grid">
        <aside className="research-pass-panel">
          <div className="research-panel-heading">
            <div>
              <span>METHOD</span>
              <h2>Research passes</h2>
            </div>
            <Activity size={16} />
          </div>
          {passes.length
            ? (
              <div className="research-pass-list">
                {passes.map((pass, index) => {
                  const meta = PASS_META[pass.pass_number as 1 | 2 | 3];
                  const Icon = meta?.icon || Search;
                  const passQueries = queries.filter((query) =>
                    query.pass_number === pass.pass_number
                  );
                  return (
                    <article
                      key={pass.id}
                      className={`${revealUpClass} pass-${pass.status.toLowerCase()}`}
                      style={getStaggerDelay(index)}
                    >
                      <div className="research-pass-index">
                        <span>0{pass.pass_number}</span>
                        <Icon size={15} />
                      </div>
                      <div className="research-pass-copy">
                        <div className="research-pass-title">
                          <h3>{meta?.label || compactLabel(pass.objective)}</h3>
                          <span>{compactLabel(pass.status)}</span>
                        </div>
                        <p>{meta?.detail || compactLabel(pass.objective)}</p>
                        <div className="research-pass-stats">
                          <span>{pass.query_count} queries</span>
                          <span>{pass.evidence_count} findings</span>
                          {pass.sufficient && (
                            <span className="is-sufficient">Sufficient</span>
                          )}
                        </div>
                        {passQueries.slice(0, 2).map((query) => (
                          <div className="research-query-line" key={query.id}>
                            <span>{query.evidence_family}</span>
                            <p>{query.query}</p>
                            {query.triggered_by_evidence_ids.length > 0 && (
                              <small>
                                Followed{" "}
                                {query.triggered_by_evidence_ids.length}{" "}
                                earlier finding{query.triggered_by_evidence_ids
                                    .length === 1
                                  ? ""
                                  : "s"}
                              </small>
                            )}
                          </div>
                        ))}
                        {pass.coverage_gaps.length > 0 && (
                          <p className="research-pass-gap">
                            <CircleAlert size={12} />{" "}
                            {pass.coverage_gaps.join("; ")}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )
            : (
              <p className="research-empty-state">
                No research pass has been persisted yet.
              </p>
            )}
        </aside>

        <main className="research-evidence-panel">
          <div className="research-panel-heading">
            <div>
              <span>LIVE EVIDENCE</span>
              <h2>What the system is finding</h2>
            </div>
            <span className="research-live-mark">
              <i /> streaming rows
            </span>
          </div>
          {evidence.length
            ? (
              <div className="research-evidence-feed">
                {evidence.slice(0, 10).map((item, index) => {
                  const source = asSource(item.sources);
                  const domain = domainFor(item);
                  return (
                    <article
                      key={item.id}
                      className={`${revealUpClass} ${
                        item.disconfirming ? "is-disconfirming" : ""
                      } ${item.excluded ? "is-excluded" : ""}`}
                      style={getStaggerDelay(index, 160, 18)}
                    >
                      <div className="evidence-feed-topline">
                        <div>
                          {item.research_pass && (
                            <span>Pass {item.research_pass}</span>
                          )}
                          {item.source_tier && (
                            <span className={`tier-${item.source_tier}`}>
                              Tier {item.source_tier}
                            </span>
                          )}
                          {item.evidence_family && (
                            <span>{item.evidence_family} space</span>
                          )}
                          {item.disconfirming && (
                            <span className="evidence-negative">
                              disconfirming
                            </span>
                          )}
                          {item.excluded && (
                            <span className="evidence-excluded">excluded</span>
                          )}
                        </div>
                        <time>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.snippet}</p>
                      <footer>
                        <div className="evidence-source-line">
                          <Globe2 size={12} />
                          {source?.url
                            ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {domain || source.title || "Open source"}
                              </a>
                            )
                            : (
                              <span>
                                {domain || source?.title || "Persisted source"}
                              </span>
                            )}
                        </div>
                        <div
                          className="corroboration-chip"
                          title={`${item.independent_domain_count} independent domains`}
                        >
                          <i
                            style={{
                              "--corroboration": Math.min(
                                item.independent_source_count,
                                5,
                              ),
                            } as CSSProperties}
                          />
                          <span>
                            {item.independent_source_count}{" "}
                            independent
                            source{item.independent_source_count === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )
            : (
              <p className="research-empty-state">
                No evidence row has been persisted yet.
              </p>
            )}
        </main>

        <aside className="research-verification-panel">
          <div className="research-panel-heading">
            <div>
              <span>CROSS-CHECK</span>
              <h2>Integrity desk</h2>
            </div>
            <ShieldCheck size={16} />
          </div>

          {clusters.length > 0 && (
            <section className="corroboration-board">
              <h3>Corroborated pain points</h3>
              {clusters.map((cluster) => (
                <article key={cluster.label}>
                  <div>
                    <p>{cluster.label}</p>
                    <b>{cluster.sources}x</b>
                  </div>
                  <span>
                    <i
                      style={{
                        width: `${Math.min(cluster.sources / 5, 1) * 100}%`,
                      }}
                    />
                  </span>
                  <small>
                    {cluster.domains}{" "}
                    independent domain{cluster.domains === 1 ? "" : "s"}
                  </small>
                </article>
              ))}
            </section>
          )}

          {checks.length > 0 && (
            <section className="checker-board">
              <div>
                <h3>Independent re-derivations</h3>
                <span className={disputedCount ? "has-dispute" : ""}>
                  {disputedCount} disputed
                </span>
              </div>
              {checks.map((check) => (
                <article
                  key={check.id}
                  className={check.disputed ? "is-disputed" : ""}
                >
                  {check.disputed
                    ? <CircleAlert size={13} />
                    : <Check size={13} />}
                  <div>
                    <b>{compactLabel(check.specialist_name)}</b>
                    <small>
                      {check.disputed
                        ? check.dispute_reason
                        : compactLabel(check.checker_direction)}
                    </small>
                  </div>
                </article>
              ))}
            </section>
          )}

          {gate && (
            <section
              className={`adversarial-card ${
                gate.unresolved ? "is-unresolved" : "is-cleared"
              }`}
            >
              <div>
                <ShieldAlert size={15} />
                <span>ADVERSARIAL GATE</span>
              </div>
              <h3>{compactLabel(gate.outcome)}</h3>
              <p>{gate.objection}</p>
              <footer>
                <span>{gate.severity} severity</span>
                <span>
                  {gate.evidence_ids.length}{" "}
                  cited item{gate.evidence_ids.length === 1 ? "" : "s"}
                </span>
              </footer>
            </section>
          )}

          {citation && (
            <section
              className={`citation-card ${
                citation.valid ? "is-valid" : "is-invalid"
              }`}
            >
              <FileCheck2 size={16} />
              <div>
                <h3>
                  {citation.valid
                    ? "Citations resolved"
                    : "Citation issues found"}
                </h3>
                <p>
                  {citation.claims_checked} claims checked ·{" "}
                  {citation.claims_removed} removed
                </p>
              </div>
            </section>
          )}

          {!clusters.length && !checks.length && !gate && !citation && (
            <p className="research-empty-state">
              Integrity records will appear here only after they are persisted.
            </p>
          )}
        </aside>
      </div>

      {logs.length > 0 && (
        <section className="research-ledger">
          <div className="research-panel-heading">
            <div>
              <span>ACTIVITY</span>
              <h2>Run ledger</h2>
            </div>
            <span>{logs.length} events</span>
          </div>
          <div className="research-ledger-lines">
            {logs.slice(-8).map((log) => (
              <article key={log.id}>
                <time>{new Date(log.created_at).toLocaleTimeString()}</time>
                <i />
                <p>
                  {log.error_message || log.progress_detail ||
                    compactLabel(log.stage_name)}
                </p>
              </article>
            ))}
            {isRunning && (
              <article className="is-live">
                <time>now</time>
                <i />
                <p>Waiting for the next persisted event</p>
              </article>
            )}
          </div>
        </section>
      )}

      {(state.stage === "Failed" || connectionError) && (
        <div className="progress-error" role="alert">
          <p>{productCopy.microcopy.error} {state.stage === "Failed" ? state.message : connectionError}</p>
          {state.stage === "Failed" && <b>{state.creditState === "restored" ? "The reserved credit was restored automatically." : "Credit restoration is being verified. Contact support if this status does not update."}</b>}
          <button type="button" onClick={() => router.push(`/research/new?mode=${state.mode}&retryFrom=${id}`)}>Retry with the same brief</button>
        </div>
      )}
      {state.stage === "Cancelled" && (
        <div className="progress-error is-cancelled" role="status">
          <p>This {config.label} was cancelled before completion.</p>
          <b>{state.creditState === "restored" ? "The reserved credit was restored." : "Credit restoration is being verified."}</b>
          <button type="button" onClick={() => router.push(`/research/new?mode=${state.mode}&retryFrom=${id}`)}>Start again with the same brief</button>
        </div>
      )}
    </div>
  );
}
