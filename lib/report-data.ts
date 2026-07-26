import "server-only";
import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { scorecardSchema, validationReportSchema, type ValidationReport } from "@/lib/report-schema";
import type { OpportunityScorecard } from "@/lib/types";
import { scoringCriteria } from "@/lib/scoring";
import { firstRecord, recordArray } from "@/lib/supabase/relations";
import type { ReportChartDataset } from "@/components/report/ReportCharts";

export type StoredExportFormat = "json" | "markdown" | "csv" | "pdf";
export type StoredExport = { format: StoredExportFormat; storagePath: string; byteSize: number };
export type LoadedReport = { report: ValidationReport; exports: StoredExport[]; chartDatasets: ReportChartDataset[] };
export type ReportLoadResult =
  | { state: "ready"; value: LoadedReport }
  | { state: "access_denied" }
  | { state: "pending"; reason: string };
export type CompletedScorecard = { id: string; name: string; scorecard: OpportunityScorecard };

const reportSelect = `
  id, run_id, executive_summary, methodology, generated_at,
  report_versions(id, version_number, report_mode, payload, report_exports(format, storage_path, byte_size), report_chart_datasets(chart_key, chart_type, source_data, chart_config, supporting_evidence_ids))
`;

const exportRowSchema = z.object({
  format: z.enum(["json", "markdown", "csv", "pdf"]),
  storage_path: z.string(),
  byte_size: z.coerce.number(),
});
const reportVersionSchema = z.object({
  version_number: z.coerce.number(),
  payload: z.unknown(),
  report_exports: z.preprocess(recordArray, z.array(exportRowSchema)),
  report_chart_datasets: z.preprocess(recordArray, z.array(z.object({
    chart_key: z.string(), chart_type: z.string(), source_data: z.record(z.string(), z.unknown()),
    chart_config: z.record(z.string(), z.unknown()), supporting_evidence_ids: z.array(z.string()),
  }))),
});
const reportRowSchema = z.object({
  run_id: z.string(),
  report_versions: z.preprocess(recordArray, z.array(reportVersionSchema)),
});
const scoreEvidenceSchema = z.object({ evidence_id: z.string() });
const breakdownSchema = z.object({
  criterion: z.string(),
  score: z.coerce.number(),
  notes: z.string(),
  weight: z.coerce.number(),
  evidence: z.preprocess(recordArray, z.array(scoreEvidenceSchema)),
});
const normalizedScoreSchema = z.object({
  total: z.coerce.number(),
  confidence: z.coerce.number(),
  verdict: z.string(),
  breakdowns: z.preprocess(recordArray, z.array(breakdownSchema)),
});
const scoreQueryRowSchema = z.object({
  run_id: z.string(),
  opportunity: z.preprocess(firstRecord, z.object({
    name: z.string(),
    scorecard: z.preprocess(firstRecord, normalizedScoreSchema),
  })),
});

function mapScorecard(input: unknown, runId: string): OpportunityScorecard {
  const score = normalizedScoreSchema.parse(input);
  const byCriterion = new Map(score.breakdowns.map((item) => [item.criterion, item]));
  for (const criterion of scoringCriteria) {
    if (!byCriterion.has(criterion.key)) throw new Error(`Completed report ${runId} is missing score breakdown ${criterion.key}.`);
  }
  return scorecardSchema.parse({
    scores: Object.fromEntries(scoringCriteria.map(({ key }) => [key, byCriterion.get(key)?.score])),
    notes: Object.fromEntries(scoringCriteria.map(({ key }) => [key, byCriterion.get(key)?.notes])),
    evidenceRefs: Object.fromEntries(scoringCriteria.map(({ key }) => [key, byCriterion.get(key)?.evidence.map((ref) => ref.evidence_id)])),
    weights: Object.fromEntries(scoringCriteria.map(({ key }) => [key, byCriterion.get(key)?.weight])),
    total: score.total,
    confidence: score.confidence,
    verdict: score.verdict,
  });
}

function mapReport(input: unknown): LoadedReport {
  const row = reportRowSchema.parse(input);
  const latestVersion = [...row.report_versions].sort((a, b) => b.version_number - a.version_number)[0];
  if (!latestVersion) throw new Error(`Completed report ${row.run_id} has no immutable report version.`);
  const parsed = validationReportSchema.safeParse(latestVersion.payload);
  if (!parsed.success) throw new Error(`Completed report ${row.run_id} failed payload validation: ${parsed.error.message}`);
  return {
    report: parsed.data,
    exports: latestVersion.report_exports.map((item) => ({ format: item.format, storagePath: item.storage_path, byteSize: item.byte_size })),
    chartDatasets: latestVersion.report_chart_datasets.map((item) => ({
      chartKey: item.chart_key, chartType: item.chart_type, sourceData: item.source_data,
      chartConfig: item.chart_config, supportingEvidenceIds: item.supporting_evidence_ids,
    })),
  };
}

const ownedReportRpcSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("access_denied") }),
  z.object({
    state: z.literal("pending"),
    reason: z.string().default("report_consistency_delay"),
    runStatus: z.string().optional(),
  }),
  z.object({
    state: z.literal("ready"),
    runId: z.string(),
    payload: z.unknown(),
    exports: z.array(exportRowSchema).default([]),
    charts: z.array(z.object({
      chart_key: z.string(),
      chart_type: z.string(),
      source_data: z.record(z.string(), z.unknown()),
      chart_config: z.record(z.string(), z.unknown()),
      supporting_evidence_ids: z.array(z.string()),
    })).default([]),
  }),
]);

export function parseOwnedReportRpc(input: unknown): ReportLoadResult {
  const result = ownedReportRpcSchema.parse(input);
  if (result.state !== "ready") return result;
  const report = validationReportSchema.parse(result.payload);
  return {
    state: "ready",
    value: {
      report,
      exports: result.exports.map((item) => ({
        format: item.format,
        storagePath: item.storage_path,
        byteSize: item.byte_size,
      })),
      chartDatasets: result.charts.map((item) => ({
        chartKey: item.chart_key,
        chartType: item.chart_type,
        sourceData: item.source_data,
        chartConfig: item.chart_config,
        supportingEvidenceIds: item.supporting_evidence_ids,
      })),
    },
  };
}

export async function loadReportForRun(runId: string): Promise<ReportLoadResult> {
  const deny = (reason: string) => {
    console.warn(JSON.stringify({ event: "report_access_denied", runId, reason }));
    return { state: "access_denied" as const };
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: refreshed } = user
    ? { data: { session: null } }
    : await supabase.auth.refreshSession();
  // Middleware supplies this only after authenticating the request and removes
  // any client-provided value. It bridges the response where an expired access
  // token is refreshed but the server component still sees the original cookie.
  const authenticatedUserId = user?.id
    ?? refreshed.session?.user.id
    ?? (await headers()).get("x-shouldbuild-user-id");
  if (!authenticatedUserId) return deny("missing_authenticated_user");
  const admin = createServiceRoleClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    name: string,
    params: Record<string, string>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  // The SECURITY DEFINER RPC proves ownership and resolves the canonical latest
  // immutable version in one PostgreSQL snapshot. It intentionally returns the
  // same access-denied state for unknown and cross-tenant run IDs.
  const delays = [0, 150, 300, 600, 1_200, 2_400];
  let lastPending: ReportLoadResult = { state: "pending", reason: "report_consistency_delay" };
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const { data, error } = await rpc("get_owned_latest_report", {
      p_run_id: runId,
      p_user_id: authenticatedUserId,
    });
    if (error) throw error;
    const parsed = parseOwnedReportRpc(data);
    if (parsed.state === "ready") return parsed;
    if (parsed.state === "access_denied") return deny("ownership_not_proved");
    lastPending = parsed;
    // A pending result has already proved tenant ownership inside the
    // SECURITY DEFINER function. In some PostgREST connection-pool snapshots,
    // that function can briefly miss a relation row that a fresh direct
    // service-role statement sees. Resolve the same canonical immutable
    // version on a new no-store statement without ever widening tenant scope.
    const { data: directlyVisible, error: directError } = await admin
      .from("reports")
      .select(reportSelect)
      .eq("run_id", runId)
      .maybeSingle();
    if (directError) throw directError;
    if (directlyVisible) {
      const row = reportRowSchema.safeParse(directlyVisible);
      if (row.success && row.data.report_versions.length) {
        console.info(JSON.stringify({ event: "report_consistency_direct_fallback", runId }));
        return { state: "ready", value: mapReport(row.data) };
      }
    }
  }
  console.info(JSON.stringify({ event: "report_consistency_retry", runId, reason: lastPending.reason }));
  return lastPending;
}

export async function loadCompletedReports(): Promise<LoadedReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").select(`${reportSelect}, research_runs!inner(status)`).eq("research_runs.status", "Completed").order("generated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapReport);
}

export async function loadCompletedScorecards(): Promise<CompletedScorecard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").select(`run_id, research_runs!inner(status), opportunity:opportunities(name, scorecard:opportunity_scores(total, confidence, verdict, breakdowns:score_breakdowns(criterion, score, notes, weight, evidence:score_evidence_refs(evidence_id))))`).eq("research_runs.status", "Completed").order("generated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((input) => {
    const row = scoreQueryRowSchema.parse(input);
    return { id: row.run_id, name: row.opportunity.name, scorecard: mapScorecard(row.opportunity.scorecard, row.run_id) };
  });
}
