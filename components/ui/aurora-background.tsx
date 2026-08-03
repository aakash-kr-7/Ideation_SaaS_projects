import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./glow-layers.module.css";

export type AuroraBackgroundProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  static?: boolean;
};

export const AuroraBackground = forwardRef<HTMLDivElement, AuroraBackgroundProps>(
  function AuroraBackground({ className, static: staticFrame = false, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(styles.aurora, staticFrame && styles.auroraStatic, className)}
        aria-hidden="true"
      >
        <span className={cn(styles.auroraBlob, styles.auroraBlobAccent)} />
        <span className={cn(styles.auroraBlob, styles.auroraBlobBuild)} />
        <span className={cn(styles.auroraBlob, styles.auroraBlobConditional)} />
        <span className={cn(styles.auroraBlob, styles.auroraBlobEvidence)} />
      </div>
    );
  },
);
