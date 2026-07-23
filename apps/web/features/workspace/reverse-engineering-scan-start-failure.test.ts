import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "../../lib/api-client";
import { getReverseEngineeringStartFailure } from "./reverse-engineering-scan-start-failure";

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
