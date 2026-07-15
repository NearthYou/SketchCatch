import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Writable } from "node:stream";
import Fastify from "fastify";
import type { ApiErrorResponse } from "@sketchcatch/types";
import type { RuntimeEnv } from "./config/env.js";
import { buildApp, createApiLoggerOptions } from "./app.js";
import { createAiProviderBackedLlmExplanation } from "./services/aiLlmExplanation.js";
import { explainTerraformPreview } from "./services/aiTerraformPreviewExplanation.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

test("GET /health returns ok", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });

  await app.close();
});

test("Terraform 오류 설명 API는 provider를 호출하지 않고 deterministic 결과를 반환한다", async () => {
  let providerCallCount = 0;
  const app = buildApp({
    createLlmExplanation: async () => {
      providerCallCount += 1;
      throw new Error("Terraform 설명 API에서 provider를 호출하면 안 됩니다.");
    }
  });

  const errorResponse = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-error-explanation",
    payload: {
      stage: "validate",
      rawMessage: "terraform.unexpected_token",
      diagnostic: {
        severity: "error",
        code: "terraform.unexpected_token",
        message: "닫힌 block 뒤에 알 수 없는 Terraform 코드가 붙어 있습니다.",
        sourceFileName: "main.tf",
        line: 3
      },
      terraformCodeContext:
        'resource "aws_s3_bucket" "s3_bucket" {\n  force_destroy = false\n}sdasd'
    }
  });
  assert.equal(errorResponse.statusCode, 200);
  assert.equal(providerCallCount, 0);
  assert.deepEqual(errorResponse.json().diagnosticExplanation.codeSuggestion, {
    currentCode: "}sdasd",
    suggestedCode: "}",
    rationale:
      "The unexpected code after the closing Terraform block can be removed while preserving the closing brace.",
    source: "rule"
  });
  assert.equal(
    errorResponse
      .json()
      .diagnosticExplanation.codeFrame.find(
        (line: { readonly isErrorLine: boolean }) => line.isErrorLine
      )?.text,
    "}sdasd"
  );
  await app.close();
});

test("Terraform 에이전트 리뷰 API는 Amazon Q 결과를 반드시 포함한다", async () => {
  let providerCallCount = 0;
  const app = buildApp({
    createLlmExplanation: async (input) => {
      providerCallCount += 1;
      assert.equal(input.target, "terraform_preview_explanation");

      return {
        target: input.target,
        summary: "Amazon Q가 Terraform 구성을 검토했습니다.",
        highlights: ["S3 버킷의 삭제 보호 설정을 확인했습니다."],
        nextActions: ["암호화와 액세스 차단 설정을 추가로 확인하세요."],
        fallbackUsed: false,
        wellArchitectedConclusion:
          "현재 구성은 S3 버킷을 명시적으로 정의해 저장소의 소유 범위가 Terraform 코드에 남는 점이 좋습니다. force_destroy를 비활성화한 것도 실수로 버킷과 객체를 함께 삭제할 위험을 낮추는 설정입니다. 다만 서버 측 암호화와 퍼블릭 액세스 차단 설정은 제공된 코드에서 확인할 수 없어 데이터 보호 수준을 검증하기 어렵습니다. 배포 전에는 암호화 리소스와 퍼블릭 액세스 차단을 코드에 선언하고, 접근 로그와 객체 복구 정책까지 함께 검토해야 합니다.",
        providerMetadata: {
          provider: "amazon_q",
          service: "amazon_q_business",
          routeTarget: input.target,
          cacheHit: false,
          cacheKey: "terraform-preview-test",
          estimatedUsage: {
            inputCharacters: 100,
            inputTokensEstimate: 25
          },
          billingMode: "aws_credit_only",
          generatedAt: "2026-07-15T00:00:00.000Z"
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: {
      terraformCode: 'resource "aws_s3_bucket" "s3_bucket" {\n  force_destroy = false\n}'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(providerCallCount, 1);
  assert.equal(
    response.json().llmExplanation?.wellArchitectedConclusion,
    "현재 구성은 S3 버킷을 명시적으로 정의해 저장소의 소유 범위가 Terraform 코드에 남는 점이 좋습니다. force_destroy를 비활성화한 것도 실수로 버킷과 객체를 함께 삭제할 위험을 낮추는 설정입니다. 다만 서버 측 암호화와 퍼블릭 액세스 차단 설정은 제공된 코드에서 확인할 수 없어 데이터 보호 수준을 검증하기 어렵습니다. 배포 전에는 암호화 리소스와 퍼블릭 액세스 차단을 코드에 선언하고, 접근 로그와 객체 복구 정책까지 함께 검토해야 합니다."
  );
  assert.equal(response.json().detectedResources[0]?.terraformType, "aws_s3_bucket");

  await app.close();
});

test("Terraform 에이전트 리뷰 API는 Amazon Q fallback을 성공 결과로 반환하지 않는다", async () => {
  const app = buildApp({
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "deterministic fallback",
      highlights: ["fallback"],
      nextActions: ["retry"],
      fallbackUsed: true,
      fallbackReason: "provider_error",
      providerMetadata: {
        provider: "amazon_q",
        service: "amazon_q_business",
        routeTarget: input.target,
        cacheHit: false,
        cacheKey: "terraform-preview-fallback-test",
        estimatedUsage: {
          inputCharacters: 100,
          inputTokensEstimate: 25
        },
        billingMode: "aws_credit_only",
        generatedAt: "2026-07-15T00:00:00.000Z"
      }
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: {
      terraformCode: 'resource "aws_s3_bucket" "s3_bucket" {}'
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "service_unavailable");
  assert.equal(
    response.json().message,
    "Amazon Q 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
  );

  await app.close();
});

test("Terraform 에이전트 리뷰 API는 짧거나 분리된 Amazon Q 결론을 성공 처리하지 않는다", async () => {
  const app = buildApp({
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "Amazon Q 검토 완료",
      highlights: ["운영", "보안", "안정성", "성능", "비용", "지속 가능성"],
      nextActions: ["설정을 보완하세요."],
      fallbackUsed: false,
      wellArchitectedConclusion: "잘한 점: 리소스를 선언했습니다. 문제점: 설정이 부족합니다.",
      providerMetadata: {
        provider: "amazon_q",
        service: "amazon_q_business",
        routeTarget: input.target,
        cacheHit: false,
        cacheKey: "terraform-preview-short-review-test",
        estimatedUsage: {
          inputCharacters: 100,
          inputTokensEstimate: 25
        },
        billingMode: "aws_credit_only",
        generatedAt: "2026-07-15T00:00:00.000Z"
      }
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: {
      terraformCode: 'resource "aws_s3_bucket" "s3_bucket" {}'
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "service_unavailable");

  await app.close();
});

test("Terraform 에이전트 리뷰 API는 근거가 충분한 세 문장 결론을 성공 처리한다", async () => {
  const conclusion =
    "현재 Terraform은 VPC, 서브넷, 보안 그룹, 로드 밸런서와 대상 그룹의 연결 관계를 코드로 명시해 변경 범위와 의존성을 검토할 수 있고, 인터넷 진입점과 애플리케이션 계층의 책임도 리소스 단위로 구분한 점이 좋습니다. 다만 제공된 코드에는 액세스 로그 저장, 전송 구간 암호화, 제한적인 인바운드 규칙, 다중 가용 영역 배치, 상태 확인 실패 시 대응 기준이 충분히 드러나지 않아 보안과 신뢰성 판단에 필요한 근거가 부족하며, 특히 넓은 CIDR 허용이나 단일 서브넷 배치는 실제 장애와 노출 위험으로 이어질 수 있습니다. 배포 전에는 HTTPS 리스너와 인증서, 최소 권한 보안 그룹, 두 개 이상의 가용 영역에 걸친 서브넷, 로그 버킷과 보존 정책, 구체적인 상태 확인 값을 Terraform에 선언하고 예상 트래픽을 기준으로 용량과 비용 설정까지 함께 검증해야 합니다.";
  const app = buildApp({
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "Amazon Q 검토 완료",
      highlights: ["운영", "보안", "안정성", "성능", "비용", "지속 가능성"],
      nextActions: ["구체적인 보완 설정을 적용하세요."],
      fallbackUsed: false,
      wellArchitectedConclusion: conclusion,
      providerMetadata: {
        provider: "amazon_q",
        service: "amazon_q_business",
        routeTarget: input.target,
        cacheHit: false,
        cacheKey: "terraform-preview-three-sentence-review-test",
        estimatedUsage: {
          inputCharacters: 100,
          inputTokensEstimate: 25
        },
        billingMode: "aws_credit_only",
        generatedAt: "2026-07-15T00:00:00.000Z"
      }
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: {
      terraformCode: 'resource "aws_lb" "web" {}'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().llmExplanation?.wellArchitectedConclusion, conclusion);

  await app.close();
});

test("Terraform 에이전트 리뷰 API는 Amazon Q의 장단점 구분을 한 문단으로 정규화한다", async () => {
  const app = buildApp({
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "Amazon Q 검토 완료",
      highlights: ["보안과 운영 근거를 확인했습니다."],
      nextActions: ["누락된 설정을 코드로 보완하세요."],
      fallbackUsed: false,
      wellArchitectedConclusion:
        "잘한 점:\n현재 Terraform은 VPC와 서브넷, 보안 그룹의 참조 관계를 코드로 명시해 변경 범위와 네트워크 경계를 검토할 수 있고, 리소스 이름과 주요 설정도 반복 가능한 형태로 관리하는 점이 좋습니다. 문제점:\n다만 액세스 로그, 전송 구간 암호화, 최소 권한 인바운드 규칙과 장애 복구 기준이 충분히 드러나지 않아 실제 배포 전 보안 및 신뢰성 검증 근거가 부족합니다. 배포 전에는 HTTPS 리스너, 제한적인 보안 그룹, 다중 가용 영역, 로그 보존 정책과 상태 확인 값을 Terraform에 선언하고 plan 결과에서 교체 및 삭제 범위까지 확인해야 합니다.",
      providerMetadata: {
        provider: "amazon_q",
        service: "amazon_q_business",
        routeTarget: input.target,
        cacheHit: false,
        cacheKey: "terraform-preview-normalized-review-test",
        estimatedUsage: { inputCharacters: 100, inputTokensEstimate: 25 },
        billingMode: "aws_credit_only",
        generatedAt: "2026-07-15T00:00:00.000Z"
      }
    })
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/terraform-preview-explanation",
    payload: { terraformCode: 'resource "aws_vpc" "main" {}' }
  });
  const conclusion = response.json().llmExplanation?.wellArchitectedConclusion as string;

  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(conclusion, /[\r\n]/u);
  assert.doesNotMatch(conclusion, /(?:잘한 점|문제점)\s*:/u);
  assert.match(conclusion, /현재 Terraform은 VPC와 서브넷/u);
  assert.match(conclusion, /다만 액세스 로그/u);

  await app.close();
});

test("Amazon Q 에이전트 리뷰 프롬프트는 장단점의 근거를 하나의 긴 문단으로 요구한다", async () => {
  let providerPrompt = "";
  const createExplanation = createAiProviderBackedLlmExplanation({
    amazonQProvider: {
      provider: "amazon_q",
      service: "amazon_q_business",
      generate: async (request) => {
      providerPrompt = request.prompt;

        return {
          text: JSON.stringify({
            target: "terraform_preview_explanation",
            summary: "Amazon Q 검토 완료",
            highlights: ["운영", "보안", "안정성", "성능", "비용", "지속 가능성"],
            nextActions: ["구체적인 보완 설정을 적용하세요."],
            fallbackUsed: false,
            codeSuggestion: null,
            wellArchitectedConclusion:
              "현재 구성에서 확인한 장점과 문제를 Terraform 근거와 함께 설명합니다."
          })
        };
      }
    },
    creditPolicy: {
      amazonQ: true,
      bedrock: false,
      transcribe: false,
      billingMode: "aws_credit_only"
    }
  });

  await createExplanation({
    target: "terraform_preview_explanation",
    result: explainTerraformPreview('resource "aws_s3_bucket" "assets" {\n  force_destroy = false\n}'),
    terraformCodeContext:
      'resource "aws_s3_bucket" "assets" {\n  force_destroy = false\n}\nresource "aws_ecr_repository" "api" {\n  image_scanning_configuration {\n    scan_on_push = true\n  }\n  image_tag_mutability = "IMMUTABLE"\n}'
  });

  assert.match(providerPrompt, /exactly 3 complete Korean sentences/u);
  assert.match(providerPrompt, /within 110 Korean characters/u);
  assert.match(providerPrompt, /\| 판단: concrete issue or confirmed strength \| 확인:/u);
  assert.match(providerPrompt, /specific Terraform evidence/u);
  assert.match(providerPrompt, /single paragraph without headings or bullet points/u);
  assert.match(providerPrompt, /strengths and problems naturally/u);
  assert.match(providerPrompt, /"resourceTypes":\["aws_s3_bucket x1"\]/u);
  assert.match(providerPrompt, /scan_on_push = true/u);
  assert.match(providerPrompt, /image_tag_mutability = \\"IMMUTABLE\\"/u);
});

test("trusts exactly one ALB hop and ignores spoofed leading client IP headers", async () => {
  const app = buildApp();

  app.get("/forwarded-context", async (request) => ({
    ip: request.ip,
    protocol: request.protocol
  }));

  const response = await app.inject({
    headers: {
      "x-forwarded-for": "192.0.2.99, 203.0.113.10",
      "x-forwarded-proto": "https"
    },
    method: "GET",
    url: "/forwarded-context"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ip: "203.0.113.10",
    protocol: "https"
  });

  await app.close();
});

test("GET /api/projects requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/projects"
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("GET /api/notifications requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/notifications"
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("POST /api/auth/logout-all requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout-all"
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("DELETE /api/auth/me requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "DELETE",
    url: "/api/auth/me"
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("unknown routes return the standard 404 error response", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/unknown"
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("Live Observation v2 returns an explicit unavailable error while disabled", async () => {
  const app = buildApp({
    runtimeEnv: createLiveObservationRuntimeEnv({ liveObservationEnabled: "false" })
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/deployments/123e4567-e89b-42d3-a456-426614174000/live-observations"
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: "LIVE_OBSERVATION_DISABLED",
    message: "Live Observation is disabled"
  });
  assert.equal(typeof response.headers["x-request-id"], "string");
  assert.ok(String(response.headers["x-request-id"]).length > 0);

  await app.close();
});

test("Live Observation v2 requires a valid capability keyring when enabled", () => {
  assert.throws(
    () =>
      buildApp({
        runtimeEnv: createLiveObservationRuntimeEnv({ liveObservationEnabled: "true" })
      }),
    /Invalid Live Observation capability configuration/
  );
});

test("Live Observation v2 app composition exposes Store routes and removes legacy token behavior", async () => {
  const observationId = "11111111-1111-4111-8111-111111111111";
  const deploymentId = "123e4567-e89b-42d3-a456-426614174000";
  const snapshot = {
    observationId,
    status: "active" as const,
    live: {
      acceptedEventCount: 0,
      rollingRequestsPerSecond: 0,
      projectedRequestsPerMinute: 0,
      pressurePercent: 0,
      pressureLevel: "normal" as const,
      observedAt: "2026-07-11T00:00:00.000Z"
    },
    latestObservation: null,
    terminalAt: null
  };
  const app = buildApp({
    runtimeEnv: createLiveObservationRuntimeEnv({
      liveObservationEnabled: "true",
      liveObservationCapabilityCurrentKid: "current-key",
      liveObservationCapabilityCurrentSecret: Buffer.alloc(32, 0x41).toString("base64url")
    }),
    liveObservationV2Runtime: {
      collector: {
        async authorize() {
          return {
            audienceOrigin: "https://sketchcatch.example.com",
            request: async () => ({ accepted: true, acceptedEventCount: 1 })
          };
        },
        async bootstrap() {
          return {
            audienceOrigin: "https://sketchcatch.example.com",
            credential: `current-key.${"a".repeat(43)}`
          };
        },
        async preflight() {
          return { audienceOrigin: "https://sketchcatch.example.com" };
        }
      },
      liveObservationService: {
        async createSession() {
          return {
            session: {
              id: observationId,
              deploymentId,
              status: "active" as const,
              audienceUrl: `https://sketchcatch.example.com/observe/${observationId}`,
              createdAt: "2026-07-11T00:00:00.000Z",
              expiresAt: "2026-07-11T00:15:00.000Z"
            },
            snapshot
          };
        },
        async readSession() {
          return { snapshot };
        },
        async stopSession() {
          return { snapshot: { ...snapshot, status: "stopped" as const } };
        }
      },
      async prepareDeploymentManifest() {},
      async requireDeploymentAccess() {},
      async refreshObservation() {}
    }
  });

  const created = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/live-observations`
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().session.audienceUrl, `https://sketchcatch.example.com/observe/${observationId}`);

  const bootstrap = await app.inject({
    method: "POST",
    url: `/api/live-observations/public/${observationId}/bootstrap`,
    headers: { origin: "https://sketchcatch.example.com" }
  });
  assert.equal(bootstrap.statusCode, 200);

  const legacyToken = await app.inject({
    method: "POST",
    url: `/api/live-observations/public/${"a".repeat(43)}/events`,
    headers: { origin: "https://sketchcatch.example.com" }
  });
  assert.equal(legacyToken.statusCode, 404);

  await app.close();
});

test("OPTIONS preflight allows project draft PUT requests", async () => {
  const app = buildApp();

  const response = await app.inject({
    headers: {
      "access-control-request-headers": "content-type,authorization",
      "access-control-request-method": "PUT",
      origin: "http://localhost:3000"
    },
    method: "OPTIONS",
    url: "/api/projects/11111111-1111-4111-8111-111111111111/draft"
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.match(String(response.headers["access-control-allow-methods"]), /PUT/);
  assert.match(String(response.headers["access-control-allow-headers"]), /authorization/);

  await app.close();
});

test("OPTIONS preflight allows notification read PATCH requests", async () => {
  const app = buildApp();

  const response = await app.inject({
    headers: {
      "access-control-request-headers": "content-type,authorization",
      "access-control-request-method": "PATCH",
      origin: "http://localhost:3000"
    },
    method: "OPTIONS",
    url: "/api/notifications/ntf_11111111111111111111111111111111/read"
  });

  assert.equal(response.statusCode, 204);
  assert.match(String(response.headers["access-control-allow-methods"]), /PATCH/);

  await app.close();
});

test("OPTIONS preflight allows the configured public web origin", async () => {
  const previousPublicBaseUrl = process.env.SKETCHCATCH_PUBLIC_BASE_URL;
  process.env.SKETCHCATCH_PUBLIC_BASE_URL = "http://127.0.0.1:3002";
  const app = buildApp();

  try {
    const response = await app.inject({
      headers: {
        "access-control-request-headers": "content-type,authorization",
        "access-control-request-method": "POST",
        origin: "http://127.0.0.1:3002"
      },
      method: "OPTIONS",
      url: "/api/projects/11111111-1111-4111-8111-111111111111/source-repositories"
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:3002");
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  } finally {
    if (previousPublicBaseUrl === undefined) {
      delete process.env.SKETCHCATCH_PUBLIC_BASE_URL;
    } else {
      process.env.SKETCHCATCH_PUBLIC_BASE_URL = previousPublicBaseUrl;
    }
    await app.close();
  }
});

test("production 500 responses do not expose internal error messages", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousS3BucketName = process.env.S3_BUCKET_NAME;
  process.env.NODE_ENV = "production";
  process.env.S3_BUCKET_NAME = "test-project-assets";
  const app = buildApp();

  app.get("/boom", async () => {
    throw new Error("internal diagnostic detail should stay server-side");
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/boom"
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: "internal_server_error",
      message: "Internal server error"
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousS3BucketName === undefined) {
      delete process.env.S3_BUCKET_NAME;
    } else {
      process.env.S3_BUCKET_NAME = previousS3BucketName;
    }
    await app.close();
  }
});

test("API logger options stay disabled in tests", () => {
  assert.equal(createApiLoggerOptions({ nodeEnv: "test" }), false);
});

test("API logger redaction explicitly covers root and request/response header wrappers", () => {
  const loggerOptions = createApiLoggerOptions({ nodeEnv: "production" });

  assert.notEqual(loggerOptions, false);
  if (loggerOptions === false) {
    assert.fail("Expected production logger options");
  }

  const redact = loggerOptions.redact;
  assert.ok(redact && !Array.isArray(redact));
  const paths = redact.paths;

  for (const wrapper of ["", "req.", "request.", "res.", "response."]) {
    assert.ok(paths.includes(`${wrapper}headers.authorization`));
    assert.ok(paths.includes(`${wrapper}headers.cookie`));
    assert.ok(paths.includes(`${wrapper}headers["set-cookie"]`));
  }
});

test("API logger censors sensitive headers in actual serialized Fastify output", async () => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });
  const loggerOptions = createApiLoggerOptions({
    nodeEnv: "production",
    stream
  });
  const app = Fastify({ logger: loggerOptions });
  const probes = {
    rootAuthorization: "Bearer root-authorization-probe",
    rootCookie: "root-cookie-probe=secret",
    rootSetCookie: "root-set-cookie-probe=secret",
    requestAuthorization: "Bearer request-authorization-probe",
    requestCookie: "request-cookie-probe=secret",
    requestSetCookie: "request-set-cookie-probe=secret",
    responseAuthorization: "Bearer response-authorization-probe",
    responseCookie: "response-cookie-probe=secret",
    responseSetCookie: "response-set-cookie-probe=secret"
  };

  app.log.info({
    headers: {
      authorization: probes.rootAuthorization,
      cookie: probes.rootCookie,
      "set-cookie": probes.rootSetCookie,
      "x-visible-root": "visible-root-probe"
    },
    request: {
      headers: {
        authorization: probes.requestAuthorization,
        cookie: probes.requestCookie,
        "set-cookie": probes.requestSetCookie,
        "x-visible-request": "visible-request-probe"
      }
    },
    response: {
      headers: {
        authorization: probes.responseAuthorization,
        cookie: probes.responseCookie,
        "set-cookie": probes.responseSetCookie,
        "x-visible-response": "visible-response-probe"
      }
    }
  });

  await app.close();
  stream.end();
  await once(stream, "finish");

  for (const probe of Object.values(probes)) {
    assert.equal(output.includes(probe), false);
  }
  assert.match(output, /visible-root-probe/);
  assert.match(output, /visible-request-probe/);
  assert.match(output, /visible-response-probe/);
});

function assertErrorResponse(
  body: ApiErrorResponse,
  expectedError: ApiErrorResponse["error"]
): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
  assert.equal(body.error, expectedError);
  assert.equal(typeof body.message, "string");
}

function createLiveObservationRuntimeEnv(
  overrides: Partial<RuntimeEnv> = {}
): RuntimeEnv {
  return {
    awsRegion: "ap-northeast-2",
    authTokenSecret: process.env.AUTH_TOKEN_SECRET,
    cloudFormationTemplateTokenSecret: undefined,
    databaseUrl: undefined,
    databaseSsl: false,
    githubOauthClientId: undefined,
    githubOauthClientSecret: undefined,
    kakaoOauthClientId: undefined,
    kakaoOauthClientSecret: undefined,
    naverOauthClientId: undefined,
    naverOauthClientSecret: undefined,
    nodeEnv: "test",
    oauthRedirectBaseUrl: undefined,
    s3BucketName: undefined,
    sketchcatchAwsCallerPrincipalArn: undefined,
    sketchcatchPublicBaseUrl: "https://sketchcatch.example.com",
    ...overrides
  };
}
