import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./glow-layers.module.css";

export type AuroraTextProps = HTMLAttributes<HTMLSpanElement>;

export const AuroraText = forwardRef<HTMLSpanElement, AuroraTextProps>(
  function AuroraText({ className, ...props }, ref) {
    return (
      <span
        {...props}
        ref={ref}
        className={cn(styles.auroraText, className)}
      />
    );
  },
);
