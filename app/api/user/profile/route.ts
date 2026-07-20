import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const profileUpdateSchema = z.object({
  display_name: z.string().trim().max(120).nullable().optional(),
  experience_level: z.string().max(80).nullable().optional(),
  preferred_market: z.string().max(80).nullable().optional(),
  target_customer_type: z.string().max(240).nullable().optional(),
  revenue_goal: z.string().max(80).nullable().optional(),
  business_model: z.string().max(80).nullable().optional(),
  technical_level: z.string().max(80).nullable().optional(),
  region: z.string().max(80).nullable().optional(),
  launch_channels: z.array(z.string().max(80)).max(20).nullable().optional(),
  onboarding_completed: z.boolean().optional(),
  tour_completed: z.boolean().optional(),
}).strict();

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

  const parsedBody = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid profile update." }, { status: 400 });
  }
  const body = parsedBody.data;

  // Repair older environments where the auth.users provisioning trigger was
  // missing or had not created the user's profile/team records.
  const { error: bootstrapError } = await supabase.rpc("ensure_user_bootstrap");
  if (bootstrapError) {
    return NextResponse.json({ error: bootstrapError.message }, { status: 500 });
  }

  const userPatch = {
    ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
    ...(body.onboarding_completed !== undefined ? { onboarding_completed: body.onboarding_completed } : {}),
    ...(body.tour_completed !== undefined ? { tour_completed: body.tour_completed } : {}),
    email: user.email,
    updated_at: new Date().toISOString(),
  };

  // Update only fields present in this request. Tour completion must not reset onboarding.
  const { data: userData, error: userError } = await supabase
    .from("users")
    .update(userPatch)
    .eq("id", user.id)
    .select()
    .single();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  const preferenceKeys = [
    "experience_level", "preferred_market", "target_customer_type", "revenue_goal",
    "business_model", "technical_level", "region", "launch_channels",
  ] as const;
  const preferencePatch = Object.fromEntries(
    preferenceKeys.flatMap((key) => body[key] !== undefined ? [[key, body[key]]] : []),
  );

  if (Object.keys(preferencePatch).length > 0) {
    const { error: prefUpdateError } = await supabase
      .from("user_preferences")
      .upsert({ user_id: user.id, ...preferencePatch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (prefUpdateError) {
      return NextResponse.json({ error: prefUpdateError.message }, { status: 500 });
    }
  }

  const { data: prefData, error: prefError } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (prefError) {
    return NextResponse.json({ error: prefError.message }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      display_name: userData.display_name,
      experience_level: prefData?.experience_level ?? null,
      preferred_market: prefData?.preferred_market ?? null,
      target_customer_type: prefData?.target_customer_type ?? null,
      revenue_goal: prefData?.revenue_goal ?? null,
      business_model: prefData?.business_model ?? null,
      technical_level: prefData?.technical_level ?? null,
      region: prefData?.region ?? null,
      launch_channels: prefData?.launch_channels ?? null,
      onboarding_completed: userData.onboarding_completed,
      tour_completed: userData.tour_completed,
    }
  });
}
