import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const commandSchema = z.union([
  z.object({ action: z.literal("opt_in") }),
  z.object({ action: z.literal("opt_out") }),
  z.object({
    action: z.literal("submit"),
    checkpointDay: z.union([z.literal(30), z.literal(90), z.literal(180)]),
    interviewsCompleted: z.number().int().min(0).nullable(),
    paidCommitments: z.number().int().min(0).nullable(),
    mvpLaunched: z.boolean().nullable(),
    firstRevenue: z.boolean().nullable(),
    retainedCustomers: z.number().int().min(0).nullable(),
    declaredMilestoneReached: z.boolean().nullable(),
    ideaAbandoned: z.boolean().nullable(),
    abandonmentReason: z.string().trim().max(1000).nullable(),
  }).refine(
    (value) =>
      value.ideaAbandoned !== true || Boolean(value.abandonmentReason?.trim()),
    {
      message: "An abandonment reason is required when the idea is abandoned.",
      path: ["abandonmentReason"],
    },
  ),
]);

async function ownedReport(runId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required", status: 401 } as const;
  const { data: run } = await supabase.from("research_runs")
    .select("id,mode,reports(id)").eq("id", runId).maybeSingle();
  const reports = Array.isArray(run?.reports) ? run.reports : [];
  const reportId = reports[0]?.id;
  if (!run || !reportId) {
    return { error: "Research report not found", status: 404 } as const;
  }
  if (run.mode !== "full_validation") {
    return {
      error: "Outcome checkpoints are available for Full Validation reports.",
      status: 409,
    } as const;
  }
  return { supabase, reportId, userId: user.id } as const;
}

async function loadCheckpoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
  userId: string,
) {
  return await supabase.from("founder_outcome_checkpoints").select(
    "id,opted_in,checkpoint_day,checkpoint_due_at,interviews_completed,paid_commitments,mvp_launched,first_revenue,retained_customers,declared_milestone_reached,idea_abandoned,abandonment_reason,submitted_at,updated_at",
  ).eq("report_id", reportId).eq("user_id", userId)
    .order("checkpoint_day", { ascending: true });
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await ownedReport(id);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  const { data, error } = await loadCheckpoints(
    owned.supabase,
    owned.reportId,
    owned.userId,
  );
  if (error) {
    return NextResponse.json({ error: "Outcome checkpoints could not be loaded." }, {
      status: 500,
    });
  }
  return NextResponse.json({ checkpoints: data ?? [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await ownedReport(id);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  const parsed = commandSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || "Invalid outcome command.",
    }, { status: 400 });
  }
  if (parsed.data.action === "opt_in") {
    const { error } = await owned.supabase.rpc(
      "opt_in_founder_outcome_checkpoints",
      { p_report_id: owned.reportId },
    );
    if (error) {
      return NextResponse.json({ error: "Outcome tracking could not be enabled." }, {
        status: 500,
      });
    }
  } else if (parsed.data.action === "opt_out") {
    const { error } = await owned.supabase.from("founder_outcome_checkpoints")
      .update({ opted_in: false, updated_at: new Date().toISOString() })
      .eq("report_id", owned.reportId).eq("user_id", owned.userId);
    if (error) {
      return NextResponse.json({ error: "Outcome tracking could not be disabled." }, {
        status: 500,
      });
    }
  } else {
    const value = parsed.data;
    const { error } = await owned.supabase.from("founder_outcome_checkpoints")
      .update({
        interviews_completed: value.interviewsCompleted,
        paid_commitments: value.paidCommitments,
        mvp_launched: value.mvpLaunched,
        first_revenue: value.firstRevenue,
        retained_customers: value.retainedCustomers,
        declared_milestone_reached: value.declaredMilestoneReached,
        idea_abandoned: value.ideaAbandoned,
        abandonment_reason: value.ideaAbandoned
          ? value.abandonmentReason
          : null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("report_id", owned.reportId).eq("user_id", owned.userId)
      .eq("checkpoint_day", value.checkpointDay).eq("opted_in", true);
    if (error) {
      return NextResponse.json({ error: "Outcome checkpoint could not be saved." }, {
        status: 500,
      });
    }
  }
  const { data, error } = await loadCheckpoints(
    owned.supabase,
    owned.reportId,
    owned.userId,
  );
  if (error) {
    return NextResponse.json({ error: "Saved, but checkpoints could not be reloaded." }, {
      status: 500,
    });
  }
  return NextResponse.json({ checkpoints: data ?? [] });
}
