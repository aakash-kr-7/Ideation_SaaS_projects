import { z } from "zod";
import { CRITERIA } from "./scoring-engine.ts";

const traceableSentence = z.object({
  text: z.string().min(1), evidence_ids: z.array(z.string().uuid()).min(1),
  score_criteria: z.array(z.enum([...CRITERIA])).default([]),
});
export const finalJudgeSchema = z.object({
  written_verdict: z.enum(["Build Now", "Validate First", "Niche Down", "Weak Signal", "Avoid"]),
  executive_summary: z.array(traceableSentence).length(2),
  methodology: z.array(traceableSentence).length(1),
});

export function assertCitationsBelongToRun(value: unknown, allowedEvidenceIds: Set<string>) {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key === "evidence_ids" && Array.isArray(child)) {
        for (const id of child) if (typeof id !== "string" || !allowedEvidenceIds.has(id)) throw new Error(`Citation ${String(id)} does not belong to this research run.`);
      } else visit(child);
    }
  };
  visit(value);
}
