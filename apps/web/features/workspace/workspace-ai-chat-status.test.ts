import assert from "node:assert/strict";
import test from "node:test";
import {
  architectureDraftGenerationSteps,
  getArchitectureDraftGenerationProgressStep,
  getTerraformPreviewReviewProgressStep,
  getWorkspaceAiChatDockStatus,
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
