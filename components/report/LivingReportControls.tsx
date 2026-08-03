"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";

type RefreshState = {
  schedule: { enabled: boolean; cadenceDays: number; nextRefreshAt: string | null; lastRefreshStatus: string | null };
  latestRequest: { status: string; error_message?: string | null; created_at: string } | null;
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

const EMPTY_REFRESH: RefreshState = {
  schedule: { enabled: false, cadenceDays: 1, nextRefreshAt: null, lastRefreshStatus: null },
  latestRequest: null,
  runs: [],
};

const fieldClass = "min-h-10 w-full rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 px-sb-3 py-sb-2 text-sm text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus";

function date(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function optionalBoolean(value: FormDataEntryValue | null) {
  return value === "yes" ? true : value === "no" ? false : null;
}

export function LivingReportControls({ runId, currentAsOf, staleEvidenceWarning }: { runId: string; currentAsOf?: string; staleEvidenceWarning?: string | null }) {
  const [refresh, setRefresh] = useState<RefreshState>(EMPTY_REFRESH);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [refreshResponse, outcomeResponse] = await Promise.all([
      fetch(`/api/research/${runId}/refresh`, { cache: "no-store" }),
      fetch(`/api/research/${runId}/outcomes`, { cache: "no-store" }),
    ]);
    if (refreshResponse.ok) setRefresh(await refreshResponse.json());
    if (outcomeResponse.ok) {
      const body = await outcomeResponse.json();
      setCheckpoints(body.checkpoints ?? []);
    }
  }, [runId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!["pending", "running"].includes(refresh.latestRequest?.status ?? "")) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [load, refresh.latestRequest?.status]);

  async function command(path: "refresh" | "outcomes", body: object) {
    const response = await fetch(`/api/research/${runId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The request did not complete.");
    return result;
  }

  async function queueRefresh() {
    setBusy("refresh");
    setMessage("");
    try {
      const result = await command("refresh", { action: "refresh_now" });
      setMessage(result.message || "An evidence recheck was queued.");
      await load();
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : String(error)} Recheck the evidence when the service is available.`);
    } finally {
      setBusy("");
    }
  }

  async function setSchedule(enabled: boolean) {
    setBusy("schedule");
    setMessage("");
    try {
      await command("refresh", { action: "set_schedule", enabled, cadenceDays: refresh.schedule.cadenceDays });
      await load();
      setMessage(enabled ? "Automatic evidence checks are enabled." : "Automatic evidence checks are disabled. Recheck manually when needed.");
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : String(error)} The current schedule was not changed.`);
    } finally {
      setBusy("");
    }
  }

  async function optIn() {
    setBusy("outcomes");
    setMessage("");
    try {
      const result = await command("outcomes", { action: "opt_in" });
      setCheckpoints(result.checkpoints ?? []);
      setMessage("Optional founder outcome checkpoints are enabled.");
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : String(error)} Outcome checkpoints remain unchanged.`);
    } finally {
      setBusy("");
    }
  }

  async function saveCheckpoint(checkpoint: Checkpoint, form: HTMLFormElement) {
    setBusy(`checkpoint-${checkpoint.checkpoint_day}`);
    setMessage("");
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
      setMessage(`Day ${checkpoint.checkpoint_day} outcome checkpoint was saved.`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : String(error)} Review the checkpoint and save it again.`);
    } finally {
      setBusy("");
    }
  }

  const latestRun = refresh.runs[0];
  const optedIn = checkpoints.some((item) => item.opted_in);
  const freshnessLine = staleEvidenceWarning
    ?? (latestRun
      ? `${latestRun.sources_checked} sources checked; ${latestRun.material_changes} material change${latestRun.material_changes === 1 ? "" : "s"} recorded.`
      : `Evidence is current as of ${date(currentAsOf)}. No later revalidation check is recorded.`);

  return (
    <footer className="fv-section" aria-label="Living report freshness">
      <Card className="grid gap-sb-4 p-sb-4 sm:p-sb-5">
        <div className="flex flex-col gap-sb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Living report</p>
            <p className="mb-0 mt-sb-1 text-sm leading-relaxed text-sb-text-secondary">{freshnessLine}</p>
          </div>
          <dl className="m-0 flex flex-wrap gap-x-sb-6 gap-y-sb-2 text-xs">
            <div><dt className="text-sb-text-tertiary">Current as of</dt><dd className="m-0 font-sb-mono tabular-nums text-sb-text-secondary">{date(currentAsOf)}</dd></div>
            <div><dt className="text-sb-text-tertiary">Next check</dt><dd className="m-0 font-sb-mono tabular-nums text-sb-text-secondary">{date(refresh.schedule.nextRefreshAt)}</dd></div>
            <div><dt className="text-sb-text-tertiary">Latest status</dt><dd className="m-0 text-sb-text-secondary">{latestRun?.status ?? refresh.schedule.lastRefreshStatus ?? "No check recorded"}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-sb-2">
            <Button variant="secondary" className="min-h-9 px-sb-3 text-xs" disabled={Boolean(busy)} onClick={() => void queueRefresh()}>{busy === "refresh" ? "Queuing…" : "Recheck evidence"}</Button>
            <Button variant="ghost" className="min-h-9 px-sb-3 text-xs" disabled={Boolean(busy)} onClick={() => void setSchedule(!refresh.schedule.enabled)}>{refresh.schedule.enabled ? "Disable automatic checks" : "Enable automatic checks"}</Button>
          </div>
        </div>

        {message && <p className="m-0 border-t border-sb-border-hairline pt-sb-3 text-xs leading-relaxed text-sb-text-secondary" role="status">{message}</p>}
        {refresh.latestRequest?.status && <p className="m-0 text-xs text-sb-text-tertiary">Revalidation request: {refresh.latestRequest.status}</p>}

        <Disclosure
          className="border-t border-sb-border-hairline pt-sb-3 text-sm"
          buttonClassName="w-fit text-xs text-sb-text-tertiary hover:text-sb-text-primary"
          panelClassName="pt-sb-4"
          summary="Optional founder outcome checkpoints"
        >
          <div className="grid gap-sb-4">
            {!optedIn ? (
              <div className="flex flex-col gap-sb-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Store 30, 90, and 180 day outcomes for future calibration. These fields do not change this report score.</p>
                <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void optIn()}>Enable checkpoints</Button>
              </div>
            ) : checkpoints.filter((item) => item.opted_in).map((checkpoint) => (
              <Disclosure
                className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-4"
                buttonClassName="flex w-full items-center justify-between gap-sb-3"
                panelClassName="pt-sb-4"
                key={checkpoint.id}
                summary={(
                  <>
                  <b className="text-sm font-medium">Day {checkpoint.checkpoint_day}</b>
                  <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{checkpoint.submitted_at ? `Saved ${date(checkpoint.submitted_at)}` : `Due ${date(checkpoint.checkpoint_due_at)}`}</span>
                  </>
                )}
              >
                <form className="grid gap-sb-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void saveCheckpoint(checkpoint, event.currentTarget); }}>
                  <CheckpointNumber label="Interviews completed" name="interviews" value={checkpoint.interviews_completed}/>
                  <CheckpointNumber label="Paid commitments" name="commitments" value={checkpoint.paid_commitments}/>
                  <CheckpointNumber label="Retained customers" name="retained" value={checkpoint.retained_customers}/>
                  <CheckpointSelect label="MVP launched" name="mvp" value={checkpoint.mvp_launched}/>
                  <CheckpointSelect label="First revenue" name="revenue" value={checkpoint.first_revenue}/>
                  <CheckpointSelect label="Milestone reached" name="milestone" value={checkpoint.declared_milestone_reached}/>
                  <CheckpointSelect label="Idea abandoned" name="abandoned" value={checkpoint.idea_abandoned}/>
                  <label className="grid gap-sb-1 text-xs text-sb-text-secondary sm:col-span-2"><span>Abandonment reason, if applicable</span><Input name="reason" defaultValue={checkpoint.abandonment_reason ?? ""}/></label>
                  <div className="flex items-end"><Button variant="secondary" type="submit" disabled={Boolean(busy)}>{busy === `checkpoint-${checkpoint.checkpoint_day}` ? "Saving…" : "Save checkpoint"}</Button></div>
                </form>
              </Disclosure>
            ))}
          </div>
        </Disclosure>
      </Card>
    </footer>
  );
}

function CheckpointNumber({ label, name, value }: { label: string; name: string; value: number | null }) {
  return <label className="grid gap-sb-1 text-xs text-sb-text-secondary"><span>{label}</span><Input name={name} type="number" min="0" defaultValue={value ?? ""}/></label>;
}

function CheckpointSelect({ label, name, value }: { label: string; name: string; value: boolean | null }) {
  return (
    <label className="grid gap-sb-1 text-xs text-sb-text-secondary">
      <span>{label}</span>
      <select className={fieldClass} name={name} defaultValue={value == null ? "" : value ? "yes" : "no"}>
        <option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    </label>
  );
}
