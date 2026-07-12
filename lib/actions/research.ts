"use server";

import { createClient } from "@/lib/supabase/server";
import { startResearchRunSchema, createProjectSchema } from "@/lib/report-schema";
import { z } from "zod";

export async function createProject(formData: z.infer<typeof createProjectSchema>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("Unauthorized");

  const validated = createProjectSchema.parse(formData);

  // Get user's default team (assuming they have one for now)
  const { data: teamMember, error: teamError } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .single();

  if (teamError || !teamMember) throw new Error("No team found for user");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      team_id: teamMember.team_id,
      name: validated.name,
      description: validated.description,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function startResearchRun(formData: z.infer<typeof startResearchRunSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const validated = startResearchRunSchema.parse(formData);

  const { data, error } = await supabase
    .from("research_runs")
    .insert({
      project_id: validated.project_id,
      idea_name: validated.idea_name,
      idea_description: validated.idea_description,
      target_customer: validated.target_customer,
      market_type: validated.market_type,
      target_region: validated.target_region,
      mode: validated.mode,
      status: "Queued",
      progress: 0,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  
  // Here we would typically trigger an Edge Function or Background Job queue
  // e.g., await fetch('...', { method: 'POST', body: JSON.stringify({ run_id: data.id }) })
  
  return data;
}

export async function getResearchRuns(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
