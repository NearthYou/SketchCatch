export function cloneParameterValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneParameterValue(item)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneParameterValue(nestedValue)])
    ) as T;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
