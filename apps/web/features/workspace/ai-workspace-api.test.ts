import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requestDesignSimulation,
  requestTerraformErrorExplanation
} from "../../app/workspace/workspace-api-client";
import {
  createAiArchitectureDraft,
  runAiTerraformErrorExplanation,
  runAiTerraformPreviewExplanation
} from "./api";
import type { ArchitectureJson } from "../../../../packages/types/src";
import { getApiErrorMessage } from "../../lib/api-client";

const architectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "ec2-backend",
      type: "EC2",
      label: "Backend API",
      positionX: 120,
      positionY: 180,
      config: {
        instanceType: "t3.micro"
      }
    }
  ],
  edges: []
};

test("requestDesignSimulation posts ArchitectureJson and operating choices", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        summary: "simulation ready",
        assumptions: [],
        requestFlow: [],
        bottlenecks: [],
        failureScenarios: [],
        costPressure: [],
        recommendations: []
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const result = await requestDesignSimulation({
    architectureJson,
    budgetLevel: "low",
    trafficLevel: "normal"
  });

  assert.equal(String(requests[0]?.input), "/api/ai/design-simulation");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    architectureJson,
    budgetLevel: "low",
    trafficLevel: "normal"
  });
  assert.equal(result.summary, "simulation ready");
});

test("requestTerraformErrorExplanation posts stage and raw Terraform message", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        stage: "export",
        category: "syntax",
        severity: "medium",
        rawMessage: "Error: Missing required argument",
        summary: "생성된 Terraform 입력이 부족합니다.",
        likelyCause: "필수 값이 비어 있습니다.",
        nextActions: ["Resource 설정을 확인하세요."]
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const result = await requestTerraformErrorExplanation({
    rawMessage: "Error: Missing required argument",
    relatedResourceId: "ec2-backend",
    stage: "export"
  });

  assert.equal(String(requests[0]?.input), "/api/ai/terraform-error-explanation");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    rawMessage: "Error: Missing required argument",
    relatedResourceId: "ec2-backend",
    stage: "export"
  });
  assert.equal(result.category, "syntax");
});

test("runAiTerraformPreviewExplanation posts Terraform code from the real workspace panel", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        summary: "VPC와 EC2가 감지되었습니다.",
        detectedResources: [
          {
            terraformType: "aws_vpc",
            label: "VPC",
            explanation: "네트워크 범위를 만듭니다."
          }
        ],
        findings: [],
        checklist: []
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const result = await runAiTerraformPreviewExplanation('resource "aws_vpc" "main" {}');

  assert.equal(String(requests[0]?.input), "/api/ai/terraform-preview-explanation");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    terraformCode: 'resource "aws_vpc" "main" {}'
  });
  assert.equal(result.summary, "VPC와 EC2가 감지되었습니다.");
});

test("createAiArchitectureDraft preserves API rejection message for non-architecture prompts", async (context) => {
  const originalFetch = globalThis.fetch;
  const rejectionMessage =
    "자연어 요구사항에서 명확한 아키텍처 단서를 찾지 못해 초안을 생성하지 않았습니다.";

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: "bad_request",
        message: rejectionMessage
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 400
      }
    );

  try {
    await createAiArchitectureDraft({
      budgetLevel: "normal",
      prompt: "된장찌개 레시피 알려줘",
      scenarioHint: "auto",
      securityPriority: "basic",
      trafficLevel: "small"
    });
    assert.fail("expected createAiArchitectureDraft to reject");
  } catch (error) {
    assert.equal(
      getApiErrorMessage(error, "Architecture Draft 생성 중 오류가 발생했습니다."),
      rejectionMessage
    );
  }
});

test("runAiTerraformErrorExplanation posts Terraform stage and raw message from the real workspace panel", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        stage: "plan",
        category: "permission",
        severity: "high",
        rawMessage: "AccessDenied",
        summary: "AWS 권한이 부족합니다.",
        likelyCause: "IAM 권한이 누락되었습니다.",
        nextActions: ["필요 권한을 확인하세요."]
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const result = await runAiTerraformErrorExplanation({
    rawMessage: "AccessDenied",
    relatedResourceId: "ec2-backend",
    stage: "plan"
  });

  assert.equal(String(requests[0]?.input), "/api/ai/terraform-error-explanation");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    rawMessage: "AccessDenied",
    relatedResourceId: "ec2-backend",
    stage: "plan"
  });
  assert.equal(result.category, "permission");
});
