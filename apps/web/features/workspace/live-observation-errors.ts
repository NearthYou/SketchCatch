import { getApiErrorMessage } from "../../lib/api-client";
import type { LiveObservationStreamFailure } from "./api";

export function getLiveObservationStreamErrorMessage(
  failure: LiveObservationStreamFailure
): string {
  return getApiErrorMessage(
    failure.error,
    failure.source === "stream"
      ? "실시간 관측 연결이 지연되고 있습니다. 자동으로 다시 연결합니다."
      : "관측 상태 조회가 지연되고 있습니다. 자동으로 다시 연결합니다."
  );
}
