import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
  DiscoveredResource,
  ReverseEngineeringScanError,
  ReverseEngineeringServiceCoverage,
  ReverseEngineeringScanResponse
} from "@sketchcatch/types";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ReverseEngineeringScanCoveragePanel,
  ReverseEngineeringResultPanel,
  type ReverseEngineeringResultPanelProps
} from "./ReverseEngineeringResultPanel";

Object.assign(globalThis, { React });

const resultPanelSource = readFileSync(
  fileURLToPath(new URL("./ReverseEngineeringResultPanel.tsx", import.meta.url)),
  "utf8"
);

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

/** 실제 보드 미리보기 props를 조립해 SSR 결과를 검증한다. */
function renderPanel(
  placement: "original" | "compiled",
  options: {
    readonly applyMessage?: string | null;
    readonly applicationMode?: ReverseEngineeringResultPanelProps["applicationMode"];
    readonly applyState?: ReverseEngineeringResultPanelProps["applyState"];
    readonly additionCount?: number;
    readonly boardNodeCount?: number;
    readonly edgeCount?: number;
    readonly discoveredResources?: readonly DiscoveredResource[];
    readonly hasCurrentBoardResources?: boolean;
    readonly coverage?: ReverseEngineeringServiceCoverage;
    readonly scanErrors?: readonly ReverseEngineeringScanError[];
    readonly layoutSummary?: readonly string[];
  } = {}
): string {
  const props: ReverseEngineeringResultPanelProps = {
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
    logs: [],
    layoutSummary: options.layoutSummary ?? [],
    onAppendToCurrentBoard() {},
    onApplicationModeChange() {},
    onCompilePlacement() {},
    onKeepOriginalPlacement() {},
    onReplaceCurrentBoard() {},
    onRetryScan() {},
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
              })),
              edges: Array.from({ length: options.edgeCount ?? 0 }, (_, index) => ({
                id: `edge-${index}`,
                sourceId: "resource-0",
                targetId: "resource-1"
              }))
            },
            discoveredResources: [...(options.discoveredResources ?? [])],
            scanErrors: [...(options.scanErrors ?? [])],
            ...(options.coverage ? { coverage: options.coverage } : {})
          }
        : undefined
    },
    selectedCandidateId: "candidate-structure-auto"
  };

  return renderToStaticMarkup(createElement(ReverseEngineeringResultPanel, props));
}

function discoveredResource(
  id: string,
  providerResourceType: string,
  resourceType: DiscoveredResource["resourceType"] = "UNKNOWN"
): DiscoveredResource {
  return {
    id,
    provider: "aws",
    providerResourceType,
    providerResourceId: id,
    region: "ap-northeast-2",
    displayName: id,
    resourceType,
    config: {}
  };
}

function renderCoveragePanel(
  coverage: ReverseEngineeringServiceCoverage,
  scanErrors: readonly ReverseEngineeringScanError[] = []
): string {
  return renderToStaticMarkup(
    createElement(ReverseEngineeringScanCoveragePanel, {
      coverage,
      scanErrors: [...scanErrors]
    })
  );
}

test("기본 미리보기는 핵심 수치와 세 가지 행동만 먼저 보여준다", () => {
  const html = renderPanel("original", {
    boardNodeCount: 2,
    edgeCount: 1,
    discoveredResources: [
      {
        id: "resource-1",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-1",
        region: "ap-northeast-2",
        displayName: "서비스 VPC",
        resourceType: "VPC",
        config: {}
      },
      {
        id: "resource-2",
        provider: "aws",
        providerResourceType: "AWS::IAM::Role",
        providerResourceId: "role-1",
        region: "global",
        displayName: "서비스 역할",
        resourceType: "UNKNOWN",
        config: {},
        analysisExcluded: true
      }
    ]
  });

  assert.match(html, /aria-label="미리보기"/);
  assert.match(html, /리소스<strong>2<\/strong>/);
  assert.match(html, /연결<strong>1<\/strong>/);
  assert.match(html, />보드에 적용</);
  assert.match(html, />보기 좋게 정리</);
  assert.match(html, />상세 정보</);
  assert.match(html, /role="dialog"/);
  assert.match(html, /hidden=""/);
  assert.match(resultPanelSource, /리소스 이름 또는 종류 검색/);
  assert.match(html, /전체[^0-9]*2/);
  assert.match(html, /보드 표시[^0-9]*2/);
  assert.match(html, /추가 확인[^0-9]*1/);
  assert.match(html, /연결[^0-9]*1/);
  assert.match(html, /스캔 상태\s*<strong>완료<\/strong>/);
  assert.match(html, /스캔 시간/);
  assert.match(html, /보드에 적용은 가져온 구조를 보드에 저장하는 동작입니다/);
  assert.match(html, /Terraform 코드 생성, import, AWS 변경은 실행하지 않습니다/);
  assert.doesNotMatch(html, /Terraform으로 관리할 리소스 선택/);
  assert.doesNotMatch(html, /<h3>스캔 요약<\/h3>/);
  assert.doesNotMatch(html, /<h3>선택한 배치 적용<\/h3>/);
});

test("상세 정보는 여섯 최상위 접기 영역 중 가져오기 요약만 열고 시작한다", () => {
  const html = renderPanel("original", {
    discoveredResources: [
      discoveredResource("network-vpc", "AWS::EC2::VPC", "VPC"),
      discoveredResource("storage-bucket", "AWS::S3::Bucket", "S3")
    ]
  });

  const sections = [
    ["summary", "가져오기 요약", "true"],
    ["resources", "가져온 리소스", "false"],
    ["structure", "연결과 구조", "false"],
    ["read-scope", "AWS 읽기 범위", "false"],
    ["checks", "확인 사항", "false"],
    ["source", "원본 정보", "false"]
  ] as const;

  for (const [key, title, isExpanded] of sections) {
    assert.match(html, new RegExp(`>${title}<`));
    assert.match(
      html,
      new RegExp(
        `<button[^>]*aria-expanded="${isExpanded}"[^>]*id="reverse-engineering-detail-${key}-trigger"`
      )
    );
  }

  assert.match(resultPanelSource, /ResourceCategoryAccordion/);
  assert.match(resultPanelSource, /기본 정보/);
  assert.match(resultPanelSource, /AWS 원본 정보/);
  assert.match(resultPanelSource, /원본 종류 식별자/);
  assert.match(resultPanelSource, /연결/);
  assert.match(resultPanelSource, /설정/);
  assert.match(resultPanelSource, /주의 사항/);
});

test("자동 정리는 한 프레임 먼저 진행 상태를 그리고 같은 요청을 다시 받지 않는다", () => {
  assert.match(resultPanelSource, /if \(isOrganizing \|\| placement === "compiled"\) \{\s*return;/);
  assert.match(
    resultPanelSource,
    /setIsOrganizing\(true\);[\s\S]*?window\.requestAnimationFrame\([\s\S]*?window\.setTimeout\([\s\S]*?onCompilePlacement\(\);[\s\S]*?setIsOrganizing\(false\)/
  );
  assert.match(resultPanelSource, /disabled=\{isOrganizing \|\| placement === "compiled"\}/);
  assert.match(resultPanelSource, /isOrganizing \? "정리하는 중…" : "보기 좋게 정리"/);
});

test("원래 AWS 배치를 먼저 보여주고 상세 설정과 저장 행동을 분리한다", () => {
  const html = renderPanel("original");

  assert.match(html, /AWS에서 가져온 배치/);
  assert.match(html, /aria-pressed="true"[^>]*>원본 유지</);
  assert.match(html, /aria-pressed="false"[^>]*>보기 좋게 정리</);
  assert.match(html, />보드에 적용</);
  assert.match(html, /hidden=""/);
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
  const html = renderPanel("compiled", {
    layoutSummary: [
      "리소스 겹침 2곳을 정리했습니다.",
      "연결선 경로 3개가 바뀌었습니다. 결과를 확인해 주세요.",
      "서브넷 밖 리소스 1개를 안으로 옮겼습니다."
    ]
  });

  assert.match(html, /aria-pressed="false"[^>]*>원본 유지</);
  assert.match(
    html,
    /aria-pressed="true"[^>]*disabled=""[^>]*>(?:<span>)?보기 좋게 정리/
  );
  assert.match(html, /보기 좋게 정리한 배치/);
  assert.match(html, /리소스 겹침 2곳을 정리했습니다/);
  assert.match(html, /연결선 경로 3개가 바뀌었습니다/);
  assert.match(html, /서브넷 밖 리소스 1개를 안으로 옮겼습니다/);
  assert.doesNotMatch(
    html,
    /정리안 1|정리안 2|Board 정리안 선택|겹친 Resource를 떨어뜨렸습니다|연결선이 Resource를 지나가지 않게 정리했습니다|정리 점수|변경 거리|후보|내부 cost|compiled:|architecture-board-compiler|template/
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
          remedy: "open_settings",
          affectedProviderResourceTypes: ["AWS::EC2::VPC"]
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

  assert.match(html, /일부 AWS 항목을 가져오지 못했어요/);
  assert.match(html, /읽은 리소스와 연결은 유지하고, 읽지 못한 범위는 별도로 표시합니다/);
  assert.match(html, />환경설정에서 권한 보완</);
  assert.match(
    html,
    /href="\/dashboard\/settings\?tab=aws&amp;next=reverse&amp;awsConnectionId=connection-1"/
  );
  assert.doesNotMatch(html, /AWS에서 승인했어요|가져오기 권한 추가/);
  assert.match(html, /보드에 표시할 항목이 없습니다/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>보드에 적용<\/button>/);
  assert.match(resultPanelSource, /못 읽은 서비스 자세히 보기/);
  assert.match(resultPanelSource, /필요한 읽기 권한/);
  assert.match(resultPanelSource, /읽지 못한 종류/);
  assert.doesNotMatch(
    html,
    /AccessDenied|arn:aws|DescribeVpcs|provider_api|permission_denied|retryable|RequestId/
  );
});

test("읽기 실패 상세에는 확인된 최소 읽기 권한만 보여주고 과거 데이터의 임의 action은 숨긴다", () => {
  const html = renderCoveragePanel({
    status: "partial",
    unavailableServices: [
      {
        serviceKey: "ec2",
        displayName: "EC2",
        reason: "permission_required",
        remedy: "open_settings",
        failedAwsApiActions: ["private:Secret", "ec2:DescribeSubnets", "ec2:DescribeVpcs"]
      }
    ]
  });

  assert.match(html, /필요한 읽기 권한: ec2:DescribeSubnets, ec2:DescribeVpcs/);
  assert.match(html, /표시된 API 동작의 읽기 권한을 추가한 뒤 다시 시도해 주세요/);
  assert.doesNotMatch(html, /private:Secret/);
});

test("Cloud Control 목록 조회 미지원은 부분 실패나 환경설정 행동으로 안내하지 않는다", () => {
  const coverage: ReverseEngineeringServiceCoverage = {
    status: "complete",
    unavailableServices: [],
    capabilityLimits: [
      {
        serviceKey: "cloud-control-capability",
        displayName: "Cloud Control 목록 조회",
        reason: "not_supported",
        affectedProviderResourceTypes: ["AWS::CertificateManager::Certificate"]
      }
    ]
  };
  const html = renderCoveragePanel(coverage);
  const previewHtml = renderPanel("original", { boardNodeCount: 1, coverage });

  assert.match(html, /Cloud Control 목록 조회 미지원 종류/);
  assert.match(html, /Cloud Control 목록 조회/);
  assert.match(html, /목록 조회 미지원/);
  assert.match(html, /이 종류는 별도 reader가 필요합니다/);
  assert.match(html, /해당 종류: AWS::CertificateManager::Certificate/);
  assert.doesNotMatch(
    html,
    /못 읽은 서비스 자세히 보기|필요한 읽기 권한|환경설정에서 읽기 권한|다시 시도해 주세요/
  );
  assert.doesNotMatch(previewHtml, />AWS 연결 설정</);
});

test("coverage가 없는 과거 결과에서도 Cloud Control 목록 제한만으로 부분 실패를 만들지 않는다", () => {
  const html = renderPanel("original", {
    boardNodeCount: 1,
    scanErrors: [
      {
        id: "scan-error-service-cloud-control-capability",
        serviceKey: "cloud-control-capability",
        resourceType: "UNKNOWN",
        stage: "provider_api",
        reason: "unsupported",
        message: "legacy unsupported handler",
        retryable: false,
        affectedProviderResourceTypes: ["AWS::CertificateManager::Certificate"]
      }
    ]
  });
  const previewHtml = html.slice(0, html.indexOf('role="dialog"'));

  assert.doesNotMatch(previewHtml, /일부 AWS 서비스를 읽지 못했어요|AWS 연결 설정/);
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

  assert.match(resultPanelSource, /ReverseEngineeringScanCoveragePanel/);
  assert.doesNotMatch(html, /ExpiredToken|InvalidEndpoint|arn:aws|RequestId|provider_api/u);
});

test("부분 결과의 교체와 추가 선택은 상세 정보 안에서 보존한다", () => {
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

  assert.match(html, />현재 보드 교체 미리보기</);
  assert.match(html, />현재 보드 추가 미리보기</);
  assert.match(html, />보드에 적용</);
  assert.match(html, /읽은 리소스와 연결은 유지하고, 읽지 못한 범위는 별도로 표시합니다/);
});

test("부분 결과는 적용 버튼 전에 짧게 알리고 가져온 항목 적용은 막지 않는다", () => {
  const html = renderPanel("original", {
    boardNodeCount: 1,
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
    }
  });
  const dialogIndex = html.indexOf('role="dialog"');
  const previewHtml = html.slice(0, dialogIndex);
  const warning = "일부 AWS 서비스를 읽지 못했어요. 가져온 항목만 보드에 적용합니다.";

  assert.ok(dialogIndex > 0);
  assert.ok(previewHtml.indexOf(warning) >= 0);
  assert.ok(previewHtml.indexOf(warning) < previewHtml.indexOf(">보드에 적용"));
  assert.match(previewHtml, /<button[^>]*>보드에 적용<\/button>/);
  assert.doesNotMatch(previewHtml, /<button[^>]*disabled=""[^>]*>보드에 적용<\/button>/);
  assert.match(resultPanelSource, /못 읽은 서비스 자세히 보기/);
});

test("AWS 연결 설정이 필요한 부분 결과만 미리보기에서 바로 환경설정으로 이동할 수 있다", () => {
  const recoveryHtml = renderPanel("original", {
    boardNodeCount: 1,
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
    }
  });
  const healthyHtml = renderPanel("original", { boardNodeCount: 1 });
  const recoveryPreview = recoveryHtml.slice(0, recoveryHtml.indexOf('role="dialog"'));
  const healthyPreview = healthyHtml.slice(0, healthyHtml.indexOf('role="dialog"'));

  assert.match(recoveryPreview, />AWS 연결 설정</);
  assert.match(
    recoveryPreview,
    /href="\/dashboard\/settings\?tab=aws&amp;next=reverse&amp;awsConnectionId=connection-1"/
  );
  assert.doesNotMatch(healthyPreview, /AWS 연결 설정/);
});

test("상세 정보는 공통 모달 접근성 도우미로 포커스와 닫기 흐름을 연결한다", () => {
  assert.match(resultPanelSource, /setupModalAccessibility/);
  assert.match(resultPanelSource, /detailsOverlayRef/);
  assert.match(resultPanelSource, /detailsDialogRef/);
  assert.match(resultPanelSource, /detailsCloseButtonRef/);
  assert.match(
    resultPanelSource,
    /if \(!isDetailsOpen\) \{\s*return;\s*\}[\s\S]*?setupModalAccessibility\(/
  );
  assert.doesNotMatch(resultPanelSource, /function handleEscape/);
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
  assert.match(html, /<button[^>]*aria-busy="false"(?![^>]*disabled="")[^>]*>보드에 적용<\/button>/);
});

test("Reverse Engineering 상세 정보에는 Terraform 가져오기 선택을 표시하지 않는다", () => {
  const html = renderPanel("original", { boardNodeCount: 2 });

  assert.doesNotMatch(html, /Terraform으로 관리할 리소스 선택/);
  assert.doesNotMatch(html, /기존 AWS 리소스를 Terraform으로 가져와 수정/);
  assert.doesNotMatch(html, /보드에서만 확인할 리소스를 모두 확인해 주세요/);
  assert.match(html, /<button[^>]*aria-busy="false"[^>]*>보드에 적용<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>보드에 적용<\/button>/);
});
