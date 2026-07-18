export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function relationArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  return relationArray(value)[0];
}

export function recordArray(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

export function firstRecord(value: unknown): UnknownRecord | undefined {
  return recordArray(value)[0];
}

export function errorMessage(error: unknown, fallback = "Unexpected error"): string {
  return error instanceof Error ? error.message : fallback;
}
