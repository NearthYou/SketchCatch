import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureBoardCompilationProposal,
  ReverseEngineeringScanError,
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

const compilation = {
  architecture: { nodes: [], edges: [] },
  diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  changes: [],
  diagnostics: [],
  quality: {
    before: {
      score: 9_000_000,
      visualPenalty: 9_000_000,
      structuralPenalty: 0,
      semanticDiagnosticPenalty: 0,
      metrics: {
        nodeOverlapCount: 2,
        edgeNodeIntersectionCount: 1,
        edgeCrossingCount: 1,
        parentBoundaryViolationCount: 1
      }
    },
    after: {
      score: 2_000_000,
      visualPenalty: 2_000_000,
      structuralPenalty: 0,
      semanticDiagnosticPenalty: 0,
      metrics: {
        nodeOverlapCount: 0,
        edgeNodeIntersectionCount: 0,
        edgeCrossingCount: 0,
        parentBoundaryViolationCount: 1
      }
    },
    compilationDistance: 7
  },
  provenance: {
    compilerVersion: "architecture-board-compiler/v3",
    candidateId: "compiled:balanced",
    referenceTemplateIds: ["template-internal-id"]
  }
} satisfies ArchitectureBoardCompilationProposal;

function renderPanel(
  placement: "original" | "compiled",
  options: {
    readonly applyMessage?: string | null;
    readonly applyState?: ReverseEngineeringResultPanelProps["applyState"];
    readonly appendCompilation?: ArchitectureBoardCompilationProposal | null;
    readonly boardNodeCount?: number;
    readonly hasCurrentBoardResources?: boolean;
    readonly scanErrors?: readonly ReverseEngineeringScanError[];
  } = {}
): string {
  const props: ReverseEngineeringResultPanelProps = {
    applyMessage: options.applyMessage ?? null,
    applyState: options.applyState ?? "idle",
    appendCompilation: options.appendCompilation ?? null,
    boardCandidates: [],
    compilation,
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
            scanErrors: [...(options.scanErrors ?? [])]
          }
        : undefined
    },
    selectedCandidateId: "candidate-structure-auto"
  };

  return renderToStaticMarkup(createElement(ReverseEngineeringResultPanel, props));
}

test("원래 AWS 배치를 처음 보여주고 Compiler와 원본 유지 선택을 저장 행동과 분리한다", () => {
  const html = renderPanel("original");

  assert.match(html, /AWS에서 가져온 원본/);
  assert.match(html, /가져온 Resource와 관계와 설정을 바꾸지 않은 상태/);
  assert.match(html, />자동 정리</);
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

test("Compiler 검토는 새 보드와 현재 보드 추가 결과를 각각의 실제 proposal로 설명한다", () => {
  const appendCompilation = {
    ...compilation,
    quality: {
      ...compilation.quality,
      before: {
        ...compilation.quality.before,
        metrics: {
          nodeOverlapCount: 4,
          edgeNodeIntersectionCount: 2,
          edgeCrossingCount: 0,
          parentBoundaryViolationCount: 0
        }
      },
      after: {
        ...compilation.quality.after,
        metrics: {
          nodeOverlapCount: 3,
          edgeNodeIntersectionCount: 1,
          edgeCrossingCount: 0,
          parentBoundaryViolationCount: 0
        }
      }
    }
  } satisfies ArchitectureBoardCompilationProposal;
  const html = renderPanel("compiled", {
    appendCompilation,
    hasCurrentBoardResources: true
  });

  assert.match(html, /새 보드로 열 때/);
  assert.match(html, /현재 보드에 추가할 때/);
  assert.match(html, /배치 문제 4건을 줄였습니다/);
  assert.match(html, /배치 문제 2건을 줄였습니다/);
});

test("Compiler 결과 기본 화면은 내부 점수 대신 실제 품질 지표 변화를 설명한다", () => {
  const html = renderPanel("compiled");
  const technicalDetailsIndex = html.indexOf("기술 세부 정보");
  const defaultSurface = technicalDetailsIndex === -1 ? html : html.slice(0, technicalDetailsIndex);

  assert.match(defaultSurface, /배치 문제 4건을 줄였습니다/);
  assert.match(defaultSurface, /Resource 겹침/);
  assert.match(defaultSurface, /영역 경계 밖 Resource/);
  assert.doesNotMatch(defaultSurface, /정리 점수|변경 거리|후보 compiled|template-internal-id/);
  assert.doesNotMatch(
    html,
    /내부 cost|변경 cost|compiled:balanced|architecture-board-compiler|template-internal-id/
  );
});

test("부분 실패는 짧은 안내와 권한 추가 행동만 보여주고 내부 AWS 정보를 숨긴다", () => {
  const html = renderPanel("original", {
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
  assert.match(html, />가져오기 권한 추가</);
  assert.match(html, /보드에 표시할 항목이 없어요/);
  assert.match(html, /<button[^>]*disabled=""[^>]*><span>가져온 항목만 보드에 적용<\/span>/);
  assert.match(html, /EC2/);
  assert.match(html, /가져오기 권한을 추가한 뒤 다시 시도해 주세요/);
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
