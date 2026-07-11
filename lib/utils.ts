export function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }
export function formatDate(date: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date)); }
export function scoreTone(score: number) { return score >= 75 ? "positive" : score >= 52 ? "warning" : "negative"; }
