import assert from "node:assert/strict";
import test from "node:test";
import type { ApiErrorResponse } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { ReverseEngineeringScanFailedError } from "./reverse-engineering-service.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

test("전체 스캔의 AWS Role 오류는 설정 이동용 안전한 API 오류로 응답한다", async () => {
  const app = buildApp();

  app.get("/reverse-engineering-settings-required", async () => {
    throw new ReverseEngineeringScanFailedError({
      internalCode: "target_role_unavailable",
      publicReason: "open_settings",
      publicMessage: "AWS Role 연결을 확인해 주세요."
    });
  });

  const response = await app.inject({
    method: "GET",
    url: "/reverse-engineering-settings-required"
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json() as ApiErrorResponse, {
    error: "REVERSE_ENGINEERING_AWS_SETTINGS_REQUIRED",
    message: "AWS Role 연결을 확인해 주세요."
  });

  await app.close();
});

test("전체 스캔의 일시 오류는 재시도용 안전한 API 오류로 응답한다", async () => {
  const app = buildApp();

  app.get("/reverse-engineering-retryable", async () => {
    throw new ReverseEngineeringScanFailedError({
      internalCode: "provider_unavailable",
      publicReason: "retry",
      publicMessage: "AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
    });
  });

  const response = await app.inject({
    method: "GET",
    url: "/reverse-engineering-retryable"
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json() as ApiErrorResponse, {
    error: "REVERSE_ENGINEERING_SCAN_RETRYABLE",
    message: "AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요."
  });

  await app.close();
});
