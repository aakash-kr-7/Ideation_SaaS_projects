import {
  classifyPackFailure,
  packOutcome,
  researchUnavailableMessage,
} from "./quick-scan-reliability.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("Quick Scan distinguishes technical research failure from weak evidence", () => {
  assert(packOutcome(0) === "completed_no_evidence", "zero accepted evidence was not a completed research outcome");
  assert(packOutcome(2) === "completed", "accepted evidence was not a completed research outcome");
  assert(classifyPackFailure(new Error("request timed out"), null) === "timed_out", "timeout classification failed");
  assert(classifyPackFailure(new Error("provider 503"), null) === "provider_failed", "provider classification failed");
  assert(classifyPackFailure(new Error("429"), {
    metric: "requests_per_day",
    limit: 20,
    retryDelayMs: null,
    dailyExhausted: true,
  }) === "quota_blocked", "quota classification failed");
});

Deno.test("Research Unavailable never states a market conclusion", () => {
  const message = researchUnavailableMessage("quota_blocked");
  assert(message.startsWith("RESEARCH_UNAVAILABLE:"), "technical marker missing");
  assert(/No market verdict was produced/.test(message), "verdict boundary missing");
  assert(!/no demand|no pricing|no contradiction|insufficient evidence/i.test(message), "technical failure leaked a market conclusion");
});
