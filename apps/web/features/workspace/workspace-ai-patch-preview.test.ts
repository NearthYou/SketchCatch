import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, ArchitecturePatchPreview } from "@sketchcatch/types";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";
import {
  createWorkspaceAiPatchPreviewModel,
  getWorkspaceAiPatchParameterChanges
} from "./workspace-ai-patch-preview";

const baseArchitectureJson: ArchitectureJson = {
  edges: [],
  nodes: [
    {
      config: {
        name: "web-oac",
        signing_behavior: "always",
        terraformResourceType: "aws_cloudfront_origin_access_control"
      },
      id: "cloudfront-oac",
      label: "CloudFront Origin Access Control",
      positionX: 0,
      positionY: 0,
      type: "CLOUDFRONT"
    }
  ]
};

test("파라미터 수정 미리보기는 리소스와 변경 전후 값을 명확히 추출한다", () => {
  const baseNode = baseArchitectureJson.nodes[0]!;
  const proposedArchitectureJson: ArchitectureJson = {
    ...baseArchitectureJson,
    nodes: [
      {
        ...baseNode,
        config: {
          ...baseNode.config,
          signing_behavior: "never"
        }
      }
    ]
  };

  assert.deepEqual(getWorkspaceAiPatchParameterChanges(baseArchitectureJson, proposedArchitectureJson), [
    {
      after: "never",
      before: "always",
      parameter: "signing_behavior",
      resourceId: "cloudfront-oac",
      resourceLabel: "CloudFront Origin Access Control",
      resourceType: "aws_cloudfront_origin_access_control"
    }
  ]);
});

test("parameter change extraction tolerates missing architecture nodes", () => {
  const missingNodes = {
    ...baseArchitectureJson,
    nodes: undefined
  } as unknown as ArchitectureJson;

  assert.deepEqual(
    getWorkspaceAiPatchParameterChanges(undefined as unknown as ArchitectureJson, baseArchitectureJson),
    []
  );
  assert.deepEqual(getWorkspaceAiPatchParameterChanges(baseArchitectureJson, missingNodes), []);
});

test("patch preview model carries modify, add, and delete changes into the board diagram", () => {
  const baseArchitecture: ArchitectureJson = {
    edges: [
      { id: "service-to-bucket", sourceId: "orders-service", targetId: "logs-bucket" }
    ],
    nodes: [
      {
        config: {
          desiredCount: 2,
          name: "orders-service",
          terraformResourceType: "aws_ecs_service"
        },
        id: "orders-service",
        label: "Orders Service",
        positionX: 0,
        positionY: 0,
        type: "ECS_SERVICE"
      },
      {
        config: {
          bucketName: "logs-archive",
          terraformResourceType: "aws_s3_bucket"
        },
        id: "logs-bucket",
        label: "Logs Bucket",
        positionX: 100,
        positionY: 0,
        type: "S3"
      }
    ]
  };
  const proposedArchitecture: ArchitectureJson = {
    edges: [],
    nodes: [
      {
        ...baseArchitecture.nodes[0]!,
        config: {
          ...baseArchitecture.nodes[0]!.config,
          desiredCount: 4
        }
      },
      {
        config: {
          name: "orders-events",
          terraformResourceType: "aws_sqs_queue"
        },
        id: "orders-events-queue",
        label: "Orders Events",
        positionX: 200,
        positionY: 0,
        type: "SQS_QUEUE"
      }
    ]
  };
  const preview = {
    status: "preview",
    intent: {
      instruction: "test patch",
      requestedAction: "manual_review"
    },
    baseArchitectureJson: baseArchitecture,
    proposedArchitectureJson: proposedArchitecture,
    changes: [],
    requiresUserAcceptance: true,
    userAcceptedChange: null,
    providerMetadata: {
      provider: "fallback",
      service: "rule_fallback",
      routeTarget: "architecture_patch_preview",
      cacheHit: false,
      cacheKey: "patch-preview-test",
      estimatedUsage: {
        inputCharacters: 10,
        inputTokensEstimate: 3
      },
      billingMode: "disabled",
      generatedAt: "2026-07-24T00:00:00.000Z"
    }
  } as ArchitecturePatchPreview;
  const model = createWorkspaceAiPatchPreviewModel(
    convertArchitectureJsonToDiagramJson(baseArchitecture),
    preview
  );
  const proposedNodeById = new Map(model.proposedDiagram.nodes.map((node) => [node.id, node]));

  assert.equal(
    proposedNodeById.get("orders-service")?.parameters?.values.desiredCount,
    4
  );
  assert.equal(proposedNodeById.has("logs-bucket"), false);
  assert.equal(proposedNodeById.has("orders-events-queue"), true);
  assert.deepEqual(model.proposedDiagram.edges, []);
  assert.equal(model.annotations.nodeStates["orders-service"], "modified");
  assert.equal(model.annotations.nodeStates["logs-bucket"], "deleted");
  assert.equal(model.annotations.nodeStates["orders-events-queue"], "added");
  assert.equal(model.annotations.edgeStates["service-to-bucket"], "deleted");
  assert.deepEqual(model.parameterChanges, [
    {
      after: "4",
      before: "2",
      parameter: "desiredCount",
      resourceId: "orders-service",
      resourceLabel: "Orders Service",
      resourceType: "aws_ecs_service"
    }
  ]);
});
