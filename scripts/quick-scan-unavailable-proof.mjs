import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerToken = process.env.WEBHOOK_SECRET || serviceKey;
if (!url || !anonKey || !serviceKey || !workerToken) {
  throw new Error("Local Supabase URL and worker credentials are required.");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `research-unavailable-${crypto.randomUUID()}@example.test`;
const password = `Unavailable!${crypto.randomUUID()}`;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (created.error || !created.data.user) throw created.error || new Error("User creation failed.");
const userId = created.data.user.id;
let runId;

try {
  const membership = await admin.from("team_members").select("team_id").eq("user_id", userId).single();
  if (membership.error) throw membership.error;
  const project = await admin.from("projects").insert({
    team_id: membership.data.team_id,
    created_by: userId,
    name: "Research unavailable proof",
  }).select("id").single();
  if (project.error) throw project.error;
  const user = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const reservation = await user.rpc("create_research_run_with_reservation", {
    p_project_id: project.data.id,
    p_idea_name: "Unavailable research fixture",
    p_idea_description: "A bounded fixture proving technical research failure cannot become a market verdict.",
    p_target_customer: "Test buyers",
    p_market_type: "B2B SaaS",
    p_target_region: "Global",
    p_assumptions: [],
    p_mode: "quick_scan",
    p_idempotency_key: crypto.randomUUID(),
    p_request_id: crypto.randomUUID(),
  });
  if (reservation.error) throw reservation.error;
  runId = reservation.data?.[0]?.run_id;
  if (!runId) throw new Error("Run was not reserved.");
  const enqueued = await admin.rpc("enqueue_research_job", {
    p_run_id: runId,
    p_stage: "plan",
    p_input_meta: { mode: "quick_scan" },
    p_stage_iteration: 0,
    p_batch_index: 0,
    p_batch_size: 0,
    p_job_purpose: "stage",
    p_parent_job_id: null,
    p_max_attempts: 1,
    p_visible_after: new Date().toISOString(),
  });
  if (enqueued.error) throw enqueued.error;

  for (let attempt = 0; attempt < 8; attempt++) {
    await callWorker();
    const run = await admin.from("research_runs")
      .select("status,research_outcome,credit_state,error_message")
      .eq("id", runId)
      .single();
    if (run.error) throw run.error;
    if (run.data.status === "Failed") break;
  }

  const [run, reservationState, ledger, packs, reports] = await Promise.all([
    admin.from("research_runs").select("status,research_outcome,credit_state,error_message").eq("id", runId).single(),
    admin.from("credit_reservations").select("status").eq("run_id", runId).single(),
    admin.from("credit_ledger").select("event_type").eq("run_id", runId),
    admin.from("quick_scan_research_pack_statuses").select("pack_key,status,accepted_evidence_count").eq("run_id", runId),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("run_id", runId),
  ]);
  for (const result of [run, reservationState, ledger, packs, reports]) {
    if (result.error) throw result.error;
  }
  const events = ledger.data.map((row) => row.event_type);
  if (
    run.data.status !== "Failed" ||
    run.data.research_outcome !== "research_unavailable" ||
    run.data.credit_state !== "restored" ||
    reservationState.data.status !== "restored" ||
    !String(run.data.error_message || "").startsWith("RESEARCH_UNAVAILABLE:") ||
    reports.count !== 0 ||
    events.filter((event) => event === "reserve").length !== 1 ||
    events.filter((event) => event === "restore").length !== 1 ||
    events.includes("consume")
  ) {
    throw new Error(`Research Unavailable invariant failed: ${JSON.stringify({
      run: run.data,
      reservation: reservationState.data,
      events,
      reportCount: reports.count,
      packs: packs.data,
    })}`);
  }
  console.log(JSON.stringify({
    result: "PASS",
    runId,
    outcome: run.data.research_outcome,
    verdictProduced: false,
    credit: reservationState.data.status,
    ledgerEvents: events,
    packStatuses: packs.data,
  }, null, 2));
} finally {
  await admin.auth.admin.deleteUser(userId);
}

async function callWorker() {
  const response = await fetch(`${url}/functions/v1/research-worker`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ runId }),
  });
  if (!response.ok && response.status !== 202) {
    throw new Error(`Worker ${response.status}: ${await response.text()}`);
  }
}
