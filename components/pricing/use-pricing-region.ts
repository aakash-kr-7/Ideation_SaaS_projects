"use client";

import { useEffect, useState } from "react";
import type { PricingRegion, PricingRegionHint } from "@/lib/pricing";

function browserRegion(): PricingRegion {
  const locale = navigator.language?.toUpperCase() ?? "";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return locale.endsWith("-IN") || timezone === "Asia/Kolkata" || timezone === "Asia/Calcutta"
    ? "india"
    : "global";
}

export function usePricingRegion(initialRegion: PricingRegionHint) {
  const [region, setRegion] = useState<PricingRegion>(initialRegion === "india" ? "india" : "global");

  useEffect(() => {
    if (initialRegion === "auto") setRegion(browserRegion());
  }, [initialRegion]);

  return region;
}
