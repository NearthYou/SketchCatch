import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";

test("getApiErrorMessage translates AWS Role verification failures instead of generic bad request", () => {
  const error = new ApiClientError(400, {
    error: "bad_request",
    message: "AWS Role connection test failed"
  });

  assert.equal(
    getApiErrorMessage(error, "AWS 연결 검증에 실패했습니다."),
    "AWS Role 연결 검증에 실패했습니다. CloudFormation Stack 생성 완료 후 잠시 기다렸다가 다시 시도하고, Account ID와 Trust Policy를 확인해주세요."
  );
});
