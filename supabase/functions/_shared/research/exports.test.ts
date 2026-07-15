import { renderCsv, renderJson, renderMarkdown, renderPdf } from "./exports.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
const input = {
  runId: "00000000-0000-4000-8000-000000000001",
  ideaName: "Actual run content",
  total: 84,
  verdict: "Validate First",
  confidence: 75,
  executiveSummary: "Evidence-backed summary.",
  methodology: "Deterministic method.",
  breakdowns: [{
    criterion: "painSeverity",
    score: 80,
    weight: 12,
    note: "Verified pain.",
    evidenceIds: ["00000000-0000-4000-8000-000000000002"],
  }],
  payload: {
    id: "00000000-0000-4000-8000-000000000001",
    score: 84,
    verdict: "Validate First",
    content: "Actual run content",
  },
};

Deno.test("all export formats carry consistent run facts", () => {
  const outputs = [
    renderJson(input),
    renderMarkdown(input),
    renderCsv(input),
    new TextDecoder().decode(renderPdf(input)),
  ];
  for (const output of outputs) {
    assert(output.includes("Actual run content"), "idea missing");
    assert(output.includes("84"), "score missing");
    assert(output.includes("Validate First"), "verdict missing");
  }
  assert(
    outputs[1].includes(input.breakdowns[0].evidenceIds[0]),
    "markdown citation missing",
  );
  assert(
    outputs[2].includes(input.breakdowns[0].evidenceIds[0]),
    "csv citation missing",
  );
  assert(outputs[3].startsWith("%PDF-1.4"), "invalid PDF signature");
});
