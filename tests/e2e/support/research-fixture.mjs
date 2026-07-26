import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

dotenv.config({ path: ".env.local", quiet: true });

const execFileAsync = promisify(execFile);
export const OWNER_EMAIL = "hybrid-proof@localhost.test";
export const OWNER_PASSWORD = "Playwright!2026";
export const OUTSIDER_EMAIL = "research-outsider@localhost.test";
export const OUTSIDER_PASSWORD = "Playwright!2026";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated research proof.`);
  return value;
}

function adminClient() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function prepareResearchProof() {
  const admin = adminClient();
  let users = await admin.auth.admin.listUsers();
  if (users.error) throw users.error;
  let owner = users.data.users.find((user) => user.email === OWNER_EMAIL);
  if (owner) {
    const existing = await admin.from("research_runs").select("id").eq("created_by", owner.id).eq("status", "Completed").limit(1);
    if (existing.error) throw existing.error;
    if (!existing.data?.length) {
      const removed = await admin.auth.admin.deleteUser(owner.id);
      if (removed.error) throw removed.error;
      owner = undefined;
    }
  }
  if (!owner) {
    await execFileAsync(process.execPath, ["scripts/pipeline-integration.mjs", "all"], {
      cwd: process.cwd(),
      env: { ...process.env, PIPELINE_USER_EMAIL: OWNER_EMAIL, PIPELINE_USER_PASSWORD: OWNER_PASSWORD, PIPELINE_PRESERVE: "1" },
      timeout: 15 * 60_000,
      maxBuffer: 1024 * 1024,
    });
    users = await admin.auth.admin.listUsers();
    if (users.error) throw users.error;
    owner = users.data.users.find((user) => user.email === OWNER_EMAIL);
  }
  if (!owner) throw new Error("The canonical pipeline did not provision the browser proof owner.");
  const ownerId = owner.id;
  const passwordResult = await admin.auth.admin.updateUserById(ownerId, { password: OWNER_PASSWORD });
  if (passwordResult.error) throw passwordResult.error;

  let outsider = users.data.users.find((user) => user.email === OUTSIDER_EMAIL);
  if (!outsider) {
    const created = await admin.auth.admin.createUser({
      email: OUTSIDER_EMAIL, password: OUTSIDER_PASSWORD, email_confirm: true,
      user_metadata: { full_name: "Research outsider" },
    });
    if (created.error) throw created.error;
    outsider = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(outsider.id, { password: OUTSIDER_PASSWORD });
    if (updated.error) throw updated.error;
  }
  const onboardingReady = await admin.from("users").update({ onboarding_completed: true }).in("id", [ownerId, outsider.id]);
  if (onboardingReady.error) throw onboardingReady.error;

  const completed = await admin.from("research_runs")
    .select("id,idea_name,mode,status,project_id,reports(id)")
    .eq("created_by", ownerId)
    .eq("status", "Completed");
  if (completed.error) throw completed.error;
  const completedWithReports = (completed.data ?? []).filter((run) => Boolean(run.reports));
  const quick = completedWithReports.find((run) => run.mode === "quick_scan");
  const full = completedWithReports.find((run) => run.mode === "full_validation");
  if (!quick || !full) throw new Error("Completed Quick Scan and Full Validation reports are required; assertions are not skipped.");

  const now = new Date();
  const runInsert = await admin.from("research_runs").insert({
    project_id: quick.project_id,
    created_by: ownerId,
    idea_name: `Browser proof ${now.toISOString()}`,
    idea_description: "A persisted browser-proof run for factual live research activity and cancellation coverage.",
    target_customer: "Small product teams",
    market_type: "B2B",
    target_region: "Global",
    assumptions: { industry: "Software", complexityTolerance: "Low" },
    mode: "full_validation",
    status: "Searching",
    progress: 18,
    progress_detail: "Evaluating retrieved pages against evidence requirements",
    current_stage: "grounded_research",
    current_stage_started_at: new Date(now.getTime() - 42_000).toISOString(),
    last_progress_at: now.toISOString(),
    idempotency_key: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    credit_cost: 3,
    credit_state: "legacy",
  }).select("id").single();
  if (runInsert.error) throw runInsert.error;
  const liveRunId = runInsert.data.id;

  const failedInsert = await admin.from("research_runs").insert({
    project_id: quick.project_id,
    created_by: ownerId,
    idea_name: `Failed browser proof ${now.toISOString()}`,
    idea_description: "A persisted terminal fixture for safe failure and restored-credit browser coverage.",
    target_customer: "Small product teams",
    market_type: "B2B",
    target_region: "Global",
    assumptions: { industry: "Software" },
    mode: "quick_scan",
    status: "Failed",
    progress: 0,
    progress_detail: "Research stopped before completion",
    current_stage: "grounded_research",
    terminal_at: now.toISOString(),
    last_progress_at: now.toISOString(),
    idempotency_key: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    credit_cost: 1,
    credit_state: "restored",
  }).select("id").single();
  if (failedInsert.error) throw failedInsert.error;

  const stages = await admin.from("research_stages").insert([
    { run_id: liveRunId, stage_name: "Completed", status: "Completed", progress_detail: "Research plan persisted", started_at: new Date(now.getTime() - 80_000).toISOString(), completed_at: new Date(now.getTime() - 55_000).toISOString() },
    { run_id: liveRunId, stage_name: "Searching", status: "Searching", progress_detail: "Evaluating retrieved pages", started_at: new Date(now.getTime() - 42_000).toISOString() },
  ]);
  if (stages.error) throw stages.error;

  const jobs = await admin.from("research_jobs").insert([
    { run_id: liveRunId, stage: "plan", logical_key: `${liveRunId}|plan`, status: "completed", attempt_count: 1, visible_after: new Date(now.getTime() - 80_000).toISOString(), completed_at: new Date(now.getTime() - 55_000).toISOString() },
    { run_id: liveRunId, stage: "grounded_research", logical_key: `${liveRunId}|grounded_research`, status: "claimed", attempt_count: 1, claimed_by: "browser-proof", claimed_at: new Date(now.getTime() - 42_000).toISOString(), visible_after: new Date(now.getTime() + 60_000).toISOString() },
    { run_id: liveRunId, stage: "evidence_boosters", logical_key: `${liveRunId}|evidence_boosters`, status: "pending", attempt_count: 0, visible_after: new Date(now.getTime() + 60_000).toISOString() },
  ]);
  if (jobs.error) throw jobs.error;

  const metrics = await admin.from("research_pipeline_metrics").insert({
    run_id: liveRunId,
    candidates_discovered: 7,
    pages_attempted: 5,
    pages_fetched: 3,
    sources_accepted: 2,
    sources_rejected_by_reason: { empty_or_unextractable: 1 },
    independent_domains: 2,
    evidence_items_extracted: 2,
    retry_count: 1,
    provider_fallback_count: 1,
    grounded_calls_attempted: 1,
    grounded_calls_completed: 0,
    grounded_calls_quota_blocked: 1,
    external_search_calls: 2,
    synthesis_calls: 0,
    degraded_providers: ["gemini_grounding"],
    grounding_mode: "optional",
    grounding_degraded: true,
    total_duration_ms: 42_000,
  });
  if (metrics.error) throw metrics.error;

  const sources = await admin.from("sources").insert([
    { run_id: liveRunId, title: "GitHub pull request review documentation", url: "https://docs.github.com/en/pull-requests", canonical_url: "https://docs.github.com/en/pull-requests", source_type: "official_docs", source_tier: 1, source_class: "primary", publisher: "GitHub", extraction_method: "direct_http", retrieval_date: now.toISOString(), source_domain: "docs.github.com", text_content: "Official documentation describing pull request reviews and approval workflows." },
    { run_id: liveRunId, title: "Atlassian approval workflow guide", url: "https://www.atlassian.com/software/jira/guides/workflows/overview", canonical_url: "https://www.atlassian.com/software/jira/guides/workflows/overview", source_type: "official_docs", source_tier: 1, source_class: "primary", publisher: "Atlassian", extraction_method: "direct_http", retrieval_date: now.toISOString(), source_domain: "atlassian.com", text_content: "Official workflow documentation describing approval and audit processes." },
  ]).select("id,url");
  if (sources.error) throw sources.error;

  const evidence = await admin.from("evidence_items").insert([
    { run_id: liveRunId, source_id: sources.data[0].id, canonical_url: sources.data[0].url, associated_claim_ids: [crypto.randomUUID()], signal_type: "Demand", strength: "High", title: "Approval steps are native to review workflows", snippet: "Official documentation confirms explicit review and approval states.", relevant_excerpt: "Official documentation confirms explicit review and approval states.", source_title: "GitHub pull request review documentation", publisher: "GitHub", extraction_method: "direct_http", retrieval_date: now.toISOString(), source_class: "primary", support_classification: "support", verified: true, evidence_family: "problem", source_tier: 1, source_domain: "docs.github.com", excluded: false, disconfirming: false, claim_fingerprint: crypto.randomUUID() },
    { run_id: liveRunId, source_id: sources.data[1].id, canonical_url: sources.data[1].url, associated_claim_ids: [crypto.randomUUID()], signal_type: "Risk", strength: "Medium", title: "Established workflow tools already cover approvals", snippet: "Existing workflow products provide configurable approval and audit capabilities.", relevant_excerpt: "Existing workflow products provide configurable approval and audit capabilities.", source_title: "Atlassian approval workflow guide", publisher: "Atlassian", extraction_method: "direct_http", retrieval_date: now.toISOString(), source_class: "primary", support_classification: "contradiction", verified: true, evidence_family: "solution", source_tier: 1, source_domain: "atlassian.com", excluded: false, disconfirming: true, claim_fingerprint: crypto.randomUUID() },
  ]);
  if (evidence.error) throw evidence.error;

  const retrieval = await admin.from("source_retrieval_audit").insert([
    { run_id: liveRunId, query_family: "workflow_demand", provider: "tavily", candidate_url: "https://docs.github.com/en/pull-requests", canonical_url: "https://docs.github.com/en/pull-requests", disposition: "accepted", relevance_score: 91, source_domain: "docs.github.com", created_at: new Date(now.getTime() - 12_000).toISOString() },
    { run_id: liveRunId, query_family: "competitor_risk", provider: "tavily", candidate_url: "https://www.atlassian.com/software/jira/guides/workflows/overview", canonical_url: "https://www.atlassian.com/software/jira/guides/workflows/overview", disposition: "accepted", relevance_score: 87, source_domain: "atlassian.com", created_at: new Date(now.getTime() - 8_000).toISOString() },
    { run_id: liveRunId, query_family: "buyer_pain", provider: "direct_http", candidate_url: "https://example.com/unavailable", canonical_url: "https://example.com/unavailable", disposition: "rejected", rejection_reason: "empty_or_unextractable", relevance_score: 52, source_domain: "example.com", created_at: new Date(now.getTime() - 4_000).toISOString() },
  ]);
  if (retrieval.error) throw retrieval.error;

  return {
    quickRunId: quick.id,
    quickIdeaName: quick.idea_name,
    fullRunId: full.id,
    fullIdeaName: full.idea_name,
    liveRunId,
    failedRunId: failedInsert.data.id,
    owner: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    outsider: { email: OUTSIDER_EMAIL, password: OUTSIDER_PASSWORD },
  };
}

export async function setProofPaidCredits(paidCredits) {
  const admin = adminClient();
  const listed = await admin.auth.admin.listUsers();
  if (listed.error) throw listed.error;
  const owner = listed.data.users.find(user => user.email === OWNER_EMAIL);
  if (!owner) throw new Error("Browser proof owner is unavailable.");
  const membership = await admin.from("team_members").select("team_id").eq("user_id", owner.id).single();
  if (membership.error) throw membership.error;
  const updated = await admin.from("team_credit_accounts").update({ paid_credits: paidCredits, reserved_paid_credits: 0 }).eq("team_id", membership.data.team_id);
  if (updated.error) throw updated.error;
}
