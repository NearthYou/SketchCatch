import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import type { AiPreDeploymentAnalysisResult, LlmEnhancement } from "@sketchcatch/types";
import { createOpenAiEnhancement, type OpenAiParseRequest, type OpenAiResponsesClient } from "./aiLlmEnhancement.js";

process.env.NODE_ENV = "test";

const preDeploymentCheckResult: AiPreDeploymentAnalysisResult = {
  summary: "배포 전 확인할 보안 항목이 있습니다.",
  totalMonthlyEstimate: {
    amount: 0,
    currency: "USD",
    pricingAssumption: "rule 기반 추정"
  },
  resourceCostEstimates: [],
  findings: [
    {
      id: "finding-public-ssh",
      category: "security",
      severity: "high",
      resourceId: "sg-public-ssh",
      title: "SSH가 전체 인터넷에 열려 있습니다.",
      description: "0.0.0.0/0 SSH 접근은 실습 환경에서도 위험합니다.",
      recommendation: "허용 CIDR을 제한하세요."
    }
  ],
  checklist: [
    {
      id: "check-public-ssh",
      label: "SSH 접근 범위 제한",
      status: "fail",
      relatedFindingIds: ["finding-public-ssh"]
    }
  ],
  suggestions: []
};

const payloadSchema = z.object({
  target: z.literal("pre_deployment_check"),
  findings: z.array(z.string()),
  checklist: z.array(z.string())
});

test("createOpenAiEnhancement sends Pre-Deployment Check evidence with generic AI instructions", async () => {
  const parsedEnhancement: LlmEnhancement = {
    target: "pre_deployment_check",
    summary: "OpenAI가 배포 전 검사 결과를 쉬운 말로 정리했습니다.",
    highlights: ["SSH가 전체 인터넷에 열려 있습니다."],
    nextActions: ["SSH 허용 범위를 제한하세요."],
    fallbackUsed: false
  };
  const parseRequests: OpenAiParseRequest[] = [];
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
    apiKey: "test-openai-api-key"
  });

  const result = await createLlmEnhancement({
    target: "pre_deployment_check",
    result: preDeploymentCheckResult
  });

  assert.deepEqual(result, parsedEnhancement);
  assert.equal(parseRequests.length, 1);

  const [request] = parseRequests;
  assert.ok(request);

  const payload = payloadSchema.parse(JSON.parse(request.input));
  assert.equal(payload.target, "pre_deployment_check");
  assert.deepEqual(payload.findings, ["high security: SSH가 전체 인터넷에 열려 있습니다."]);
  assert.match(request.instructions, /AI 분석 결과/);
  assert.doesNotMatch(request.instructions, /Design Simulation/);
});
