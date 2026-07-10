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

test("getApiErrorMessage explains AWS AssumeRole permission failures", () => {
  const error = new ApiClientError(400, {
    error: "bad_request",
    message: "AWS Role assume permission denied"
  });

  assert.equal(
    getApiErrorMessage(error, "AWS 연결 검증에 실패했습니다."),
    "AWS Role을 AssumeRole할 권한이 없습니다. 로컬 SSO Permission Set 또는 실행 Role에 sts:AssumeRole 권한을 추가하고, 대상 Role Trust Policy의 Principal과 External ID가 현재 연결 정보와 일치하는지 확인해주세요."
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

test("getApiErrorMessage explains Repository Analysis GitHub connection failures", () => {
  // Given
  const cases = [
    {
      message: "GIT_APP_AUTHENTICATION_FAILED",
      expected: "GitHub App 인증에 실패했습니다. GitHub App 설치와 서버 설정을 확인해주세요."
    },
    {
      message: "GIT_APP_REPOSITORY_ACCESS_UNAVAILABLE",
      expected: "GitHub App 연결이 해제됐거나 repository 접근 권한이 없습니다. 다시 연결해주세요."
    },
    {
      message: "GIT_APP_GITHUB_IDENTITY_REQUIRED",
      expected: "GitHub로 로그인한 계정만 GitHub App repository를 연결할 수 있습니다."
    },
    {
      message: "GIT_APP_INSTALLATION_FORBIDDEN",
      expected:
        "현재 GitHub 계정이 소유한 GitHub App 설치가 아닙니다. 올바른 계정으로 다시 연결해주세요."
    },
    {
      message: "GIT_APP_REPOSITORY_FILE_ENCODING_UNSUPPORTED",
      expected: "분석 파일의 문자 인코딩을 읽을 수 없어 Repository Analysis를 중단했습니다."
    },
    {
      message: "GIT_APP_REPOSITORY_EVIDENCE_LIMIT_EXCEEDED",
      expected: "repository가 안전한 정적 분석 범위를 초과했습니다. 분석 범위를 줄여주세요."
    }
  ] as const;

  for (const testCase of cases) {
    // When
    const error = new ApiClientError(409, {
      error: "conflict",
      message: testCase.message
    });

    // Then
    assert.equal(
      getApiErrorMessage(error, "GitHub repository를 분석하지 못했습니다."),
      testCase.expected
    );
  }
});
