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

test("getApiErrorMessage explains AWS connection deletion conflicts", () => {
  const error = new ApiClientError(409, {
    error: "conflict",
    message: "AWS connection is used by a deployment"
  });

  assert.equal(
    getApiErrorMessage(error, "AWS 연결 삭제에 실패했습니다."),
    "이 AWS 연결은 배포 기록에서 사용 중이라 삭제할 수 없습니다. 먼저 해당 프로젝트 또는 배포 기록을 정리한 뒤 다시 시도해주세요."
  );
});

test("getApiErrorMessage explains GitHub repository settings permission gaps", () => {
  const error = new ApiClientError(409, {
    error: "github_oauth_required",
    message: "GitHub App does not have permission to create environments or Actions variables"
  });

  assert.equal(
    getApiErrorMessage(error, "Git/CI/CD 자동 배포 handoff를 만들지 못했습니다."),
    "GitHub App 권한이 부족해서 repository settings를 적용할 수 없습니다. GitHub App repository permissions에서 Administration 권한과 Variables 권한을 Read and write로 승인한 뒤 다시 시도해주세요."
  );
});
