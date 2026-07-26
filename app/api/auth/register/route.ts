import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(100),
  emailRedirectTo: z.string().url(),
});

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_768) return NextResponse.json({ error: "Registration request is too large." }, { status: 413 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, and secure password." }, { status: 400 });
  const base = request.nextUrl.origin;
  if (new URL(parsed.data.emailRedirectTo).origin !== base) {
    return NextResponse.json({ error: "Invalid registration redirect." }, { status: 400 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName }, emailRedirectTo: parsed.data.emailRedirectTo },
  });
  // A uniform response prevents account enumeration.
  if (error && !/already|registered|exists/i.test(error.message)) {
    console.warn(JSON.stringify({ event: "registration_rejected", reason: error.status ?? "provider_error" }));
  }
  return NextResponse.json({ accepted: true });
}
