type JsonRecord = Record<string, unknown>;

export function parseRecord(input: unknown): JsonRecord {
  let candidate = input;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      // Keep the original value so the normal object error remains stable.
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("input must be an object");
  }
  return candidate as JsonRecord;
}

export function readOptionalPositiveInteger(record: JsonRecord, key: string): number | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${key} must be a positive integer`);
  return parsed;
}
