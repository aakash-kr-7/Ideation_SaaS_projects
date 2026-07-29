import type { GeminiQuotaDetails } from "./gemini.ts";

export const QUICK_SCAN_PACK_KEYS = [
  "quick_primary_problem_buyer_demand",
  "quick_adversarial",
  "quick_pricing_wtp_reachability",
  "quick_coverage_repair",
] as const;

export type QuickScanPackKey = (typeof QUICK_SCAN_PACK_KEYS)[number];
export type ResearchPackStatus =
  | "completed"
  | "completed_no_evidence"
  | "quota_blocked"
  | "provider_failed"
  | "timed_out"
  | "skipped";

export type QuickScanResearchOutcome =
  | "research_completed"
  | "insufficient_evidence"
  | "research_unavailable";

export function classifyPackFailure(
  error: unknown,
  quota: GeminiQuotaDetails | null,
): Extract<ResearchPackStatus, "quota_blocked" | "provider_failed" | "timed_out"> {
  if (quota) return "quota_blocked";
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|aborterror/i.test(message) ? "timed_out" : "provider_failed";
}

export function researchUnavailableMessage(status: ResearchPackStatus): string {
  const reason = status === "quota_blocked"
    ? "The grounded research provider has reached its current quota."
    : status === "timed_out"
    ? "The mandatory grounded research request timed out."
    : "The mandatory grounded research provider could not complete the request.";
  return `RESEARCH_UNAVAILABLE: ${reason} No market verdict was produced and the reserved credit was restored. Please retry when research is available.`;
}

export async function initializeQuickScanPackStatuses(db: any, runId: string) {
  await db.from("quick_scan_research_pack_statuses").upsert(
    QUICK_SCAN_PACK_KEYS.map((packKey) => ({
      run_id: runId,
      pack_key: packKey,
      status: "skipped",
      accepted_evidence_count: 0,
      failure_reason: null,
      started_at: null,
      completed_at: null,
      metadata: {},
    })),
    { onConflict: "run_id,pack_key" },
  );
}

export async function persistQuickScanPackStatus(
  db: any,
  input: {
    runId: string;
    packKey: QuickScanPackKey | string;
    status: ResearchPackStatus;
    acceptedEvidenceCount?: number;
    failureReason?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.from("quick_scan_research_pack_statuses").upsert({
    run_id: input.runId,
    pack_key: input.packKey,
    status: input.status,
    accepted_evidence_count: input.acceptedEvidenceCount || 0,
    failure_reason: input.failureReason || null,
    started_at: input.startedAt || null,
    completed_at: input.completedAt ||
      (input.status === "skipped" ? null : new Date().toISOString()),
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "run_id,pack_key" });
}

export async function knownDailyGroundingQuotaFailure(db: any): Promise<boolean> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from("research_call_metrics")
    .select("metadata")
    .eq("provider", "gemini")
    .eq("grounded", true)
    .eq("quota_failure", true)
    .gte("created_at", start.toISOString())
    .limit(20);
  return (data || []).some((row: any) =>
    row?.metadata?.dailyExhausted === true
  );
}

export function packOutcome(
  acceptedEvidenceCount: number,
): Extract<ResearchPackStatus, "completed" | "completed_no_evidence"> {
  return acceptedEvidenceCount > 0 ? "completed" : "completed_no_evidence";
}
