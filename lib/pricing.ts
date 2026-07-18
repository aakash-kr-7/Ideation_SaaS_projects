export const SUPPORT_EMAIL = "support.shouldbuild@gmail.com";
export const PUBLIC_SITE_URL = "https://shouldbuild.app";

export type PricingRegion = "india" | "global";
export type PricingRegionHint = PricingRegion | "auto";

export const launchPricing = {
  oneOff: {
    quick: { global: "$5", india: "₹149" },
    full: { global: "$15", india: "₹499" },
    compare: { global: "$36", india: "₹1,199" },
  },
  plans: {
    free: { global: "$0", india: "₹0" },
    proMonthly: { global: "$12", india: "₹699" },
    proAnnual: { global: "$120", india: "₹6,990" },
  },
} as const;

export function regionalPrice(price: { global: string; india: string }, region: PricingRegion) {
  return price[region];
}
