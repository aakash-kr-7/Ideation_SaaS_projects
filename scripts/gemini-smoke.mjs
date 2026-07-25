import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerToken = process.env.WEBHOOK_SECRET || serviceKey;
if (!url || !anonKey || !serviceKey || !workerToken) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and worker authentication are required.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `gemini-smoke-${crypto.randomUUID()}@example.test`;
const password = `Gemini!${crypto.randomUUID()}`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error || !created.data.user) throw created.error || new Error("Unable to create Gemini smoke user.");
const userId = created.data.user.id;
let runId;

try {
  const { data: membership, error: membershipError } = await admin.from("team_members").select("team_id").eq("user_id", userId).single();
  if (membershipError || !membership) throw membershipError || new Error("Gemini smoke team bootstrap failed.");
  await must(admin.from("team_credit_accounts").upsert({ team_id: membership.team_id, paid_credits: 5, reserved_paid_credits: 0, free_quick_scans_remaining: 1 }), "seed smoke credits");
  const { data: project, error: projectError } = await admin.from("projects").insert({ team_id: membership.team_id, name: "Gemini foundation smoke", created_by: userId }).select("id").single();
  if (projectError || !project) throw projectError || new Error("Gemini smoke project creation failed.");
  const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const reservation = await user.rpc("create_research_run_with_reservation", {
    p_project_id: project.id,
    p_idea_name: "Grounded Gemini foundation smoke",
    p_idea_description: "A minimal real-provider request proving grounded market research usage accounting and source persistence.",
    p_target_customer: "Local test operators",
    p_market_type: "B2B",
    p_target_region: "Global",
    p_assumptions: {},
    p_mode: "quick_scan",
    p_idempotency_key: crypto.randomUUID(),
    p_request_id: crypto.randomUUID(),
  });
  if (reservation.error) throw reservation.error;
  runId = (Array.isArray(reservation.data) ? reservation.data[0] : reservation.data).run_id;

  const diagnosticResponse = await callWorker({ action: "gemini-diagnostic", runId });
  const allowedDiagnosticKeys = ["configuredModels", "geminiKeyPresent", "googleSearchGroundingMetadata", "modelChecks"].sort();
  if (JSON.stringify(Object.keys(diagnosticResponse).sort()) !== JSON.stringify(allowedDiagnosticKeys)) {
    throw new Error("Gemini diagnostic returned fields outside the safe contract.");
  }
  if (!diagnosticResponse.geminiKeyPresent || !diagnosticResponse.googleSearchGroundingMetadata || diagnosticResponse.modelChecks.some((check) => !check.success)) {
    throw new Error(`Gemini diagnostic failed: ${JSON.stringify(diagnosticResponse)}`);
  }

  const enqueue = await admin.rpc("enqueue_research_job", {
    p_run_id: runId, p_stage: "plan", p_input_meta: { mode: "quick_scan" },
    p_stage_iteration: 0, p_batch_index: 0, p_batch_size: 0, p_job_purpose: "stage",
    p_parent_job_id: null, p_max_attempts: 1, p_visible_after: new Date().toISOString(),
  });
  if (enqueue.error) throw enqueue.error;
  const plan = await callWorker({ trigger: "gemini-smoke-plan" });
  if (plan.stage !== "plan" || plan.status !== "completed") throw new Error(`Plan preflight failed: ${JSON.stringify(plan)}`);
  await callWorker({ trigger: "gemini-smoke-grounded" });
  const groundedState = await waitForJob("grounded_research", 180_000);
  if (groundedState.status !== "completed") {
    throw new Error(`Grounded request failed: ${JSON.stringify({ status: groundedState.status, errorClass: groundedState.error_class, errorMessage: groundedState.error_message })}`);
  }

  const { data: boosterJob, error: boosterError } = await admin.from("research_jobs")
    .select("input_meta").eq("run_id", runId).eq("stage", "evidence_boosters").single();
  if (boosterError || !boosterJob) throw boosterError || new Error("Grounded output was not persisted.");
  const sources = Array.isArray(boosterJob.input_meta?.groundingSources) ? boosterJob.input_meta.groundingSources : [];
  if (!sources.length) throw new Error("No real Google Search grounding sources were persisted.");
  const sourceDomains = sources.map((source) => new URL(source.url).hostname);
  if (sourceDomains.some((domain) => domain === "example.com" || domain.endsWith(".example.com"))) {
    throw new Error("Fixture source detected in real Gemini smoke.");
  }
  const groundingSourceTitles = sources.map((source) => String(source.title || "").trim()).filter(Boolean);
  if (!groundingSourceTitles.length || !sources.every((source) => /^https:\/\//i.test(source.url))) {
    throw new Error("Gemini grounding chunks omitted source titles or HTTPS metadata.");
  }
  if (groundingSourceTitles.some((title) => /(?:^|\.)example\.com\b/i.test(title))) {
    throw new Error("Fixture source title detected in real Gemini smoke.");
  }

  const [{ data: usage, error: usageError }, { data: metrics, error: metricsError }, { data: groundedJob, error: groundedJobError }] = await Promise.all([
    admin.from("api_usage_logs").select("model,prompt_tokens,completion_tokens,retry_count,duration_ms,grounded_search_requested,grounding_metadata_present,cache_status,estimated_cost_usd,pricing_version,status").eq("run_id", runId).eq("provider", "gemini"),
    admin.from("research_pipeline_metrics").select("provider_calls,grounded_calls,input_tokens,output_tokens,retry_count,total_duration_ms,cache_hits,cache_misses,total_provider_cost_usd,model_call_counts,pricing_version").eq("run_id", runId).single(),
    admin.from("research_jobs").select("output_meta").eq("run_id", runId).eq("stage", "grounded_research").single(),
  ]);
  if (usageError || metricsError || groundedJobError) throw usageError || metricsError || groundedJobError;
  const usageTotals = usage.reduce((sum, row) => ({
    providerCalls: sum.providerCalls + 1,
    groundedCalls: sum.groundedCalls + (row.grounded_search_requested ? 1 : 0),
    inputTokens: sum.inputTokens + Number(row.prompt_tokens || 0),
    outputTokens: sum.outputTokens + Number(row.completion_tokens || 0),
    retries: sum.retries + (Number(row.retry_count || 0) > 0 ? 1 : 0),
    durationMs: sum.durationMs + Number(row.duration_ms || 0),
    estimatedCostUsd: sum.estimatedCostUsd + Number(row.estimated_cost_usd || 0),
  }), { providerCalls: 0, groundedCalls: 0, inputTokens: 0, outputTokens: 0, retries: 0, durationMs: 0, estimatedCostUsd: 0 });
  for (const [field, value] of Object.entries({
    provider_calls: usageTotals.providerCalls,
    grounded_calls: usageTotals.groundedCalls,
    input_tokens: usageTotals.inputTokens,
    output_tokens: usageTotals.outputTokens,
    retry_count: usageTotals.retries,
    total_duration_ms: usageTotals.durationMs,
    cache_misses: usageTotals.providerCalls,
  })) {
    if (Number(metrics[field]) !== value) throw new Error(`Metric reconciliation failed for ${field}: aggregate=${metrics[field]}, logs=${value}`);
  }
  if (!groundedJob.output_meta?.registryRowsRead || !groundedJob.output_meta?.registryDomainsUsed?.length) {
    throw new Error("Gemini grounded runtime did not read the Source Registry.");
  }
  if (!usage.every((row) => row.model && row.cache_status && row.pricing_version && row.duration_ms >= 0)) {
    throw new Error("One or more Gemini usage rows omitted required metrics.");
  }
  const cancellation = await user.rpc("cancel_research_run", { p_run_id: runId, p_reason: "Gemini smoke complete" });
  if (cancellation.error) throw cancellation.error;

  console.log(JSON.stringify({
    diagnostic: diagnosticResponse,
    groundedSourceCount: sources.length,
    sourceDomains,
    groundingSourceTitles: [...new Set(groundingSourceTitles)],
    registryRowsRead: groundedJob.output_meta.registryRowsRead,
    registryDomainsUsed: groundedJob.output_meta.registryDomainsUsed,
    metrics: {
      ...usageTotals,
      cacheHits: Number(metrics.cache_hits),
      cacheMisses: Number(metrics.cache_misses),
      modelCallCounts: metrics.model_call_counts,
      pricingVersion: metrics.pricing_version,
      estimatedCostUsd: Number(usageTotals.estimatedCostUsd.toFixed(6)),
    },
    persistedUsageRows: usage.length,
    noFixtureSources: true,
    status: "PASS",
  }, null, 2));
} finally {
  await admin.auth.admin.deleteUser(userId);
}

async function callWorker(body) {
  const response = await fetch(`${url}/functions/v1/research-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(`Worker request failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForJob(stage, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await admin.from("research_jobs")
      .select("status,error_class,error_message").eq("run_id", runId).eq("stage", stage).maybeSingle();
    if (error) throw error;
    if (data && ["completed", "dead_letter", "failed"].includes(data.status)) return data;
    if (data?.status === "pending") await callWorker({ trigger: `gemini-smoke-${stage}` });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${stage}.`);
}

async function must(query, operation) {
  const { error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
}
