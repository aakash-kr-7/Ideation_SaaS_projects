"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { evidenceSchema } from "@/lib/report-schema";

export async function addEvidence(formData: Record<string, any>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Validate basic shape (assuming front-end sends run_id, opportunity_id, etc.)
  const { run_id, opportunity_id, source_id, signal_type, strength, title, snippet } = formData;

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
