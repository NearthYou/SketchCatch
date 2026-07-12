import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitecturePatchPreview, DiagramJson } from "../../../../packages/types/src";
import { createWorkspaceAiPatchPreviewModel } from "./workspace-ai-patch-preview";

test("createWorkspaceAiPatchPreviewModel keeps deleted resources only in the visual preview", () => {
  const baseDiagram: DiagramJson = {
    nodes: [
      makeDiagramNode({ id: "app-server", label: "App Server", type: "aws_instance" }),
      makeDiagramNode({ id: "assets-bucket", label: "Assets Bucket", type: "aws_s3_bucket" })
    ],
    edges: [
      {
        id: "app-to-assets",
        sourceNodeId: "app-server",
        targetNodeId: "assets-bucket"
      }
    ],
    viewport: { x: 12, y: 24, zoom: 0.8 }
  };
  const patchPreview = makePreview({
    proposedNodes: [
      {
        id: "app-server",
        type: "EC2",
        label: "App Server",
        positionX: 120,
        positionY: 80,
        config: {}
      }
    ],
    proposedEdges: []
  });

  const model = createWorkspaceAiPatchPreviewModel(baseDiagram, patchPreview);

  assert.deepEqual(
    model.proposedDiagram.nodes.map((node) => node.id),
    ["app-server"]
  );
  assert.deepEqual(
    model.visualPreviewDiagram.nodes.map((node) => node.id),
    ["app-server", "assets-bucket"]
  );
  assert.deepEqual(model.visualPreviewDiagram.edges.map((edge) => edge.id), ["app-to-assets"]);
  assert.equal(model.annotations.nodeStates["assets-bucket"], "deleted");
  assert.equal(model.annotations.edgeStates["app-to-assets"], "deleted");
});

test("createWorkspaceAiPatchPreviewModel marks added and modified resources without storing preview flags in DiagramJson", () => {
  const baseDiagram: DiagramJson = {
    nodes: [makeDiagramNode({ id: "app-server", label: "App Server", type: "aws_instance" })],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const patchPreview = makePreview({
    proposedNodes: [
      {
        id: "app-server",
        type: "EC2",
        label: "App Server",
        positionX: 120,
        positionY: 80,
        config: { instanceType: "t3.small" }
      },
      {
        id: "assets-bucket",
        type: "S3",
        label: "S3 Bucket",
        positionX: 240,
        positionY: 160,
        config: {}
      }
    ],
    proposedEdges: []
  });

  const model = createWorkspaceAiPatchPreviewModel(baseDiagram, patchPreview);

  assert.equal(model.annotations.nodeStates["app-server"], "modified");
  assert.equal(model.annotations.nodeStates["assets-bucket"], "added");
  assert.equal("previewState" in model.visualPreviewDiagram.nodes[0]!, false);
  assert.equal("previewState" in model.proposedDiagram.nodes[0]!, false);
});

function makeDiagramNode(node: {
  readonly id: string;
  readonly label: string;
  readonly type: string;
}): DiagramJson["nodes"][number] {
  return {
    id: node.id,
    kind: "resource",
    label: node.label,
    locked: false,
    position: { x: 120, y: 80 },
    size: { width: 168, height: 96 },
    type: node.type,
    zIndex: 1,
    parameters: {
      fileName: "main",
      resourceName: node.id.replaceAll("-", "_"),
      resourceType: node.type,
      terraformBlockType: "resource",
      values: {}
    }
  };
}

function makePreview(input: {
  readonly proposedNodes: ArchitecturePatchPreview["proposedArchitectureJson"]["nodes"];
  readonly proposedEdges: ArchitecturePatchPreview["proposedArchitectureJson"]["edges"];
}): ArchitecturePatchPreview {
  return {
    status: "preview",
    intent: {
      instruction: "edit diagram",
      requestedAction: "modify_resource"
    },
    baseArchitectureJson: {
      nodes: [],
      edges: []
    },
    proposedArchitectureJson: {
      nodes: input.proposedNodes,
      edges: input.proposedEdges
    },
    changes: [],
    requiresUserAcceptance: true,
    userAcceptedChange: null,
    providerMetadata: {
      provider: "fallback",
      service: "rule_fallback",
      routeTarget: "architecture_patch_preview",
      cacheHit: false,
      cacheKey: "test",
      estimatedUsage: {
        inputCharacters: 1,
        inputTokensEstimate: 1
      },
      billingMode: "disabled",
      generatedAt: new Date(0).toISOString()
    }
  };
}
