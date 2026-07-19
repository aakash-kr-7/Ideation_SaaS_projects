"use server";

import { createClient } from "@/lib/supabase/server";
import { startResearchRunSchema, createProjectSchema } from "@/lib/report-schema";
import { z } from "zod";
import { ProjectsRepository } from "@/lib/repositories/projects";
import { ResearchRepository } from "@/lib/repositories/research";
import { TeamsRepository } from "@/lib/repositories/teams";
import { ResearchService } from "@/lib/services/research";
import { errorMessage, isRecord } from "@/lib/supabase/relations";

export async function createProject(formData: z.infer<typeof createProjectSchema>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("Unauthorized");

  const validated = createProjectSchema.parse(formData);

  const teams = await TeamsRepository.getUserTeams();
  const teamMember = teams[0]?.team_members.find((member) => member.user_id === user.id);

  if (!teamMember) throw new Error("No team found for user");

  try {
    const data = await ProjectsRepository.createProject({
      team_id: teamMember.team_id,
      name: validated.name,
      description: validated.description ?? null,
      created_by: user.id,
    });
    return data;
  } catch (error: unknown) {
    throw new Error(errorMessage(error));
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
  } catch (error: unknown) {
    throw new Error(errorMessage(error));
  }
}

export async function startResearchRun(formData: z.infer<typeof startResearchRunSchema>) {
  try {
    const validated = startResearchRunSchema.parse(formData);
    return await ResearchService.startResearchRun(validated);
  } catch (error: unknown) {
    const details = isRecord(error) ? error : {};
    throw new Error(JSON.stringify({
      status: "error",
      code: typeof details.code === "string" ? details.code : "START_RESEARCH_RUN_FAILED",
      message: errorMessage(error, String(error)),
      requestId: typeof details.requestId === "string" ? details.requestId : undefined,
    }));
  }
}

export async function getCreditSnapshot() {
  return ResearchService.getCreditSnapshot();
}

export async function getResearchRuns(projectId: string) {
  try {
    return await ResearchRepository.getProjectRuns(projectId);
  } catch (error: unknown) {
    throw new Error(errorMessage(error));
  }
}

export async function cancelResearchRun(runId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("cancel_research_run" as any, { p_run_id: runId });
  if (error) {
    throw new Error(error.message);
  }
}
