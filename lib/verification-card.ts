import "server-only";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const verificationCardSchema = z.object({
  version: z.literal(2),
  title: z.string().regex(/^ShouldBuild \d+(?:\.\d+)?$/),
  verdict: z.string().min(1),
  evidenceConfidence: z.string().min(1),
  independentEvidenceGroups: z.number().int().nonnegative(),
  currentAsOf: z.string(),
  immutableVerificationUrl: z.string().url(),
  methodologyUrl: z.string().url().or(z.string().startsWith("/")),
  interpretation: z.literal("decision_readiness_not_success_probability"),
});

export type PublicVerificationCard = z.infer<typeof verificationCardSchema>;

export async function loadPublicVerificationCard(
  publicId: string,
): Promise<PublicVerificationCard | null> {
  if (!z.string().uuid().safeParse(publicId).success) return null;
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from("report_verification_cards")
    .select("payload")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = verificationCardSchema.safeParse(data.payload);
  return parsed.success ? parsed.data : null;
}
