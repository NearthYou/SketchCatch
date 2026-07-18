import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClientError, apiFetch, getApiErrorMessage } from "../lib/api-client";
import { createAiArchitectureDraft } from "./workspace/api";

test("apiFetch exposes safe request diagnostics for visible API errors", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: "LIVE_OBSERVATION_DISABLED",
        message: "Live Observation is disabled"
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-123"
        }
      }
    );

  await assert.rejects(
    apiFetch("/deployments/deployment-id/live-observations?token=secret#fragment", {
      method: "POST"
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(
        getApiErrorMessage(error, "관측 세션을 시작하지 못했습니다."),
        "실시간 관측 기능이 서버에서 비활성화되어 있습니다. " +
          "[POST /api/deployments/deployment-id/live-observations · HTTP 503 · " +
          "LIVE_OBSERVATION_DISABLED · 요청 ID req-123]"
      );
      return true;
    }
  );
});

test("apiFetch identifies requests that receive no HTTP response", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  await assert.rejects(apiFetch("/health"), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(
      getApiErrorMessage(error, "상태를 확인하지 못했습니다."),
      "API 서버에 연결할 수 없습니다. Docker DB와 API 서버가 켜져 있는지 확인해주세요. " +
        "[GET /api/health · 응답 없음 · internal_server_error]"
    );
    return true;
  });
});

test("Git/CI/CD handoff conflicts keep the actionable server precondition", async () => {
  const error = new ApiClientError(
    409,
    {
      error: "conflict",
      message: "DEPLOYMENT_OUTPUT_URL_REQUIRED"
    },
    {
      method: "POST",
      path: "/api/projects/project-id/git-cicd-handoffs",
      requestId: "req-handoff-409"
    }
  );

  assert.equal(
    getApiErrorMessage(error, "CI/CD PR을 만들지 못했습니다."),
    "ECS 배포 결과 URL이 설정되지 않았습니다. 프로젝트 배포 대상 설정에서 외부 HTTPS URL을 입력한 뒤 다시 시도해주세요. " +
      "[POST /api/projects/project-id/git-cicd-handoffs · HTTP 409 · conflict · 요청 ID req-handoff-409]"
  );
});

test("Git/CI/CD handoff explains a missing confirmed deployment target", () => {
  for (const message of [
    "GitOps application handoff requires a confirmed project deployment target",
    "PROJECT_DEPLOYMENT_TARGET_REQUIRED"
  ]) {
    const error = new ApiClientError(409, { error: "conflict", message });

    assert.equal(
      getApiErrorMessage(error, "CI/CD PR을 만들지 못했습니다."),
      "프로젝트 배포 대상이 확정되지 않았습니다. 프로젝트 설정에서 검증된 AWS 연결과 Repository 빌드 근거를 저장한 뒤 다시 시도해주세요."
    );
  }
});

test("unknown conflicts use a neutral state-conflict message", () => {
  const error = new ApiClientError(409, {
    error: "conflict",
    message: "UNMAPPED_CONFLICT"
  });

  assert.equal(
    getApiErrorMessage(error, "요청을 완료하지 못했습니다."),
    "현재 상태와 요청 조건이 충돌합니다. 최신 상태와 필요한 설정을 확인해주세요."
  );
});

test("deployment prepare explains a missing application target before worker execution", () => {
  const error = new ApiClientError(
    409,
    {
      error: "conflict",
      message: "A confirmed project deployment target is required for application deployment"
    },
    {
      method: "POST",
      path: "/api/projects/project-id/deployments/prepare",
      requestId: "req-target-required"
    }
  );

  const message = getApiErrorMessage(error, "배포 검토를 시작하지 못했습니다.", {
    developerMode: true
  });

  assert.match(message, /Source Repository/u);
  assert.match(message, /프로젝트 배포 타깃/u);
  assert.match(message, /실패 단계: 배포 범위 및 타깃 확인/u);
  assert.match(message, /worker 로그/u);
  assert.doesNotMatch(message, /Terraform state\/output/u);
});

test("public AI requests use the same visible request diagnostics", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "bad_request", message: "입력 오류" }), {
      status: 400,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-ai-456"
      }
    });

  await assert.rejects(
    createAiArchitectureDraft({ prompt: "웹 서비스를 설계해줘" }),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(
        getApiErrorMessage(error, "아키텍처 초안을 만들지 못했습니다."),
        "입력 오류 [POST /api/ai/architecture-draft · HTTP 400 · bad_request · " +
          "요청 ID req-ai-456]"
      );
      return true;
    }
  );
});

test("development errors include the failed demo stage, safe server cause, and concrete checks", () => {
  const error = new ApiClientError(
    502,
    {
      error: "internal_server_error",
      message: "The role with name SketchCatchCodeBuild-demo cannot be found"
    },
    {
      method: "POST",
      path: "/api/projects/project-id/build-environment/prepare",
      requestId: "req-build-env"
    }
  );

  const message = getApiErrorMessage(error, "빌드 환경을 준비하지 못했습니다.", {
    developerMode: true
  });

  assert.match(message, /개발자 진단/u);
  assert.match(message, /실패 단계: AWS 빌드 환경 준비/u);
  assert.match(message, /SketchCatchCodeBuild-demo cannot be found/u);
  assert.match(message, /CodeBuild project와 service role/u);
  assert.match(message, /요청 ID req-build-env/u);
});

test("development AWS connection errors point developers to CloudFormation and IAM evidence", () => {
  const error = new ApiClientError(
    500,
    {
      error: "internal_server_error",
      message: "AssumeRole returned AccessDenied"
    },
    {
      method: "POST",
      path: "/api/aws/connections/connection-id/verify-created-role",
      requestId: "req-aws-role"
    }
  );

  const message = getApiErrorMessage(error, "AWS Role 검증에 실패했습니다.", {
    developerMode: true
  });

  assert.match(message, /실패 단계: AWS 계정 연결/u);
  assert.match(message, /AssumeRole returned AccessDenied/u);
  assert.match(message, /CloudFormation Stack 상태.*Trust Policy/u);
});
