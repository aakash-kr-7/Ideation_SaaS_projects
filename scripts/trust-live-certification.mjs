import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

class InfrastructureError extends Error {}

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerToken = /127\.0\.0\.1|localhost/.test(url || "")
  ? serviceKey
  : process.env.WEBHOOK_SECRET || serviceKey;
if (!url || !anonKey || !serviceKey || !workerToken) {
  throw new Error("Supabase and worker configuration is required.");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const functionEnv = existsSync("supabase/functions/.env.local")
  ? readFileSync("supabase/functions/.env.local", "utf8")
  : "";
const configured = (name) =>
  process.env[name] || functionEnv.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();

const ideas = [
  {
    category: "B2B SaaS Quick Scan",
    mode: "quick_scan",
    name: "Client Approval Ledger",
    description:
      "A workflow product for small agencies to collect attributable client approval on deliverables, preserve an audit trail, and reduce billing disputes.",
    customer: "Owners and delivery leaders at 5-50 person digital agencies",
    marketType: "B2B SaaS",
    region: "United States and United Kingdom",
    assumptions: {
      buyer: "Agency owners and client-delivery leaders",
      endUser: "Project and account managers",
      workflow: "Requesting and preserving client approval on deliverables",
      problem: "Ambiguous approvals create rework and billing disputes",
      expectedOutcome: "Faster approval with attributable history",
      industry: "Digital agencies",
      directCompetitorCategory: "Online proofing and client approval software",
      priceHypothesis: "Per-team monthly subscription",
      founderProfile: { buyerAccess: "Confirmed access to agency operators", domainExperience: "Client delivery operations" },
    },
  },
  {
    category: "B2B SaaS Full Validation",
    mode: "full_validation",
    name: "Client Approval Ledger",
    description:
      "A workflow product for small agencies to collect attributable client approval on deliverables, preserve an audit trail, and reduce billing disputes.",
    customer: "Owners and delivery leaders at 5-50 person digital agencies",
    marketType: "B2B SaaS",
    region: "United States and United Kingdom",
    assumptions: {
      buyer: "Agency owners and client-delivery leaders",
      endUser: "Project and account managers",
      workflow: "Requesting and preserving client approval on deliverables",
      problem: "Ambiguous approvals create rework and billing disputes",
      expectedOutcome: "Faster approval with attributable history",
      industry: "Digital agencies",
      directCompetitorCategory: "Online proofing and client approval software",
      priceHypothesis: "Per-team monthly subscription",
      founderProfile: { buyerAccess: "Confirmed access to agency operators", domainExperience: "Client delivery operations" },
    },
  },
];

const suffix = crypto.randomUUID().slice(0, 8);
const email = `trust-cert-${suffix}@example.test`;
const password = `TrustCert!${crypto.randomUUID()}`;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: `trust-cert-${suffix}` },
});
if (created.error || !created.data.user) throw created.error || new Error("Unable to create certification user.");
const userId = created.data.user.id;
let teamId;
const results = [];
const attemptedRunIds = [];
const startedAt = new Date().toISOString();

try {
  const membership = await one(admin.from("team_members").select("team_id").eq("user_id", userId), "certification membership");
  teamId = membership.team_id;
  await must(admin.from("team_credit_accounts").upsert({
    team_id: teamId,
    paid_credits: 4,
    reserved_paid_credits: 0,
    free_quick_scans_remaining: 0,
  }), "seed certification credits");
  const project = await one(admin.from("projects").insert({
    team_id: teamId,
    name: `Trust certification ${suffix}`,
    created_by: userId,
  }).select("id"), "create certification project");
  const customer = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await customer.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  for (const idea of ideas) {
    const gate = await liveGate();
    let runId;
    try {
      runId = await reserve(customer, project.id, idea);
      attemptedRunIds.push(runId);
      const diagnostic = await callWorker({ action: "gemini-diagnostic", runId });
      if (
        !diagnostic.geminiKeyPresent ||
        !diagnostic.googleSearchGroundingMetadata ||
        !Array.isArray(diagnostic.modelChecks) ||
        diagnostic.modelChecks.some((check) => !check.success)
      ) {
        throw new InfrastructureError(`Grounding diagnostic failed: ${JSON.stringify(diagnostic)}`);
      }
      await enqueue(runId, idea.mode);
      await drive(runId);
      const verified = await verifyRun(runId, idea, gate);
      results.push(verified);
      await assertCleanQueue();
    } catch (error) {
      const failureAudit = runId ? await captureFailureAudit(runId) : null;
      if (runId) await restoreFailedReservation(customer, runId, error);
      const failure = {
        status: "FAILED",
        startedAt,
        stoppedAt: new Date().toISOString(),
        liveCallsAttempted: attemptedRunIds.length,
        liveCallsCompleted: results.length,
        liveRunIds: attemptedRunIds,
        completedResults: results,
        infrastructureFailure: error instanceof InfrastructureError,
        error: error.message,
        failureAudit,
      };
      writeFileSync("artifacts/trust-live-certification.json", `${JSON.stringify(failure, null, 2)}\n`);
      throw error;
    }
  }

  const usage = await many(admin.from("api_usage_logs")
    .select("run_id,provider,estimated_cost_usd,prompt_tokens,completion_tokens,status")
    .in("run_id", results.map((result) => result.runId)), "load certification usage");
  const quotaConsumed = usage.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const output = {
    status: "PASS",
    startedAt,
    completedAt: new Date().toISOString(),
    liveCallsUsed: results.length,
    liveRunIds: results.map((result) => result.runId),
    quotaConsumedUsd: Number(quotaConsumed.toFixed(6)),
    providerCalls: usage.length,
    results,
  };
  writeFileSync("artifacts/trust-live-certification.json", `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
} finally {
  if (teamId) {
    const cleanup = await admin.rpc("cleanup_isolated_test_team", { p_team_id: teamId });
    if (cleanup.error) console.error(`Certification cleanup failed: ${cleanup.error.message}`);
  }
  await admin.auth.admin.deleteUser(userId);
}

async function liveGate() {
  if (configured("RESEARCH_ENGINE") !== "gemini_hybrid") {
    throw new InfrastructureError("RESEARCH_ENGINE is not gemini_hybrid.");
  }
  if (configured("GEMINI_GROUNDING_MODE") !== "required") {
    throw new InfrastructureError("GEMINI_GROUNDING_MODE is not required.");
  }
  if (configured("GROQ_CLASSIFIER_ENABLED") !== "true") {
    throw new InfrastructureError("GROQ classifier feature flag is not enabled.");
  }
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [activeJobs, activeRuns, reservations, quotaFailures, alerts] = await Promise.all([
    count(admin.from("research_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "claimed"])),
    count(admin.from("research_runs").select("id", { count: "exact", head: true }).in("status", ["Queued", "Running"])),
    count(admin.from("credit_reservations").select("id", { count: "exact", head: true }).eq("status", "reserved")),
    count(admin.from("research_call_metrics").select("id", { count: "exact", head: true })
      .eq("provider", "gemini").eq("grounded", true).eq("quota_failure", true)
      .gte("created_at", dayStart.toISOString())),
    count(admin.from("operational_alerts").select("id", { count: "exact", head: true }).eq("status", "open")),
  ]);
  if (activeJobs || activeRuns || reservations || quotaFailures || alerts) {
    throw new InfrastructureError(`Live gate failed: ${JSON.stringify({ activeJobs, activeRuns, reservations, quotaFailures, alerts })}`);
  }
  return { grounding: "required", quotaFailures, featureFlags: "verified", queue: "clean" };
}

async function reserve(customer, projectId, idea) {
  const response = await customer.rpc("create_research_run_with_reservation", {
    p_project_id: projectId,
    p_idea_name: idea.name,
    p_idea_description: idea.description,
    p_target_customer: idea.customer,
    p_market_type: idea.marketType,
    p_target_region: idea.region,
    p_assumptions: idea.assumptions,
    p_mode: idea.mode,
    p_idempotency_key: crypto.randomUUID(),
    p_request_id: crypto.randomUUID(),
  });
  if (response.error) throw response.error;
  return (Array.isArray(response.data) ? response.data[0] : response.data).run_id;
}

async function enqueue(runId, mode) {
  const response = await admin.rpc("enqueue_research_job", {
    p_run_id: runId,
    p_stage: "plan",
    p_input_meta: { mode },
    p_stage_iteration: 0,
    p_batch_index: 0,
    p_batch_size: 0,
    p_job_purpose: "stage",
    p_parent_job_id: null,
    p_max_attempts: 3,
    p_visible_after: new Date().toISOString(),
  });
  if (response.error) throw response.error;
}

async function drive(runId) {
  const deadline = Date.now() + 25 * 60_000;
  while (Date.now() < deadline) {
    const run = await one(admin.from("research_runs")
      .select("status,error_message,research_outcome,credit_state")
      .eq("id", runId), "poll certification run");
    if (run.status === "Completed") return;
    if (["Failed", "Cancelled"].includes(run.status)) {
      const infrastructure = /quota|provider|ground|timeout|unavailable|429|5\d\d/i.test(run.error_message || "");
      const ErrorType = infrastructure ? InfrastructureError : Error;
      throw new ErrorType(`Run ${runId} ended ${run.status}: ${run.error_message}`);
    }
    const response = await callWorker({ source: "trust-live-certification", runId });
    if (response.error && !/No pending research job/i.test(response.error)) {
      throw new InfrastructureError(`Worker failed: ${JSON.stringify(response)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new InfrastructureError(`Run ${runId} timed out.`);
}

async function verifyRun(runId, idea, gate) {
  const packTable = idea.mode === "full_validation"
    ? "full_validation_research_pack_statuses"
    : "quick_scan_research_pack_statuses";
  const [run, packs, evidence, sources, metrics, report, reservation, score, rejections] = await Promise.all([
    one(admin.from("research_runs").select("*").eq("id", runId), "load completed run"),
    many(admin.from(packTable).select("*").eq("run_id", runId), "load packs"),
    many(admin.from("evidence_items").select("*").eq("run_id", runId), "load evidence"),
    many(admin.from("sources").select("*").eq("run_id", runId), "load sources"),
    one(admin.from("research_pipeline_metrics").select("*").eq("run_id", runId), "load metrics"),
    one(admin.from("reports").select("*,report_versions(*,report_exports(*),report_chart_datasets(*))").eq("run_id", runId), "load report"),
    one(admin.from("credit_reservations").select("*").eq("run_id", runId), "load reservation"),
    one(admin.from("opportunities").select("id,opportunity_scores(id,total,confidence,verdict,score_breakdowns(*))").eq("run_id", runId), "load score"),
    many(admin.from("evidence_rejection_diagnostics").select("*").eq("run_id", runId), "load evidence rejections"),
  ]);
  if (run.status !== "Completed" || run.research_outcome !== "research_completed") throw new Error("Research did not complete successfully.");
  if (run.credit_state !== "consumed" || reservation.status !== "consumed") throw new Error("Credit settlement is not consumed exactly once.");
  if (metrics.grounding_mode !== "required" || Number(metrics.grounded_calls_completed || 0) < 1 || Number(metrics.grounded_calls_quota_blocked || 0) !== 0) {
    throw new Error("Required grounded research metrics are invalid.");
  }
  const accepted = evidence.filter((item) => item.excluded !== true && item.verified !== false);
  const groups = new Set(accepted.map((item) => item.independence_key || item.syndication_group || item.canonical_source_id || item.source_domain).filter(Boolean));
  const official = sources.filter((item) => item.source_tier === 1 || ["primary", "official"].includes(item.source_class));
  const adversarial = accepted.filter((item) => item.evidence_role === "challenging" || item.disconfirming === true);
  const pricing = accepted.filter((item) => /pricing|willingness_to_pay/i.test(item.evidence_topic || ""));
  const wtp = pricing.filter((item) => /paid|purchase|renew|commit|deposit|pre.?order/i.test(`${item.title} ${item.snippet}`));
  const persistedFunnel = packs.reduce((sum, pack) => ({
    discovered: sum.discovered + Number(pack.sources_discovered || 0),
    reviewed: sum.reviewed + Number(pack.sources_reviewed || 0),
    fetched: sum.fetched + Number(pack.sources_fetched || 0),
    accepted: sum.accepted + Number(pack.findings_accepted || 0),
    rejected: sum.rejected + Number(pack.findings_rejected || 0),
  }), { discovered: 0, reviewed: 0, fetched: 0, accepted: 0, rejected: 0 });
  const funnel = {
    discovered: persistedFunnel.discovered || sources.length,
    reviewed: persistedFunnel.reviewed || sources.length,
    fetched: persistedFunnel.fetched || sources.filter((item) => String(item.text_content || "").trim()).length,
    accepted: persistedFunnel.accepted || accepted.length,
    rejected: persistedFunnel.rejected || rejections.length,
  };
  if (!funnel.discovered || !funnel.reviewed || !funnel.fetched || !funnel.accepted) throw new Error("Evidence funnel is incomplete.");
  if (groups.size < 2) throw new Error("Independent evidence groups are insufficient.");
  if (!official.length) throw new Error("No official or primary source was accepted.");
  const adversarialPack = packs.find((pack) => /adversarial/.test(pack.pack_key));
  if (idea.mode === "full_validation" && !adversarial.length) {
    throw new Error("No proposition-specific adversarial finding was accepted for Full Validation.");
  }
  if (idea.mode === "quick_scan" && !adversarialPack) {
    throw new Error("Quick Scan did not execute its adversarial research pack.");
  }
  if (!pricing.length) throw new Error("No pricing evidence was accepted.");
  const opportunityScore = Array.isArray(score.opportunity_scores) ? score.opportunity_scores[0] : score.opportunity_scores;
  const breakdowns = opportunityScore?.score_breakdowns || [];
  const founder = breakdowns.find((item) => item.criterion === "founderFit");
  if (!founder || !String(founder.notes || "").trim()) throw new Error("Founder-fit handling is missing.");
  const version = [...(report.report_versions || [])].sort((a, b) => b.version_number - a.version_number)[0];
  const formats = new Set((version?.report_exports || []).map((item) => item.format));
  if (!version || formats.size !== 4 || !["pdf", "markdown", "json", "csv"].every((format) => formats.has(format))) {
    throw new Error("Export bundle is incomplete.");
  }
  for (const item of version.report_exports) {
    const download = await admin.storage.from("exports").download(item.storage_path);
    if (download.error || !download.data || download.data.size !== Number(item.byte_size)) {
      throw new Error(`Export verification failed for ${item.format}.`);
    }
  }
  const payload = version.payload || {};
  if (!payload.verdictChangeConditions && !payload.fullValidationDecision?.verdictStructure) {
    throw new Error("Verdict-change conditions are missing.");
  }
  if (idea.mode === "full_validation" && !payload.fullValidationDecision?.segmentRankings?.length) {
    throw new Error("Full Validation segment analysis is missing.");
  }
  return {
    category: idea.category,
    mode: idea.mode,
    runId,
    inputParameters: {
      ideaName: idea.name,
      description: idea.description,
      targetCustomer: idea.customer,
      marketType: idea.marketType,
      region: idea.region,
      assumptions: idea.assumptions,
    },
    score: Number(opportunityScore.total),
    verdict: opportunityScore.verdict,
    evidenceFunnel: funnel,
    acceptedEvidence: accepted.length,
    independentGroups: groups.size,
    officialSources: official.length,
    adversarialFindings: adversarial.length,
    adversarialOutcome: adversarial.length
      ? "accepted_proposition_specific_findings"
      : "searched_no_acceptable_finding",
    pricingFindings: pricing.length,
    directWtpFindings: wtp.length,
    researchExecution: {
      groundingMode: metrics.grounding_mode,
      groundedCallsAttempted: Number(metrics.grounded_calls_attempted || 0),
      groundedCallsCompleted: Number(metrics.grounded_calls_completed || 0),
      providerCalls: Number(metrics.provider_calls || 0),
      totalProviderCostUsd: Number(metrics.total_provider_cost_usd || 0),
      packStatuses: packs.map((pack) => ({
        packKey: pack.pack_key,
        status: pack.status,
        acceptedEvidenceCount: Number(pack.accepted_evidence_count || 0),
        failureReason: pack.failure_reason || null,
      })),
    },
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.canonical_url || source.url,
      domain: source.source_domain,
      publisher: source.publisher,
      sourceType: source.source_type,
      sourceClass: source.source_class,
      sourceTier: source.source_tier,
      extractionMethod: source.extraction_method,
      retrievalDate: source.retrieval_date,
    })),
    evidence: accepted.map((item) => ({
      id: item.id,
      sourceId: item.source_id,
      title: item.title,
      snippet: item.snippet,
      signalType: item.signal_type,
      evidenceTopic: item.evidence_topic,
      evidenceRole: item.evidence_role,
      sourceTier: item.source_tier,
      associatedFactorIds: item.associated_factor_ids,
      numericValidationState: item.numeric_validation_state,
    })),
    rejectedEvidence: rejections.map((item) => ({
      stage: item.stage,
      reasonCode: item.reason_code,
      reason: item.reason,
      sourceUrl: item.source_url,
    })),
    founderFit: {
      score: founder.effective_score ?? founder.score,
      state: founder.evidence_state,
      explanation: founder.notes,
      unresolvedGaps: founder.unresolved_gaps,
    },
    exports: [...formats].sort(),
    exportArtifacts: version.report_exports.map((item) => ({
      format: item.format,
      byteSize: Number(item.byte_size),
      sha256: item.sha256,
      storagePath: item.storage_path,
    })),
    documentStructure: {
      reportMode: version.report_mode,
      payloadSections: Object.keys(payload).sort(),
      decisionSections: (payload.decisionProduct?.sections || []).map((section) => section.title),
      chartKeys: (version.report_chart_datasets || []).map((chart) => chart.chart_key).sort(),
      segmentCount: payload.fullValidationDecision?.segmentRankings?.length || 0,
      propositionCount: payload.fullValidationDecision?.propositionAssessments?.length || payload.researchPropositions?.length || 0,
      verdictChangeConditions: payload.verdictChangeConditions || payload.fullValidationDecision?.verdictStructure || null,
    },
    creditSettlement: run.credit_state,
    gate,
  };
}

async function captureFailureAudit(runId) {
  const [run, jobs, calls, usage, quickPacks, fullPacks, errors, sources, evidence, reports] = await Promise.all([
    admin.from("research_runs").select("id,mode,status,research_outcome,credit_state,error_message").eq("id", runId).maybeSingle(),
    admin.from("research_jobs").select("stage,status,attempt_count,error_class,error_message,input_meta,output_meta").eq("run_id", runId).order("created_at"),
    admin.from("research_call_metrics").select("*").eq("run_id", runId).order("created_at"),
    admin.from("api_usage_logs").select("provider,operation,model,status,duration_ms,estimated_cost_usd,error_class,error_message,grounded_search_requested,grounding_metadata_present,quota_metric,quota_limit").eq("run_id", runId).order("created_at"),
    admin.from("quick_scan_research_pack_statuses").select("*").eq("run_id", runId),
    admin.from("full_validation_research_pack_statuses").select("*").eq("run_id", runId),
    admin.from("error_logs").select("context,error_message,created_at").eq("run_id", runId).order("created_at"),
    admin.from("sources").select("id,title,url,canonical_url,source_domain,publisher,source_type,source_class,source_tier,extraction_method,retrieval_date").eq("run_id", runId),
    admin.from("evidence_items").select("id,source_id,title,snippet,signal_type,evidence_topic,evidence_role,source_tier,associated_factor_ids,numeric_validation_state,excluded,verified").eq("run_id", runId),
    admin.from("reports").select("id,status,report_versions(id,version_number,report_mode,payload,report_exports(format,storage_path,byte_size,sha256),report_chart_datasets(chart_key,chart_type))").eq("run_id", runId),
  ]);
  return {
    run: run.data || null,
    jobs: jobs.data || [],
    researchCalls: calls.data || [],
    providerUsage: usage.data || [],
    packStatuses: [...(quickPacks.data || []), ...(fullPacks.data || [])],
    errors: errors.data || [],
    sources: sources.data || [],
    evidence: evidence.data || [],
    reports: reports.data || [],
  };
}

async function assertCleanQueue() {
  const [jobs, runs, reservations] = await Promise.all([
    count(admin.from("research_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "claimed"])),
    count(admin.from("research_runs").select("id", { count: "exact", head: true }).in("status", ["Queued", "Running"])),
    count(admin.from("credit_reservations").select("id", { count: "exact", head: true }).eq("status", "reserved")),
  ]);
  if (jobs || runs || reservations) throw new InfrastructureError(`Queue cleanup failed: ${JSON.stringify({ jobs, runs, reservations })}`);
}

async function restoreFailedReservation(customer, runId, error) {
  const run = await one(admin.from("research_runs").select("status").eq("id", runId), "load failed run");
  if (!["Completed", "Failed", "Cancelled"].includes(run.status)) {
    await customer.rpc("cancel_research_run", { p_run_id: runId, p_reason: `Certification stopped: ${error.message}` });
  }
}

async function callWorker(body) {
  const response = await fetch(`${url}/functions/v1/research-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new InfrastructureError(`Worker request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function one(query, operation) {
  const { data, error } = await query.single();
  if (error || !data) throw error || new Error(`${operation}: missing row`);
  return data;
}
async function many(query, operation) {
  const { data, error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
  return data || [];
}
async function must(query, operation) {
  const { error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
}
async function count(query) {
  const { count: value, error } = await query;
  if (error) throw error;
  return value || 0;
}
