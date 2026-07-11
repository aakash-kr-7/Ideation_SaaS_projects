import { ValidationVerdict } from "@/lib/types";
import { cn } from "@/lib/utils";
export function VerdictBadge({ verdict }: { verdict: ValidationVerdict }) { return <span className={cn("verdict", verdict === "Build now" && "build", verdict === "Validate first" && "validate")}>{verdict}</span>; }
