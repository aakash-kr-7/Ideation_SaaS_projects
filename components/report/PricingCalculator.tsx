"use client";

import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { motion } from "@/lib/motion";

export function PricingCalculator({ starterPrice = 79, proPrice = 149, agencyPrice = 349 }: { starterPrice?: number; proPrice?: number; agencyPrice?: number }) {
  const [starter, setStarter] = useState(4);
  const [pro, setPro] = useState(2);
  const [agency, setAgency] = useState(0);
  const mrr = useMemo(() => starter * starterPrice + pro * proPrice + agency * agencyPrice, [starter, pro, agency, starterPrice, proPrice, agencyPrice]);

  return <section className={`pricing-calculator-widget ${motion.hoverElevate}`}>
    <div><p className="eyebrow">Pricing calculator</p><h4>Test the customer mix, not an imaginary market size.</h4></div>
    <div className="calc-inputs">
      <label><span>Starter users · ${starterPrice}/mo</span><input type="number" min="0" value={starter} onChange={event => setStarter(Math.max(0, Number(event.target.value)))}/></label>
      <label><span>Pro users · ${proPrice}/mo</span><input type="number" min="0" value={pro} onChange={event => setPro(Math.max(0, Number(event.target.value)))}/></label>
      <label><span>Agency users · ${agencyPrice}/mo</span><input type="number" min="0" value={agency} onChange={event => setAgency(Math.max(0, Number(event.target.value)))}/></label>
    </div>
    <div className="calc-results">
      <span>Estimated MRR<b>$<AnimatedNumber value={mrr}/></b></span>
      <span>To $500 MRR<b>{Math.ceil(500 / starterPrice)} Starter customers</b></span>
      <span>To $3,000 MRR<b>{Math.ceil(3000 / proPrice)} Pro customers</b></span>
    </div>
  </section>;
}
