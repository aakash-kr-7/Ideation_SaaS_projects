import { assertCitationsBelongToRun, finalJudgeSchema } from "./reasoning.ts";
function expectThrow(fn: () => unknown) { let threw = false; try { fn(); } catch { threw = true; } if (!threw) throw new Error("Expected validation failure"); }
Deno.test("final narrative requires exactly three cited sentences", () => {
  const sentence = { text: "Traceable sentence.", evidence_ids: ["00000000-0000-4000-8000-000000000001"], score_criteria: [] };
  finalJudgeSchema.parse({ written_verdict: "Validate First", executive_summary: [sentence, { ...sentence, text: "Second sentence." }], methodology: [{ ...sentence, text: "Method sentence." }] });
  expectThrow(() => finalJudgeSchema.parse({ written_verdict: "Validate First", executive_summary: [sentence], methodology: [sentence] }));
  expectThrow(() => finalJudgeSchema.parse({ written_verdict: "Validate First", executive_summary: [{ ...sentence, evidence_ids: [] }, sentence], methodology: [sentence] }));
});
Deno.test("foreign evidence citations are rejected", () => { expectThrow(() => assertCitationsBelongToRun({ evidence_ids: ["00000000-0000-4000-8000-000000000099"] }, new Set(["00000000-0000-4000-8000-000000000001"]))); });
