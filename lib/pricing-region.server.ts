import "server-only";
import { headers } from "next/headers";
import type { PricingRegionHint } from "@/lib/pricing";

export async function getPricingRegionHint(): Promise<PricingRegionHint> {
  const requestHeaders = await headers();
  const country = requestHeaders.get("x-vercel-ip-country")
    ?? requestHeaders.get("cf-ipcountry")
    ?? requestHeaders.get("x-country-code");

  if (!country) return "auto";
  return country.toUpperCase() === "IN" ? "india" : "global";
}
