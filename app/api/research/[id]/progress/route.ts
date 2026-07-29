import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  const [{ data, error }, { data: detail, error: detailError }, { data: runOutcome }] = await Promise.all([
    supabase.rpc("get_research_progress_snapshot", { p_run_id: id }),
    rpc("get_research_activity_detail", { p_run_id: id }),
    supabase.from("research_runs").select("research_outcome,retry_after").eq("id", id).maybeSingle(),
  ]);
  if (error) {
    const missing = error.code === "P0002" || error.message.includes("RESEARCH_RUN_NOT_FOUND");
    return NextResponse.json(
      { error: missing ? "Research run not found" : "Research activity is temporarily unavailable." },
      { status: missing ? 404 : 503 },
    );
  }

  if (detailError) {
    console.error(JSON.stringify({ event: "research_activity_detail_failed", runId: id, code: detailError.code }));
  }
  const snapshot = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const additions = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const publicOutcome = runOutcome as unknown as {
    research_outcome?: string | null;
    retry_after?: string | null;
  } | null;
  const decisions = new Map(
    Array.isArray(additions.retrievalDecisions)
      ? additions.retrievalDecisions.map((item: { id: string }) => [item.id, item])
      : [],
  );
  const evidenceDecisions = new Map(
    Array.isArray(additions.evidenceDecisions)
      ? additions.evidenceDecisions.map((item: { id: string }) => [item.id, item])
      : [],
  );
  return NextResponse.json({
    ...snapshot,
    ...additions,
    researchOutcome: publicOutcome?.research_outcome ?? null,
    retryAfter: publicOutcome?.retry_after ?? null,
    ...(publicOutcome?.research_outcome === "research_unavailable"
      ? {
        publicFailureReason:
          "Mandatory research was unavailable, so no market verdict was produced. Your reserved credit was restored. Please retry when research is available.",
      }
      : {}),
    retrieval: Array.isArray(snapshot.retrieval)
      ? snapshot.retrieval.map((item: { id: string }) => ({ ...item, ...(decisions.get(item.id) ?? {}) }))
      : [],
    evidence: Array.isArray(snapshot.evidence)
      ? snapshot.evidence.map((item: { id: string }) => ({ ...item, ...(evidenceDecisions.get(item.id) ?? {}) }))
      : [],
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
