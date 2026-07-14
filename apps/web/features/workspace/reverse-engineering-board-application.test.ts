import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, ReverseEngineeringScanResult } from "@sketchcatch/types";
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

  assert.equal(proposal.provenance.compilerVersion, "architecture-board-compiler/v1");
  assert.equal(proposal.architecture.nodes.length, 1);
  assert.equal(application.compilation.provenance.compilerVersion, proposal.provenance.compilerVersion);
  assert.deepEqual(application.compilation.diagram, proposal.diagram);
  assert.equal(application.previewDiagram.nodes.length, 1);
  assert.equal(application.diagram.nodes[0]?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.deepEqual(scanResult, inputBefore);
});
