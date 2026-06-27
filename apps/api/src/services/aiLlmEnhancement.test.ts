import assert from "node:assert/strict";
import { test } from "node:test";
import type { DesignSimulationResult, LlmEnhancement, LlmEnhancementFallbackReason } from "@sketchcatch/types";
import {
  createConfiguredOpenAiEnhancement,
  createOpenAiEnhancement,
  type OpenAiClientOptions,
  type OpenAiResponsesClient
} from "./aiLlmEnhancement.js";

process.env.NODE_ENV = "test";

const designSimulationResult: DesignSimulationResult = {
  summary: "1개 Resource와 0개 연결을 기준으로 Design Simulation을 만들었습니다.",
  assumptions: ["실제 부하 테스트가 아닌 ArchitectureJson 기반 추정입니다."],
  requestFlow: [],
  bottlenecks: [
    {
      id: "bottleneck-single-ec2-ec2-backend",
      resourceId: "ec2-backend",
      severity: "medium",
      title: "단일 EC2 처리 용량 주의",
      description: "보통 트래픽에서 EC2가 하나뿐이면 응답 지연이 생길 수 있습니다."
    }
  ],
  failureScenarios: [],
  costPressure: [],
  recommendations: ["EC2가 하나뿐이면 트래픽 증가 시 확장 구조를 검토하세요."]
};

test("createOpenAiEnhancement returns parsed LLM enhancement when OpenAI succeeds", async () => {
  const parsedEnhancement: LlmEnhancement = {
    target: "design_simulation",
    summary: "OpenAI가 Design Simulation 결과를 쉬운 말로 정리했습니다.",
    highlights: ["단일 EC2 병목 가능성이 있습니다."],
    nextActions: ["트래픽 증가 전 확장 구조를 검토하세요."],
    fallbackUsed: false
  };
  const parseRequests: unknown[] = [];
  const client: OpenAiResponsesClient = {
    responses: {
      parse: async (request) => {
        parseRequests.push(request);

        return { output_parsed: parsedEnhancement };
      }
    }
  };
  const createLlmEnhancement = createOpenAiEnhancement({
    client,
    apiKey: "test-openai-api-key",
    model: "test-model"
  });

  const result = await createLlmEnhancement({
    target: "design_simulation",
    result: designSimulationResult
  });

  assert.deepEqual(result, parsedEnhancement);
  assert.equal(parseRequests.length, 1);
  assert.match(JSON.stringify(parseRequests[0]), /test-model/);
  assert.match(JSON.stringify(parseRequests[0]), /단일 EC2 처리 용량 주의/);
});

test("createConfiguredOpenAiEnhancement creates OpenAI client with timeout, no retry, and configured model", async () => {
  const parsedEnhancement: LlmEnhancement = {
    target: "design_simulation",
    summary: "OpenAI SDK client가 설정된 모델로 응답했습니다.",
    highlights: ["timeout은 10초로 제한됩니다."],
    nextActions: ["실패하면 재시도 없이 fallback을 사용하세요."],
    fallbackUsed: false
  };
  const clientOptions: OpenAiClientOptions[] = [];
  const parseRequests: unknown[] = [];
  const createLlmEnhancement = createConfiguredOpenAiEnhancement({
    apiKey: "test-openai-api-key",
    model: "custom-model",
    createClient: (options) => {
      clientOptions.push(options);

      return {
        responses: {
          parse: async (request) => {
            parseRequests.push(request);

            return { output_parsed: parsedEnhancement };
          }
        }
      };
    }
  });

  const result = await createLlmEnhancement({
    target: "design_simulation",
    result: designSimulationResult
  });

  assert.deepEqual(result, parsedEnhancement);
  assert.deepEqual(clientOptions, [
    {
      apiKey: "test-openai-api-key",
      timeout: 10_000,
      maxRetries: 0
    }
  ]);
  assert.match(JSON.stringify(parseRequests[0]), /custom-model/);
});

test("createOpenAiEnhancement returns provider fallback when OpenAI throws", async () => {
  const createLlmEnhancement = createOpenAiEnhancement({
    apiKey: "test-openai-api-key",
    client: {
      responses: {
        parse: async () => {
          throw new Error("raw provider message must not be exposed");
        }
      }
    }
  });

  const result = await createLlmEnhancement({
    target: "design_simulation",
    result: designSimulationResult
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "provider_error");
  assert.equal(result.summary, designSimulationResult.summary);
  assert.doesNotMatch(JSON.stringify(result), /raw provider message/);
});

test("createOpenAiEnhancement maps known OpenAI errors to safe fallback reasons", async () => {
  const cases: readonly {
    readonly errorName: string;
    readonly fallbackReason: LlmEnhancementFallbackReason;
  }[] = [
    { errorName: "APIConnectionTimeoutError", fallbackReason: "timeout" },
    { errorName: "RateLimitError", fallbackReason: "rate_limited" },
    { errorName: "BadRequestError", fallbackReason: "invalid_request" },
    { errorName: "AuthenticationError", fallbackReason: "auth_error" }
  ];

  for (const item of cases) {
    const providerError = new Error("raw provider message must not be exposed");
    providerError.name = item.errorName;
    const createLlmEnhancement = createOpenAiEnhancement({
      apiKey: "test-openai-api-key",
      client: {
        responses: {
          parse: async () => {
            throw providerError;
          }
        }
      }
    });

    const result = await createLlmEnhancement({
      target: "design_simulation",
      result: designSimulationResult
    });

    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackReason, item.fallbackReason);
    assert.doesNotMatch(JSON.stringify(result), /raw provider message/);
  }
});

test("createOpenAiEnhancement keeps valid fields and replaces invalid fields with fallback", async () => {
  const createLlmEnhancement = createOpenAiEnhancement({
    apiKey: "test-openai-api-key",
    client: {
      responses: {
        parse: async () => ({
          output_parsed: {
            target: "design_simulation",
            summary: "OpenAI가 만든 정상 요약입니다.",
            highlights: ["", "단일 EC2 병목 가능성이 있습니다.", "x".repeat(121)],
            nextActions: ["트래픽 증가 전 확장 구조를 검토하세요."],
            fallbackUsed: false
          }
        })
      }
    }
  });

  const result = await createLlmEnhancement({
    target: "design_simulation",
    result: designSimulationResult
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "invalid_response");
  assert.equal(result.summary, "OpenAI가 만든 정상 요약입니다.");
  assert.deepEqual(result.highlights, ["단일 EC2 병목 가능성이 있습니다."]);
  assert.deepEqual(result.nextActions, ["트래픽 증가 전 확장 구조를 검토하세요."]);
});
