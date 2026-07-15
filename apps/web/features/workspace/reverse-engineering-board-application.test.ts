import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, ReverseEngineeringScanResult } from "@sketchcatch/types";
import { ARCHITECTURE_BOARD_COMPILER_VERSION } from "../architecture-board-compiler";
import { evaluateAutomaticDiagramLayout } from "./automatic-diagram-layout";
import {
  compileReverseEngineeringArchitecture,
  createReverseEngineeringBoardApplication
} from "./reverse-engineering-board-application";

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
    result: scanResult
  });

  assert.equal(proposal.provenance.compilerVersion, ARCHITECTURE_BOARD_COMPILER_VERSION);
  assert.equal(proposal.architecture.nodes.length, 1);
  assert.equal(application.compilation.provenance.compilerVersion, proposal.provenance.compilerVersion);
  assert.deepEqual(application.compilation.diagram, application.previewDiagram);
  assert.deepEqual(application.compilation.diagram, application.diagram);
  assert.equal(application.previewDiagram.nodes.length, 1);
  assert.equal(application.diagram.nodes[0]?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.deepEqual(scanResult, inputBefore);
});

test("Reverse Engineering은 scan finding·제외·provider error를 Compiler context signal로 보존한다", () => {
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

  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.context.deployment:finding-public-vpc"));
  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.context.provider:excluded-unknown"));
  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.context.provider:scan-permission"));
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
  assert.ok(
    application.compilation.changes.some((change) => change.targetIds.includes("vpc-1"))
  );
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "vpc-1")?.metadata?.reverseEngineering?.source,
    "aws_scan"
  );
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "current-bucket")?.metadata?.reverseEngineering,
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
