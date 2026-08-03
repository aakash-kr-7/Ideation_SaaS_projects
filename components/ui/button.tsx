"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from "framer-motion";
import {
  forwardRef,
  useCallback,
  useEffect,
  type PointerEvent,
} from "react";
import { sbMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-sb-accent bg-sb-accent text-sb-text-primary hover:border-sb-accent-hover hover:bg-sb-accent-hover active:border-sb-accent-active active:bg-sb-accent-active",
  secondary:
    "border-sb-border-hairline bg-sb-bg-surface-2 text-sb-text-primary hover:bg-sb-bg-surface-3",
  ghost:
    "border-transparent bg-transparent text-sb-text-secondary hover:bg-sb-bg-surface-1 hover:text-sb-text-primary",
  destructive:
    "border-sb-verdict-avoid bg-transparent text-sb-verdict-avoid hover:bg-sb-verdict-avoid-bg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    type = "button",
    variant = "primary",
    disabled,
    onPointerMove,
    onPointerLeave,
    onPointerCancel,
    onBlur,
    style,
    ...props
  },
  ref,
) {
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, sbMotion.magnetic.spring);
  const springY = useSpring(y, sbMotion.magnetic.spring);
  const interactionMotionDisabled = Boolean(disabled || prefersReducedMotion);
  const magneticDisabled = Boolean(
    variant !== "primary" || interactionMotionDisabled,
  );

  const settle = useCallback(
    (immediate = false) => {
      x.set(0);
      y.set(0);
      if (immediate) {
        springX.jump(0);
        springY.jump(0);
      }
    },
    [springX, springY, x, y],
  );

  useEffect(() => {
    if (magneticDisabled) settle(true);
  }, [magneticDisabled, settle]);

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    onPointerMove?.(event);
    const hasFinePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    ).matches;

    if (
      event.defaultPrevented ||
      magneticDisabled ||
      event.pointerType !== "mouse" ||
      !hasFinePointer
    ) {
      settle(true);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const rawX =
      (event.clientX - (bounds.left + bounds.width / 2)) * sbMotion.magnetic.strength;
    const rawY =
      (event.clientY - (bounds.top + bounds.height / 2)) * sbMotion.magnetic.strength;
    const distance = Math.hypot(rawX, rawY);
    const scale =
      distance > sbMotion.magnetic.radiusPx && distance > 0
        ? sbMotion.magnetic.radiusPx / distance
        : 1;

    x.set(rawX * scale);
    y.set(rawY * scale);
  }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      style={{ ...style, x: magneticDisabled ? 0 : springX, y: magneticDisabled ? 0 : springY }}
      whileTap={interactionMotionDisabled ? undefined : { scale: 0.97 }}
      transition={{
        scale: {
          duration: prefersReducedMotion ? 0 : sbMotion.duration.fast,
          ease: sbMotion.ease,
        },
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        settle(magneticDisabled);
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        settle(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        settle(magneticDisabled);
      }}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-sb-2 rounded-sb-md border px-sb-4 py-sb-2 text-sm font-medium",
        "transition-[background-color,border-color,color] duration-sb-fast ease-sb-standard",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
