import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./glow-layers.module.css";

export type GlassPanelProps = HTMLAttributes<HTMLDivElement>;

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(styles.glassPanel, className)}
      />
    );
  },
);
