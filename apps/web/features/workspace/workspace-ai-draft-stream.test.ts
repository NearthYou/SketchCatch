import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureDraftProgressSnapshot,
  ArchitectureDraftStreamEvent,
  CreateArchitectureDraftResponse
} from "@sketchcatch/types";
import { ApiClientError } from "../../lib/api-client";
import { createAiArchitectureDraftStream } from "./api";

const snapshot: ArchitectureDraftProgressSnapshot = {
  sequence: 1,
  stage: "normalizing_requirements",
  confirmedRequirements: ["정적 웹사이트"],
  pendingQuestions: [],
  provisionalArchitectureJson: {
    nodes: [
      {
        id: "candidate-s3",
        type: "S3",
        label: "Static Website Bucket",
        positionX: 120,
        positionY: 160,
        config: {}
      }
    ],
    edges: []
  },
  excludableCandidateIds: ["candidate-s3"]
};

const result: CreateArchitectureDraftResponse = {
  architectureJson: snapshot.provisionalArchitectureJson!,
  title: "Static Website",
  metadata: {
    source: "prompt",
    confidence: "medium",
    assumptions: [],
    explanations: []
  }
};

test("AI draft stream은 임의 청크 경계와 한 청크의 여러 NDJSON 줄을 처리한다", async () => {
  const originalFetch = globalThis.fetch;
  const progressEvents: ArchitectureDraftProgressSnapshot[] = [];
  const payload = [
    JSON.stringify({ type: "progress", stage: snapshot.stage, snapshot }),
    JSON.stringify({ type: "result", result })
  ].join("\n") + "\n";
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Accept"), "application/x-ndjson");
    assert.equal(init?.signal instanceof AbortSignal, true);
    return createChunkedResponse([
      payload.slice(0, 11),
      payload.slice(11, 47),
      payload.slice(47)
    ]);
  };

  try {
    const controller = new AbortController();
    const response = await createAiArchitectureDraftStream(
      { prompt: "  정적 웹사이트  " },
      { signal: controller.signal, onProgress: (next) => progressEvents.push(next) }
    );

    assert.deepEqual(progressEvents, [snapshot]);
    assert.deepEqual(response, result);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI draft stream은 서버가 보내는 실제 terminal status/code와 요청 문맥을 보존한다", async () => {
  const originalFetch = globalThis.fetch;

  try {
    for (const expected of [
      { statusCode: 422, code: "unprocessable_entity" },
      { statusCode: 502, code: "bad_gateway" },
      { statusCode: 503, code: "service_unavailable" }
    ] as const) {
      const event: ArchitectureDraftStreamEvent = {
        type: "error",
        error: {
          statusCode: expected.statusCode,
          error: expected.code,
          message: "다시 시도해주세요."
        }
      };
      globalThis.fetch = async () => createChunkedResponse([`${JSON.stringify(event)}\n`]);

      await assert.rejects(
        createAiArchitectureDraftStream({ prompt: "정적 웹사이트" }),
        (error: unknown) =>
          error instanceof ApiClientError &&
          error.status === expected.statusCode &&
          error.code === expected.code &&
          error.requestContext?.path === "/api/ai/architecture-draft/stream"
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI draft stream은 malformed event와 result 없는 종료를 typed invalid-stream 오류로 바꾼다", async () => {
  const originalFetch = globalThis.fetch;

  try {
    for (const chunks of [
      ["{not-json}\n"],
      ["null\n"],
      [`${JSON.stringify({ type: "progress", stage: snapshot.stage, snapshot })}\n`]
    ]) {
      globalThis.fetch = async () => createChunkedResponse(chunks);

      await assert.rejects(
        createAiArchitectureDraftStream({ prompt: "정적 웹사이트" }),
        (error: unknown) =>
          error instanceof ApiClientError &&
          error.status === 500 &&
          error.code === "internal_server_error"
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI draft stream은 파싱 실패 시 남은 upstream reader를 취소한다", async () => {
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  const encoder = new TextEncoder();

  globalThis.fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
        start(controller) {
          controller.enqueue(encoder.encode("{not-json}\n"));
        }
      }),
      {
        headers: { "content-type": "application/x-ndjson" },
        status: 200
      }
    );

  try {
    await assert.rejects(
      createAiArchitectureDraftStream({ prompt: "정적 웹사이트" }),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.status === 500 &&
        error.code === "internal_server_error"
    );
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI draft stream은 full snapshot/result와 단일 terminal 순서를 강제한다", async () => {
  const originalFetch = globalThis.fetch;
  const progressLine = JSON.stringify({ type: "progress", stage: snapshot.stage, snapshot });
  const resultLine = JSON.stringify({ type: "result", result });
  const invalidPayloads = [
    `${JSON.stringify({ type: "result", result: {} })}\n`,
    `${JSON.stringify({ type: "result", result: { ...result, diagramJson: {} } })}\n`,
    `${JSON.stringify({
      type: "result",
      result: { ...result, metadata: { ...result.metadata, guardrailWarnings: {} } }
    })}\n`,
    `${JSON.stringify({
      type: "result",
      result: {
        ...result,
        llmExplanation: {
          target: "architecture_draft",
          summary: "설명",
          highlights: {},
          nextActions: [],
          fallbackUsed: false
        }
      }
    })}\n`,
    `${JSON.stringify({
      type: "result",
      result: {
        status: "needs_clarification",
        question: "질문",
        suggestions: [],
        providerMetadata: {}
      }
    })}\n`,
    `${JSON.stringify({
      type: "progress",
      stage: snapshot.stage,
      snapshot: { sequence: 1 }
    })}\n${resultLine}\n`,
    `${JSON.stringify({
      type: "progress",
      stage: "building_diagram",
      snapshot
    })}\n${resultLine}\n`,
    `${resultLine}\n${resultLine}\n`,
    `${resultLine}\n${progressLine}\n`
  ];

  try {
    for (const payload of invalidPayloads) {
      globalThis.fetch = async () => createChunkedResponse([payload]);
      await assert.rejects(
        createAiArchitectureDraftStream({ prompt: "정적 웹사이트" }),
        (error: unknown) =>
          error instanceof ApiClientError &&
          error.status === 500 &&
          error.code === "internal_server_error"
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createChunkedResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      headers: { "content-type": "application/x-ndjson" },
      status: 200
    }
  );
}
