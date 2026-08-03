/**
 * Runtime mirrors of the canonical motion tokens in DESIGN.md section 4.
 * CSS, Framer Motion, and GSAP all consume this same definition.
 */
export const sbMotion = {
  duration: {
    fast: 0.12,
    page: 0.18,
    base: 0.2,
    dataMin: 0.15,
    dataMax: 0.4,
  },
  ease: [0.4, 0, 0.2, 1] as const,
  gsapEase: {
    name: "sb-standard",
    definition: "0.4,0,0.2,1",
  },
  magnetic: {
    radiusPx: 8,
    strength: 0.12,
    spring: {
      stiffness: 320,
      damping: 28,
      mass: 0.4,
    },
  },
} as const;

export function clampDataResolveDuration(durationMs: number) {
  return Math.min(
    sbMotion.duration.dataMax,
    Math.max(sbMotion.duration.dataMin, durationMs / 1000),
  );
}
