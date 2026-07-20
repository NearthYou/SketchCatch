import type { ReverseEngineeringScanError } from "@sketchcatch/types";

const REASON_PRIORITY = {
  unknown: 0,
  provider_error: 1,
  throttled: 1,
  expired_credential: 1,
  invalid_region: 1,
  not_configured: 2,
  permission_denied: 3
} satisfies Record<ReverseEngineeringScanError["reason"], number>;

/** gg: 같은 서비스의 여러 실패 중 사용자가 먼저 해결할 수 있는 원인을 안정적으로 고릅니다. */
export function selectHigherPriorityReverseEngineeringScanError(
  current: ReverseEngineeringScanError | undefined,
  candidate: ReverseEngineeringScanError
): ReverseEngineeringScanError {
  if (!current) {
    return candidate;
  }

  return REASON_PRIORITY[candidate.reason] > REASON_PRIORITY[current.reason]
    ? candidate
    : current;
}
