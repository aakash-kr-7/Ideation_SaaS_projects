import { createClient } from "@supabase/supabase-js";

export async function createIsolatedSmokeRun(kind) {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing smoke configuration: ${missing.join(", ")}`);
  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `${kind}-smoke-${suffix}@example.test`;
  const password = `Smoke!9${crypto.randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `${kind} smoke` },
  });
  if (createError || !created.user) throw createError ?? new Error("Smoke user creation failed");
  const userId = created.user.id;
  try {
    const { data: membership, error: membershipError } = await admin.from("team_members")
      .select("team_id").eq("user_id", userId).single();
    if (membershipError || !membership) throw membershipError ?? new Error("Smoke team bootstrap failed");
    const { error: creditError } = await admin.rpc("grant_paid_credits", {
      p_team_id: membership.team_id, p_credits: 3,
      p_external_reference: `${kind}-smoke-${suffix}`, p_metadata: { purpose: "isolated-smoke" },
    });
    if (creditError) throw creditError;
    const { data: project, error: projectError } = await admin.from("projects").insert({
      team_id: membership.team_id, name: `${kind} smoke ${suffix}`, created_by: userId,
    }).select("id").single();
    if (projectError || !project) throw projectError ?? new Error("Smoke project creation failed");
    const user = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await user.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const { data: rows, error: reserveError } = await user.rpc("create_research_run_with_reservation", {
      p_project_id: project.id,
      p_idea_name: `${kind} queue isolation`,
      p_idea_description: "An isolated operational smoke run that must never claim jobs outside its own namespace.",
      p_target_customer: "ShouldBuild release operators",
      p_market_type: "B2B",
      p_target_region: "Local",
      p_assumptions: { purpose: "isolated-smoke" },
      p_mode: "quick_scan",
      p_idempotency_key: crypto.randomUUID(),
      p_request_id: crypto.randomUUID(),
    });
    if (reserveError) throw reserveError;
    const reservation = Array.isArray(rows) ? rows[0] : rows;
    const runId = reservation.run_id;
    const { error: enqueueError } = await admin.rpc("enqueue_research_job", {
      p_run_id: runId, p_stage: "plan", p_input_meta: { smokeNamespace: runId },
      p_stage_iteration: 0, p_batch_index: 0, p_batch_size: 0, p_job_purpose: "smoke",
      p_parent_job_id: null, p_max_attempts: 1, p_visible_after: new Date().toISOString(),
    });
    if (enqueueError) throw enqueueError;
    return { url, serviceKey, admin, user, userId, teamId: membership.team_id, projectId: project.id, runId };
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    throw error;
  }
}

export async function removeIsolatedSmokeRun(smoke) {
  const { error: teamError } = await smoke.admin.rpc("cleanup_isolated_test_team", { p_team_id: smoke.teamId });
  if (teamError) throw new Error(`Smoke namespace cleanup failed for run ${smoke.runId}: ${teamError.message}`);
  const { error } = await smoke.admin.auth.admin.deleteUser(smoke.userId);
  if (error) throw new Error(`Smoke user cleanup failed for namespace ${smoke.runId}: ${error.message}`);
  const { count } = await smoke.admin.from("research_runs").select("id", { count: "exact", head: true }).eq("id", smoke.runId);
  if (count !== 0) throw new Error(`Smoke cleanup left run ${smoke.runId} behind`);
}
