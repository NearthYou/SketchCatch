import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, DiagramJson } from "@sketchcatch/types";
import {
  applyArchitectureBoardPresentationOperations,
  applyArchitectureBoardSemanticOperations
} from "./architecture-board-semantic-operations";

const architecture: ArchitectureJson = {
  nodes: [
    {
      id: "legacy-api",
      type: "API_GATEWAY_REST_API",
      label: "Legacy API",
      positionX: 0,
      positionY: 0,
      config: { stageName: "legacy" }
    },
    {
      id: "obsolete-log",
      type: "CLOUDWATCH_LOG_GROUP",
      label: "Obsolete log",
      positionX: 100,
      positionY: 0,
      config: {}
    }
  ],
  edges: [{ id: "legacy-edge", sourceId: "legacy-api", targetId: "obsolete-log", label: "logs" }]
};

test("semantic operation은 Resource·관계·설정·소속 변경을 하나의 후보 Architecture에 반영한다", () => {
  const result = applyArchitectureBoardSemanticOperations(architecture, [
    {
      id: "replace-api",
      kind: "resource-replace",
      targetId: "legacy-api",
      node: {
        id: "api",
        type: "API_GATEWAY_REST_API",
        label: "Public API",
        positionX: 0,
        positionY: 0,
        config: { terraformResourceType: "aws_api_gateway_rest_api" }
      }
    },
    {
      id: "add-vpc",
      kind: "resource-add",
      node: {
        id: "vpc",
        type: "VPC",
        label: "VPC",
        positionX: 80,
        positionY: 80,
        config: { terraformResourceType: "aws_vpc" }
      }
    },
    { id: "remove-log", kind: "resource-remove", targetId: "obsolete-log" },
    {
      id: "configure-api",
      kind: "configuration-merge",
      targetId: "api",
      values: { stageName: "v1" }
    },
    { id: "contain-api", kind: "containment-set", targetId: "api", parentAreaNodeId: "vpc" },
    {
      id: "api-vpc",
      kind: "relationship-add",
      edge: { id: "api-vpc", sourceId: "vpc", targetId: "api", label: "contains" }
    }
  ]);

  assert.deepEqual(
    result.architecture.nodes.map((node) => node.id).sort(),
    ["api", "vpc"]
  );
  assert.equal(result.architecture.nodes.find((node) => node.id === "api")?.config.stageName, "v1");
  assert.equal(
    result.architecture.nodes.find((node) => node.id === "api")?.config.parentAreaNodeId,
    "vpc"
  );
  assert.deepEqual(result.architecture.edges, [
    { id: "api-vpc", sourceId: "vpc", targetId: "api", label: "contains" }
  ]);
  assert.deepEqual(result.appliedOperationIds, [
    "add-vpc",
    "api-vpc",
    "configure-api",
    "contain-api",
    "remove-log",
    "replace-api"
  ]);
});

test("semantic operation은 존재하지 않는 대상과 중복 Resource를 diagnostic 입력으로 남긴다", () => {
  const result = applyArchitectureBoardSemanticOperations(architecture, [
    { id: "missing", kind: "resource-remove", targetId: "does-not-exist" },
    {
      id: "duplicate",
      kind: "resource-add",
      node: {
        id: "legacy-api",
        type: "API_GATEWAY_REST_API",
        positionX: 0,
        positionY: 0,
        config: {}
      }
    }
  ]);

  assert.deepEqual(result.appliedOperationIds, []);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["compiler.semantic_operation_duplicate_resource", "compiler.semantic_operation_missing_target"]
  );
});

test("presentation operation은 Resource graph를 건드리지 않고 design Group을 추가·삭제한다", () => {
  const diagram: DiagramJson = {
    nodes: [
      {
        id: "app",
        type: "aws_instance",
        kind: "resource",
        label: "App",
        locked: false,
        position: { x: 100, y: 100 },
        size: { width: 48, height: 48 },
        zIndex: 100
      },
      {
        id: "obsolete-group",
        type: "design_group",
        kind: "design",
        label: "Obsolete",
        locked: false,
        position: { x: 0, y: 0 },
        size: { width: 320, height: 220 },
        zIndex: 1
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const result = applyArchitectureBoardPresentationOperations(diagram, [
    { id: "remove-old-group", kind: "presentation-remove", targetId: "obsolete-group" },
    {
      id: "add-platform-group",
      kind: "presentation-add",
      node: {
        id: "platform-group",
        type: "design_group",
        kind: "design",
        label: "Platform",
        locked: false,
        position: { x: 40, y: 40 },
        size: { width: 240, height: 160 },
        zIndex: 1
      }
    }
  ]);

  assert.deepEqual(
    result.diagram.nodes.map((node) => node.id).sort(),
    ["app", "platform-group"]
  );
  assert.deepEqual(result.appliedOperationIds, ["add-platform-group", "remove-old-group"]);
  assert.deepEqual(result.issues, []);
});
