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
