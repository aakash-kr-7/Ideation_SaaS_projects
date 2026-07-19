import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { startResearchRunSchema } from "@/lib/report-schema";
import { getReportModeConfig } from "@/lib/report-modes";
import { ResearchRepository } from "@/lib/repositories/research";

const reservationResultSchema = z.object({
  run_id: z.string().uuid(), run_status: z.string(), report_mode: z.enum(["quick_scan", "full_validation"]),
  credit_cost: z.number().int(), credit_source: z.enum(["free_monthly", "paid"]), available_paid_credits: z.number().int().nonnegative(),
  free_quick_scans_remaining: z.number().int().min(0).max(1), duplicate: z.boolean(),
});
const creditSnapshotSchema = z.object({
  team_id: z.string().uuid(), paid_credits: z.number().int().nonnegative(), reserved_paid_credits: z.number().int().nonnegative(),
  free_quick_scans_remaining: z.number().int().min(0).max(1), quick_scans_available: z.number().int().nonnegative(),
  full_validations_available: z.number().int().nonnegative(), free_cycle_started_at: z.string(),
});

export class ResearchLaunchError extends Error {
  constructor(readonly code: string, message: string, readonly requestId: string, readonly status = 500) { super(message); this.name = "ResearchLaunchError"; }
}

function firstRow(value: unknown) { return Array.isArray(value) ? value[0] : value; }
function databaseError(error: { message?: string } | null, requestId: string) {
  const message = error?.message || "Unable to reserve this report.";
  if (message.includes("INSUFFICIENT_CREDITS")) return new ResearchLaunchError("INSUFFICIENT_CREDITS", "You do not have enough credits for this report.", requestId, 402);
  if (message.includes("PROJECT_ACCESS_DENIED")) return new ResearchLaunchError("PROJECT_ACCESS_DENIED", "This project is not available to your team.", requestId, 403);
  return new ResearchLaunchError("RESERVATION_FAILED", message, requestId);
}

export const ResearchService = {
  async startResearchRun(input: z.infer<typeof startResearchRunSchema>) {
    const validated = startResearchRunSchema.parse(input);
    const config = getReportModeConfig(validated.mode);
    const requestId = crypto.randomUUID();
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new ResearchLaunchError("AUTHENTICATION_REQUIRED", "Sign in to start a report.", requestId, 401);

    const { data, error } = await supabase.rpc("create_research_run_with_reservation", {
      p_project_id: validated.project_id, p_idea_name: validated.idea_name, p_idea_description: validated.idea_description,
      p_target_customer: validated.target_customer, p_market_type: validated.market_type, p_target_region: validated.target_region,
      p_assumptions: validated.assumptions, p_mode: validated.mode, p_idempotency_key: validated.idempotency_key, p_request_id: requestId,
    });
    if (error) throw databaseError(error, requestId);
    const reservation = reservationResultSchema.parse(firstRow(data));
    const workerSecret = process.env.WEBHOOK_SECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!workerSecret || !supabaseUrl) {
      await supabase.rpc("fail_queued_research_dispatch", { p_run_id: reservation.run_id, p_error_message: "Research worker dispatch is not configured." });
      throw new ResearchLaunchError("WORKER_NOT_CONFIGURED", "Research processing is temporarily unavailable. Your reserved credit was restored.", requestId, 503);
    }

    // Canonical path: reservation RPC -> staged queue job -> authenticated worker wake-up.
    const { error: updateError } = await supabase.from("research_runs").update({ max_jobs_per_run: config.maxJobsPerRun } as never).eq("id", reservation.run_id);
    if (updateError) {
      await supabase.rpc("fail_queued_research_dispatch", { p_run_id: reservation.run_id, p_error_message: `Pipeline initialization failed: ${updateError.message}` });
      throw new ResearchLaunchError("PIPELINE_INITIALIZATION_FAILED", "Research processing could not start. Your reserved credit was restored.", requestId, 503);
    }
    const enqueue = supabase.rpc as unknown as (name: string, params: unknown) => Promise<{ error: { message: string } | null }>;
    const { error: enqueueError } = await enqueue("enqueue_research_job", {
      p_run_id: reservation.run_id, p_stage: "plan_research", p_input_meta: { mode: validated.mode }, p_stage_iteration: 0,
      p_batch_index: 0, p_batch_size: 0, p_job_purpose: "stage", p_parent_job_id: null, p_max_attempts: 3, p_visible_after: new Date().toISOString(),
    });
    if (enqueueError) {
      await supabase.rpc("fail_queued_research_dispatch", { p_run_id: reservation.run_id, p_error_message: `Job enqueue failed: ${enqueueError.message}` });
      throw new ResearchLaunchError("JOB_ENQUEUE_FAILED", "Research processing could not start. Your reserved credit was restored.", requestId, 503);
    }
    fetch(`${supabaseUrl}/functions/v1/research-worker`, {
      method: "POST", headers: { Authorization: `Bearer ${workerSecret}`, "Content-Type": "application/json", "X-Request-ID": requestId },
      body: JSON.stringify({ trigger: "self", source: "service_enqueue" }),
    }).catch(() => undefined);

    console.info(JSON.stringify({ event: "research_run_dispatched", requestId, runId: reservation.run_id, userId: user.id, reportMode: validated.mode, reportLabel: config.label, creditCost: reservation.credit_cost, creditSource: reservation.credit_source, duplicate: reservation.duplicate, pipelineVersion: "staged" }));
    return { id: reservation.run_id, status: reservation.run_status, mode: reservation.report_mode, creditCost: reservation.credit_cost, requestId, duplicate: reservation.duplicate };
  },

  async getCreditSnapshot() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.rpc("get_team_credit_snapshot");
    if (error) throw error;
    return creditSnapshotSchema.parse(firstRow(data));
  },

  async getResearchRuns(projectId: string) { return ResearchRepository.getProjectRuns(projectId); },
};

export type CreditSnapshot = z.infer<typeof creditSnapshotSchema>;
