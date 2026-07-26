import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase URL, anon key, and service-role key are required.");
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const password = `Rls!${crypto.randomUUID()}`;
const victimEmail = `rls-victim-${crypto.randomUUID()}@example.test`;
const attackerEmail = `rls-attacker-${crypto.randomUUID()}@example.test`;
const victimCreated = await service.auth.admin.createUser({ email: victimEmail, password, email_confirm: true });
const attackerCreated = await service.auth.admin.createUser({ email: attackerEmail, password, email_confirm: true });
if (victimCreated.error || attackerCreated.error || !victimCreated.data.user || !attackerCreated.data.user) throw victimCreated.error || attackerCreated.error || new Error("RLS users were not created");
const victimId = victimCreated.data.user.id; const attackerId = attackerCreated.data.user.id;
const { data: cleanupMemberships } = await service.from("team_members").select("team_id").in("user_id", [victimId, attackerId]);
const cleanupTeamIds = (cleanupMemberships || []).map((item) => item.team_id);

try {
  const { data: victimMembership, error: memberError } = await service.from("team_members").select("team_id").eq("user_id", victimId).single();
  if (memberError || !victimMembership) throw memberError || new Error("Victim team was not bootstrapped");
  const { data: project, error: projectError } = await service.from("projects").insert({ team_id: victimMembership.team_id, name: "RLS victim project", created_by: victimId }).select("id").single();
  if (projectError || !project) throw projectError || new Error("Victim project insert failed");
  const { data: run, error: runError } = await service.from("research_runs").insert({ project_id: project.id, created_by: victimId, idea_name: "Tenant isolation", idea_description: "A sufficiently long RLS fixture description", target_customer: "Security teams", market_type: "B2B", target_region: "Global", mode: "quick_scan", status: "Queued", progress: 0 }).select("id").single();
  if (runError || !run) throw runError || new Error("Victim run insert failed");
  const { data: source } = await requiredInsert(service, "sources", { run_id: run.id, title: "Private source", url: "https://victim.example.test/source", canonical_url: "https://victim.example.test/source", source_type: "official_docs", source_tier: 1, source_class: "primary", publisher: "Victim", extraction_method: "direct_http", retrieval_date: new Date().toISOString(), text_content: "Private tenant evidence", source_domain: "victim.example.test" });
  const { data: evidence } = await requiredInsert(service, "evidence_items", { run_id: run.id, source_id: source.id, canonical_url: source.url, associated_claim_ids: [crypto.randomUUID()], signal_type: "Demand", strength: "High", title: "Private evidence", snippet: "Tenant private evidence", relevant_excerpt: "Tenant private evidence", source_title: source.title, publisher: "Victim", extraction_method: "direct_http", retrieval_date: new Date().toISOString(), source_class: "primary", support_classification: "support", verified: true, evidence_family: "problem", source_tier: 1, source_domain: "victim.example.test", claim_fingerprint: crypto.randomUUID() });
  const { data: firstNode } = await requiredInsert(service, "evidence_graph_nodes", { run_id: run.id, node_type: "claim", node_key: "private-claim", label: "Private claim" });
  const { data: secondNode } = await requiredInsert(service, "evidence_graph_nodes", { run_id: run.id, node_type: "source", node_key: "private-source", label: "Private source" });
  const { data: _edge } = await requiredInsert(service, "evidence_graph_edges", { run_id: run.id, from_node_id: firstNode.id, to_node_id: secondNode.id, relation: "supported_by", evidence_ids: [evidence.id] });
  const { data: opportunity } = await requiredInsert(service, "opportunities", { run_id: run.id, name: "Private opportunity", one_liner: "Private", target_customer: "Private customer", core_pain: "Private pain", market: "B2B" });
  const { data: score } = await requiredInsert(service, "opportunity_scores", { opportunity_id: opportunity.id, total: 61, confidence: 72, verdict: "Validate First" });
  const { data: report } = await requiredInsert(service, "reports", { run_id: run.id, opportunity_id: opportunity.id, status: "Published", executive_summary: "Private report", methodology: "Private methodology" });
  const { data: version } = await requiredInsert(service, "report_versions", { report_id: report.id, version_number: 1, report_mode: "quick_scan", market_sizing: { reason: "No qualified market sizing in this isolation fixture." }, payload: { privateIdea: "tenant-only", specialists: [{ name: "risk", finding: "private" }] } });
  const { data: chart } = await requiredInsert(service, "report_chart_datasets", { report_version_id: version.id, run_id: run.id, chart_key: "private-chart", chart_type: "bar", sha256: "rls-chart", source_data: { values: [1] } });
  const { data: reportExport } = await requiredInsert(service, "report_exports", { report_version_id: version.id, format: "json", storage_path: `${victimId}/private.json`, byte_size: 7, sha256: "rls-export" });

  const victim = createClient(url, anonKey, { auth: { persistSession: false } });
  const attacker = createClient(url, anonKey, { auth: { persistSession: false } });
  if ((await victim.auth.signInWithPassword({ email: victimEmail, password })).error || (await attacker.auth.signInWithPassword({ email: attackerEmail, password })).error) throw new Error("RLS sign-in failed");
  const victimRead = await victim.from("research_runs").select("id").eq("id", run.id);
  if (victimRead.error || victimRead.data?.length !== 1) throw new Error("Owner cannot read their run");
  const attackerRead = await attacker.from("research_runs").select("id").eq("id", run.id);
  if (attackerRead.error || attackerRead.data?.length !== 0) throw new Error("Cross-tenant research run was exposed");
  const crossInsert = await attacker.from("projects").insert({ team_id: victimMembership.team_id, name: "Forbidden", created_by: attackerId });
  if (!crossInsert.error) throw new Error("Cross-tenant project insert was allowed");

  const tenantMatrix = [
    ["users", "id", victimId], ["teams", "id", victimMembership.team_id], ["projects", "id", project.id],
    ["team_credit_accounts", "team_id", victimMembership.team_id], ["research_runs", "id", run.id],
    ["sources", "id", source.id], ["evidence_items", "id", evidence.id],
    ["opportunities", "id", opportunity.id], ["opportunity_scores", "id", score.id],
    ["reports", "id", report.id], ["report_versions", "id", version.id],
    ["report_chart_datasets", "id", chart.id], ["report_exports", "id", reportExport.id],
  ];
  for (const [table, column, value] of tenantMatrix) {
    const ownerResult = await victim.from(table).select("*").eq(column, value);
    if (ownerResult.error || ownerResult.data?.length !== 1) throw new Error(`Owner access failed for ${table}: ${ownerResult.error?.message || "missing row"}`);
    const attackerResult = await attacker.from(table).select("*").eq(column, value);
    if (attackerResult.error || attackerResult.data?.length !== 0) throw new Error(`Cross-tenant data was exposed from ${table}`);
  }

  const storagePath = `${victimId}/rls-private.txt`;
  const upload = await service.storage.from("exports").upload(storagePath, "private tenant export", { contentType: "text/plain", upsert: true });
  if (upload.error) throw upload.error;
  const attackerDownload = await attacker.storage.from("exports").download(storagePath);
  if (!attackerDownload.error) throw new Error("Cross-tenant Storage download was allowed");
  await service.storage.from("exports").remove([storagePath]);
  const assetPath = `${victimId}/rls-owner-asset.txt`;
  const ownerAssetUpload = await victim.storage.from("user-assets").upload(assetPath, "owner asset", { contentType: "text/plain", upsert: true });
  if (ownerAssetUpload.error) throw new Error(`Owner-path asset upload failed: ${ownerAssetUpload.error.message}`);
  const attackerAssetDownload = await attacker.storage.from("user-assets").download(assetPath);
  if (!attackerAssetDownload.error) throw new Error("Cross-tenant user-assets download was allowed");
  const attackerAssetUpload = await attacker.storage.from("user-assets").upload(`${victimId}/attacker.txt`, "forbidden", { contentType: "text/plain" });
  if (!attackerAssetUpload.error) throw new Error("Cross-tenant user-assets upload was allowed");
  const ownerAssetDownload = await victim.storage.from("user-assets").download(assetPath);
  if (ownerAssetDownload.error) throw new Error(`Owner could not read user asset: ${ownerAssetDownload.error.message}`);
  await victim.storage.from("user-assets").remove([assetPath]);

  const ownerProgress = await victim.rpc("get_research_progress_snapshot", { p_run_id: run.id });
  const attackerProgress = await attacker.rpc("get_research_progress_snapshot", { p_run_id: run.id });
  const ownerActivity = await victim.rpc("get_research_activity_detail", { p_run_id: run.id });
  const attackerActivity = await attacker.rpc("get_research_activity_detail", { p_run_id: run.id });
  if (ownerProgress.error || ownerActivity.error) throw new Error(`Owner could not use customer-facing research RPCs: ${ownerProgress.error?.message || ownerActivity.error?.message}`);
  if (!attackerProgress.error || !attackerActivity.error) throw new Error("Cross-tenant research RPC access was allowed");

  let victimEvents = 0;
  let attackerEvents = 0;
  const victimChannel = victim.channel(`rls-victim-${run.id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "research_runs", filter: `id=eq.${run.id}` }, () => { victimEvents += 1; });
  const attackerChannel = attacker.channel(`rls-attacker-${run.id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "research_runs", filter: `id=eq.${run.id}` }, () => { attackerEvents += 1; });
  await Promise.all([subscribe(victimChannel), subscribe(attackerChannel)]);
  await new Promise(resolve => setTimeout(resolve, 1_000));
  for (let attempt = 0; attempt < 5 && victimEvents === 0; attempt += 1) {
    await must(service.from("research_runs").update({ progress_detail: `realtime-${crypto.randomUUID()}` }).eq("id", run.id), "publish Realtime isolation event");
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  await Promise.all([victim.removeChannel(victimChannel), attacker.removeChannel(attackerChannel)]);
  victim.realtime.disconnect();
  attacker.realtime.disconnect();
  if (victimEvents < 1 || attackerEvents !== 0) throw new Error(`Realtime tenant isolation failed: ${JSON.stringify({ victimEvents, attackerEvents })}`);

  const internalTables = ["source_registry", "public_retrieval_cache", "gemini_cache", "api_usage_logs", "research_jobs", "research_job_attempts", "research_pipeline_metrics", "research_pipeline_cursors", "evidence_graph_nodes", "evidence_graph_edges", "research_briefs", "evidence_contradictions", "operational_alerts"];
  for (const table of internalTables) {
    const authenticated = await attacker.from(table).select("*").limit(1);
    if (!authenticated.error) throw new Error(`Authenticated client retained Data API access to internal table ${table}`);
    const anonymous = await createClient(url, anonKey, { auth: { persistSession: false } }).from(table).select("*").limit(1);
    if (!anonymous.error) throw new Error(`Anonymous client retained Data API access to internal table ${table}`);
    const backend = await service.from(table).select("*").limit(1);
    if (backend.error) throw new Error(`Service role cannot access internal table ${table}: ${backend.error.message}`);
  }

  const cacheFixtures = [
    {
      table: "source_registry",
      key: { domain: `rls-${crypto.randomUUID()}.test` },
      row: { domain: `rls-insert-${crypto.randomUUID()}.test`, evidence_families: ["test"], enabled: true },
      update: { enabled: false },
    },
    {
      table: "public_retrieval_cache",
      key: { canonical_url: `https://rls-${crypto.randomUUID()}.test/cache` },
      row: { canonical_url: `https://rls-insert-${crypto.randomUUID()}.test/cache`, content_hash: "rls", text_content: "rls", expires_at: new Date(Date.now() + 60_000).toISOString() },
      update: { text_content: "forbidden" },
    },
    {
      table: "gemini_cache",
      key: { run_id: run.id, prompt_hash: `rls-${crypto.randomUUID()}`, model: "rls-test" },
      row: { run_id: run.id, prompt_hash: `rls-insert-${crypto.randomUUID()}`, model: "rls-test", response_text: "forbidden" },
      update: { response_text: "forbidden" },
    },
  ];
  for (const fixture of cacheFixtures) {
    await must(service.from(fixture.table).insert({ ...fixture.key, ...(fixture.table === "source_registry" ? { evidence_families: ["test"] } : {}), ...(fixture.table === "public_retrieval_cache" ? { content_hash: "rls", text_content: "rls", expires_at: new Date(Date.now() + 60_000).toISOString() } : {}), ...(fixture.table === "gemini_cache" ? { response_text: "rls" } : {}) }), `seed ${fixture.table}`);
    for (const [role, client] of [["anonymous", createClient(url, anonKey, { auth: { persistSession: false } })], ["authenticated", attacker]]) {
      const filters = Object.entries(fixture.key);
      let read = client.from(fixture.table).select("*");
      let update = client.from(fixture.table).update(fixture.update);
      let remove = client.from(fixture.table).delete();
      for (const [column, value] of filters) {
        read = read.eq(column, value);
        update = update.eq(column, value);
        remove = remove.eq(column, value);
      }
      if (!(await read).error) throw new Error(`${role} read was allowed on ${fixture.table}`);
      if (!(await client.from(fixture.table).insert(fixture.row)).error) throw new Error(`${role} insert was allowed on ${fixture.table}`);
      if (!(await update).error) throw new Error(`${role} update was allowed on ${fixture.table}`);
      if (!(await remove).error) throw new Error(`${role} delete was allowed on ${fixture.table}`);
    }
    let cleanup = service.from(fixture.table).delete();
    for (const [column, value] of Object.entries(fixture.key)) cleanup = cleanup.eq(column, value);
    await must(cleanup, `clean up ${fixture.table}`);
  }
  console.log(JSON.stringify({ tenantOwnerRead: "PASS", crossTenantRead: "PASS", crossTenantWrite: "PASS", tenantMatrix: "PASS", tenantTableCount: tenantMatrix.length, exportsStorageIsolation: "PASS", userAssetsOwnerPathIsolation: "PASS", customerResearchRpcs: "PASS", specialistIsolation: "covered by tenant-scoped immutable report_versions payload", realtimeIsolation: "PASS", realtimeOwnerEvents: victimEvents, realtimeCrossTenantEvents: attackerEvents, internalTablesServiceOnly: "PASS", internalCacheCrudDeniedForAnonAndAuthenticated: "PASS", internalTableCount: internalTables.length }, null, 2));
} finally {
  for (const teamId of cleanupTeamIds) await service.rpc("cleanup_isolated_test_team", { p_team_id: teamId });
  await service.auth.admin.deleteUser(attackerId);
  await service.auth.admin.deleteUser(victimId);
}

async function must(query, operation) {
  const { error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function requiredInsert(client, table, row) {
  const result = await client.from(table).insert(row).select("*").single();
  if (result.error || !result.data) throw result.error || new Error(`Unable to seed ${table}`);
  return result;
}

function subscribe(channel) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timed out")), 10_000);
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); reject(new Error(`Realtime subscription failed: ${status}`)); }
    });
  });
}
