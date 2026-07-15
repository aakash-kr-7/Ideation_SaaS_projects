import {
  assertCitationsBelongToRun,
  competitionAgentSchema,
} from "./reasoning.ts";

function expectThrow(fn: () => unknown) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected validation failure");
}
Deno.test("specialist claims without citations are rejected", () => {
  expectThrow(() =>
    competitionAgentSchema.parse({
      claims: [{ claim: "unsupported", evidence_ids: [] }],
      limitations: [],
    })
  );
});
Deno.test("citations from another run are rejected", () => {
  expectThrow(() =>
    assertCitationsBelongToRun({
      claims: [{
        claim: "foreign",
        evidence_ids: ["00000000-0000-4000-8000-000000000099"],
      }],
    }, new Set(["00000000-0000-4000-8000-000000000001"]))
  );
});
