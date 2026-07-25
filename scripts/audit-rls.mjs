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

try {
  const { data: victimMembership, error: memberError } = await service.from("team_members").select("team_id").eq("user_id", victimId).single();
  if (memberError || !victimMembership) throw memberError || new Error("Victim team was not bootstrapped");
  const { data: project, error: projectError } = await service.from("projects").insert({ team_id: victimMembership.team_id, name: "RLS victim project", created_by: victimId }).select("id").single();
  if (projectError || !project) throw projectError || new Error("Victim project insert failed");
  const { data: run, error: runError } = await service.from("research_runs").insert({ project_id: project.id, created_by: victimId, idea_name: "Tenant isolation", idea_description: "A sufficiently long RLS fixture description", target_customer: "Security teams", market_type: "B2B", target_region: "Global", mode: "quick_scan", status: "Queued", progress: 0 }).select("id").single();
  if (runError || !run) throw runError || new Error("Victim run insert failed");

  const victim = createClient(url, anonKey, { auth: { persistSession: false } });
  const attacker = createClient(url, anonKey, { auth: { persistSession: false } });
  if ((await victim.auth.signInWithPassword({ email: victimEmail, password })).error || (await attacker.auth.signInWithPassword({ email: attackerEmail, password })).error) throw new Error("RLS sign-in failed");
  const victimRead = await victim.from("research_runs").select("id").eq("id", run.id);
  if (victimRead.error || victimRead.data?.length !== 1) throw new Error("Owner cannot read their run");
  const attackerRead = await attacker.from("research_runs").select("id").eq("id", run.id);
  if (attackerRead.error || attackerRead.data?.length !== 0) throw new Error("Cross-tenant research run was exposed");
  const crossInsert = await attacker.from("projects").insert({ team_id: victimMembership.team_id, name: "Forbidden", created_by: attackerId });
  if (!crossInsert.error) throw new Error("Cross-tenant project insert was allowed");

  const internalTables = ["source_registry", "public_retrieval_cache", "gemini_cache", "api_usage_logs", "research_jobs", "research_job_attempts", "research_pipeline_metrics", "research_pipeline_cursors"];
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
  console.log(JSON.stringify({ tenantOwnerRead: "PASS", crossTenantRead: "PASS", crossTenantWrite: "PASS", internalTablesServiceOnly: "PASS", internalCacheCrudDeniedForAnonAndAuthenticated: "PASS", internalTableCount: internalTables.length }, null, 2));
} finally {
  await service.auth.admin.deleteUser(attackerId);
  await service.auth.admin.deleteUser(victimId);
}

async function must(query, operation) {
  const { error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`);
}
