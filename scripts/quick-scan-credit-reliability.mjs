import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error("Supabase URL, anon key, and service-role key are required.");
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `quick-credit-${crypto.randomUUID()}@example.test`;
const password = `Quick!${crypto.randomUUID()}`;
const created = await service.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (created.error || !created.data.user) throw created.error || new Error("User creation failed.");
const userId = created.data.user.id;

try {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const membership = await service.from("team_members").select("team_id").eq("user_id", userId).single();
  if (membership.error) throw membership.error;
  const creditSeed = await service.from("team_credit_accounts").update({
    paid_credits: 10,
    reserved_paid_credits: 0,
  }).eq("team_id", membership.data.team_id);
  if (creditSeed.error) throw creditSeed.error;
  const project = await service.from("projects").insert({
    team_id: membership.data.team_id,
    created_by: userId,
    name: "Quick Scan credit reliability",
  }).select("id").single();
  if (project.error) throw project.error;

  const reserve = async (suffix, mode = "quick_scan") => {
    const result = await client.rpc("create_research_run_with_reservation", {
      p_project_id: project.data.id,
      p_idea_name: `Credit ${suffix}`,
      p_idea_description: "A sufficiently detailed Quick Scan credit reliability fixture.",
      p_target_customer: "Test buyers",
      p_market_type: "B2B",
      p_target_region: "Global",
      p_assumptions: [],
      p_mode: mode,
      p_idempotency_key: crypto.randomUUID(),
      p_request_id: crypto.randomUUID(),
    });
    if (result.error) throw result.error;
    return result.data?.[0]?.run_id;
  };

  const unavailableRunId = await reserve("unavailable");
  if (!unavailableRunId) throw new Error("Unavailable fixture was not reserved.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await service.rpc("terminate_research_run", {
      p_run_id: unavailableRunId,
      p_error_class: "research_unavailable",
      p_error_message: "RESEARCH_UNAVAILABLE: quota blocked",
      p_failed_stage: "grounded_research",
    });
    if (result.error) throw result.error;
  }
  const [unavailableRun, unavailableReservation, unavailableLedger] = await Promise.all([
    service.from("research_runs").select("status,research_outcome,credit_state").eq("id", unavailableRunId).single(),
    service.from("credit_reservations").select("status").eq("run_id", unavailableRunId).single(),
    service.from("credit_ledger").select("event_type").eq("run_id", unavailableRunId),
  ]);
  if (unavailableRun.error || unavailableReservation.error || unavailableLedger.error) {
    throw unavailableRun.error || unavailableReservation.error || unavailableLedger.error;
  }
  const unavailableEvents = unavailableLedger.data.map((row) => row.event_type);
  if (
    unavailableRun.data.status !== "Failed" ||
    unavailableRun.data.research_outcome !== "research_unavailable" ||
    unavailableRun.data.credit_state !== "restored" ||
    unavailableReservation.data.status !== "restored" ||
    unavailableEvents.filter((event) => event === "reserve").length !== 1 ||
    unavailableEvents.filter((event) => event === "restore").length !== 1 ||
    unavailableEvents.includes("consume")
  ) {
    throw new Error(`Research Unavailable credit invariant failed: ${JSON.stringify({
      run: unavailableRun.data,
      reservation: unavailableReservation.data,
      events: unavailableEvents,
    })}`);
  }

  const completedResearchRunId = await reserve("completed-research");
  if (!completedResearchRunId) throw new Error("Completed research fixture was not reserved.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await service.rpc("finalize_research_credit", {
      p_run_id: completedResearchRunId,
      p_outcome: "consume",
    });
    if (result.error) throw result.error;
  }
  const [completedReservation, completedLedger] = await Promise.all([
    service.from("credit_reservations").select("status").eq("run_id", completedResearchRunId).single(),
    service.from("credit_ledger").select("event_type").eq("run_id", completedResearchRunId),
  ]);
  if (completedReservation.error || completedLedger.error) {
    throw completedReservation.error || completedLedger.error;
  }
  const completedEvents = completedLedger.data.map((row) => row.event_type);
  if (
    completedReservation.data.status !== "consumed" ||
    completedEvents.filter((event) => event === "reserve").length !== 1 ||
    completedEvents.filter((event) => event === "consume").length !== 1 ||
    completedEvents.includes("restore")
  ) {
    throw new Error(`Completed research credit invariant failed: ${JSON.stringify({
      reservation: completedReservation.data,
      events: completedEvents,
    })}`);
  }

  const fullUnavailableRunId = await reserve(
    "full-validation-unavailable",
    "full_validation",
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await service.rpc("terminate_research_run", {
      p_run_id: fullUnavailableRunId,
      p_error_class: "research_unavailable",
      p_error_message: "RESEARCH_UNAVAILABLE: grounded provider failed",
      p_failed_stage: "grounded_research",
    });
    if (result.error) throw result.error;
  }
  const [fullUnavailableRun, fullUnavailableReservation, fullUnavailableLedger] =
    await Promise.all([
      service.from("research_runs").select(
        "status,research_outcome,credit_state",
      ).eq("id", fullUnavailableRunId).single(),
      service.from("credit_reservations").select("status").eq(
        "run_id",
        fullUnavailableRunId,
      ).single(),
      service.from("credit_ledger").select("event_type").eq(
        "run_id",
        fullUnavailableRunId,
      ),
    ]);
  const fullEvents = (fullUnavailableLedger.data || []).map((row) =>
    row.event_type
  );
  if (
    fullUnavailableRun.error || fullUnavailableReservation.error ||
    fullUnavailableLedger.error ||
    fullUnavailableRun.data.research_outcome !== "research_unavailable" ||
    fullUnavailableReservation.data.status !== "restored" ||
    fullEvents.filter((event) => event === "reserve").length !== 1 ||
    fullEvents.filter((event) => event === "restore").length !== 1 ||
    fullEvents.includes("consume")
  ) {
    throw new Error(`Full Validation unavailable credit invariant failed: ${
      JSON.stringify({
        run: fullUnavailableRun.data,
        reservation: fullUnavailableReservation.data,
        events: fullEvents,
      })
    }`);
  }

  console.log(JSON.stringify({
    result: "PASS",
    unavailable: {
      runId: unavailableRunId,
      outcome: unavailableRun.data.research_outcome,
      credit: unavailableReservation.data.status,
      events: unavailableEvents,
    },
    completedResearch: {
      runId: completedResearchRunId,
      credit: completedReservation.data.status,
      events: completedEvents,
    },
    fullValidationUnavailable: {
      runId: fullUnavailableRunId,
      outcome: fullUnavailableRun.data.research_outcome,
      credit: fullUnavailableReservation.data.status,
      events: fullEvents,
    },
  }, null, 2));
} finally {
  const membership = await service.from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  if (membership.data?.team_id) {
    await service.rpc("cleanup_isolated_test_team", {
      p_team_id: membership.data.team_id,
      p_user_id: userId,
    });
  }
  await service.auth.admin.deleteUser(userId);
}
