"use client";

import {
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { PanelTransition } from "@/components/ui/panel-transition";
import { cn } from "@/lib/utils";

export interface DisclosureProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  summary: ReactNode;
  buttonClassName?: string;
  panelClassName?: string;
  defaultOpen?: boolean;
}

export function Disclosure({
  children,
  summary,
  buttonClassName,
  panelClassName,
  defaultOpen = false,
  className,
  ...props
}: DisclosureProps) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={className} {...props}>
      <button
        type="button"
        className={cn(
          "cursor-pointer rounded-sb-sm border-0 bg-transparent p-0 text-left text-inherit",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus",
          buttonClassName,
        )}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {summary}
      </button>
      <PanelTransition
        isOpen={isOpen}
        id={panelId}
        className="overflow-hidden"
      >
        <div className={panelClassName}>{children}</div>
      </PanelTransition>
    </div>
  );
}
