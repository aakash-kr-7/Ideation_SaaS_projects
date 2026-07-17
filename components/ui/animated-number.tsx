"use client";

import { useEffect, useRef, useState } from "react";
import { easings, timings } from "@/lib/motion";

export function AnimatedNumber({ value, pad = 0, suffix = "", className = "" }: { value: number; pad?: number; suffix?: string; className?: string }) {
  const previous = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    const duration = timings.spring;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={`sf-tabular-number ${className}`} style={{ transitionTimingFunction: easings.settle }}>{String(display).padStart(pad, "0")}{suffix}</span>;
}
