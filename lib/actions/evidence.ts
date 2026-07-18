"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const evidenceInputSchema = z.object({
  run_id: z.string().uuid(),
  opportunity_id: z.string().uuid().nullable().optional(),
  source_id: z.string().uuid().nullable().optional(),
  signal_type: z.string().min(1),
  strength: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
});

export async function addEvidence(formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Validate basic shape (assuming front-end sends run_id, opportunity_id, etc.)
  const { run_id, opportunity_id, source_id, signal_type, strength, title, snippet } = evidenceInputSchema.parse(formData);

  const { data, error } = await supabase
    .from("evidence_items")
    .insert({
      run_id,
      opportunity_id,
      source_id,
      signal_type,
      strength,
      title,
      snippet,
      verified: false
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getEvidenceForRun(runId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_items")
    .select(`
      *,
      source:sources(*)
    `)
    .eq("run_id", runId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function toggleEvidenceVerification(evidenceId: string, verified: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("evidence_items")
    .update({ verified })
    .eq("id", evidenceId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
