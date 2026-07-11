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

test("createWorkspaceAiPatchPreviewModel preserves existing node geometry for parameter edits", () => {
  const baseDiagram: DiagramJson = {
    nodes: [
      makeDiagramNode({
        id: "ec2-1",
        label: "EC2 Fleet Instance 1",
        type: "aws_instance",
        metadata: { parentAreaNodeId: "private-app-subnet-a" },
        parameters: {
          values: {
            instanceType: "t3.small",
            subnetId: "aws_subnet.private_app_a.id"
          }
        },
        position: { x: 930, y: 2102 },
        size: { width: 48, height: 48 },
        zIndex: 100220
      })
    ],
    edges: [],
    viewport: { x: -520, y: -1200, zoom: 0.6 }
  };
  const patchPreview = makePreview({
    proposedNodes: [
      {
        id: "ec2-1",
        type: "EC2",
        label: "EC2 Fleet Instance 1",
        positionX: 120,
        positionY: 80,
        config: {
          instanceType: "t3.medium",
          subnetId: "aws_subnet.private_app_a.id"
        }
      }
    ],
    proposedEdges: []
  });

  const model = createWorkspaceAiPatchPreviewModel(baseDiagram, patchPreview);
  const proposedNode = model.proposedDiagram.nodes[0]!;

  assert.deepEqual(proposedNode.position, { x: 930, y: 2102 });
  assert.deepEqual(proposedNode.size, { width: 48, height: 48 });
  assert.equal(proposedNode.metadata?.parentAreaNodeId, "private-app-subnet-a");
  assert.equal(proposedNode.zIndex, 100220);
  assert.ok(proposedNode.parameters);
  assert.equal(proposedNode.parameters.values.instanceType, "t3.medium");
  assert.equal(proposedNode.parameters.values.subnetId, "aws_subnet.private_app_a.id");
  assert.deepEqual(model.proposedDiagram.viewport, baseDiagram.viewport);
  assert.equal(model.annotations.nodeStates["ec2-1"], "modified");
});

function makeDiagramNode(node: {
  readonly id: string;
  readonly label: string;
  readonly metadata?: DiagramJson["nodes"][number]["metadata"];
  readonly parameters?: Partial<DiagramJson["nodes"][number]["parameters"]>;
  readonly position?: DiagramJson["nodes"][number]["position"];
  readonly size?: DiagramJson["nodes"][number]["size"];
  readonly type: string;
  readonly zIndex?: number;
}): DiagramJson["nodes"][number] {
  return {
    id: node.id,
    kind: "resource",
    label: node.label,
    locked: false,
    ...(node.metadata ? { metadata: node.metadata } : {}),
    position: node.position ?? { x: 120, y: 80 },
    size: node.size ?? { width: 168, height: 96 },
    type: node.type,
    zIndex: node.zIndex ?? 1,
    parameters: {
      fileName: node.parameters?.fileName ?? "main",
      resourceName: node.parameters?.resourceName ?? node.id.replaceAll("-", "_"),
      resourceType: node.parameters?.resourceType ?? node.type,
      terraformBlockType: node.parameters?.terraformBlockType ?? "resource",
      values: node.parameters?.values ?? {}
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
