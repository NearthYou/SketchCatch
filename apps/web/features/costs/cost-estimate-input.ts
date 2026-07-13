export const MIN_EXPECTED_USER_COUNT = 1;
export const MAX_EXPECTED_USER_COUNT = 1_000_000;

export function normalizeExpectedUserCount(value: string): number | null {
  const parsed = Number(value.replaceAll(",", "").trim());

  if (!Number.isFinite(parsed) || parsed < MIN_EXPECTED_USER_COUNT) {
    return null;
  }

  return Math.min(MAX_EXPECTED_USER_COUNT, Math.round(parsed));
}
