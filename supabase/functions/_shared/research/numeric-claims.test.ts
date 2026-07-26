import { labelStatistic, validateNumericClaim } from "./numeric-claims.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("rejects the false Blink Starter price range", () => {
  const result = validateNumericClaim({
    narrativeValue: "Starter plan pricing: $29 - $79/month",
    sourceText: "Starter $79 per month. Agency $299 per month.",
    sourceUrl: "https://useblink.com/pricing",
    claimType: "price_range",
    sourceClass: "official_product",
  });
  assert(result.status === "rejected", "false range was accepted");
  assert(result.reason?.includes("$29"), "missing source value was not identified");
});

Deno.test("keeps distinct plans distinct instead of inventing a range", () => {
  const result = validateNumericClaim({
    narrativeValue: "$79 - $299/month",
    sourceText: "Starter $79 per month. Agency $299 per month.",
    sourceUrl: "https://useblink.com/pricing",
    claimType: "price_range",
    sourceClass: "official_product",
  });
  assert(result.status === "rejected", "two plans were merged into a range");
  assert(result.reason === "range_not_stated_by_source_multiple_values_must_remain_distinct", "wrong rejection");
});

Deno.test("accepts an exact plan price and labels unsupported statistics", () => {
  const price = validateNumericClaim({
    narrativeValue: "Starter costs $79/month",
    sourceText: "Starter costs $79/month",
    sourceUrl: "https://useblink.com/pricing",
    claimType: "price",
    sourceClass: "official_product",
  });
  assert(price.status === "verified" && price.extractedSourceValue === "$79", "exact price failed");
  const statistic = validateNumericClaim({
    narrativeValue: "73% report scope disputes",
    sourceText: "73% report scope disputes",
    sourceUrl: "https://vendor.test/article",
    claimType: "percentage",
    sourceClass: "vendor_marketing",
  });
  assert(statistic.methodologyStatus === "vendor_reported", "vendor statistic was promoted");
  assert(labelStatistic("73%", statistic).includes("vendor-reported"), "vendor label missing");
});
