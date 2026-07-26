import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
}).strict();
const updateSchema = createSchema.partial().extend({ id: z.string().uuid() }).strict();

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

export async function GET() {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const { data, error } = await supabase.from("projects").select("id,name,description,created_at,updated_at").order("created_at");
  if (error) return NextResponse.json({ error: "Projects could not be loaded." }, { status: 500 });
  return NextResponse.json({ projects: data });
}

export async function POST(request: Request) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid project name." }, { status: 400 });
  const { data: membership } = await supabase.from("team_members").select("team_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Your workspace is not ready." }, { status: 409 });
  const { data, error } = await supabase.from("projects").insert({
    team_id: membership.team_id, created_by: user.id, name: parsed.data.name, description: parsed.data.description ?? null,
  }).select("id,name,description,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: "Project could not be created." }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid project details." }, { status: 400 });
  const { id, ...patch } = parsed.data;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No project changes were supplied." }, { status: 400 });
  const { data, error } = await supabase.from("projects").update(patch).eq("id", id)
    .select("id,name,description,created_at,updated_at").maybeSingle();
  if (error) return NextResponse.json({ error: "Project could not be updated." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project: data });
}
