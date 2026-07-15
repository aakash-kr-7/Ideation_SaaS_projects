import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase environment variables");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `Audit-${randomUUID()}-aA1!`;
const victimEmail = `rls-victim-${suffix}@example.test`;
const attackerEmail = `rls-attacker-${suffix}@example.test`;
const cleanup = [];

async function one(table, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.code || "error"} ${error.message}`);
  return data;
}

async function insert(table, payload, remember = true) {
  const row = await one(table, service.from(table).insert(payload).select().single());
  if (remember) cleanup.unshift({ table, key: primaryKey(table), value: row[primaryKey(table)] });
  return row;
}

function primaryKey(table) {
  if (table === "user_preferences") return "user_id";
  if (table === "feature_limits") return "team_id";
  if (table === "scoring_weights") return "criterion";
  return "id";
}

async function sample(table) {
  const { data, error } = await service.from(table).select("*").limit(1).maybeSingle();
  if (error || !data) throw new Error(`No sample row for ${table}: ${error?.message || "empty"}`);
  return data;
}

async function clone(table, overrides = {}) {
  const source = await sample(table);
  const payload = { ...source, ...overrides };
  const pk = primaryKey(table);
  if (pk === "id") payload.id = randomUUID();
  delete payload.created_at;
  delete payload.updated_at;
  if ("slug" in payload) payload.slug = `rls-${suffix}-${randomUUID().slice(0, 6)}`;
  if ("email" in payload) payload.email = `clone-${suffix}@example.test`;
  if ("query_hash" in payload) payload.query_hash = `rls-${suffix}-${randomUUID()}`;
  if ("query_string" in payload) payload.query_string = `rls-${suffix}-${randomUUID()}`;
  if ("stripe_customer_id" in payload) payload.stripe_customer_id = `cus_rls_${suffix}`;
  if ("stripe_subscription_id" in payload) payload.stripe_subscription_id = `sub_rls_${suffix}`;
  if ("storage_path" in payload) payload.storage_path = `rls/${suffix}/${randomUUID()}.json`;
  return insert(table, payload);
}

async function main() {
  const victimAuth = await service.auth.admin.createUser({ email: victimEmail, password, email_confirm: true });
  if (victimAuth.error) throw victimAuth.error;
  const attackerAuth = await service.auth.admin.createUser({ email: attackerEmail, password, email_confirm: true });
  if (attackerAuth.error) throw attackerAuth.error;
  const victimId = victimAuth.data.user.id;
  const attackerId = attackerAuth.data.user.id;

  try {
    const attacker = createClient(url, anonKey, { auth: { persistSession: false } });
    const signedIn = await attacker.auth.signInWithPassword({ email: attackerEmail, password });
    if (signedIn.error) throw signedIn.error;

    const victimUser = await one("users", service.from("users").select("*").eq("id", victimId).single());
    const victimTeam = await one("teams", service.from("teams").select("*").eq("created_by", victimId).single());
    const victimMember = await one("team_members", service.from("team_members").select("*").eq("team_id", victimTeam.id).eq("user_id", victimId).single());
    const victimLimit = await one("feature_limits", service.from("feature_limits").select("*").eq("team_id", victimTeam.id).single());
    const victimPreference = await insert("user_preferences", { user_id: victimId, theme_preference: "system" });

    const project = await insert("projects", { team_id: victimTeam.id, name: `RLS fixture ${suffix}`, created_by: victimId });
    const run = await insert("research_runs", {
      project_id: project.id, created_by: victimId, idea_name: `RLS fixture ${suffix}`,
      idea_description: "Disposable cross-tenant authorization fixture", target_customer: "Security auditors",
      market_type: "B2B", target_region: "Global", mode: "Fast Scan", status: "Queued", progress: 0,
    });
    const stage = await insert("research_stages", { run_id: run.id, stage_name: "Queued", status: "Queued", progress_detail: "RLS fixture" });
    const comparison = await insert("saved_comparisons", { project_id: project.id, name: `RLS ${suffix}`, run_ids: [run.id], created_by: victimId });
    const opportunity = await clone("opportunities", { run_id: run.id, name: `RLS opportunity ${suffix}` });
    const source = await clone("sources", { run_id: run.id, url: `https://example.test/${suffix}` });
    const evidence = await clone("evidence_items", { run_id: run.id, opportunity_id: opportunity.id, source_id: source.id });
    const competitor = await clone("competitors", { opportunity_id: opportunity.id, name: `RLS competitor ${suffix}` });
    const risk = await clone("risks", { opportunity_id: opportunity.id });
    const pricing = await clone("pricing_models", { opportunity_id: opportunity.id });
    const mvp = await clone("mvp_plans", { opportunity_id: opportunity.id });
    const mvpItem = await clone("mvp_scope_items", { mvp_plan_id: mvp.id });
    const launch = await clone("launch_plans", { opportunity_id: opportunity.id });
    const launchStrategy = await clone("launch_strategies", { launch_plan_id: launch.id });
    const score = await clone("opportunity_scores", { opportunity_id: opportunity.id });
    const breakdown = await clone("score_breakdowns", { score_id: score.id, criterion: `rls-${suffix}` });
    const evidenceRef = await clone("score_evidence_refs", { score_breakdown_id: breakdown.id, evidence_id: evidence.id });
    const report = await clone("reports", { run_id: run.id, opportunity_id: opportunity.id });
    const versionSource = await sample("report_versions");
    const reportVersion = await insert("report_versions", { report_id: report.id, version_number: 1, payload: versionSource.payload }, false);
    const reportExport = await clone("report_exports", { report_version_id: reportVersion.id, format: "json" });
    const reasoning = await clone("reasoning_agent_outputs", { run_id: run.id, agent_name: "competition" });
    const usage = await clone("api_usage_logs", { run_id: run.id, provider: "rls-audit", operation: "authorization-test" });
    const analytics = await insert("analytics_events", { user_id: victimId, event_name: "rls_audit", event_data: { suffix } });
    const errorLog = await insert("error_logs", { user_id: victimId, run_id: run.id, context: "rls_audit", error_message: "Disposable fixture" });
    const auditLog = await insert("audit_logs", { user_id: victimId, team_id: victimTeam.id, action: "rls_audit", entity_type: "fixture", entity_id: run.id, metadata: { suffix } });
    const job = await insert("background_jobs", { run_id: run.id, job_type: "rls_audit", status: "Queued" });
    const notification = await insert("notifications", { user_id: victimId, title: "RLS audit", message: "Disposable fixture", type: "Info" });
    const cached = await insert("cached_research", { query_hash: `rls-${suffix}`, result: { suffix }, expires_at: new Date(Date.now() + 3600000).toISOString() });
    const search = await insert("search_cache", { query_string: `rls-${suffix}`, results: { suffix }, expires_at: new Date(Date.now() + 3600000).toISOString() });
    const billingCustomer = await insert("billing_customers", { team_id: victimTeam.id, stripe_customer_id: `cus_rls_${suffix}` });
    const billingSubscription = await insert("billing_subscriptions", { team_id: victimTeam.id, stripe_subscription_id: `sub_rls_${suffix}`, plan_id: "audit", status: "active", current_period_end: new Date(Date.now() + 86400000).toISOString() });
    const scoringWeight = await insert("scoring_weights", { criterion: `rls-${suffix}`, weight: 1, description: "Disposable authorization fixture" });

    const fixtures = {
      users: victimUser, teams: victimTeam, team_members: victimMember, user_preferences: victimPreference,
      feature_limits: victimLimit, projects: project, research_runs: run, research_stages: stage,
      saved_comparisons: comparison, opportunities: opportunity, sources: source, evidence_items: evidence,
      competitors: competitor, risks: risk, pricing_models: pricing, mvp_plans: mvp,
      mvp_scope_items: mvpItem, launch_plans: launch, launch_strategies: launchStrategy,
      opportunity_scores: score, score_breakdowns: breakdown, score_evidence_refs: evidenceRef,
      reports: report, report_versions: reportVersion, report_exports: reportExport,
      reasoning_agent_outputs: reasoning, api_usage_logs: usage, analytics_events: analytics,
      error_logs: errorLog, audit_logs: auditLog, background_jobs: job, notifications: notification,
      cached_research: cached, search_cache: search, billing_customers: billingCustomer,
      billing_subscriptions: billingSubscription, scoring_weights: scoringWeight,
    };

    const matrix = [];
    for (const [table, fixture] of Object.entries(fixtures).sort(([a], [b]) => a.localeCompare(b))) {
      const pk = primaryKey(table);
      const key = fixture[pk];
      const selectResult = await attacker.from(table).select("*").eq(pk, key);
      const updateResult = await attacker.from(table).update({ [pk]: key }).eq(pk, key).select();
      const deleteResult = await attacker.from(table).delete().eq(pk, key).select();

      const insertPayload = { ...fixture };
      delete insertPayload.created_at;
      delete insertPayload.updated_at;
      if (pk === "id") insertPayload.id = randomUUID();
      else if (table === "scoring_weights") insertPayload.criterion = `attacker-${suffix}`;
      if ("slug" in insertPayload) insertPayload.slug = `attacker-${suffix}`;
      if ("email" in insertPayload) insertPayload.email = `attacker-${suffix}@example.test`;
      if ("query_hash" in insertPayload) insertPayload.query_hash = `attacker-${suffix}`;
      if ("query_string" in insertPayload) insertPayload.query_string = `attacker-${suffix}`;
      if ("stripe_customer_id" in insertPayload) insertPayload.stripe_customer_id = `cus_attacker_${suffix}`;
      if ("stripe_subscription_id" in insertPayload) insertPayload.stripe_subscription_id = `sub_attacker_${suffix}`;
      if ("storage_path" in insertPayload) insertPayload.storage_path = `attacker/${suffix}/${randomUUID()}.json`;
      if (table === "report_versions") insertPayload.version_number = 999999;
      const insertResult = await attacker.from(table).insert(insertPayload).select();

      const blockedRows = (result) => !result.error && Array.isArray(result.data) && result.data.length === 0;
      const rlsError = (result) => Boolean(result.error && ["42501", "PGRST301"].includes(result.error.code));
      const selectPass = blockedRows(selectResult);
      const updatePass = blockedRows(updateResult) || rlsError(updateResult);
      const deletePass = blockedRows(deleteResult) || rlsError(deleteResult);
      const insertPass = rlsError(insertResult);
      matrix.push({
        table, select: selectPass ? "PASS" : "FAIL", insert: insertPass ? "PASS" : "FAIL",
        update: updatePass ? "PASS" : "FAIL", delete: deletePass ? "PASS" : "FAIL",
        evidence: {
          select: selectResult.error?.code || `${selectResult.data?.length ?? "?"} rows`,
          insert: insertResult.error?.code || `${insertResult.data?.length ?? "?"} rows`,
          update: updateResult.error?.code || `${updateResult.data?.length ?? "?"} rows`,
          delete: deleteResult.error?.code || `${deleteResult.data?.length ?? "?"} rows`,
        },
      });
    }
    console.log(JSON.stringify({ tested_at: new Date().toISOString(), table_count: matrix.length, victim_id: victimId, attacker_id: attackerId, matrix }, null, 2));
  } finally {
    for (const item of cleanup) {
      await service.from(item.table).delete().eq(item.key, item.value);
    }
    await service.auth.admin.deleteUser(attackerId);
    await service.auth.admin.deleteUser(victimId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
