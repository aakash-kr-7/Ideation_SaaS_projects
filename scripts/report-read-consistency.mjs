import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Local Supabase service configuration is required.");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID().slice(0, 8);
const password = `Read!${crypto.randomUUID()}`;
const ownerResult = await db.auth.admin.createUser({
  email: `report-read-owner-${suffix}@example.test`,
  password,
  email_confirm: true,
  user_metadata: { full_name: `reveal-proof-read-${suffix}` },
});
const attackerResult = await db.auth.admin.createUser({
  email: `report-read-attacker-${suffix}@example.test`,
  password,
  email_confirm: true,
  user_metadata: { full_name: `reveal-proof-read-attacker-${suffix}` },
});
if (ownerResult.error || attackerResult.error || !ownerResult.data.user || !attackerResult.data.user) {
  throw ownerResult.error || attackerResult.error || new Error("Unable to create report-read test users.");
}
const ownerId = ownerResult.data.user.id;
const attackerId = attackerResult.data.user.id;
const { data: memberships } = await db.from("team_members").select("team_id,user_id").in("user_id", [ownerId, attackerId]);
const ownerTeamId = memberships?.find((item) => item.user_id === ownerId)?.team_id;
const cleanupTeamIds = (memberships || []).map((item) => item.team_id);

try {
  if (!ownerTeamId) throw new Error("Owner workspace was not provisioned.");
  const project = await insert("projects", { team_id: ownerTeamId, name: "Completed Full Validation read regression", created_by: ownerId });
  const run = await insert("research_runs", {
    project_id: project.id,
    created_by: ownerId,
    idea_name: "Approval audit trail",
    idea_description: "A completed paid Full Validation report with an immutable report version.",
    target_customer: "Client-service agencies",
    market_type: "B2B",
    target_region: "United States and United Kingdom",
    mode: "full_validation",
    status: "Completed",
    progress: 100,
  });
  const opportunity = await insert("opportunities", {
    run_id: run.id,
    name: "Approval audit trail",
    one_liner: "Attributable customer sign-off",
    target_customer: "Client-service agencies",
    core_pain: "Approval disputes",
    market: "B2B SaaS",
  });
  const report = await insert("reports", {
    run_id: run.id,
    opportunity_id: opportunity.id,
    status: "Published",
    executive_summary: "Immutable completed Full Validation fixture.",
    methodology: "Database integration regression.",
  });
  await insert("report_versions", {
    report_id: report.id,
    version_number: 1,
    report_mode: "full_validation",
    market_sizing: { reason: "No market sizing in the read consistency fixture." },
    payload: { marker: "older-version" },
  });
  const latest = await insert("report_versions", {
    report_id: report.id,
    version_number: 2,
    report_mode: "full_validation",
    market_sizing: { reason: "No market sizing in the read consistency fixture." },
    payload: { marker: "canonical-latest-full-validation" },
  });
  for (const [index, format] of ["pdf", "markdown", "csv", "json"].entries()) {
    await insert("report_exports", {
      report_version_id: latest.id,
      format,
      storage_path: `${ownerId}/read-regression-${index}.${format}`,
      byte_size: 10 + index,
      sha256: `read-export-${index}`,
    });
    await insert("report_chart_datasets", {
      report_version_id: latest.id,
      run_id: run.id,
      chart_key: `read-chart-${index}`,
      chart_type: "bar",
      source_data: { values: [index] },
      chart_config: { title: `Chart ${index}` },
      supporting_evidence_ids: [],
      sha256: `read-chart-${index}`,
    });
  }

  const ownerRead = await db.rpc("get_owned_latest_report", { p_run_id: run.id, p_user_id: ownerId });
  if (ownerRead.error) throw ownerRead.error;
  if (ownerRead.data?.state !== "ready") throw new Error(`Completed report was not ready: ${JSON.stringify(ownerRead.data)}`);
  if (ownerRead.data?.reportVersionId !== latest.id || ownerRead.data?.payload?.marker !== "canonical-latest-full-validation") {
    throw new Error("Canonical latest immutable version was not returned.");
  }
  if (ownerRead.data?.exports?.length !== 4 || ownerRead.data?.charts?.length !== 4) {
    throw new Error("Completed report dependencies were not returned atomically.");
  }

  const attackerRead = await db.rpc("get_owned_latest_report", { p_run_id: run.id, p_user_id: attackerId });
  if (attackerRead.error) throw attackerRead.error;
  if (attackerRead.data?.state !== "access_denied") throw new Error("Cross-tenant report metadata was exposed.");

  const pendingRun = await insert("research_runs", {
    project_id: project.id,
    created_by: ownerId,
    idea_name: "Pending consistency state",
    idea_description: "An owned run whose report transaction has not become visible.",
    target_customer: "Client-service agencies",
    market_type: "B2B",
    target_region: "Global",
    mode: "full_validation",
    status: "Generating",
    progress: 95,
  });
  const pendingRead = await db.rpc("get_owned_latest_report", { p_run_id: pendingRun.id, p_user_id: ownerId });
  if (pendingRead.error) throw pendingRead.error;
  if (pendingRead.data?.state !== "pending") throw new Error("Consistency delay was misreported as not found.");

  console.log(JSON.stringify({
    completedFullValidationCanonicalRead: "PASS",
    canonicalLatestVersion: "PASS",
    crossTenantIsolation: "PASS",
    retryableConsistencyState: "PASS",
    runId: run.id,
  }, null, 2));
} finally {
  for (const teamId of cleanupTeamIds) {
    const cleanup = await db.rpc("cleanup_isolated_test_team", { p_team_id: teamId });
    if (cleanup.error) throw cleanup.error;
  }
  await db.auth.admin.deleteUser(attackerId);
  await db.auth.admin.deleteUser(ownerId);
}

async function insert(table, row) {
  const result = await db.from(table).insert(row).select("*").single();
  if (result.error || !result.data) throw result.error || new Error(`Unable to seed ${table}.`);
  return result.data;
}
