import type { CSSProperties } from "react";

/**
 * SignalFit motion vocabulary.
 *
 * Curves
 * - `swift` (160ms): direct manipulation. It gets out of the pointer's way.
 * - `settle` (260ms): elevation and reveals. The long deceleration removes snap.
 * - `spring` (420ms): spatial state changes. Slight overshoot, never decorative bounce.
 *
 * Scale is deliberately fractional: large surfaces move 0.6%, small controls 1.8%.
 * Translations stay within 1–2px so motion explains depth without changing layout.
 */

export const timings = {
  instant: 90,
  swift: 160,
  settle: 260,
  spring: 420,
  acknowledgment: 520,
} as const;

export const easings = {
  swift: "cubic-bezier(0.2, 0, 0, 1)",
  settle: "cubic-bezier(0.16, 1, 0.3, 1)",
  spring: "cubic-bezier(0.34, 1.32, 0.64, 1)",
} as const;

export const elevation = {
  rest: "sf-elevation-rest",
  hover: "sf-elevation-hover",
  active: "sf-elevation-active",
  dragging: "sf-elevation-dragging",
  ambient: "sf-ambient-surface",
} as const;

export const press = {
  /** Large cards and rows: perceptible but visually stable. */
  subtle: "sf-press-subtle",
  /** Compact buttons, icon controls, tabs and toggles. */
  firm: "sf-press-firm",
} as const;

export const focus = {
  ring: "sf-focus-ring",
  within: "sf-focus-within",
} as const;

export const reveal = {
  item: "sf-reveal-item",
  group: "sf-reveal-group",
  content: "sf-content-enter",
} as const;

export const stateChange = {
  acknowledged: "sf-state-ack",
  confirmation: "sf-confirmation",
  success: "is-success",
  error: "is-error",
  loading: "is-loading",
} as const;

export const loading = {
  skeleton: "sf-skeleton",
  line: "sf-skeleton sf-skeleton-line",
  metric: "sf-skeleton sf-skeleton-metric",
  avatar: "sf-skeleton sf-skeleton-avatar",
} as const;

/** Composed aliases keep component markup compact and prevent bespoke recipes. */
export const motion = {
  transitionBase: "sf-transition",
  press: press.subtle,
  pressTight: press.firm,
  hoverElevate: `${elevation.rest} ${elevation.hover} ${elevation.ambient}`,
  hoverElevateSubtle: `${elevation.rest} ${elevation.hover}`,
  focusRing: focus.ring,
  cardInteractive: `sf-transition ${elevation.rest} ${elevation.hover} ${elevation.ambient} ${press.subtle} ${focus.ring}`,
  buttonBase: `sf-control sf-transition ${press.firm} ${focus.ring}`,
  buttonTight: `sf-control sf-transition ${press.firm} ${focus.ring}`,
} as const;

/** Caps a collection's full entrance window at 180ms. */
export function getStaggerDelay(index: number, maxTotalDelayMs = 180, stepMs = 24) {
  return { "--sf-delay": `${Math.min(index * stepMs, maxTotalDelayMs)}ms` } as CSSProperties;
}

export const revealUpClass = reveal.item;

export function stateChangeKey(value: unknown) {
  return String(value ?? "empty");
}
