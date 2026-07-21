import assert from "node:assert/strict";
import test from "node:test";
import {
  architectureDraftGenerationSteps,
  getTerraformIssueAnalysisProgressPresentation,
  getArchitectureDraftGenerationProgressStep,
  getTerraformIssueAnalysisProgressTransition,
  getTerraformIssueAnalysisProgress,
  getTerraformPreviewReviewProgressStep,
  getWorkspaceAiChatDockStatus,
  TERRAFORM_ISSUE_ANALYSIS_COMPLETION_DURATION_MS,
  TERRAFORM_ISSUE_ANALYSIS_ESTIMATED_DURATION_MS,
  terraformPreviewReviewSteps
} from "./workspace-ai-chat-status";

const readyState = {
  hasPendingApproval: false,
  isStale: false,
  requestState: "idle" as const
};

test("AI Chat 상태는 요청 처리 중을 최우선으로 표시한다", () => {
  assert.deepEqual(
    getWorkspaceAiChatDockStatus({
      ...readyState,
      requestState: "loading"
    }),
    {
      description: "요청을 처리하고 있습니다.",
      label: "처리 중"
    }
  );
});

test("AI Chat 상태는 승인 전 제안을 적용 대기로 표시한다", () => {
  assert.deepEqual(
    getWorkspaceAiChatDockStatus({
      ...readyState,
      hasPendingApproval: true
    }),
    {
      description: "제안을 확인한 뒤 적용하거나 취소하세요.",
      label: "적용 대기"
    }
  );
});

test("AI Chat 상태는 오래된 제안을 적용 대기보다 먼저 표시한다", () => {
  assert.deepEqual(
    getWorkspaceAiChatDockStatus({
      ...readyState,
      hasPendingApproval: true,
      isStale: true
    }),
    {
      description: "작업 기준이 바뀌어 적용할 수 없습니다. 최신 기준으로 다시 실행하세요.",
      label: "오래된 제안"
    }
  );
});

test("AI Chat 상태는 사용자의 대응이 필요하지 않으면 상태 바를 숨긴다", () => {
  assert.equal(getWorkspaceAiChatDockStatus(readyState), null);
});

test("다이어그램 생성은 결과를 기다리는 동안 단계별 진행 상태를 제공한다", () => {
  assert.deepEqual(
    architectureDraftGenerationSteps.map((step) => step.label),
    ["요청 의도 정리", "리소스 후보 구성", "연결 구조 설계", "아키텍처 결과 검증", "최종 초안 정리"]
  );
  assert.equal(getArchitectureDraftGenerationProgressStep(0), 0);
  assert.equal(getArchitectureDraftGenerationProgressStep(1_499), 0);
  assert.equal(getArchitectureDraftGenerationProgressStep(1_500), 1);
  assert.equal(getArchitectureDraftGenerationProgressStep(3_000), 2);
  assert.equal(getArchitectureDraftGenerationProgressStep(4_500), 3);
  assert.equal(getArchitectureDraftGenerationProgressStep(6_000), 4);
  assert.equal(getArchitectureDraftGenerationProgressStep(60_000), 4);
});

test("에이전트 리뷰는 Amazon Q 결과를 기다리는 동안 단계별 진행 상태를 제공한다", () => {
  assert.deepEqual(
    terraformPreviewReviewSteps.map((step) => step.label),
    [
      "Terraform 코드 구조 분석",
      "배포 전 위험 신호 점검",
      "Amazon Q 6가지 기준 검토",
      "검토 결과 정리"
    ]
  );
  assert.equal(getTerraformPreviewReviewProgressStep(0), 0);
  assert.equal(getTerraformPreviewReviewProgressStep(3_499), 0);
  assert.equal(getTerraformPreviewReviewProgressStep(3_500), 1);
  assert.equal(getTerraformPreviewReviewProgressStep(7_000), 2);
  assert.equal(getTerraformPreviewReviewProgressStep(10_500), 3);
  assert.equal(getTerraformPreviewReviewProgressStep(60_000), 3);
});

test("오류 분석 예상 진행률은 경과 시간에 따라 증가하고 완료 전 100%에 도달하지 않는다", () => {
  assert.equal(
    getTerraformIssueAnalysisProgress({ completed: 0, elapsedMs: 0, total: 1 }),
    8
  );
  assert.equal(
    getTerraformIssueAnalysisProgress({
      completed: 0,
      elapsedMs: TERRAFORM_ISSUE_ANALYSIS_ESTIMATED_DURATION_MS,
      total: 1
    }),
    94
  );
  assert.equal(
    getTerraformIssueAnalysisProgress({ completed: 0, elapsedMs: 60_000, total: 1 }),
    94
  );
});

test("오류 분석 완료는 100% 상태를 잠시 유지한 뒤 숨긴다", () => {
  assert.deepEqual(
    getTerraformIssueAnalysisProgressTransition({
      currentPhase: "running",
      didComplete: true,
      isRunning: false
    }),
    {
      delayMs: TERRAFORM_ISSUE_ANALYSIS_COMPLETION_DURATION_MS,
      phase: "complete"
    }
  );
  assert.deepEqual(
    getTerraformIssueAnalysisProgressTransition({
      currentPhase: "hidden",
      didComplete: false,
      isRunning: false
    }),
    { delayMs: 0, phase: "hidden" }
  );
  assert.deepEqual(
    getTerraformIssueAnalysisProgressTransition({
      currentPhase: "running",
      didComplete: false,
      isRunning: false
    }),
    { delayMs: 0, phase: "hidden" }
  );
});

test("오류 분석 완료 상태는 예상치 대신 100%와 완료 라벨을 표시한다", () => {
  assert.deepEqual(
    getTerraformIssueAnalysisProgressPresentation({
      completed: 0,
      elapsedMs: 2_000,
      phase: "complete",
      total: 1
    }),
    { label: "완료", progress: 100 }
  );
});

test("오류 일괄 분석 진행률은 완료 개수를 합산하고 활성 상태를 0%로 표시하지 않는다", () => {
  assert.equal(
    getTerraformIssueAnalysisProgress({
      completed: 1,
      elapsedMs: TERRAFORM_ISSUE_ANALYSIS_ESTIMATED_DURATION_MS / 2,
      total: 4
    }),
    38
  );
  assert.equal(
    getTerraformIssueAnalysisProgress({ completed: 0, elapsedMs: 0, total: 100 }),
    1
  );
  assert.equal(
    getTerraformIssueAnalysisProgress({ completed: 4, elapsedMs: 0, total: 4 }),
    99
  );
});
