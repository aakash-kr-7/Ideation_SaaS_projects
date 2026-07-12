"use server";

import { createClient } from "@/lib/supabase/server";
import { validationReportSchema } from "@/lib/report-schema";
import { z } from "zod";

export async function getReportForRun(runId: string) {
  const supabase = await createClient();
  
  // This requires a deep join across the normalized schema to assemble the FullOpportunity
  // In a real production app, this might be a database view or a stored procedure to return JSON
  // For the server action, we fetch the pieces and assemble them.

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select(`
      *,
      opportunity:opportunities(
        *,
        scorecard:opportunity_scores(
          *,
          breakdowns:score_breakdowns(
            *,
            evidence:score_evidence_refs(
              evidence_item:evidence_items(*)
            )
          )
        ),
        evidence:evidence_items(*),
        competitors:competitors(*),
        pricing:pricing_models(*),
        mvp:mvp_plans(
          *,
          items:mvp_scope_items(*)
        ),
        launch:launch_plans(
          *,
          strategies:launch_strategies(*)
        ),
        risks:risks(*)
      )
    `)
    .eq("run_id", runId)
    .single();

  if (reportError) throw new Error(reportError.message);
  return report;
}

export async function publishReport(reportId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("reports")
    .update({ status: "Published", updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createReportVersion(reportId: string, versionNumber: number, payload: any) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("report_versions")
    .insert({
      report_id: reportId,
      version_number: versionNumber,
      payload
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
