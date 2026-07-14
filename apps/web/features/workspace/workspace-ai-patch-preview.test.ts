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

test("createWorkspaceAiPatchPreviewModel preserves saved and locked node layout while placing additions", () => {
  const savedNode = {
    ...makeDiagramNode({ id: "app-server", label: "App Server", type: "aws_instance" }),
    locked: true,
    position: { x: 713, y: 389 },
    size: { width: 222, height: 111 }
  };
  const baseDiagram: DiagramJson = {
    nodes: [savedNode],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 0.8 }
  };
  const patchPreview = makePreview({
    proposedNodes: [
      {
        id: "app-server",
        type: "EC2",
        label: "App Server",
        positionX: 0,
        positionY: 0,
        config: { instanceType: "t3.small" }
      },
      {
        id: "assets-bucket",
        type: "S3",
        label: "Assets Bucket",
        positionX: 0,
        positionY: 0,
        config: {}
      }
    ],
    proposedEdges: [
      {
        id: "app-to-assets",
        sourceId: "app-server",
        targetId: "assets-bucket",
        label: "stores files"
      }
    ]
  });

  const model = createWorkspaceAiPatchPreviewModel(baseDiagram, patchPreview);
  const preservedNode = model.proposedDiagram.nodes.find((node) => node.id === savedNode.id);
  const addedNode = model.proposedDiagram.nodes.find((node) => node.id === "assets-bucket");

  assert.deepEqual(preservedNode?.position, savedNode.position);
  assert.deepEqual(preservedNode?.size, savedNode.size);
  assert.equal(preservedNode?.locked, true);
  assert.ok(addedNode);
  assert.equal(nodesOverlap(preservedNode!, addedNode), false);
});

test("createWorkspaceAiPatchPreviewModel grows a saved Area around added children without moving it", () => {
  const savedArea = {
    ...makeDiagramNode({ id: "manual-vpc", label: "Manual VPC", type: "aws_vpc" }),
    locked: true,
    position: { x: 500, y: 300 },
    size: { width: 260, height: 196 }
  };
  const savedChild = {
    ...makeDiagramNode({ id: "existing-service", label: "Existing Service", type: "aws_instance" }),
    metadata: { parentAreaNodeId: savedArea.id },
    position: { x: 536, y: 336 }
  };
  const baseDiagram: DiagramJson = {
    nodes: [savedArea, savedChild],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const patchPreview = makePreview({
    proposedNodes: [
      {
        id: savedArea.id,
        type: "VPC",
        label: savedArea.label,
        positionX: 0,
        positionY: 0,
        config: { cidrBlock: "10.20.0.0/16" }
      },
      {
        id: savedChild.id,
        type: "EC2",
        label: savedChild.label,
        positionX: 0,
        positionY: 0,
        config: { vpcId: "aws_vpc.vpc_manual.id" }
      },
      {
        id: "new-service",
        type: "EC2",
        label: "New Service",
        positionX: 0,
        positionY: 0,
        config: { vpcId: "aws_vpc.vpc_manual.id" }
      }
    ],
    proposedEdges: []
  });
  const model = createWorkspaceAiPatchPreviewModel(baseDiagram, patchPreview);
  const nodeById = new Map(model.proposedDiagram.nodes.map((node) => [node.id, node]));
  const nextArea = nodeById.get(savedArea.id)!;
  const newChild = nodeById.get("new-service")!;

  assert.deepEqual(nextArea.position, savedArea.position);
  assert.deepEqual(nodeById.get(savedChild.id)?.position, savedChild.position);
  assert.ok(nextArea.size.width >= savedArea.size.width);
  assert.ok(nextArea.size.height >= savedArea.size.height);
  assert.ok(newChild.position.x >= nextArea.position.x);
  assert.ok(newChild.position.y >= nextArea.position.y);
  assert.ok(newChild.position.x + newChild.size.width <= nextArea.position.x + nextArea.size.width);
  assert.ok(newChild.position.y + newChild.size.height <= nextArea.position.y + nextArea.size.height);
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

function nodesOverlap(left: DiagramJson["nodes"][number], right: DiagramJson["nodes"][number]): boolean {
  return (
    left.position.x < right.position.x + right.size.width &&
    left.position.x + left.size.width > right.position.x &&
    left.position.y < right.position.y + right.size.height &&
    left.position.y + left.size.height > right.position.y
  );
}
