export type NumericClaimType =
  | "price"
  | "price_range"
  | "plan_name"
  | "percentage"
  | "date"
  | "count"
  | "market_metric";

export type NumericClaimValidation = {
  claimType: NumericClaimType;
  narrativeValue: string;
  extractedSourceValue: string;
  normalizedValue: Record<string, unknown> | null;
  sourceUrl: string;
  status: "verified" | "flagged" | "rejected";
  reason: string | null;
  methodologyStatus: "attributable" | "vendor_reported" | "unverified" | "not_applicable";
};

const numberPattern = /(?:[$€£₹]\s*)?-?\d[\d,.]*(?:\s*%|\s*(?:million|billion|thousand|m|bn|k)\b)?/gi;
const normalizeToken = (value: string) => value.toLowerCase().replace(/\s+/g, "").replace(/,/g, "");

export function numericTokens(value: string) {
  return (value.match(numberPattern) || []).map((raw) => ({ raw: raw.trim(), normalized: normalizeToken(raw) }));
}

function exactSourceFragment(sourceText: string, token: string) {
  const normalized = normalizeToken(token);
  const match = numericTokens(sourceText).find((item) => item.normalized === normalized);
  return match?.raw || "";
}

function looksLikeRange(value: string) {
  return /(?:[$€£₹]\s*)?\d[\d,.]*\s*(?:-|–|—|to)\s*(?:[$€£₹]\s*)?\d/i.test(value);
}

function sourceContainsExactRange(narrative: string, source: string) {
  const values = numericTokens(narrative);
  if (values.length !== 2) return false;
  const escaped = values.map((item) => item.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`${escaped[0]}\\s*(?:-|–|—|to)\\s*${escaped[1]}`, "i").test(source);
}

function methodologyFor(
  claimType: NumericClaimType,
  sourceText: string,
  sourceClass: string,
) {
  if (!["percentage", "market_metric"].includes(claimType)) return "not_applicable" as const;
  if (/\b(methodology|sample size|respondents|surveyed|n\s*=\s*\d|dataset|census)\b/i.test(sourceText)) {
    return "attributable" as const;
  }
  if (/vendor|official_product|company|marketing/i.test(sourceClass)) return "vendor_reported" as const;
  return "unverified" as const;
}

export function validateNumericClaim(input: {
  narrativeValue: string;
  sourceText: string;
  sourceUrl: string;
  claimType?: NumericClaimType;
  sourceClass?: string;
}): NumericClaimValidation {
  const narrative = input.narrativeValue.trim();
  const source = input.sourceText.trim();
  const narrativeNumbers = numericTokens(narrative);
  const claimType = input.claimType
    ?? (/[0-9]\s*%/.test(narrative) ? "percentage"
      : /[$€£₹]/.test(narrative) && looksLikeRange(narrative) ? "price_range"
      : /[$€£₹]/.test(narrative) ? "price"
      : "count");
  const methodologyStatus = methodologyFor(claimType, source, input.sourceClass || "");

  if (!narrativeNumbers.length) {
    return {
      claimType, narrativeValue: narrative, extractedSourceValue: "", normalizedValue: null,
      sourceUrl: input.sourceUrl, status: "rejected", reason: "narrative_contains_no_numeric_value",
      methodologyStatus,
    };
  }

  const missing = narrativeNumbers.filter((item) => !exactSourceFragment(source, item.raw));
  if (missing.length) {
    return {
      claimType, narrativeValue: narrative, extractedSourceValue: "",
      normalizedValue: { values: narrativeNumbers.map((item) => item.normalized) },
      sourceUrl: input.sourceUrl, status: "rejected",
      reason: `narrative_value_not_in_source:${missing.map((item) => item.raw).join(",")}`,
      methodologyStatus,
    };
  }

  if (looksLikeRange(narrative) && !sourceContainsExactRange(narrative, source)) {
    return {
      claimType: claimType === "price" ? "price_range" : claimType,
      narrativeValue: narrative,
      extractedSourceValue: narrativeNumbers.map((item) => exactSourceFragment(source, item.raw)).join(" | "),
      normalizedValue: { values: narrativeNumbers.map((item) => item.normalized), distinctPlans: true },
      sourceUrl: input.sourceUrl, status: "rejected",
      reason: "range_not_stated_by_source_multiple_values_must_remain_distinct",
      methodologyStatus,
    };
  }

  const status = methodologyStatus === "unverified" ? "flagged" : "verified";
  return {
    claimType,
    narrativeValue: narrative,
    extractedSourceValue: narrativeNumbers.map((item) => exactSourceFragment(source, item.raw)).join(" | "),
    normalizedValue: { values: narrativeNumbers.map((item) => item.normalized) },
    sourceUrl: input.sourceUrl,
    status,
    reason: status === "flagged" ? "high_impact_statistic_has_no_attributable_methodology" : null,
    methodologyStatus,
  };
}

export function labelStatistic(value: string, validation: NumericClaimValidation) {
  if (validation.methodologyStatus === "vendor_reported") return `${value} (vendor-reported)`;
  if (validation.methodologyStatus === "unverified") return `${value} (unverified; methodology not found)`;
  return value;
}
