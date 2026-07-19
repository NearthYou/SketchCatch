import assert from "node:assert/strict";
import test from "node:test";
import type {
  BoardAutoOrganizeCandidate,
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

const organizationCandidates = [
  {
    id: "arrangement-1",
    diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    visualDiff: {
      movedNodeIds: ["resource-1"],
      resizedNodeIds: [],
      reroutedEdgeIds: [],
      addedFrameIds: [],
      changedFrameIds: [],
      removedFrameIds: []
    },
    explanations: ["겹친 Resource를 떨어뜨렸습니다."],
    visualFingerprint: "visual-1"
  },
  {
    id: "arrangement-2",
    diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    visualDiff: {
      movedNodeIds: [],
      resizedNodeIds: [],
      reroutedEdgeIds: ["edge-1"],
      addedFrameIds: [],
      changedFrameIds: [],
      removedFrameIds: []
    },
    explanations: ["연결선이 Resource를 지나가지 않게 정리했습니다."],
    visualFingerprint: "visual-2"
  }
] satisfies BoardAutoOrganizeCandidate[];

function renderPanel(
  placement: "original" | "compiled",
  options: {
    readonly applyMessage?: string | null;
    readonly applyState?: ReverseEngineeringResultPanelProps["applyState"];
    readonly boardNodeCount?: number;
    readonly hasCurrentBoardResources?: boolean;
    readonly coverage?: ReverseEngineeringServiceCoverage;
    readonly organizationCandidates?: readonly BoardAutoOrganizeCandidate[];
    readonly scanErrors?: readonly ReverseEngineeringScanError[];
  } = {}
): string {
  const props: ReverseEngineeringResultPanelProps = {
    applyMessage: options.applyMessage ?? null,
    applyState: options.applyState ?? "idle",
    boardCandidates: [],
    comparison: {
      additions: [],
      changes: [],
      deletions: [],
      duplicates: [],
      manualReviews: []
    },
    createProjectOnApply: false,
    hasCurrentBoardResources: options.hasCurrentBoardResources ?? false,
    logs: [],
    onAppendToCurrentBoard() {},
    onCompilePlacement() {},
    onKeepOriginalPlacement() {},
    onOpenAsNewBoard() {},
    onRetryScan() {},
    onSelectOrganizationCandidate() {},
    organizationCandidates: options.organizationCandidates ?? [],
    permissionRecoveryHref:
      "/dashboard/settings?tab=aws&next=reverse&awsConnectionId=connection-1",
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
    selectedOrganizationCandidateId:
      (options.organizationCandidates ?? [])[0]?.id ?? null
  };

  return renderToStaticMarkup(createElement(ReverseEngineeringResultPanel, props));
}

test("원래 AWS 배치를 처음 보여주고 Compiler와 원본 유지 선택을 저장 행동과 분리한다", () => {
  const html = renderPanel("original");

  assert.match(html, /AWS에서 가져온 원본/);
  assert.match(html, /가져온 Resource와 관계와 설정을 바꾸지 않은 상태/);
  assert.match(html, />자동 정리 해보기</);
  assert.match(html, />원본 보기</);
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

test("자동 정리는 여러 정리안과 쉬운 설명만 보여주고 내부 점수를 숨긴다", () => {
  const html = renderPanel("compiled", { organizationCandidates });

  assert.match(html, /정리안 1/);
  assert.match(html, /정리안 2/);
  assert.match(html, /겹친 Resource를 떨어뜨렸습니다/);
  assert.match(html, /연결선이 Resource를 지나가지 않게 정리했습니다/);
  assert.doesNotMatch(
    html,
    /정리 점수|변경 거리|후보|내부 cost|compiled:|architecture-board-compiler|template/
  );
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
  assert.match(html, />환경설정에서 권한 보완</);
  assert.match(
    html,
    /href="\/dashboard\/settings\?tab=aws&amp;next=reverse&amp;awsConnectionId=connection-1"/
  );
  assert.doesNotMatch(html, /AWS에서 승인했어요|가져오기 권한 추가/);
  assert.match(html, /보드에 표시할 항목이 없어요/);
  assert.match(html, /<button[^>]*disabled=""[^>]*><span>가져온 항목만 보드에 적용<\/span>/);
  assert.match(html, /EC2/);
  assert.match(html, /환경설정에서 읽기 권한을 보완해 주세요/);
  assert.doesNotMatch(
    html,
    /AccessDenied|arn:aws|DescribeVpcs|provider_api|permission_denied|retryable|RequestId/
  );
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
