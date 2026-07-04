export type ParameterRecord = Record<string, unknown>;

export function toParameterRecord(value: unknown): ParameterRecord {
  if (Array.isArray(value)) {
    return toParameterRecord(value[0]);
  }

  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function isRecord(value: unknown): value is ParameterRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
