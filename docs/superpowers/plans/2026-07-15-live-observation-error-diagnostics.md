# Live Observation Error Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live Observation이 비활성화된 원인을 503 전용 오류로 반환하고, 프런트 API 오류에 안전한 요청 위치와 응답 진단 정보를 표시한다.

**Architecture:** Fastify는 Live Observation이 꺼져 있어도 세션 관리 경로를 등록하고 service 호출 없이 전용 오류를 반환한다. 공통 Web API client는 HTTP method, query 없는 path, status, error code, request ID를 `ApiClientError`에 보존하고 기존 한국어 오류 문장 뒤에 진단 문구를 붙인다.

**Tech Stack:** TypeScript 6, Fastify 5, Next.js 16, React 19, Node test runner, pnpm 11

## Global Constraints

- DB schema와 `apps/api/drizzle/**`는 변경하지 않는다.
- Live Observation을 기본 활성화하거나 capability secret을 생성하지 않는다.
- API path 진단에는 query와 fragment를 포함하지 않는다.
- Authorization, cookie, credential, token은 응답·로그·화면에 추가하지 않는다.
- production code보다 실패하는 회귀 테스트를 먼저 작성하고 RED를 확인한다.
- shared type → API → Web 순서로 계약을 변경한다.

## File Structure

- `packages/types/src/index.ts`: `LIVE_OBSERVATION_DISABLED` 공용 오류 코드를 소유한다.
- `apps/api/src/routes/live-observations-v2.ts`: 활성·비활성 Live Observation 라우트 동작을 구분한다.
- `apps/api/src/app.ts`: 라우트를 항상 조합하고 모든 API 응답에 `x-request-id`를 붙인다.
- `apps/api/src/app.test.ts`: 비활성 응답과 request ID 회귀를 검증한다.
- `apps/web/lib/api-client.ts`: HTTP 실패의 안전한 요청 문맥을 수집하고 표시한다.
- `apps/web/features/api-client-error-diagnostics.test.ts`: 프런트 공통 진단 문구와 URL redaction을 검증한다.
- `apps/web/features/workspace/api.ts`: 공통 client 밖의 public AI fetch도 같은 요청 문맥을 전달한다.
- `.env.example`: Live Observation v2 활성화 조건을 정확히 설명한다.
- `docs/data-models.md`: 공통 프런트 오류 진단 계약을 기록한다.
- `agent-progress.md`: 원인, 변경, 검증 결과를 영어로 기록한다.

---

### Task 1: Live Observation 비활성 API 계약

**Files:**
- Modify: `packages/types/src/index.ts:12-28`
- Modify: `apps/api/src/app.test.ts:123-135`
- Modify: `apps/api/src/routes/live-observations-v2.ts:10-44`
- Modify: `apps/api/src/app.ts:185-289`

**Interfaces:**
- Consumes: `RuntimeEnv.liveObservationEnabled`와 `FastifyRequest.id`
- Produces: `ApiErrorCode`의 `LIVE_OBSERVATION_DISABLED`, `503 { error, message }`, `x-request-id` response header

- [ ] **Step 1: 비활성 응답과 request ID의 실패 테스트 작성**

`apps/api/src/app.test.ts`의 기존 비활성 테스트를 다음 계약으로 바꾼다.

```ts
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
```

- [ ] **Step 2: API 회귀 테스트가 RED인지 확인**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern='Live Observation v2 returns an explicit unavailable error while disabled' src/app.test.ts
```

Expected: FAIL because the response is still `404` and has no explicit disabled code.

- [ ] **Step 3: 공용 오류 코드 추가**

`packages/types/src/index.ts`의 `ApiErrorCode` union에 다음 값을 추가한다.

```ts
  | "LIVE_OBSERVATION_DISABLED"
```

- [ ] **Step 4: 활성·비활성 route options를 discriminated union으로 분리**

`apps/api/src/routes/live-observations-v2.ts`에서 options를 다음 구조로 바꾸고, 비활성 경로 네 개를 등록한다.

```ts
type EnabledLiveObservationV2RouteOptions = {
  readonly enabled: true;
  readonly liveObservationService: LiveObservationV2Service;
  readonly prepareDeploymentManifest: (
    request: FastifyRequest,
    deploymentId: string
  ) => Promise<void>;
  readonly requireDeploymentAccess: (
    request: FastifyRequest,
    deploymentId: string
  ) => Promise<void>;
  readonly refreshObservation: (
    request: FastifyRequest,
    deploymentId: string,
    observationId: string
  ) => Promise<void>;
};

export type LiveObservationV2RouteOptions =
  | { readonly enabled: false }
  | EnabledLiveObservationV2RouteOptions;

function sendDisabled(reply: FastifyReply) {
  return reply.status(503).send({
    error: "LIVE_OBSERVATION_DISABLED",
    message: "Live Observation is disabled"
  });
}
```

`registerLiveObservationV2Routes` 시작 부분은 다음처럼 실제 service를 건드리지 않는 비활성 handler를 등록한다.

```ts
  if (!options.enabled) {
    app.post("/deployments/:deploymentId/live-observations", (_request, reply) =>
      sendDisabled(reply)
    );
    app.get(
      "/deployments/:deploymentId/live-observations/:observationId",
      (_request, reply) => sendDisabled(reply)
    );
    app.get(
      "/deployments/:deploymentId/live-observations/:observationId/stream",
      (_request, reply) => sendDisabled(reply)
    );
    app.post(
      "/deployments/:deploymentId/live-observations/:observationId/stop",
      (_request, reply) => sendDisabled(reply)
    );
    return;
  }
```

같은 파일의 `streamSnapshots` input에서 union 전체를 index하지 않도록 다음 type을 사용한다.

```ts
refreshObservation: EnabledLiveObservationV2RouteOptions["refreshObservation"];
```

- [ ] **Step 5: 앱에서 라우트를 항상 등록하고 request ID header 추가**

`apps/api/src/app.ts`의 기존 `onRequest` hook 첫 줄에 다음 header를 추가한다.

```ts
reply.header("x-request-id", request.id);
```

조건부 Live Observation 등록을 다음과 같이 바꾼다.

```ts
  app.register(registerLiveObservationV2Routes, liveObservationV2Runtime
    ? {
        prefix: "/api",
        enabled: true,
        liveObservationService: liveObservationV2Runtime.liveObservationService,
        prepareDeploymentManifest: liveObservationV2Runtime.prepareDeploymentManifest,
        requireDeploymentAccess: liveObservationV2Runtime.requireDeploymentAccess,
        refreshObservation: liveObservationV2Runtime.refreshObservation
      }
    : {
        prefix: "/api",
        enabled: false
      });

  if (liveObservationV2Runtime) {
    app.register(registerLiveObservationPublicCollectorRoutes, {
      prefix: "/api",
      collector: liveObservationV2Runtime.collector,
      enabled: true
    });
  }
```

- [ ] **Step 6: API 테스트가 GREEN인지 확인**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern='Live Observation v2 returns an explicit unavailable error while disabled|Live Observation v2 app composition exposes Store routes|unknown routes return the standard 404 error response' src/app.test.ts
```

Expected: 3 tests PASS. Unknown routes remain 404 and enabled Live Observation remains 201.

- [ ] **Step 7: Task 1 커밋**

```bash
git add packages/types/src/index.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/routes/live-observations-v2.ts
git commit -m "Fix: Live Observation 비활성 원인 응답"
```

---

### Task 2: 프런트 공통 API 오류 진단

**Files:**
- Create: `apps/web/features/api-client-error-diagnostics.test.ts`
- Modify: `apps/web/lib/api-client.ts:100-320`
- Modify: `apps/web/features/workspace/api.ts:530-575`

**Interfaces:**
- Consumes: Task 1의 `x-request-id` header와 `ApiErrorCode`
- Produces: `ApiRequestContext`, 확장된 `ApiClientError`, `getApiErrorMessage()`의 안전한 진단 suffix

- [ ] **Step 1: 서버 응답 진단과 URL redaction의 실패 테스트 작성**

`apps/web/features/api-client-error-diagnostics.test.ts`를 다음 내용으로 만든다.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiClientError,
  apiFetch,
  getApiErrorMessage
} from "../lib/api-client";

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
```

- [ ] **Step 2: Web 회귀 테스트가 RED인지 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/api-client-error-diagnostics.test.ts
```

Expected: FAIL because `ApiClientError` does not preserve request context and the disabled translation is absent.

- [ ] **Step 3: `ApiClientError`에 안전한 request context 추가**

`apps/web/lib/api-client.ts`에 다음 type과 fields를 추가한다.

```ts
export type ApiRequestContext = Readonly<{
  method: string;
  path: string;
  requestId?: string | undefined;
}>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly lockedUntil?: string;
  readonly requestContext?: ApiRequestContext;

  constructor(
    status: number,
    response: ApiErrorResponse | LoginLockedErrorResponse,
    requestContext?: ApiRequestContext
  ) {
    super(response.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = response.error;
    this.requestContext = requestContext;
    if ("lockedUntil" in response) this.lockedUntil = response.lockedUntil;
  }
}
```

`apiFetch`는 fetch 전에 다음 context를 만든다.

```ts
const requestContext = createApiRequestContext(path, requestInit.method);
```

fetch 실패에는 `createConnectionError(requestContext)`, HTTP 실패에는 `toApiClientError(response, requestContext)`를 전달한다. 두 helper signature도 context를 받도록 변경하고 HTTP 오류에는 request ID를 결합한다.

```ts
async function toApiClientError(
  response: Response,
  requestContext: ApiRequestContext
): Promise<ApiClientError> {
  const context = withRequestId(requestContext, response.headers.get("x-request-id"));
  const responseBody = await readJson(response);
  if (isApiErrorResponse(responseBody)) {
    return new ApiClientError(response.status, responseBody, context);
  }
  return new ApiClientError(response.status, {
    error: response.status >= 500 ? "internal_server_error" : "bad_request",
    message: "요청 처리 중 오류가 발생했습니다."
  }, context);
}
```

- [ ] **Step 4: 진단 context 생성과 화면 문구 결합 구현**

`apps/web/lib/api-client.ts`에 다음 helper를 추가한다.

```ts
function createApiRequestContext(path: string, method?: string): ApiRequestContext {
  return {
    method: (method ?? "GET").toUpperCase(),
    path: getSafeApiPath(buildApiUrl(path))
  };
}

function getSafeApiPath(value: string): string {
  try {
    return new URL(value, "http://sketchcatch.local").pathname;
  } catch {
    return "/api";
  }
}

function withRequestId(
  context: ApiRequestContext,
  requestId: string | null
): ApiRequestContext {
  const normalizedRequestId = requestId?.trim();
  return normalizedRequestId
    ? { ...context, requestId: normalizedRequestId }
    : context;
}

function appendApiDiagnostic(message: string, error: ApiClientError): string {
  const context = error.requestContext;
  if (!context) return message;
  const response = error.status === 0 ? "응답 없음" : `HTTP ${error.status}`;
  const requestId = context.requestId ? ` · 요청 ID ${context.requestId}` : "";
  return `${message} [${context.method} ${context.path} · ${response} · ${error.code}${requestId}]`;
}
```

`getApiErrorMessage`는 먼저 기존 한국어 message를 계산하고 모든 `ApiClientError` 반환에 `appendApiDiagnostic`를 적용한다. `DEFAULT_API_ERROR_MESSAGES`에는 다음 값을 추가한다.

```ts
LIVE_OBSERVATION_DISABLED: "실시간 관측 기능이 서버에서 비활성화되어 있습니다.",
```

- [ ] **Step 5: refresh와 public AI direct fetch에도 실제 요청 context 전달**

`refreshStoredSession`은 `createApiRequestContext("/auth/refresh", "POST")`를 만들어 연결 실패와 HTTP 실패에 넘긴다.

`apps/web/features/workspace/api.ts`의 `postPublicAiJson`은 fetch 전에 같은 context를 만들고, 네트워크 예외도 `status: 0`인 `ApiClientError`로 변환한다.

```ts
const requestContext = {
  method: "POST",
  path: new URL(`${AI_API_BASE_URL}${path}`, "http://sketchcatch.local").pathname
};

let response: Response;
try {
  response = await fetch(`${AI_API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers,
    method: "POST"
  });
} catch {
  throw new ApiClientError(0, {
    error: "internal_server_error",
    message: "API 서버에 연결할 수 없습니다. Docker DB와 API 서버가 켜져 있는지 확인해주세요."
  }, requestContext);
}
```

`readPublicAiError`는 path 대신 이 context를 인자로 받고 response header의 request ID를 추가한 뒤 `ApiClientError`에 전달한다.

```ts
const responseContext = {
  ...requestContext,
  ...(response.headers.get("x-request-id")
    ? { requestId: response.headers.get("x-request-id")!.trim() }
    : {})
};
```

`postPublicAiJson`은 `throw await readPublicAiError(response, requestContext)`를 사용한다. HTTP 요청 전의 local validation error는 context 없이 유지한다.

- [ ] **Step 6: Web 테스트가 GREEN인지 확인**

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/api-client-error-diagnostics.test.ts features/workspace/api-client-auth-session.test.ts
```

Expected: 4 tests PASS, query의 `token=secret`과 fragment가 출력에 없음.

- [ ] **Step 7: Task 2 커밋**

```bash
git add apps/web/lib/api-client.ts apps/web/features/api-client-error-diagnostics.test.ts apps/web/features/workspace/api.ts
git commit -m "Feat: 프런트 API 오류 진단 정보 표시"
```

---

### Task 3: 문서화와 전체 검증

**Files:**
- Modify: `.env.example:31-38`
- Modify: `docs/data-models.md:1880-1890`
- Modify: `agent-progress.md:1-30`

**Interfaces:**
- Consumes: Task 1과 Task 2의 확정된 API/Web 동작
- Produces: 로컬 설정 안내, canonical 오류 진단 계약, 세션 검증 기록

- [ ] **Step 1: 로컬 환경 변수 설명 갱신**

`.env.example`의 기존 v1 설명을 다음 문장으로 교체한다.

```dotenv
# Live Observation v2는 명시적으로 활성화할 때만 세션 API를 실행합니다.
# false이면 API는 503 LIVE_OBSERVATION_DISABLED를 반환합니다.
LIVE_OBSERVATION_ENABLED=false

# true로 활성화하려면 아래 current keyring과 SKETCHCATCH_PUBLIC_BASE_URL이 필요합니다.
# secret은 정확히 32-byte인 unpadded base64url이어야 합니다.
```

- [ ] **Step 2: canonical data model 문서에 오류 진단 계약 추가**

`docs/data-models.md`의 Live Observation API 목록 뒤에 다음 동작을 기록한다.

```text
`LIVE_OBSERVATION_ENABLED=false`이면 인증 세션 관리 경로는 service나 Store를 호출하지 않고
`503 LIVE_OBSERVATION_DISABLED`를 반환한다. API는 모든 응답의 `x-request-id`에 Fastify request ID를
반환한다. Web은 API 오류에 HTTP method, query/fragment를 제거한 path, HTTP status 또는 응답 없음,
error code, 선택적인 request ID를 표시하며 credential-bearing query와 fragment는 화면에 복제하지 않는다.
```

- [ ] **Step 3: focused 회귀 테스트 실행**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test --test-name-pattern='Live Observation v2 returns an explicit unavailable error while disabled|Live Observation v2 app composition exposes Store routes|unknown routes return the standard 404 error response' src/app.test.ts
pnpm --filter @sketchcatch/web exec tsx --test features/api-client-error-diagnostics.test.ts features/workspace/api-client-auth-session.test.ts
```

Expected: API 3 tests PASS and Web 4 tests PASS.

- [ ] **Step 4: 프로젝트 필수 검증 실행**

Run each command and require exit code 0:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands exit 0. Any failure is reported with its actual command and output instead of being marked passing.

- [ ] **Step 5: 실제 로컬 재현 경로 확인**

현재 실행 중인 API는 코드를 reload한 뒤에도 기능이 비활성화되어 있으므로 다음 명령은 503과 전용 code를 반환해야 한다.

```bash
curl -sS -i -X POST \
  http://localhost:4000/api/deployments/0a7b3448-e4e2-42a9-9bd0-238c16facfa5/live-observations \
  -H 'content-type: application/json' \
  --data '{}'
```

Expected: `HTTP/1.1 503`, non-empty `x-request-id`, body error `LIVE_OBSERVATION_DISABLED`. 이 검증은 Live Observation을 실제 활성화하거나 AWS를 변경하지 않는다.

- [ ] **Step 6: 하네스 기록 갱신과 최종 커밋**

`agent-progress.md`에 root cause, 변경 파일 범위, focused/full verification, Live Observation이 여전히 명시적 설정을 요구한다는 알려진 경계를 영어로 기록한다. 이후 실행한다.

```bash
git add .env.example docs/data-models.md agent-progress.md
git commit -m "Docs: Live Observation 오류 진단 계약 기록"
```

- [ ] **Step 7: 종료 하네스 재확인**

Run:

```bash
pnpm harness:check
git status --short
```

Expected: harness passes and working tree is clean.
