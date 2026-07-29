export interface ResearchCallMetricInput {
  runId: string;
  callPurpose: string;
  queryFamily: string;
  grounded: boolean;
  conditionalCallTrigger?: string[];
  provider?: string;
  model?: string | null;
  sourcesDiscovered?: number;
  sourcesAccepted?: number;
  independentEvidenceGroupsAdded?: number;
  evidenceFamiliesAdded?: string[];
  contradictionsAdded?: number;
  pricingClaimsValidated?: number;
  cacheHits?: number;
  durationMs?: number;
  quotaFailure?: boolean;
  metadata?: Record<string, unknown>;
}

export async function persistResearchCallMetric(
  db: any,
  input: ResearchCallMetricInput,
) {
  const provider = input.provider || "gemini";
  let usage: any = null;
  try {
    const query = db.from("api_usage_logs")
      .select("model,prompt_tokens,completion_tokens,duration_ms,cache_status,quota_metric,error_class,status")
      .eq("run_id", input.runId)
      .eq("provider", provider)
      .eq("task_type", input.queryFamily)
      .order("start_time", { ascending: false })
      .limit(1);
    const result = await query.maybeSingle();
    usage = result?.data || null;
  } catch {
    // Metrics must never block report completion. The explicit stage values
    // below remain persisted even when usage reconciliation is unavailable.
  }
  await db.from("research_call_metrics").upsert({
    run_id: input.runId,
    call_purpose: input.callPurpose,
    query_family: input.queryFamily,
    grounded: input.grounded,
    conditional_call_trigger: input.conditionalCallTrigger || [],
    provider,
    model: input.model || usage?.model || null,
    prompt_tokens: Number(usage?.prompt_tokens || 0),
    completion_tokens: Number(usage?.completion_tokens || 0),
    sources_discovered: input.sourcesDiscovered || 0,
    sources_accepted: input.sourcesAccepted || 0,
    independent_evidence_groups_added: input.independentEvidenceGroupsAdded || 0,
    evidence_families_added: input.evidenceFamiliesAdded || [],
    contradictions_added: input.contradictionsAdded || 0,
    pricing_claims_validated: input.pricingClaimsValidated || 0,
    cache_hits: input.cacheHits ?? (usage?.cache_status === "hit" ? 1 : 0),
    duration_ms: input.durationMs ?? Number(usage?.duration_ms || 0),
    quota_failure: input.quotaFailure ??
      Boolean(usage?.quota_metric || usage?.error_class === "quota"),
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "run_id,provider,query_family,call_purpose" });
}
