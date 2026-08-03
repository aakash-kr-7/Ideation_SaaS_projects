import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-10 w-full rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 px-sb-3 py-sb-2 text-sm text-sb-text-primary",
        "placeholder:text-sb-text-tertiary",
        "transition-[border-color,outline-color] duration-sb-fast ease-sb-standard",
        "focus:border-sb-border-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
