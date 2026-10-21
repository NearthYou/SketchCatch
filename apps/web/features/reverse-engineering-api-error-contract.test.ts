import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, getApiErrorMessage } from "../lib/api-client";

test("Reverse Engineering 설정 이동 오류는 안전한 한국어 fallback을 사용한다", () => {
  const error = new ApiClientError(409, {
    error: "REVERSE_ENGINEERING_AWS_SETTINGS_REQUIRED",
    message: ""
  });

  assert.equal(getApiErrorMessage(error, "AWS 구조를 가져오지 못했습니다."), "AWS 연결을 확인해 주세요.");
});

test("Reverse Engineering 재시도 오류는 안전한 한국어 fallback을 사용한다", () => {
  const error = new ApiClientError(503, {
    error: "REVERSE_ENGINEERING_SCAN_RETRYABLE",
    message: ""
  });

  assert.equal(
    getApiErrorMessage(error, "AWS 구조를 가져오지 못했습니다."),
    "AWS 구조를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
});
