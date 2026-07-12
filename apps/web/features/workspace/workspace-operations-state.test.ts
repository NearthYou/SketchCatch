import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiPreDeploymentAnalysisResult, Deployment, DiagramJson } from "@sketchcatch/types";
import {
  getSafetyGateState,
  getTerraformPreviewState,
  selectCurrentDeployment
} from "./workspace-operations-state";

const DIAGRAM: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("Terraform을 만든 뒤 Board가 바뀌면 오래된 상태로 표시한다", () => {
  // Given
  const generatedDiagram = { ...DIAGRAM, nodes: [] };
  const changedDiagram = {
    ...DIAGRAM,
    nodes: [
      {
        id: "web",
        kind: "resource" as const,
        label: "Web",
        locked: false,
        position: { x: 0, y: 0 },
        size: { width: 120, height: 96 },
        type: "aws_instance",
        zIndex: 1
      }
    ]
  };

  // When
  const state = getTerraformPreviewState({
    currentDiagram: changedDiagram,
    generatedDiagram,
    terraformCode: "resource \"aws_instance\" \"web\" {}"
  });

  // Then
  assert.equal(state, "stale");
});

test("높은 위험이나 실패 checklist가 있으면 배포를 막는다", () => {
  // Given
  const analysis = createAnalysis({
    findings: createAnalysis().findings,
    checklistStatus: "fail"
  });

  // When
  const gate = getSafetyGateState(analysis);

  // Then
  assert.equal(gate.kind, "blocked");
  assert.equal(gate.highFindingCount, 1);
});

test("높은 위험이 없고 checklist가 통과하면 배포를 허용한다", () => {
  // Given
  const analysis = createAnalysis({ findings: [], checklistStatus: "pass" });

  // When
  const gate = getSafetyGateState(analysis);

  // Then
  assert.equal(gate.kind, "ready");
  assert.equal(gate.highFindingCount, 0);
});

test("배포 이력에서 가장 최근에 갱신된 실행을 현재 실행으로 고른다", () => {
  // Given
  const oldDeployment = createDeployment("2026-07-12T01:00:00.000Z");
  const recentDeployment = createDeployment("2026-07-12T02:00:00.000Z");

  // When
  const selected = selectCurrentDeployment([oldDeployment, recentDeployment]);

  // Then
  assert.equal(selected?.updatedAt, recentDeployment.updatedAt);
});

// 테스트가 필요한 최소 분석 결과를 만들어 위험도 규칙만 읽기 쉽게 드러냅니다.
function createAnalysis(
  input: {
    readonly findings?: AiPreDeploymentAnalysisResult["findings"];
    readonly checklistStatus?: "pass" | "warning" | "fail";
  } = {}
): AiPreDeploymentAnalysisResult {
  return {
    summary: "점검 결과",
    totalMonthlyEstimate: {
      amount: 12,
      currency: "USD",
      pricingAssumption: "테스트"
    },
    resourceCostEstimates: [],
    findings: input.findings ?? [
      {
        id: "public-ssh",
        category: "security",
        severity: "high",
        resourceId: "web",
        title: "SSH 공개",
        description: "전체 인터넷에 열려 있습니다.",
        recommendation: "허용 대역을 줄이세요."
      }
    ],
    checklist: [
      {
        id: "security",
        label: "보안 설정 확인",
        status: input.checklistStatus ?? "warning",
        relatedFindingIds: ["public-ssh"]
      }
    ],
    suggestions: []
  };
}

// 최신 실행 선택 테스트에 필요한 Deployment 계약을 한곳에서 채웁니다.
function createDeployment(updatedAt: string): Deployment {
  return {
    id: updatedAt,
    projectId: "project",
    architectureId: "architecture",
    terraformArtifactId: "artifact",
    awsConnectionId: "connection",
    liveProfile: "practice",
    currentPlanArtifactId: null,
    currentPlanOperation: null,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: updatedAt,
    updatedAt,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null
  };
}
