import { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Button({ children, variant="primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?:"primary"|"secondary"|"ghost"|"danger" }) { return <button className={cn("ds-button",`ds-${variant}`,className)} {...props}>{children}</button>; }
export function Badge({ children, tone="neutral" }: { children: ReactNode; tone?:"neutral"|"build"|"validate"|"niche"|"weak"|"avoid"|"strong"|"moderate"|"assumption" }) { return <span className={`ds-badge ds-${tone}`}>{children}</span>; }
export function Card({ children, variant="default", className }: { children:ReactNode; variant?:"default"|"elevated"|"quiet"; className?:string }) { return <section className={cn("ds-card",`ds-card-${variant}`,className)}>{children}</section>; }
