/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const idea = "A lightweight approval and audit-trail workspace for service teams that need to collect customer sign-off, preserve attributable approval history and reduce disputes.";
const configuredSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!configuredSupabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Browser proof requires local Supabase service configuration.");
const supabaseUrl: string = configuredSupabaseUrl;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const proofDir = path.resolve("artifacts/browser/reveal-proof");
const runs: Record<string, string> = {};
let account: { email: string; password: string; userId: string };

async function signIn(page: Page, credentials = account) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"), { timeout: 30000 });
  if (page.url().includes("/onboarding")) {
    await page.getByRole("button", { name: "Skip for now", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
  }
}

async function invokeScopedWorker(runId: string) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/research-worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ trigger: "browser-customer-proof", runId }),
  });
  const payload = await response.json();
  if (!response.ok && response.status !== 409) throw new Error(`Worker failed for ${runId}: ${JSON.stringify(payload)}`);
  if (payload.run_id && payload.run_id !== runId) throw new Error(`Wrong queue namespace claimed: expected ${runId}, got ${payload.run_id}`);
  return payload;
}

async function submitAndComplete(page: Page, mode: "quick_scan" | "full_validation") {
  const label = mode === "quick_scan" ? "Quick Scan" : "Full Validation";
  const slug = mode === "quick_scan" ? "quick" : "full";
  await page.goto("/research/new");
  await page.getByRole("button").filter({ hasText: label }).first().click();
  await page.getByLabel("Idea name", { exact: true }).fill(`Approval evidence workspace — ${label}`);
  await page.getByLabel("What does it do?", { exact: true }).fill(idea);
  await page.getByLabel("Customer", { exact: false }).fill("Client-service agencies and service operations leaders");
  await page.getByLabel("Geography", { exact: false }).fill("United States and United Kingdom");
  await page.getByLabel("Industry", { exact: false }).fill("Professional services software");
  await page.screenshot({ path: path.join(proofDir, `${slug}-launch.png`), fullPage: true });

  await page.getByRole("button", { name: `Run ${label}`, exact: true }).click();
  await page.waitForURL(/\/research\/([0-9a-f-]{36})\/progress/);
  const runId = page.url().match(/\/research\/([0-9a-f-]{36})\/progress/)?.[1];
  if (!runId) throw new Error("Submitted run ID was not present in the progress URL.");
  runs[mode] = runId;

  const [{ data: reservation }, { data: queued }] = await Promise.all([
    admin.from("credit_reservations").select("status,credit_cost,credit_source").eq("run_id", runId).single(),
    admin.from("research_jobs").select("id,status,stage").eq("run_id", runId).order("created_at").limit(1).single(),
  ]);
  expect(reservation?.status).toBe("reserved");
  expect(reservation?.credit_cost).toBe(mode === "quick_scan" ? 1 : 3);
  expect(queued?.stage).toBe("plan");
  await expect(page.getByTestId("research-room")).toBeVisible();

  let sawLiveSource = false;
  let sawMultipleStages = false;
  let reachedCompleted = false;
  for (let cycle = 0; cycle < 360; cycle += 1) {
    const [{ data: run, error }, { count: sourceEvents, error: sourceError }, { count: completedJobs, error: jobsError }] = await Promise.all([
      admin.from("research_runs").select("status,current_stage,credit_state").eq("id", runId).single(),
      admin.from("source_retrieval_audit").select("id", { count: "exact", head: true }).eq("run_id", runId),
      admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "completed"),
    ]);
    if (error || sourceError || jobsError) throw error ?? sourceError ?? jobsError;
    if ((sourceEvents ?? 0) > 0 && !sawLiveSource) {
      const activityResponse = await page.request.get(`/api/research/${runId}/progress`);
      expect(activityResponse.status()).toBe(200);
      const activity = await activityResponse.json();
      expect(activity.retrieval.length).toBeGreaterThan(0);
      if (!page.url().includes("/progress")) {
        await page.goto(`/research/${runId}/progress`);
      } else {
        await page.reload();
      }
      const sourceCards = page.locator(".research-source-feed article");
      if (await sourceCards.count()) {
        await expect(sourceCards.first()).toBeVisible();
        await page.screenshot({ path: path.join(proofDir, `${slug}-live-research.png`), fullPage: true });
      }
      sawLiveSource = true;
    }
    if ((completedJobs ?? 0) > 1) sawMultipleStages = true;
    if (run.status === "Completed") {
      reachedCompleted = true;
      break;
    }
    if (run.status === "Failed" || run.status === "Cancelled") throw new Error(`Run ${runId} ended as ${run.status}`);
    await invokeScopedWorker(runId);
    // A self-triggered worker may already own the next job. Poll the persisted
    // state instead of assuming the wake-up response itself advanced the run.
    await page.waitForTimeout(500);
  }
  expect(sawLiveSource, "No persisted live source event became visible").toBe(true);
  expect(sawMultipleStages, "Pipeline did not show real stage progression").toBe(true);
  expect(reachedCompleted, `Run ${runId} did not complete within the browser proof window`).toBe(true);

  await page.goto(`/research/${runId}/results`);
  await expect(page.getByRole("heading", { name: `Approval evidence workspace — ${label}`, exact: true })).toBeVisible();
  await expect(page.getByText("Report completeness", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".report-recommendation")).toContainText("Founder action:");
  await expect(page.locator(".report-recommendation")).toContainText("Success threshold:");
  await expect(page.locator(".report-recommendation")).toContainText("Failure threshold:");
  expect(await page.locator("body").innerText()).not.toContain("SOURCE_ID");
  // The conclusion tab intentionally shows the two decision charts; the
  // persisted version is checked below for the complete supported chart set.
  expect(await page.locator(".report-chart").count()).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inspect evidence", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Exports", exact: true }).click();
  const exportButtons = page.locator(".export-panel button");
  expect(await exportButtons.count()).toBe(4);
  const download = page.waitForEvent("download");
  await exportButtons.first().click();
  expect((await download).suggestedFilename()).toMatch(/\.(pdf|md|csv|json)$/);
  await page.screenshot({ path: path.join(proofDir, `${slug}-completed-report.png`), fullPage: true });

  const [{ data: completed }, { data: consumed }, { count: citations }, { count: charts }, { count: exports }] = await Promise.all([
    admin.from("research_runs").select("status,credit_state").eq("id", runId).single(),
    admin.from("credit_reservations").select("status").eq("run_id", runId).single(),
    admin.from("score_evidence_refs").select("evidence_id,score_breakdowns!inner(opportunity_scores!inner(opportunities!inner(run_id)))", { count: "exact", head: true }).eq("score_breakdowns.opportunity_scores.opportunities.run_id", runId),
    admin.from("report_chart_datasets").select("id", { count: "exact", head: true }).eq("run_id", runId),
    admin.from("report_exports").select("id,report_versions!inner(reports!inner(run_id))", { count: "exact", head: true }).eq("report_versions.reports.run_id", runId),
  ]);
  expect(completed).toMatchObject({ status: "Completed", credit_state: "consumed" });
  expect(consumed?.status).toBe("consumed");
  expect(citations ?? 0).toBeGreaterThan(0);
  expect(charts ?? 0).toBeGreaterThanOrEqual(4);
  expect(exports ?? 0).toBe(4);
  const [{ data: reportRow }, { data: numericChecks }, { data: competitors }, { data: specialistRows }, { data: acceptedEvidence }, { data: contradictionRows }] = await Promise.all([
    admin.from("reports").select("report_versions(version_number,payload)").eq("run_id", runId).single(),
    admin.from("numeric_claim_validations").select("evidence_item_id,status,claim_type,narrative_value,extracted_source_value,normalized_value,source_url,reason,methodology_status").eq("run_id", runId),
    admin.from("competitors").select("name,classification,comparability,opportunities!inner(run_id)").eq("opportunities.run_id", runId),
    admin.from("reasoning_agent_outputs").select("agent_name,payload").eq("run_id", runId).in("agent_name", ["competition", "market", "pricing", "risk", "demand", "gtm"]),
    admin.from("evidence_items").select("id,acceptance_decision,excluded").eq("run_id", runId),
    admin.from("evidence_contradictions").select("tested_claim,supporting_evidence_ids,challenging_evidence_ids,relationship,resolution_status,segment_applicability,geography_applicability,unresolved_implication").eq("run_id", runId),
  ]);
  const versions = [...((reportRow as any)?.report_versions || [])].sort((a: any, b: any) => b.version_number - a.version_number);
  const persistedPayload = versions[0]?.payload as any;
  expect(persistedPayload?.decisionProduct?.primaryRecommendation).toContain("Decision unlocked:");
  expect(numericChecks?.every((item: any) =>
    ["verified", "flagged", "rejected"].includes(item.status) &&
    item.source_url && item.normalized_value &&
    (item.status !== "rejected" || (!item.evidence_item_id && item.reason))
  )).toBe(true);
  expect((numericChecks || []).filter((item: any) => item.status === "rejected")
    .every((item: any) => !item.evidence_item_id)).toBe(true);
  expect((competitors || []).every((item: any) => ["direct", "adjacent", "substitute", "workflow_workaround"].includes(item.classification))).toBe(true);
  expect((competitors || []).filter((item: any) => /docusign|dropbox sign|hellosign/i.test(item.name)).every((item: any) => item.classification !== "direct")).toBe(true);
  const acceptedIds = new Set((acceptedEvidence || []).filter((item: any) => !item.excluded && item.acceptance_decision === "accepted_core").map((item: any) => item.id));
  expect((specialistRows || []).every((row: any) => {
    const evidenceIds = row.payload?.evidence_ids || [];
    const supporting = /SupportsOpportunity/i.test(String(row.payload?.direction || ""));
    return evidenceIds.every((id: string) => acceptedIds.has(id)) && (!supporting || evidenceIds.length > 0) && !/SOURCE_ID/i.test(JSON.stringify(row.payload));
  })).toBe(true);
  expect((contradictionRows || []).every((item: any) =>
    item.tested_claim && item.relationship && item.supporting_evidence_ids.length && item.challenging_evidence_ids.length
  )).toBe(true);
  if (mode === "full_validation") {
    expect(persistedPayload?.publicationStandard?.gapPassPerformed).toBe(true);
    if (!persistedPayload?.publicationStandard?.met) {
      expect(persistedPayload?.decisionProduct?.evidenceConfidence?.band).not.toBe("High");
      expect(persistedPayload?.publicationStandard?.publishedWithReducedConfidence).toBe(true);
    }
    if (!(contradictionRows || []).length) {
      expect(JSON.stringify(persistedPayload)).toContain("No strong proposition-specific contradictory evidence was found");
    }
  }
  return runId;
}

test.describe.serial("real authenticated customer research journeys", () => {
  test.beforeAll(async () => {
    await mkdir(proofDir, { recursive: true });
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `reveal-proof-${suffix}@example.test`;
    const password = `Reveal!9${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `reveal-proof-${suffix}` } });
    if (error || !data.user) throw error ?? new Error("Unable to create browser proof customer.");
    account = { email, password, userId: data.user.id };
    const { error: profileError } = await admin.from("users").update({ onboarding_completed: true, tour_completed: true }).eq("id", data.user.id);
    if (profileError) throw profileError;
    const { data: membership, error: membershipError } = await admin.from("team_members").select("team_id").eq("user_id", data.user.id).single();
    if (membershipError || !membership) throw membershipError ?? new Error("Browser proof workspace was not provisioned.");
    const { error: creditError } = await admin.rpc("grant_paid_credits", {
      p_team_id: membership.team_id, p_credits: 20,
      p_external_reference: `reveal-proof-${suffix}`, p_metadata: { purpose: "real-browser-release-proof" },
    });
    if (creditError) throw creditError;
  });

  test.afterAll(async () => {
    await writeFile(path.join(proofDir, "run-ids.json"), JSON.stringify({
      idea,
      quickScanRunId: runs.quick_scan,
      fullValidationRunId: runs.full_validation,
      buildProof: "../expected-build.json",
      preservedAt: new Date().toISOString(),
    }, null, 2));
    if (account?.userId) {
      const { data: membership } = await admin.from("team_members").select("team_id").eq("user_id", account.userId).maybeSingle();
      if (membership?.team_id) await admin.rpc("cleanup_isolated_test_team", { p_team_id: membership.team_id });
      await admin.auth.admin.deleteUser(account.userId);
    }
  });

  test("Quick Scan completes through the authenticated browser path", async ({ page }) => {
    await signIn(page);
    await submitAndComplete(page, "quick_scan");
  });

  test("Full Validation completes through the authenticated browser path", async ({ page }) => {
    await signIn(page);
    const fullRunId = await submitAndComplete(page, "full_validation");
    const quickRunId = runs.quick_scan;
    const [{ data: quickEvidence }, { data: fullEvidence }] = await Promise.all([
      admin.from("evidence_items").select("id,source_domain,evidence_topic,source_tier").eq("run_id", quickRunId).eq("excluded", false),
      admin.from("evidence_items").select("id,source_domain,evidence_topic,source_tier").eq("run_id", fullRunId).eq("excluded", false),
    ]);
    expect((fullEvidence || []).length).toBeGreaterThan((quickEvidence || []).length);
    expect(new Set((fullEvidence || []).map((item: any) => item.source_domain)).size)
      .toBeGreaterThan(new Set((quickEvidence || []).map((item: any) => item.source_domain)).size);
    expect(new Set((fullEvidence || []).map((item: any) => item.evidence_topic).filter(Boolean)).size)
      .toBeGreaterThan(new Set((quickEvidence || []).map((item: any) => item.evidence_topic).filter(Boolean)).size);
  });

  test("report history and comparison are explicit authenticated browser journeys", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("group", { name: "Filter report history" })).toBeVisible();
    await page.getByRole("button", { name: "Full Validation", exact: true }).click();
    await expect(page.locator(`.report-history-list a[href="/research/${runs.full_validation}/results"]`)).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.locator(`.report-history-list a[href="/research/${runs.quick_scan}/results"]`)).toBeVisible();

    await page.goto("/compare");
    await expect(page.getByText("Compare your ideas side by side", { exact: true })).toBeVisible();
    await expect(page.getByRole("row", { name: /Overall score/ })).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveCount(3);
    await expect(page.getByRole("note")).toContainText("Different research depth");
  });

  test("user cancellation and launch/cancel retries settle one credit exactly once", async ({ page }) => {
    await signIn(page);
    const oversized = await page.request.post("/api/research/start", {
      headers: { "content-type": "application/json" },
      data: "x".repeat(1_048_577),
    });
    expect(oversized.status()).toBe(413);
    const idempotencyKey = crypto.randomUUID();
    const body = {
      ideaName: "Retry-safe cancellation proof",
      ideaDescription: "A browser-created research run used to prove idempotent launch and user-initiated cancellation.",
      targetCustomer: "Operations teams",
      marketType: "B2B",
      targetRegion: "Global",
      assumptions: { industry: "Operations software" },
      mode: "quick_scan",
      idempotencyKey,
    };
    const responses = await Promise.all([
      page.request.post("/api/research/start", { data: body }),
      page.request.post("/api/research/start", { data: body }),
      page.request.post("/api/research/start", { data: body }),
    ]);
    expect(responses.every((response) => response.status() === 202)).toBe(true);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    const retryRunIds = new Set(payloads.map((payload) => payload.id));
    expect(retryRunIds.size).toBe(1);
    const runId = payloads[0].id;

    const [{ count: runCount }, { data: reservations }] = await Promise.all([
      admin.from("research_runs").select("id", { count: "exact", head: true }).eq("idempotency_key", idempotencyKey),
      admin.from("credit_reservations").select("id,status,credit_cost").eq("run_id", runId),
    ]);
    expect(runCount).toBe(1);
    expect(reservations).toHaveLength(1);
    expect(reservations?.[0]).toMatchObject({ status: "reserved", credit_cost: 1 });

    await page.goto(`/research/${runId}/progress`);
    await page.getByRole("button", { name: "Cancel research", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Research cancelled" }).first()).toBeVisible();
    const retryCancels = await Promise.all([
      page.request.post(`/api/research/${runId}/cancel`),
      page.request.post(`/api/research/${runId}/cancel`),
      page.request.post(`/api/research/${runId}/cancel`),
    ]);
    expect(retryCancels.every((response) => [200, 409].includes(response.status()))).toBe(true);
    const [{ data: run }, { data: reservation }, { count: reservationCount }] = await Promise.all([
      admin.from("research_runs").select("status,credit_state").eq("id", runId).single(),
      admin.from("credit_reservations").select("status,finalized_at").eq("run_id", runId).single(),
      admin.from("credit_reservations").select("id", { count: "exact", head: true }).eq("run_id", runId),
    ]);
    expect(run).toMatchObject({ status: "Cancelled", credit_state: "restored" });
    expect(reservation?.status).toBe("restored");
    expect(reservation?.finalized_at).toBeTruthy();
    expect(reservationCount).toBe(1);
    runs.cancelled = runId;
  });

  test("cross-account report access is rejected through the production browser session", async ({ page }) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const credentials = {
      email: `cross-account-${suffix}@example.test`,
      password: `CrossAccount!9${crypto.randomUUID()}`,
    };
    const { data, error } = await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
      user_metadata: { full_name: `cross-account-${suffix}` },
    });
    if (error || !data.user) throw error ?? new Error("Unable to create cross-account browser user.");
    await admin.rpc("bootstrap_onboarding_account", {
      p_user_id: data.user.id,
      p_email: credentials.email,
      p_full_name: `Cross Account ${suffix}`,
    });
    await admin.from("users").update({ onboarding_completed: true }).eq("id", data.user.id);
    const secondContext = await page.context().browser()!.newContext();
    const secondPage = await secondContext.newPage();
    try {
      await signIn(secondPage, { ...credentials, userId: data.user.id });
      const apiResponse = await secondPage.request.get(`/api/research/${runs.full_validation}`);
      expect([403, 404]).toContain(apiResponse.status());
      const routeResponse = await secondPage.goto(`/research/${runs.full_validation}/results`);
      expect([200, 404]).toContain(routeResponse?.status());
      await expect(secondPage.locator("body")).not.toContainText("Approval evidence workspace");
    } finally {
      await secondContext.close();
      await admin.auth.admin.deleteUser(data.user.id);
    }
  });
});
