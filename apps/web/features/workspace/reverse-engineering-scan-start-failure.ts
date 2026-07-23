import { ApiClientError } from "../../lib/api-client";
import type { ReverseEngineeringStartFailure } from "./ReverseEngineeringStartCard";

// gg: API가 준 안전한 행동 코드만 보고 설정 이동과 재시도를 나눠 raw AWS 오류를 화면에 보이지 않습니다.
export function getReverseEngineeringStartFailure(error: unknown): ReverseEngineeringStartFailure {
  if (
    error instanceof ApiClientError &&
    error.code === "REVERSE_ENGINEERING_AWS_SETTINGS_REQUIRED"
  ) {
    return {
      action: "open_settings",
      description: "AWS 연결을 확인한 뒤 다시 가져와 주세요.",
      title: "AWS 연결을 확인해 주세요."
    };
  }

  return {
    action: "retry",
    description: "잠시 후 다시 시도해 주세요.",
    title: "AWS 구조를 가져오지 못했습니다."
  };
}
