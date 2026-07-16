import assert from "node:assert/strict";
import test from "node:test";
import { forwardArchitectureDraftProxyRequest } from "./proxy";

test("architecture draft proxy는 caller abort를 upstream signal로 전달하고 503으로 위장하지 않는다", async () => {
  const controller = new AbortController();
  let forwardedSignal: AbortSignal | undefined;
  let markFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    markFetchStarted = resolve;
  });
  const request = new Request("http://localhost/api/ai/architecture-draft/stream", {
    body: JSON.stringify({ prompt: "정적 웹사이트" }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: controller.signal
  });
  const responsePromise = forwardArchitectureDraftProxyRequest(request, {
    apiOrigin: "http://api.local",
    backendPath: "/api/ai/architecture-draft/stream",
    fetcher: async (_input, init) => {
      forwardedSignal = init?.signal ?? undefined;
      markFetchStarted?.();
      return new Promise<Response>((_resolve, reject) => {
        forwardedSignal?.addEventListener("abort", () => reject(forwardedSignal?.reason), {
          once: true
        });
      });
    }
  });

  await fetchStarted;
  controller.abort(new DOMException("cancelled", "AbortError"));

  await assert.rejects(
    responsePromise,
    (error: unknown) => error instanceof Error && error.name === "AbortError"
  );
  assert.equal(forwardedSignal?.aborted, true);
});

test("architecture draft proxy는 genuine upstream 연결 실패를 기존 503 JSON으로 유지한다", async () => {
  const response = await forwardArchitectureDraftProxyRequest(
    new Request("http://localhost/api/ai/architecture-draft/stream", {
      body: JSON.stringify({ prompt: "정적 웹사이트" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    }),
    {
      apiOrigin: "http://api.local",
      backendPath: "/api/ai/architecture-draft/stream",
      fetcher: async () => {
        throw new Error("ECONNREFUSED");
      }
    }
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "service_unavailable",
    message: "Amazon Q API 연결에 실패했습니다. 잠시 후 다시 시도해주세요."
  });
});

test("architecture draft stream proxy는 reverse proxy buffering을 비활성화한다", async () => {
  const response = await forwardArchitectureDraftProxyRequest(
    new Request("http://localhost/api/ai/architecture-draft/stream", {
      body: JSON.stringify({ prompt: "정적 웹사이트" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    }),
    {
      apiOrigin: "http://api.local",
      backendPath: "/api/ai/architecture-draft/stream",
      fetcher: async () =>
        new Response('{"type":"progress"}\n', {
          headers: { "content-type": "application/x-ndjson" }
        })
    }
  );

  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
});
