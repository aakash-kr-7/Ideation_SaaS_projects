export const RESEARCH_STATUSES = [
  "Queued",
  "Searching",
  "Extracting",
  "Normalizing",
  "Scoring",
  "Generating",
  "Completed",
  "Failed",
  "Cancelled",
] as const;

export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export function isResearchStatus(value: unknown): value is ResearchStatus {
  return typeof value === "string" && (RESEARCH_STATUSES as readonly string[]).includes(value);
}
