import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { scorecardSchema, validationReportSchema, type ValidationReport } from "@/lib/report-schema";
import type { OpportunityScorecard } from "@/lib/types";
import { scoringCriteria } from "@/lib/scoring";
import { firstRecord, recordArray } from "@/lib/supabase/relations";

export type StoredExportFormat = "json" | "markdown" | "csv" | "pdf";
export type StoredExport = { format: StoredExportFormat; storagePath: string; byteSize: number };
export type LoadedReport = { report: ValidationReport; exports: StoredExport[] };
export type CompletedScorecard = { id: string; name: string; scorecard: OpportunityScorecard };

const reportSelect = `
  id, run_id, executive_summary, methodology, generated_at,
  report_versions(id, version_number, report_mode, payload, report_exports(format, storage_path, byte_size))
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
  };
}

export async function loadReportForRun(runId: string): Promise<LoadedReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").select(reportSelect).eq("run_id", runId).maybeSingle();
  if (error) throw error;
  return data ? mapReport(data) : null;
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
