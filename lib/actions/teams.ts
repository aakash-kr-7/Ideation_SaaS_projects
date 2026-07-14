"use server";

import { createClient } from "@/lib/supabase/server";
import { Database } from "@/lib/types";

export async function getTeamInfo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get user's teams with members
  const { data, error } = await supabase
    .from("teams")
    .select(`
      *,
      members:team_members(
        id,
        user_id,
        role,
        user:users(display_name, email, avatar_url)
      ),
      limits:feature_limits(*)
    `);

  if (error) throw new Error(error.message);
  return data;
}

export async function getUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("users")
    .select("*, preferences:user_preferences(*)")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateUserProfile(updates: Database["public"]["Tables"]["users"]["Update"]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
