import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Get user record
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("display_name, onboarding_completed, tour_completed")
    .eq("id", user.id)
    .single();

  if (userError && userError.code !== "PGRST116" && userError.code !== "42P01") {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  // 2. Get user preferences record
  const { data: prefData, error: prefError } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (prefError && prefError.code !== "PGRST116" && prefError.code !== "42P01") {
    return NextResponse.json({ error: prefError.message }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      display_name: userData?.display_name || user.user_metadata?.full_name || null,
      experience_level: prefData?.experience_level || null,
      preferred_market: prefData?.preferred_market || null,
      target_customer_type: prefData?.target_customer_type || null,
      revenue_goal: prefData?.revenue_goal || null,
      business_model: prefData?.business_model || null,
      technical_level: prefData?.technical_level || null,
      region: prefData?.region || null,
      launch_channels: prefData?.launch_channels || null,
      onboarding_completed: userData?.onboarding_completed ?? false,
      tour_completed: userData?.tour_completed ?? false,
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

  // 1. Upsert to users table
  const { data: userData, error: userError } = await supabase
    .from("users")
    .upsert({
      id: user.id,
      display_name: body.display_name ?? null,
      email: user.email,
      onboarding_completed: body.onboarding_completed ?? false,
      tour_completed: body.tour_completed ?? false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select()
    .single();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  // 2. Upsert to user_preferences table
  const { data: prefData, error: prefError } = await supabase
    .from("user_preferences")
    .upsert({
      user_id: user.id,
      experience_level: body.experience_level ?? null,
      preferred_market: body.preferred_market ?? null,
      target_customer_type: body.target_customer_type ?? null,
      revenue_goal: body.revenue_goal ?? null,
      business_model: body.business_model ?? null,
      technical_level: body.technical_level ?? null,
      region: body.region ?? null,
      launch_channels: body.launch_channels ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (prefError) {
    return NextResponse.json({ error: prefError.message }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      display_name: userData.display_name,
      experience_level: prefData.experience_level,
      preferred_market: prefData.preferred_market,
      target_customer_type: prefData.target_customer_type,
      revenue_goal: prefData.revenue_goal,
      business_model: prefData.business_model,
      technical_level: prefData.technical_level,
      region: prefData.region,
      launch_channels: prefData.launch_channels,
      onboarding_completed: userData.onboarding_completed,
      tour_completed: userData.tour_completed,
    }
  });
}
