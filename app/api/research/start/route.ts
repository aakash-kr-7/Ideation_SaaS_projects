import { NextResponse } from "next/server";
import { researchRequestSchema } from "@/lib/research/schema";
import { ResearchLaunchError, ResearchService } from "@/lib/services/research";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = researchRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid research request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  try {
    const { data: membership, error: membershipError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership?.team_id) throw new Error("No team is available for this account.");

    const { data: projects, error: projectReadError } = await supabase
      .from("projects")
      .select("id")
      .eq("team_id", membership.team_id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (projectReadError) throw projectReadError;

    let projectId = input.projectId ?? projects?.[0]?.id;
    if (!projectId) {
      const { data: project, error: projectCreateError } = await supabase
        .from("projects")
        .insert({
          team_id: membership.team_id,
          name: "Default Project",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (projectCreateError || !project) {
        throw projectCreateError || new Error("Failed to create a default project.");
      }
      projectId = project.id;
    }

    const run = await ResearchService.startResearchRun({
      project_id: projectId,
      idea_name: input.ideaName,
      idea_description: input.ideaDescription,
      target_customer: input.targetCustomer,
      market_type: input.marketType,
      target_region: input.targetRegion,
      assumptions: input.assumptions,
      mode: input.mode,
      idempotency_key: input.idempotencyKey,
    });

    return NextResponse.json({
      id: run.id,
      status: run.status,
      mode: run.mode,
      creditCost: run.creditCost,
      requestId: run.requestId,
      progressUrl: `/api/research/${run.id}/progress`,
      reportUrl: `/api/research/${run.id}`,
    }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const requestId = error instanceof ResearchLaunchError ? error.requestId : crypto.randomUUID();
    const code = error instanceof ResearchLaunchError ? error.code : "RESEARCH_LAUNCH_FAILED";
    const status = error instanceof ResearchLaunchError ? error.status : 500;
    await supabase.from("error_logs").insert({
      user_id: user.id,
      context: "api:research:start",
      error_message: message,
      stack_trace: error instanceof Error ? error.stack || null : null,
    });
    return NextResponse.json({ error: { code, message, requestId } }, { status });
  }
}
