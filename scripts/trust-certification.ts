import { certificationSummary } from "../supabase/functions/_shared/research/certification/harness.ts";

const summary = certificationSummary();
console.log(JSON.stringify({
  ...summary,
  mutationTests: "covered by certification.test.ts",
  liveCertification: {
    permittedMaximum: 3,
    callsUsed: 0,
    runIds: [],
    quotaConsumed: 0,
    status: "not_run",
    reason: "Live runs require all offline checks to pass and explicit preflight availability.",
  },
}, null, 2));
