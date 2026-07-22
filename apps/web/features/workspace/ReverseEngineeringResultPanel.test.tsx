import assert from "node:assert/strict";
import test from "node:test";
import type {
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage,
  ReverseEngineeringScanResponse
} from "@sketchcatch/types";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ReverseEngineeringResultPanel,
  type ReverseEngineeringResultPanelProps
} from "./ReverseEngineeringResultPanel";

Object.assign(globalThis, { React });

const response: ReverseEngineeringScanResponse = {
  scan: {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: "connection-1",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: [],
    status: "completed",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  },
  result: {
    scan: {
      id: "scan-1",
      projectId: "project-1",
      awsConnectionId: "connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: [],
      status: "completed",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    architectureJson: { nodes: [], edges: [] },
    reverseEngineeringDraft: {
      id: "draft-1",
      scanId: "scan-1",
      architectureJson: { nodes: [], edges: [] },
      protectedValueKeys: [],
      editableValueKeys: [],
      createdAt: "2026-07-17T00:00:00.000Z"
    },
    discoveredResources: [],
    findings: [],
    analysisExclusions: [],
    importSuggestions: [],
    scanErrors: []
  }
};

/** 선택 상태와 사용자 확인 경계를 실제 패널 props로 조립해 SSR 결과를 검증한다. */
function renderPanel(
  placement: "original" | "compiled",
  options: {
    readonly applyMessage?: string | null;
    readonly applicationMode?: ReverseEngineeringResultPanelProps["applicationMode"];
    readonly applyState?: ReverseEngineeringResultPanelProps["applyState"];
    readonly additionCount?: number;
    readonly boardNodeCount?: number;
    readonly hasCurrentBoardResources?: boolean;
    readonly importDecisionComplete?: boolean;
    readonly importDecisionOptions?: ReverseEngineeringResultPanelProps["importDecisionOptions"];
    readonly selectedReadyResourceIds?: readonly string[];
    readonly acknowledgedReviewOnlyResourceIds?: readonly string[];
    readonly coverage?: ReverseEngineeringServiceCoverage;
    readonly scanErrors?: readonly ReverseEngineeringScanError[];
  } = {}
): string {
  const props: ReverseEngineeringResultPanelProps = {
    acknowledgedReviewOnlyResourceIds: options.acknowledgedReviewOnlyResourceIds ?? [],
    applyMessage: options.applyMessage ?? null,
    applicationMode: options.applicationMode ?? "replace",
    applyState: options.applyState ?? "idle",
    boardCandidates: [],
    comparison: {
      additions: Array.from({ length: options.additionCount ?? 0 }, (_, index) => ({
        nodeId: `addition-${index}`,
        label: `Addition ${index}`
      })),
      changes: [],
      deletions: [],
      duplicates: [],
      manualReviews: []
    },
    createProjectOnApply: false,
    hasCurrentBoardResources: options.hasCurrentBoardResources ?? false,
    importDecisionComplete: options.importDecisionComplete ?? true,
    importDecisionOptions: options.importDecisionOptions ?? {
      ready: [],
      reviewOnly: [],
      invalidResourceIds: []
    },
    logs: [],
    onAppendToCurrentBoard() {},
    onApplicationModeChange() {},
    onCompilePlacement() {},
    onKeepOriginalPlacement() {},
    onReadyResourceToggle() {},
    onReplaceCurrentBoard() {},
    onRetryScan() {},
    onReviewOnlyResourceToggle() {},
    permissionRecoveryHref: "/dashboard/settings?tab=aws&next=reverse&awsConnectionId=connection-1",
    placement,
    response: {
      ...response,
      result: response.result
        ? {
            ...response.result,
            architectureJson: {
              ...response.result.architectureJson,
              nodes: Array.from({ length: options.boardNodeCount ?? 0 }, (_, index) => ({
                id: `resource-${index}`,
                type: "EC2",
                positionX: index * 80,
                positionY: 0,
                config: {}
              }))
            },
            scanErrors: [...(options.scanErrors ?? [])],
            ...(options.coverage ? { coverage: options.coverage } : {})
          }
        : undefined
    },
    selectedCandidateId: "candidate-structure-auto",
    selectedReadyResourceIds: options.selectedReadyResourceIds ?? []
  };

  return renderToStaticMarkup(createElement(ReverseEngineeringResultPanel, props));
}

test("원래 AWS 배치를 처음 보여주고 Compiler와 원본 유지 선택을 저장 행동과 분리한다", () => {
  const html = renderPanel("original");

  assert.match(html, /AWS에서 가져온 원본/);
  assert.match(html, /가져온 Resource와 관계와 설정을 바꾸지 않은 상태/);
  assert.match(html, /aria-pressed="true"[^>]*>원본</);
  assert.match(html, /aria-pressed="false"[^>]*>정리본</);
  assert.match(html, />보드에 적용</);
  assert.doesNotMatch(html, /보드 정리 검토/);
});

test("배치 변경과 적용 오류를 보조 기술에 알린다", () => {
  const html = renderPanel("original", {
    applyMessage: "보드 저장에 실패했습니다.",
    applyState: "error"
  });

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"[^>]*>보드 저장에 실패했습니다/);
});

test("Board 저장 뒤 Snapshot만 실패하면 저장 성공을 유지한 채 부분 성공으로 알린다", () => {
  const html = renderPanel("original", {
    applyMessage:
      "보드는 저장했습니다. imported Architecture Snapshot은 저장하지 못했습니다. 저장된 보드는 그대로 유지됩니다.",
    applyState: "partial"
  });

  assert.match(html, /role="status"/);
  assert.match(html, /보드는 저장했습니다/);
  assert.doesNotMatch(html, /class="[^"]*error[^"]*"/);
});

test("자동 정리는 원본과 하나의 정리본만 실제 Board에서 전환한다", () => {
  const html = renderPanel("compiled");

  assert.match(html, /aria-pressed="false"[^>]*>원본</);
  assert.match(html, /aria-pressed="true"[^>]*>정리본</);
  assert.match(html, /정리본을 확인한 뒤 원하는 적용/);
  assert.doesNotMatch(
    html,
    /정리안 1|정리안 2|Board 정리안 선택|겹친 Resource를 떨어뜨렸습니다|연결선이 Resource를 지나가지 않게 정리했습니다|정리 점수|변경 거리|후보|내부 cost|compiled:|architecture-board-compiler|template/
  );
  assert.doesNotMatch(html, /<(?:img|svg)\b/);
});

test("부분 실패는 같은 AWS 연결의 Settings 복구 행동만 보여주고 내부 AWS 정보를 숨긴다", () => {
  const html = renderPanel("original", {
    coverage: {
      status: "partial",
      unavailableServices: [
        {
          serviceKey: "ec2",
          displayName: "EC2",
          reason: "permission_required",
          remedy: "open_settings"
        }
      ]
    },
    scanErrors: [
      {
        id: "scan-error-service-ec2",
        resourceType: "VPC",
        stage: "provider_api",
        reason: "permission_denied",
        message:
          "AccessDeniedException: arn:aws:iam::123456789012:role/internal cannot call ec2:DescribeVpcs",
        retryable: false
      }
    ]
  });

  assert.match(html, /일부 항목을 가져오지 못했어요/);
  assert.match(html, /가져온 항목만 사용해 계속 진행할 수 있어요/);
  assert.match(html, />환경설정에서 권한 보완</);
  assert.match(
    html,
    /href="\/dashboard\/settings\?tab=aws&amp;next=reverse&amp;awsConnectionId=connection-1"/
  );
  assert.doesNotMatch(html, /AWS에서 승인했어요|가져오기 권한 추가/);
  assert.match(html, /보드에 표시할 항목이 없어요/);
  assert.match(html, /<button[^>]*disabled=""[^>]*><span>가져온 항목만 보드에 적용<\/span>/);
  assert.match(html, /EC2/);
  assert.match(html, /권한 부족/);
  assert.match(html, /환경설정에서 읽기 권한을 보완해 주세요/);
  assert.doesNotMatch(
    html,
    /AccessDenied|arn:aws|DescribeVpcs|provider_api|permission_denied|retryable|RequestId/
  );
});

test("coverage가 있어도 실제 실패 원인을 연결 만료와 리전 오류로 구분한다", () => {
  const html = renderPanel("original", {
    coverage: {
      status: "partial",
      unavailableServices: [
        {
          serviceKey: "ecr",
          displayName: "ECR",
          reason: "retry",
          remedy: "retry"
        },
        {
          serviceKey: "cloudwatch",
          displayName: "CloudWatch",
          reason: "retry",
          remedy: "retry"
        }
      ]
    },
    scanErrors: [
      {
        id: "scan-error-service-ecr",
        serviceKey: "ecr",
        resourceType: "ECR_REPOSITORY",
        stage: "provider_api",
        reason: "expired_credential",
        message: "ExpiredToken arn:aws:iam::123456789012:role/private",
        retryable: true
      },
      {
        id: "scan-error-service-cloudwatch",
        serviceKey: "cloudwatch",
        resourceType: "CLOUDWATCH_METRIC_ALARM",
        stage: "provider_api",
        reason: "invalid_region",
        message: "InvalidEndpoint RequestId: hidden",
        retryable: false
      }
    ]
  });

  assert.match(html, /ECR/);
  assert.match(html, /AWS 연결 만료/);
  assert.match(html, /CloudWatch/);
  assert.match(html, /리전 설정 오류/);
  assert.doesNotMatch(html, /ExpiredToken|InvalidEndpoint|arn:aws|RequestId|provider_api/u);
});

test("부분 결과를 기존 보드에 적용할 때 교체와 추가를 분명히 구분한다", () => {
  const html = renderPanel("original", {
    boardNodeCount: 1,
    hasCurrentBoardResources: true,
    scanErrors: [
      {
        id: "scan-error-service-rds",
        resourceType: "RDS",
        stage: "provider_api",
        reason: "permission_denied",
        message: "internal",
        retryable: false
      }
    ]
  });

  assert.match(html, />현재 보드를 가져온 항목으로 바꾸기</);
  assert.match(html, />가져온 항목만 현재 보드에 추가</);
  assert.doesNotMatch(html, />가져온 항목만 사용</);
});

test("현재 보드에서는 실제로 적용할 replace 또는 append 배치를 먼저 선택해 미리본다", () => {
  const html = renderPanel("compiled", {
    additionCount: 1,
    applicationMode: "append",
    boardNodeCount: 1,
    hasCurrentBoardResources: true
  });

  assert.match(html, /aria-pressed="false"[^>]*>현재 보드 교체 미리보기</);
  assert.match(html, /aria-pressed="true"[^>]*>현재 보드 추가 미리보기</);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*><span>현재 보드를 가져온 항목으로 바꾸기<\/span>/
  );
  assert.match(html, /<button(?![^>]*disabled="")[^>]*>현재 보드에 추가<\/button>/);
});

test("Terraform 가져오기 선택과 Board에서만 확인할 리소스 동의를 분리한다", () => {
  const html = renderPanel("original", {
    boardNodeCount: 2,
    importDecisionComplete: false,
    importDecisionOptions: {
      ready: [{ id: "ready-resource", label: "고객 파일", status: "ready" }],
      reviewOnly: [{ id: "review-resource", label: "암호화 키", status: "manual_review" }],
      invalidResourceIds: []
    }
  });

  assert.match(html, /Terraform으로 관리할 리소스 선택/);
  assert.match(html, /고객 파일/);
  assert.match(html, /기존 AWS 리소스를 Terraform으로 가져와 수정/);
  assert.match(html, /보드에서만 확인할 리소스/);
  assert.match(html, /암호화 키/);
  assert.match(html, /추가 확인이 필요/);
  assert.match(html, /보드에서만 확인할 리소스를 모두 확인해 주세요/);
  assert.match(html, /<button[^>]*disabled=""[^>]*><span>보드에 적용<\/span>/);
  assert.doesNotMatch(html, /검토 전용/);
});
