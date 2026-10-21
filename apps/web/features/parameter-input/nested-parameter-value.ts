type NestedParameterValue = Record<string, unknown>;

export function readSingleNestedParameterValue(value: unknown): NestedParameterValue {
  if (Array.isArray(value)) {
    return toRecord(value[0]);
  }

  return toRecord(value);
}

export function writeSingleNestedParameterValue(
  currentValue: unknown,
  nextValue: NestedParameterValue
): NestedParameterValue | NestedParameterValue[] {
  return Array.isArray(currentValue) ? [nextValue] : nextValue;
}

function toRecord(value: unknown): NestedParameterValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as NestedParameterValue;
}
