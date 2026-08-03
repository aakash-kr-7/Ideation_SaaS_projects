"use client";

import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import styles from "./glow-layers.module.css";

type SpotlightStyle = CSSProperties & {
  "--sb-spotlight-x"?: string;
  "--sb-spotlight-y"?: string;
};

export type SpotlightCardProps = HTMLAttributes<HTMLDivElement>;

export const SpotlightCard = forwardRef<HTMLDivElement, SpotlightCardProps>(
  function SpotlightCard(
    { children, className, onMouseMove, style, ...props },
    ref,
  ) {
    const prefersReducedMotion = useReducedMotion();

    function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
      onMouseMove?.(event);
      if (event.defaultPrevented || prefersReducedMotion) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty(
        "--sb-spotlight-x",
        `${event.clientX - bounds.left}px`,
      );
      event.currentTarget.style.setProperty(
        "--sb-spotlight-y",
        `${event.clientY - bounds.top}px`,
      );
    }

    return (
      <div
        {...props}
        ref={ref}
        className={cn(styles.spotlightCard, className)}
        style={style as SpotlightStyle}
        onMouseMove={handleMouseMove}
      >
        {children}
      </div>
    );
  },
);
