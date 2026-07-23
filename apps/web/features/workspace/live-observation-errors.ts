import type { LiveObservationStreamFailure } from "./api";

export function getLiveObservationErrorMessage(
  _error: unknown,
  fallbackMessage: string
): string {
  return fallbackMessage;
}

export function getLiveObservationStreamErrorMessage(
  failure: LiveObservationStreamFailure
): string {
  return getLiveObservationErrorMessage(
    failure.error,
    "최신 상태를 받지 못했어요. 자동으로 다시 시도할게요."
  );
}
