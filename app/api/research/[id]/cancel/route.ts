import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
  const { data, error } = await rpc("cancel_research_run", { p_run_id: id, p_reason: "Cancelled by user" });
  if (error) {
    const status = error.message.includes("RUN_ALREADY_TERMINAL") ? 409 : error.message.includes("RUN_ACCESS_DENIED") ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ id, status: data });
}
