import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./glow-layers.module.css";

type BorderBeamStyle = CSSProperties & {
  "--sb-border-beam-width"?: string;
};

export interface BorderBeamProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  persistent?: boolean;
  thickness?: 1 | 2;
}

export const BorderBeam = forwardRef<HTMLSpanElement, BorderBeamProps>(
  function BorderBeam(
    { className, persistent = false, style, thickness = 1, ...props },
    ref,
  ) {
    return (
      <span
        {...props}
        ref={ref}
        className={cn(
          styles.borderBeam,
          persistent && styles.borderBeamPersistent,
          className,
        )}
        style={{
          ...style,
          "--sb-border-beam-width": `${thickness}px`,
        } as BorderBeamStyle}
        aria-hidden="true"
      />
    );
  },
);
