import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { researchRequestSchema } from "@/lib/research/schema";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { researchStore } from "@/lib/research/store";
import { ResearchRequest } from "@/lib/research/types";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const parsed = researchRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid research request", details: parsed.error.flatten() }, { status: 400 });
    }

    const input = parsed.data as ResearchRequest;
    
    // Check if we have API keys configured (i.e. DB/Real execution mode)
    const hasKeys = process.env.GROQ_API_KEY && process.env.TAVILY_API_KEY;

    if (hasKeys) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const dbClient = userId ? supabase : supabaseAdmin;

      let projectId = "";

      // Ensure a project exists for the run
      if (userId) {
        const { data: teams } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", userId);
        
        let teamId = teams?.[0]?.team_id;
        if (!teamId) {
          const { data: newTeam } = await supabase
            .from("teams")
            .insert({ name: "Default Team", slug: `team-${Math.random().toString(36).slice(2, 8)}` })
            .select("id")
            .single();
          teamId = newTeam?.id;
          if (teamId) {
            await supabase.from("team_members").insert({ team_id: teamId, user_id: userId, role: "owner" });
          }
        }
        
        if (teamId) {
          const { data: proj } = await supabase
            .from("projects")
            .select("id")
            .eq("team_id", teamId)
            .limit(1);
          if (proj && proj.length > 0) {
            projectId = proj[0].id;
          } else {
            const { data: newProj } = await supabase
              .from("projects")
              .insert({ team_id: teamId, name: "Default Project", created_by: userId })
              .select("id")
              .single();
            projectId = newProj?.id || "";
          }
        }
      } else {
        // No auth user. Use service role to bypass RLS for local seeding
        const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
        const supabaseAdmin = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: anyProj } = await supabaseAdmin.from("projects").select("id").limit(1);
        if (anyProj && anyProj.length > 0) {
          projectId = anyProj[0].id;
        } else {
          const dummyUserId = "00000000-0000-0000-0000-000000000000";
          const { data: userCheck } = await supabaseAdmin.from("users").select("id").eq("id", dummyUserId).maybeSingle();
          if (!userCheck) {
            await supabaseAdmin.from("users").insert({ id: dummyUserId, display_name: "Local Tester", email: "tester@local.dev" });
          }
          
          let teamId = "";
          const { data: anyTeam } = await supabaseAdmin.from("teams").select("id").limit(1);
          if (anyTeam && anyTeam.length > 0) {
            teamId = anyTeam[0].id;
          } else {
            const { data: newTeam } = await supabaseAdmin
              .from("teams")
              .insert({ name: "Local Test Team", slug: "local-test-team" })
              .select("id")
              .single();
            teamId = newTeam?.id || "";
            if (teamId) {
              await supabaseAdmin.from("team_members").insert({ team_id: teamId, user_id: dummyUserId, role: "owner" });
            }
          }
          
          if (teamId) {
            const { data: newProj } = await supabaseAdmin
              .from("projects")
              .insert({ team_id: teamId, name: "Local Test Project", created_by: dummyUserId })
              .select("id")
              .single();
            projectId = newProj?.id || "";
          }
        }
      }

      if (!projectId) {
        throw new Error("Unable to resolve project_id for research run.");
      }

      // Create new queued research run row
      const runId = randomUUID();
      const { data: dbRun, error: dbRunErr } = await dbClient
        .from("research_runs")
        .insert({
          id: runId,
          project_id: projectId,
          created_by: userId,
          idea_name: input.ideaName,
          idea_description: input.ideaDescription,
          target_customer: input.targetCustomer,
          market_type: input.marketType,
          target_region: input.targetRegion,
          mode: input.depth === "fast" ? "Fast Scan" : "Deep Validation",
          status: "Queued",
          progress: 0
        })
        .select()
        .single();

      if (dbRunErr || !dbRun) {
        throw dbRunErr || new Error("Failed to insert research run to database.");
      }

      // Trigger the local background Deno worker asynchronously
      const workerUrl = `${process.env.SUPABASE_URL || "http://127.0.0.1:54321"}/functions/v1/research-worker`;
      const webhookSecret = process.env.WEBHOOK_SECRET || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

      void fetch(workerUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${webhookSecret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          record: {
            id: runId,
            idea_name: input.ideaName,
            idea_description: input.ideaDescription,
            target_customer: input.targetCustomer,
            market_type: input.marketType,
            target_region: input.targetRegion,
            mode: input.depth === "fast" ? "Fast Scan" : "Deep Validation"
          }
        })
      }).then(async (res) => {
        console.log(`Worker trigger response status: ${res.status}`);
        if (!res.ok) {
          console.error("Worker trigger failed:", await res.text());
        }
      }).catch((err) => {
        console.error("Worker trigger network error:", err);
      });

      return NextResponse.json({
        id: runId,
        status: "Queued",
        progressUrl: `/api/research/${runId}/progress`,
        reportUrl: `/api/research/${runId}`
      }, { status: 202 });
    } else {
      // Local mock fallback mode
      const id = randomUUID();
      const now = new Date().toISOString();
      researchStore.create({
        id,
        request: input,
        mode: input.depth === "deep" ? "Deep Validation" : "Fast Scan",
        stage: "Queued",
        progress: 0,
        message: "Queued for research",
        queries: [],
        sources: [],
        evidence: [],
        createdAt: now,
        updatedAt: now
      });

      void runResearchPipeline(id, input);

      return NextResponse.json({
        id,
        status: "Queued",
        progressUrl: `/api/research/${id}/progress`,
        reportUrl: `/api/research/${id}`
      }, { status: 202 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
