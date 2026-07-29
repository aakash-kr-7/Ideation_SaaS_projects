"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, RefreshCw, Save, ShieldCheck } from "lucide-react";

type RefreshState = {
  schedule: {
    enabled: boolean;
    cadenceDays: number;
    nextRefreshAt: string | null;
    lastRefreshStatus: string | null;
  };
  latestRequest: {
    status: string;
    error_message?: string | null;
    created_at: string;
  } | null;
  runs: Array<{
    id: string;
    status: string;
    sources_checked: number;
    successful_no_change_checks: number;
    material_changes: number;
    created_version_id: string | null;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>;
};

type Checkpoint = {
  id: string;
  opted_in: boolean;
  checkpoint_day: 30 | 90 | 180;
  checkpoint_due_at: string;
  interviews_completed: number | null;
  paid_commitments: number | null;
  mvp_launched: boolean | null;
  first_revenue: boolean | null;
  retained_customers: number | null;
  declared_milestone_reached: boolean | null;
  idea_abandoned: boolean | null;
  abandonment_reason: string | null;
  submitted_at: string | null;
};

const emptyRefresh: RefreshState = {
  schedule: {
    enabled: false,
    cadenceDays: 1,
    nextRefreshAt: null,
    lastRefreshStatus: null,
  },
  latestRequest: null,
  runs: [],
};

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function optionalBoolean(value: FormDataEntryValue | null) {
  return value === "yes" ? true : value === "no" ? false : null;
}

export function LivingReportControls(props: {
  runId: string;
  currentAsOf?: string;
  staleEvidenceWarning?: string | null;
}) {
  const [refresh, setRefresh] = useState<RefreshState>(emptyRefresh);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [refreshResponse, outcomeResponse] = await Promise.all([
      fetch(`/api/research/${props.runId}/refresh`, { cache: "no-store" }),
      fetch(`/api/research/${props.runId}/outcomes`, { cache: "no-store" }),
    ]);
    if (refreshResponse.ok) setRefresh(await refreshResponse.json());
    if (outcomeResponse.ok) {
      const body = await outcomeResponse.json();
      setCheckpoints(body.checkpoints ?? []);
    }
  }, [props.runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!["pending", "running"].includes(refresh.latestRequest?.status ?? "")) {
      return;
    }
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [load, refresh.latestRequest?.status]);

  async function command(path: "refresh" | "outcomes", body: object) {
    const response = await fetch(`/api/research/${props.runId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The request failed.");
    return result;
  }

  async function queueRefresh() {
    setBusy("refresh");
    setMessage("");
    try {
      const result = await command("refresh", { action: "refresh_now" });
      setMessage(result.message || "Refresh queued.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function setSchedule(enabled: boolean) {
    setBusy("schedule");
    setMessage("");
    try {
      await command("refresh", {
        action: "set_schedule",
        enabled,
        cadenceDays: refresh.schedule.cadenceDays,
      });
      await load();
      setMessage(enabled
        ? "Automatic freshness checks enabled."
        : "Automatic freshness checks disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function optIn() {
    setBusy("outcomes");
    try {
      const result = await command("outcomes", { action: "opt_in" });
      setCheckpoints(result.checkpoints ?? []);
      setMessage("Optional outcome checkpoints enabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function saveCheckpoint(
    checkpoint: Checkpoint,
    form: HTMLFormElement,
  ) {
    setBusy(`checkpoint-${checkpoint.checkpoint_day}`);
    const data = new FormData(form);
    const number = (key: string) => {
      const raw = String(data.get(key) ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    try {
      const result = await command("outcomes", {
        action: "submit",
        checkpointDay: checkpoint.checkpoint_day,
        interviewsCompleted: number("interviews"),
        paidCommitments: number("commitments"),
        mvpLaunched: optionalBoolean(data.get("mvp")),
        firstRevenue: optionalBoolean(data.get("revenue")),
        retainedCustomers: number("retained"),
        declaredMilestoneReached: optionalBoolean(data.get("milestone")),
        ideaAbandoned: optionalBoolean(data.get("abandoned")),
        abandonmentReason: String(data.get("reason") ?? "").trim() || null,
      });
      setCheckpoints(result.checkpoints ?? []);
      setMessage(`Day ${checkpoint.checkpoint_day} checkpoint saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  const latestRun = refresh.runs[0];
  const optedIn = checkpoints.some((item) => item.opted_in);
  return (
    <section className="living-report-controls" aria-label="Living report controls">
      <header>
        <div>
          <span>Living report</span>
          <h2>Evidence freshness and founder outcomes</h2>
          <p>
            Checks are limited to cited or decision-critical pages. Outcome
            checkpoints are optional and do not change the ShouldBuild score.
          </p>
        </div>
        <ShieldCheck size={25} />
      </header>

      {message && <p className="living-report-message" role="status">{message}</p>}

      <div className="living-report-grid">
        <article>
          <div className="living-report-heading">
            <RefreshCw size={18} />
            <div>
              <h3>Refresh evidence</h3>
              <p>Current as of {date(props.currentAsOf ?? null)}</p>
            </div>
          </div>
          {props.staleEvidenceWarning &&
            <p className="living-report-warning">{props.staleEvidenceWarning}</p>}
          <dl>
            <div><dt>Automatic checks</dt><dd>{refresh.schedule.enabled ? "On" : "Off"}</dd></div>
            <div><dt>Next check</dt><dd>{date(refresh.schedule.nextRefreshAt)}</dd></div>
            <div><dt>Latest result</dt><dd>{latestRun?.status ?? "No checks yet"}</dd></div>
            <div><dt>Sources checked</dt><dd>{latestRun?.sources_checked ?? 0}</dd></div>
          </dl>
          <div className="living-report-actions">
            <button
              type="button"
              onClick={queueRefresh}
              disabled={Boolean(busy)}
            >
              <RefreshCw size={14} /> {busy === "refresh" ? "Queuing…" : "Check now"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSchedule(!refresh.schedule.enabled)}
              disabled={Boolean(busy)}
            >
              {refresh.schedule.enabled ? "Turn off daily checks" : "Enable daily checks"}
            </button>
          </div>
          {refresh.latestRequest?.status &&
            <small>Refresh request: {refresh.latestRequest.status}</small>}
        </article>

        <article>
          <div className="living-report-heading">
            <BellRing size={18} />
            <div>
              <h3>Outcome checkpoints</h3>
              <p>Optional reminders at 30, 90 and 180 days</p>
            </div>
          </div>
          {!optedIn
            ? <>
              <p>
                Store real founder outcomes for future score calibration. These
                fields are excluded from current scoring.
              </p>
              <button type="button" onClick={optIn} disabled={Boolean(busy)}>
                <BellRing size={14} /> Enable checkpoints
              </button>
            </>
            : <div className="outcome-checkpoints">
              {checkpoints.filter((item) => item.opted_in).map((checkpoint) => {
                const due = new Date(checkpoint.checkpoint_due_at).getTime() <= Date.now();
                return (
                  <details key={checkpoint.id} open={due && !checkpoint.submitted_at}>
                    <summary>
                      <b>Day {checkpoint.checkpoint_day}</b>
                      <span>
                        {checkpoint.submitted_at
                          ? `Saved ${date(checkpoint.submitted_at)}`
                          : due ? "Due now" : `Due ${date(checkpoint.checkpoint_due_at)}`}
                      </span>
                    </summary>
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      void saveCheckpoint(checkpoint, event.currentTarget);
                    }}>
                      <label>Interviews completed<input name="interviews" type="number" min="0" defaultValue={checkpoint.interviews_completed ?? ""} /></label>
                      <label>Paid commitments<input name="commitments" type="number" min="0" defaultValue={checkpoint.paid_commitments ?? ""} /></label>
                      <label>Retained customers<input name="retained" type="number" min="0" defaultValue={checkpoint.retained_customers ?? ""} /></label>
                      <label>MVP launched<select name="mvp" defaultValue={checkpoint.mvp_launched == null ? "" : checkpoint.mvp_launched ? "yes" : "no"}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                      <label>First revenue<select name="revenue" defaultValue={checkpoint.first_revenue == null ? "" : checkpoint.first_revenue ? "yes" : "no"}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                      <label>Milestone reached<select name="milestone" defaultValue={checkpoint.declared_milestone_reached == null ? "" : checkpoint.declared_milestone_reached ? "yes" : "no"}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                      <label>Idea abandoned<select name="abandoned" defaultValue={checkpoint.idea_abandoned == null ? "" : checkpoint.idea_abandoned ? "yes" : "no"}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                      <label className="wide">Abandonment reason, if applicable<textarea name="reason" defaultValue={checkpoint.abandonment_reason ?? ""} /></label>
                      <button type="submit" disabled={Boolean(busy)}>
                        <Save size={14} /> {busy === `checkpoint-${checkpoint.checkpoint_day}` ? "Saving…" : "Save checkpoint"}
                      </button>
                    </form>
                  </details>
                );
              })}
            </div>}
        </article>
      </div>
    </section>
  );
}
