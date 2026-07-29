import { createClient } from "@supabase/supabase-js";
import { executeLivingReportRefresh } from "../_shared/research/living-report-runtime.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  const authorized = Boolean(
    token &&
      ((serviceRoleKey && timingSafeEqual(token, serviceRoleKey)) ||
        (webhookSecret && timingSafeEqual(token, webhookSecret))),
  );
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" &&
        /^[0-9a-f-]{36}$/i.test(body.reportId)
      ? body.reportId
      : "";
    const trigger = body.trigger === "scheduled" ? "scheduled" : "manual";
    const requestId = typeof body.requestId === "string" &&
        /^[0-9a-f-]{36}$/i.test(body.requestId)
      ? body.requestId
      : null;
    if (!reportId) return json({ error: "A valid reportId is required." }, 400);
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const siteOrigin = Deno.env.get("SITE_ORIGIN")?.trim() ||
      "https://tryshouldbuild.netlify.app";
    EdgeRuntime.waitUntil((async () => {
      try {
        const result = await executeLivingReportRefresh({
          db,
          reportId,
          trigger,
          siteOrigin,
        });
        if (requestId) {
          await db.from("report_refresh_requests").update(
            result.status === "already_running"
              ? {
                status: "pending",
                refresh_run_id: null,
                started_at: null,
                completed_at: null,
              }
              : {
                status: "completed",
                refresh_run_id: result.refreshRunId ?? null,
                completed_at: new Date().toISOString(),
              },
          ).eq("id", requestId).eq("report_id", reportId);
        }
      } catch (error) {
        console.error("[report-refresh-worker:background]", error);
        if (requestId) {
          await db.from("report_refresh_requests").update({
            status: "failed",
            error_message: error instanceof Error
              ? error.message
              : String(error),
            completed_at: new Date().toISOString(),
          }).eq("id", requestId).eq("report_id", reportId);
        }
      }
    })());
    return json({ status: "accepted", reportId, requestId }, 202);
  } catch (error) {
    console.error("[report-refresh-worker]", error);
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
