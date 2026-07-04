import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import { createArchitecturePatchPreview } from "./aiArchitecturePatchPreview.js";

test("createArchitecturePatchPreview asks for a target when multiple resources match", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: []
    },
    instruction: "delete the S3 bucket"
  });

  assert.equal(response.status, "needs_clarification");
  assert.equal(response.intent.requestedAction, "remove_resource");
  assert.deepEqual(
    response.candidates.map((candidate) => candidate.resourceId),
    ["assets-bucket", "logs-bucket"]
  );
  assert.match(response.question, /which/i);
});

test("createArchitecturePatchPreview removes the selected target and connected edges in the proposed preview", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({ id: "app-server", type: "EC2", label: "App Server" }),
        makeNode({ id: "assets-bucket", type: "S3", label: "Assets Bucket" }),
        makeNode({ id: "logs-bucket", type: "S3", label: "Logs Bucket" })
      ],
      edges: [
        {
          id: "app-to-assets",
          sourceId: "app-server",
          targetId: "assets-bucket",
          label: "stores uploads"
        },
        {
          id: "app-to-logs",
          sourceId: "app-server",
          targetId: "logs-bucket",
          label: "writes logs"
        }
      ]
    },
    instruction: "delete the S3 bucket",
    selectedTargetResourceId: "assets-bucket"
  });

  assert.equal(response.status, "preview");
  assert.deepEqual(
    response.changes.map((change) => ({
      action: change.action,
      resourceId: change.resourceId,
      resourceType: change.resourceType
    })),
    [
      {
        action: "remove_resource",
        resourceId: "assets-bucket",
        resourceType: "S3"
      }
    ]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.nodes.map((node) => node.id),
    ["app-server", "logs-bucket"]
  );
  assert.deepEqual(
    response.proposedArchitectureJson.edges.map((edge) => edge.id),
    ["app-to-logs"]
  );
});

test("createArchitecturePatchPreview updates requested resource attributes without moving the node", () => {
  const response = createArchitecturePatchPreview({
    architectureJson: {
      nodes: [
        makeNode({
          id: "app-server",
          type: "EC2",
          label: "App Server",
          config: {
            instanceType: "t3.micro"
          },
          positionX: 240,
          positionY: 180
        })
      ],
      edges: []
    },
    instruction: "change the EC2 instance type to t3.small"
  });

  assert.equal(response.status, "preview");
  assert.equal(response.changes[0]?.action, "modify_resource");
  assert.equal(response.changes[0]?.resourceId, "app-server");
  assert.deepEqual(response.proposedArchitectureJson.nodes[0], {
    id: "app-server",
    type: "EC2",
    label: "App Server",
    positionX: 240,
    positionY: 180,
    config: {
      instanceType: "t3.small"
    }
  });
});

function makeNode(
  node: Partial<ArchitectureJson["nodes"][number]> &
    Pick<ArchitectureJson["nodes"][number], "id" | "type">
): ArchitectureJson["nodes"][number] {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    positionX: node.positionX ?? 120,
    positionY: node.positionY ?? 80,
    config: node.config ?? {}
  };
}
