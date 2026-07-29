import type { GeminiGroundingMode, GeminiQuotaDetails } from "./gemini.ts";

export type GroundingFailureAction = "degrade" | "retry" | "fail";

export function groundedCallLimit(mode: GeminiGroundingMode, reportMode: string, packCount: number) {
  if (mode === "disabled") return 0;
  if (reportMode === "quick_scan") return Math.min(3, packCount);
  if (mode === "optional") return reportMode === "full_validation" ? Math.min(2, packCount) : Math.min(1, packCount);
  return packCount;
}

export function groundingFailureAction(
  mode: GeminiGroundingMode,
  quota: GeminiQuotaDetails | null,
  errorMessage: string,
): GroundingFailureAction {
  if (mode === "optional" && quota) return "degrade";
  if (quota?.dailyExhausted) return "fail";
  if (/timeout|temporar|unavailable|5\d\d|RESOURCE_EXHAUSTED|429/i.test(errorMessage)) return "retry";
  return "fail";
}
