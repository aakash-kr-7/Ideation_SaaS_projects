"use server";

import { createClient } from "@/lib/supabase/server";
import { startResearchRunSchema, createProjectSchema } from "@/lib/report-schema";
import { z } from "zod";
import { ProjectsRepository } from "@/lib/repositories/projects";
import { ResearchRepository } from "@/lib/repositories/research";
import { TeamsRepository } from "@/lib/repositories/teams";

export async function createProject(formData: z.infer<typeof createProjectSchema>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("Unauthorized");

  const validated = createProjectSchema.parse(formData);

  const teams = await TeamsRepository.getUserTeams();
  const teamMember = teams[0]?.team_members.find((tm: any) => tm.user_id === user.id);

  if (!teamMember) throw new Error("No team found for user");

  try {
    const data = await ProjectsRepository.createProject({
      team_id: teamMember.team_id,
      name: validated.name,
      description: validated.description ?? null,
      created_by: user.id,
    });
    return data;
  } catch (error: any) {
    throw new Error(error.message);
  }
}

export async function getProjects() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const teams = await TeamsRepository.getUserTeams();
  const teamId = teams[0]?.id;
  if (!teamId) return [];

  try {
    return await ProjectsRepository.getTeamProjects(teamId);
  } catch (error: any) {
    throw new Error(error.message);
  }
}

export async function startResearchRun(formData: z.infer<typeof startResearchRunSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let runId: string | null = null;
  try {
    const validated = startResearchRunSchema.parse(formData);

    const data = await ResearchRepository.createResearchRun({
      project_id: validated.project_id,
      idea_name: validated.idea_name,
      idea_description: validated.idea_description,
      target_customer: validated.target_customer,
      market_type: validated.market_type as any, // Map to enum safely if needed
      target_region: validated.target_region,
      mode: validated.mode as any,
      created_by: user.id,
    });
    runId = data.id;

    const workerSecret = process.env.WEBHOOK_SECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!workerSecret || !supabaseUrl) throw new Error("Research worker dispatch is not configured.");
    const workerResponse = await fetch(`${supabaseUrl}/functions/v1/research-worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ record: data }),
    });
    if (!workerResponse.ok) {
      const detail = await workerResponse.text();
      throw new Error(`Research worker rejected the run (${workerResponse.status}): ${detail.slice(0, 300)}`);
    }

    return data;
  } catch (err: any) {
    if (runId) {
      await supabase.from("research_runs").update({ status: "Failed", progress: 100, error_message: err.message || String(err) }).eq("id", runId);
    }
    // Log error to error_logs table
    await supabase.from("error_logs").insert({
      user_id: user.id,
      context: "startResearchRun",
      error_message: err.message || String(err),
      stack_trace: err.stack || null,
    });

    // Surface as a structured typed error
    throw new Error(JSON.stringify({
      status: "error",
      code: "START_RESEARCH_RUN_FAILED",
      message: err.message || String(err)
    }));
  }
}

export async function getResearchRuns(projectId: string) {
  try {
    return await ResearchRepository.getProjectRuns(projectId);
  } catch (error: any) {
    throw new Error(error.message);
  }
}
