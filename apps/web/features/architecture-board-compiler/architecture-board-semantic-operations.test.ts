import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import { applyArchitectureBoardSemanticOperations } from "./architecture-board-semantic-operations";

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
