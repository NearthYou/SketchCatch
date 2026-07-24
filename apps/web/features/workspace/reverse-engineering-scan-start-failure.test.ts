import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "../../lib/api-client";
import {
  getReverseEngineeringStartFailure,
  getReverseEngineeringTerminalScanFailure
} from "./reverse-engineering-scan-start-failure";

function createApiError(
  code: "REVERSE_ENGINEERING_AWS_SETTINGS_REQUIRED" | "REVERSE_ENGINEERING_SCAN_RETRYABLE"
) {
  return new ApiClientError(code === "REVERSE_ENGINEERING_AWS_SETTINGS_REQUIRED" ? 409 : 503, {
    error: code,
    message: "안전한 오류 문장입니다."
  });
}

test("AWS 연결을 확인해야 하는 스캔 실패만 환경 설정 행동으로 바꾼다", () => {
  assert.deepEqual(
    getReverseEngineeringStartFailure(createApiError("REVERSE_ENGINEERING_AWS_SETTINGS_REQUIRED")),
    {
      action: "open_settings",
      description: "AWS 연결을 확인한 뒤 다시 가져와 주세요.",
      title: "AWS 연결을 확인해 주세요."
    }
  );
});

test("그 밖의 스캔 실패는 환경 설정으로 보내지 않고 다시 시도하게 한다", () => {
  assert.deepEqual(
    getReverseEngineeringStartFailure(createApiError("REVERSE_ENGINEERING_SCAN_RETRYABLE")),
    {
      action: "retry",
      description: "잠시 후 다시 시도해 주세요.",
      title: "AWS 구조를 가져오지 못했습니다."
    }
  );
  assert.deepEqual(getReverseEngineeringStartFailure(new Error("network")), {
    action: "retry",
    description: "잠시 후 다시 시도해 주세요.",
    title: "AWS 구조를 가져오지 못했습니다."
  });
});

test("AWS SSO 만료는 환경 설정 대신 재로그인 방법을 안내한다", () => {
  const error = new ApiClientError(503, {
    error: "REVERSE_ENGINEERING_SCAN_RETRYABLE",
    message:
      "AWS SSO 로그인이 만료되었습니다. 터미널에서 aws sso login을 실행한 뒤 다시 시도해 주세요."
  });

  assert.deepEqual(getReverseEngineeringStartFailure(error), {
    action: "retry",
    description: "터미널에서 aws sso login을 실행한 뒤 다시 가져와 주세요.",
    title: "AWS SSO 로그인이 만료되었습니다."
  });
});

test("저장 scan의 권한 실패는 설정 복구 행동으로 남긴다", () => {
  assert.deepEqual(
    getReverseEngineeringTerminalScanFailure({
      errorSummary: "AccessDeniedException: missing permission",
      status: "failed"
    }),
    {
      action: "open_settings",
      description: "AWS 연결, 권한, 리전을 확인한 뒤 다시 가져와 주세요.",
      title: "AWS 연결 설정을 확인해 주세요."
    }
  );
});

test("저장 scan 취소도 화면에서 다시 시도할 수 있는 종료 상태로 남긴다", () => {
  assert.deepEqual(
    getReverseEngineeringTerminalScanFailure({
      errorSummary: null,
      status: "cancelled"
    }),
    {
      action: "retry",
      description: "필요하면 같은 설정으로 다시 가져올 수 있습니다.",
      title: "AWS 구조 가져오기를 취소했습니다."
    }
  );
});
