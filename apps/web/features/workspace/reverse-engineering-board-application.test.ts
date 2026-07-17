import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, ReverseEngineeringScanResult } from "@sketchcatch/types";
import { ARCHITECTURE_BOARD_COMPILER_VERSION } from "../architecture-board-compiler";
import { evaluateAutomaticDiagramLayout } from "./automatic-diagram-layout";
import {
  compileReverseEngineeringArchitecture,
  createReverseEngineeringBoardApplication
} from "./reverse-engineering-board-application";
import { summarizeReverseEngineeringScan } from "./reverse-engineering-presentation";

const currentDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

const scanResult: ReverseEngineeringScanResult = {
  scan: {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: "connection-1",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: [],
    status: "completed",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  },
  architectureJson: {
    nodes: [
      {
        id: "vpc-1",
        type: "VPC",
        label: "Production VPC",
        positionX: 0,
        positionY: 0,
        config: { providerResourceId: "vpc-123" }
      },
      {
        id: "unknown-1",
        type: "UNKNOWN",
        label: "Unmapped resource",
        positionX: 0,
        positionY: 0,
        config: {}
      }
    ],
    edges: []
  },
  reverseEngineeringDraft: {
    id: "draft-1",
    scanId: "scan-1",
    architectureJson: { nodes: [], edges: [] },
    protectedValueKeys: [],
    editableValueKeys: [],
    createdAt: "2026-07-15T00:00:00.000Z"
  },
  discoveredResources: [],
  findings: [],
  analysisExclusions: [],
  importSuggestions: [],
  scanErrors: []
};

test("Reverse Engineering은 Compiler proposal을 생성하고 적용 후보와 분리해 노출한다", () => {
  const inputBefore = structuredClone(scanResult);
  const proposal = compileReverseEngineeringArchitecture(scanResult);
  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "compiled",
    result: scanResult
  });

  assert.ok(application.compilation);
  assert.equal(proposal.provenance.compilerVersion, ARCHITECTURE_BOARD_COMPILER_VERSION);
  assert.equal(proposal.architecture.nodes.length, 2);
  assert.equal(
    application.compilation.provenance.compilerVersion,
    proposal.provenance.compilerVersion
  );
  assert.deepEqual(application.compilation.diagram, application.previewDiagram);
  assert.deepEqual(application.compilation.diagram, application.diagram);
  assert.equal(application.previewDiagram.nodes.length, 2);
  assert.equal(application.diagram.nodes[0]?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.deepEqual(scanResult, inputBefore);
});

test("Reverse Engineering은 원래 배치를 선택하면 Compiler proposal 없이 AWS 파생 보드를 반환한다", () => {
  const applicationInput = {
    currentDiagram,
    mode: "replace" as const,
    placement: "original" as const,
    result: scanResult
  };
  const application = createReverseEngineeringBoardApplication(applicationInput);

  assert.equal(application.compilation, null);
  assert.deepEqual(
    application.diagram.nodes.map(({ id, metadata }) => ({
      id,
      source: metadata?.reverseEngineering?.source
    })),
    [
      { id: "vpc-1", source: "aws_scan" },
      { id: "unknown-1", source: "aws_scan" }
    ]
  );
  assert.deepEqual(application.diagram, application.previewDiagram);
  assert.deepEqual(
    application.diagram.nodes.map(({ id, position }) => ({ id, position })),
    [
      { id: "vpc-1", position: { x: 0, y: 0 } },
      { id: "unknown-1", position: { x: 0, y: 0 } }
    ]
  );
});

test("Reverse Engineering은 사용자가 명시적으로 요청한 경우에만 배치 Compiler proposal을 만든다", () => {
  const originalApplication = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result: scanResult
  });
  const compiledApplication = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "compiled",
    result: scanResult
  });

  assert.equal(originalApplication.compilation, null);
  assert.equal(
    compiledApplication.compilation?.provenance.compilerVersion,
    ARCHITECTURE_BOARD_COMPILER_VERSION
  );
});

test("Reverse Engineering 원래 배치는 Compiler 없이 현재 Board에 추가할 최종 후보가 될 수 있다", () => {
  const currentBoard: DiagramJson = {
    nodes: [
      makeResourceNode("current-bucket", "aws_s3_bucket", "current_bucket", "bucket-current", 0)
    ],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 1.2 }
  };
  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "original",
    result: scanResult
  });

  assert.equal(application.compilation, null);
  assert.deepEqual(
    new Set(application.diagram.nodes.map((node) => node.id)),
    new Set(["current-bucket", "vpc-1"])
  );
  assert.deepEqual(application.diagram.viewport, currentBoard.viewport);
});

test("Reverse Engineering은 raw scan enum 없이 Compiler context 진단을 사용자 언어로 보존한다", () => {
  const proposal = compileReverseEngineeringArchitecture({
    ...scanResult,
    findings: [
      {
        id: "finding-public-vpc",
        category: "security",
        severity: "high",
        resourceId: "vpc-1",
        title: "Public exposure",
        description: "VPC ingress를 확인해야 합니다.",
        recommendation: "inbound rule을 제한하세요."
      }
    ],
    analysisExclusions: [
      {
        id: "excluded-unknown",
        resourceId: "unknown-1",
        reason: "unsupported_resource_type",
        message: "지원하지 않는 리소스입니다."
      }
    ],
    scanErrors: [
      {
        id: "scan-permission",
        resourceType: "UNKNOWN",
        stage: "provider_api",
        reason: "permission_denied",
        message: "권한이 부족합니다.",
        retryable: false
      }
    ]
  });

  assert.ok(
    proposal.diagnostics.some(
      ({ code }) => code === "compiler.context.deployment:finding-public-vpc"
    )
  );

  const exclusionDiagnostic = proposal.diagnostics.find(
    ({ code }) => code === "compiler.context.provider:excluded-unknown"
  );
  const scanErrorDiagnostic = proposal.diagnostics.find(
    ({ code }) => code === "compiler.context.provider:scan-permission"
  );

  assert.deepEqual(exclusionDiagnostic, {
    code: "compiler.context.provider:excluded-unknown",
    level: "warning",
    summary: "자동 분석 제외: 자동 분석 범위 밖",
    message: "이 Resource는 현재 자동 분석 범위에 포함되지 않습니다.",
    relatedChangeIds: [],
    relatedResourceIds: ["unknown-1"],
    penalty: 150
  });
  assert.deepEqual(scanErrorDiagnostic, {
    code: "compiler.context.provider:scan-permission",
    level: "error",
    summary: "스캔 실패: AWS 서비스 조회 · 권한 부족",
    message: "AWS 서비스 조회 중 권한 부족으로 완료하지 못했습니다. AWS 연결과 권한을 확인하세요.",
    relatedChangeIds: [],
    relatedResourceIds: [],
    penalty: 500
  });

  for (const diagnostic of [exclusionDiagnostic, scanErrorDiagnostic]) {
    assert.ok(diagnostic);
    for (const rawEnum of ["unsupported_resource_type", "provider_api", "permission_denied"]) {
      assert.equal(diagnostic.summary.includes(rawEnum), false);
      assert.equal(diagnostic.message.includes(rawEnum), false);
    }
  }
});

test("관계가 있는 검토 전용 Lambda는 보호 metadata와 확인 필요 상태로 보드에 남기고 관계 없는 IAM Role은 목록에만 남긴다", () => {
  const result = createReviewOnlyScanResult();
  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "compiled",
    result
  });
  const lambda = application.diagram.nodes.find((node) => node.id === "lambda-1");

  assert.deepEqual(
    application.diagram.nodes.map((node) => node.id),
    ["vpc-1", "lambda-1"]
  );
  assert.deepEqual(
    application.diagram.edges.map((edge) => ({
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      label: edge.label
    })),
    [{ sourceId: "vpc-1", targetId: "lambda-1", label: "uses" }]
  );
  assert.equal(lambda?.label, "확인 필요 · orders-handler");
  assert.deepEqual(lambda?.style, { borderColor: "#f97316", textColor: "#9a3412" });
  assert.equal(lambda?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.deepEqual(lambda?.metadata?.reverseEngineering?.protectedValueKeys, [
    "providerResourceId",
    "providerResourceType",
    "region",
    "accountId",
    "terraformResourceName",
    "terraformResourceType"
  ]);
  assert.equal(
    result.discoveredResources.some((resource) => resource.id === "iam-role-1"),
    true
  );
  assert.deepEqual(summarizeReverseEngineeringScan(result), {
    discoveredCount: 3,
    boardCount: 2,
    reviewOnlyCount: 2,
    unreadableServiceCount: 0
  });
  assert.deepEqual(
    result.importSuggestions.find((suggestion) => suggestion.resourceId === "lambda-1"),
    {
      id: "import-lambda-1",
      resourceId: "lambda-1",
      status: "unsupported_resource_type",
      handoffReady: false,
      reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
    }
  );
});

test("Reverse Engineering append는 현재 Board와 새 스캔 리소스를 하나의 Compiler proposal로 검토하고 적용한다", () => {
  const currentBoard: DiagramJson = {
    nodes: [
      makeResourceNode("current-bucket", "aws_s3_bucket", "current_bucket", "bucket-current", 0),
      makeResourceNode("current-log", "aws_cloudwatch_log_group", "current_log", "log-current", 600)
    ],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 1.2 }
  };
  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "compiled",
    result: scanResult
  });
  const currentQuality = evaluateAutomaticDiagramLayout({
    edges: currentBoard.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId
    })),
    nodes: currentBoard.nodes
  });

  assert.ok(application.compilation);
  assert.deepEqual(application.compilation.diagram, application.previewDiagram);
  assert.deepEqual(application.compilation.diagram, application.diagram);
  assert.deepEqual(
    new Set(application.compilation.diagram.nodes.map((node) => node.id)),
    new Set(["current-bucket", "current-log", "vpc-1"])
  );
  assert.equal(
    application.compilation.quality.before.metrics.canvasArea,
    currentQuality.canvasArea
  );
  assert.ok(application.compilation.changes.some((change) => change.targetIds.includes("vpc-1")));
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "vpc-1")?.metadata?.reverseEngineering
      ?.source,
    "aws_scan"
  );
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "current-bucket")?.metadata
      ?.reverseEngineering,
    undefined
  );
});

function makeResourceNode(
  id: string,
  resourceType: string,
  resourceName: string,
  providerResourceId: string,
  x: number
): DiagramJson["nodes"][number] {
  return {
    id,
    kind: "resource",
    label: resourceName,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName,
      resourceType,
      terraformBlockType: "resource",
      values: { providerResourceId }
    },
    position: { x, y: 0 },
    size: { width: 48, height: 48 },
    type: resourceType,
    zIndex: 1
  };
}

function createReviewOnlyScanResult(): ReverseEngineeringScanResult {
  return {
    ...structuredClone(scanResult),
    architectureJson: {
      nodes: [
        {
          id: "vpc-1",
          type: "VPC",
          label: "Production VPC",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "vpc-0123456789abcdef0" }
        },
        {
          id: "lambda-1",
          type: "UNKNOWN",
          label: "orders-handler",
          positionX: 260,
          positionY: 0,
          config: {
            providerResourceId:
              "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
            providerResourceType: "AWS::Lambda::Function",
            analysisExcluded: true
          }
        }
      ],
      edges: [
        { id: "edge-lambda-1-vpc-1-uses", sourceId: "vpc-1", targetId: "lambda-1", label: "uses" }
      ]
    },
    discoveredResources: [
      {
        id: "vpc-1",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-0123456789abcdef0",
        region: "ap-northeast-2",
        displayName: "Production VPC",
        resourceType: "VPC",
        config: {}
      },
      {
        id: "lambda-1",
        provider: "aws",
        providerResourceType: "AWS::Lambda::Function",
        providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        region: "ap-northeast-2",
        displayName: "orders-handler",
        resourceType: "UNKNOWN",
        config: {},
        relationships: [{ type: "connects_to", targetResourceId: "vpc-1", label: "uses" }]
      },
      {
        id: "iam-role-1",
        provider: "aws",
        providerResourceType: "AWS::IAM::Role",
        providerResourceId: "arn:aws:iam::123456789012:role/read-only",
        region: "ap-northeast-2",
        displayName: "read-only",
        resourceType: "UNKNOWN",
        config: {},
        relationships: []
      }
    ],
    importSuggestions: [
      {
        id: "import-vpc-1",
        resourceId: "vpc-1",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_vpc.production"
      },
      {
        id: "import-lambda-1",
        resourceId: "lambda-1",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
      },
      {
        id: "import-iam-role-1",
        resourceId: "iam-role-1",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
      }
    ]
  };
}
