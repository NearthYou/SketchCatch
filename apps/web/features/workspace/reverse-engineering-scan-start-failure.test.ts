import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ApiClientError } from "../../lib/api-client";
import { getReverseEngineeringStartFailure } from "./reverse-engineering-scan-start-failure";

const panelSource = readFileSync(
  fileURLToPath(new URL("./ReverseEngineeringPanel.tsx", import.meta.url)),
  "utf8"
);

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
    message: "AWS SSO 로그인이 만료되었습니다. 터미널에서 aws sso login을 실행한 뒤 다시 시도해 주세요."
  });

  assert.deepEqual(getReverseEngineeringStartFailure(error), {
    action: "retry",
    description: "터미널에서 aws sso login을 실행한 뒤 다시 가져와 주세요.",
    title: "AWS SSO 로그인이 만료되었습니다."
  });
});

test("기존 프로젝트 재스캔도 같은 연결 복구 안내와 환경 설정 버튼을 사용한다", () => {
  assert.match(panelSource, /setScanFailure\(getReverseEngineeringStartFailure\(error\)\)/);
  assert.match(panelSource, /scanFailure\.action === "open_settings"/);
  assert.match(panelSource, /환경 설정으로 이동/);
  assert.match(panelSource, /createReverseEngineeringAwsSettingsHref\(selectedAwsConnection\?\.id \?\? null\)/);
});
