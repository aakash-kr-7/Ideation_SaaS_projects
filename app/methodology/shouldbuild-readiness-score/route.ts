import { NextResponse } from "next/server";
import {
  READINESS_ROLLUP_MAPPING,
  SHOULD_BUILD_SCORE_CONTRACT,
} from "@/lib/readiness-contract";

export function GET() {
  return NextResponse.json({
    version: 1,
    currentAsOf: "2026-07-29",
    ...SHOULD_BUILD_SCORE_CONTRACT,
    officialFactorCount: 12,
    riskFactorTreatment: {
      platformDependencyRisk: "inverted in the official weighted total",
      regulatoryRisk: "inverted in the official weighted total",
    },
    rollups: READINESS_ROLLUP_MAPPING,
    evidenceConfidence: {
      separateFromReadinessScore: true,
      description:
        "Coverage and quality of accepted evidence behind the factor values; it is not added to the readiness score.",
    },
  });
}
