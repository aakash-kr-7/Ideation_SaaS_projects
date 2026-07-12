import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "no rows returned" — that's fine, profile doesn't exist yet
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    profile: profile || {
      id: user.id,
      display_name: user.user_metadata?.full_name || null,
      experience_level: null,
      preferred_market: null,
      target_customer_type: null,
      revenue_goal: null,
      business_model: null,
      technical_level: null,
      region: null,
      launch_channels: null,
      onboarding_completed: false,
      tour_completed: false,
    },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const profileData = {
    id: user.id,
    display_name: body.display_name ?? null,
    experience_level: body.experience_level ?? null,
    preferred_market: body.preferred_market ?? null,
    target_customer_type: body.target_customer_type ?? null,
    revenue_goal: body.revenue_goal ?? null,
    business_model: body.business_model ?? null,
    technical_level: body.technical_level ?? null,
    region: body.region ?? null,
    launch_channels: body.launch_channels ?? null,
    onboarding_completed: body.onboarding_completed ?? false,
    tour_completed: body.tour_completed ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(profileData, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
