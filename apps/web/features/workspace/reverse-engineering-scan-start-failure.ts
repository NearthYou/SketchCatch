import { ApiClientError } from "../../lib/api-client";
import type { ReverseEngineeringScan } from "../../../../packages/types/src";

export type ReverseEngineeringStartFailure = {
  readonly action: "open_settings" | "retry";
  readonly description: string;
  readonly title: string;
};

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

  if (
    error instanceof ApiClientError &&
    error.code === "REVERSE_ENGINEERING_SCAN_RETRYABLE" &&
    /AWS SSO 로그인이 만료/u.test(error.message)
  ) {
    return {
      action: "retry",
      description: "터미널에서 aws sso login을 실행한 뒤 다시 가져와 주세요.",
      title: "AWS SSO 로그인이 만료되었습니다."
    };
  }

  return {
    action: "retry",
    description: "잠시 후 다시 시도해 주세요.",
    title: "AWS 구조를 가져오지 못했습니다."
  };
}

/** 저장형 스캔의 종료 상태를 안전한 재시도·설정 복구 안내로 바꿉니다. */
export function getReverseEngineeringTerminalScanFailure(
  scan: Pick<ReverseEngineeringScan, "errorSummary" | "status">
): ReverseEngineeringStartFailure | null {
  if (scan.status === "cancelled") {
    return {
      action: "retry",
      description: "필요하면 같은 설정으로 다시 가져올 수 있습니다.",
      title: "AWS 구조 가져오기를 취소했습니다."
    };
  }

  if (scan.status !== "failed") {
    return null;
  }

  const errorSummary = scan.errorSummary?.toLowerCase() ?? "";
  if (/aws sso|expired.?credential|credential.*expired/iu.test(errorSummary)) {
    return {
      action: "retry",
      description: "터미널에서 aws sso login을 실행한 뒤 다시 가져와 주세요.",
      title: "AWS SSO 로그인이 만료되었습니다."
    };
  }

  if (/accessdenied|permission|권한|invalid.?region/iu.test(errorSummary)) {
    return {
      action: "open_settings",
      description: "AWS 연결, 권한, 리전을 확인한 뒤 다시 가져와 주세요.",
      title: "AWS 연결 설정을 확인해 주세요."
    };
  }

  return {
    action: "retry",
    description: "잠시 후 다시 시도해 주세요.",
    title: "AWS 구조를 가져오지 못했습니다."
  };
}
