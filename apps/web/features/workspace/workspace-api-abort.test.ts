import assert from "node:assert/strict";
import test from "node:test";
import { createAiArchitectureDraft } from "./api";

test("public AI 요청 취소는 연결 실패로 바꾸지 않고 AbortError를 유지한다", async () => {
  const originalFetch = globalThis.fetch;
  const abortError = new Error("cancelled");
  abortError.name = "AbortError";
  globalThis.fetch = async () => {
    throw abortError;
  };

  try {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      createAiArchitectureDraft(
        { prompt: "정적 웹사이트" },
        { signal: controller.signal }
      ),
      (error: unknown) => error instanceof Error && error.name === "AbortError"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
