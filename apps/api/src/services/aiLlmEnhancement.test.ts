import assert from "node:assert/strict";
import { test } from "node:test";
import type { DesignSimulationResult, LlmEnhancement } from "@sketchcatch/types";
import { createOpenAiEnhancement, type OpenAiResponsesClient } from "./aiLlmEnhancement.js";

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
