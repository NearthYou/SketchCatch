import assert from "node:assert/strict";
import test from "node:test";
import type {
  AiPreDeploymentAnalysisResult,
  DesignSimulationResult
} from "@sketchcatch/types";
import { createWorkspaceDesignAnalysisPresentation } from "./workspace-design-analysis-presentation.js";

test("설계 분석은 병목·장애·보안·비용·개선 권장사항을 한 결과로 조합한다", () => {
  const simulation = {
    assumptions: ["월 사용자 1,000명"],
    bottlenecks: [
      {
        description: "단일 Task에 요청이 집중됩니다.",
        id: "bottleneck-1",
        resourceId: "ecs-service",
        severity: "high",
        title: "ECS 처리량 한계"
      }
    ],
    costEstimate: {
      assumptions: [],
      expectedUserCount: 1000,
      fallbackUsed: false,
      period: "month",
      pricingAssumption: "서울 리전 온디맨드 기준",
      pricingSource: "aws_pricing_api",
      region: "ap-northeast-2",
      resources: [],
      reviewMessages: ["트래픽 증가 시 Task 비용이 늘어납니다."],
      totalEstimate: { amount: 42.5, currency: "USD" },
      totalMonthlyEstimate: { amount: 42.5, currency: "USD" }
    },
    costPressure: [],
    failureScenarios: [
      {
        affectedResourceIds: ["ecs-service"],
        description: "Task가 한 개면 장애 전파를 피하기 어렵습니다.",
        id: "failure-1",
        mitigation: "최소 Task 수를 2개로 설정하세요.",
        title: "단일 Task 장애"
      }
    ],
    recommendations: ["ECS Service Auto Scaling을 설정하세요."],
    requestFlow: [],
    summary: "현재 설계는 트래픽 증가 시 ECS가 병목이 될 수 있습니다."
  } satisfies DesignSimulationResult;
  const preDeployment = {
    checklist: [],
    findings: [
      {
        category: "security",
        description: "SSH가 전체 인터넷에 열려 있습니다.",
        id: "security-1",
        recommendation: "SSH 허용 CIDR을 관리망으로 제한하세요.",
        resourceId: "admin-sg",
        severity: "high",
        title: "공개 SSH"
      },
      {
        category: "performance",
        description: "성능 확인이 필요합니다.",
        id: "performance-1",
        recommendation: "부하 테스트를 실행하세요.",
        severity: "medium",
        title: "성능 확인"
      }
    ],
    resourceCostEstimates: [],
    suggestions: [
      {
        action: "modify_resource",
        expectedImpact: {
          cost: "neutral",
          reliability: "neutral",
          security: "improve"
        },
        explanation: "관리망에서만 SSH를 허용합니다.",
        findingId: "security-1",
        id: "suggestion-1",
        targetResourceId: "admin-sg",
        title: "SSH 접근 범위 제한"
      }
    ],
    summary: "배포 전 보안 설정을 확인하세요.",
    totalMonthlyEstimate: {
      amount: 41,
      currency: "USD",
      pricingAssumption: "서울 리전 온디맨드 기준"
    }
  } satisfies AiPreDeploymentAnalysisResult;

  const result = createWorkspaceDesignAnalysisPresentation(simulation, preDeployment);

  assert.equal(result.bottlenecks[0]?.title, "ECS 처리량 한계");
  assert.equal(result.failureScenarios[0]?.title, "단일 Task 장애");
  assert.deepEqual(result.securityRisks.map((finding) => finding.id), ["security-1"]);
  assert.deepEqual(result.costEstimate, { amount: 42.5, currency: "USD", period: "month" });
  assert.deepEqual(result.costReviewItems, ["트래픽 증가 시 Task 비용이 늘어납니다."]);
  assert.deepEqual(result.recommendations, [
    "ECS Service Auto Scaling을 설정하세요.",
    "SSH 접근 범위 제한: 관리망에서만 SSH를 허용합니다."
  ]);
});
