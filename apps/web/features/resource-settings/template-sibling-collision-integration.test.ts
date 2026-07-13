import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { toFlowEdges } from "../diagram-editor/flow-mappers";
import { doesOrthogonalRouteCrossResource } from "../diagram-editor/obstacle-safe-edge-routing";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import { hydrateCatalogResourceNodes } from "./template-resource-materializer";
import * as templateLibrary from "./template-library";

test("every reviewed deployable Template has zero visible sibling collisions", () => {
  const templates = templateLibrary.listBoardTemplates();

  assert.equal(templates.length, 6);
  for (const template of templates) {
    assert.deepEqual(findSiblingVisualCollisions(template.diagramJson), [], template.id);
  }
});

test("every reviewed deployable Template keeps child visual footprints inside its Area", () => {
  for (const template of getAllMaterializedTemplates()) {
    const nodeById = new Map(template.diagramJson.nodes.map((node) => [node.id, node]));

    for (const child of template.diagramJson.nodes) {
      const parentId = child.metadata?.parentAreaNodeId;
      const parent = parentId ? nodeById.get(parentId) : undefined;

      if (!parent || !isAreaNode(parent)) {
        continue;
      }

      const childBounds = getResourceNodeVisualBounds(child);
      const parentBounds = getResourceNodeVisualBounds(parent);
      assert.ok(
        childBounds.x >= parentBounds.x &&
          childBounds.y >= parentBounds.y &&
          childBounds.x + childBounds.width <= parentBounds.x + parentBounds.width &&
          childBounds.y + childBounds.height <= parentBounds.y + parentBounds.height,
        `${template.id}: ${child.id} must fit inside ${parent.id}`
      );
    }
  }
});

test("every reviewed deployable Template routes each visible edge around Resource captions", () => {
  for (const template of getAllMaterializedTemplates()) {
    const nodeById = new Map(template.diagramJson.nodes.map((node) => [node.id, node]));
    const flowEdges = toFlowEdges(template.diagramJson.edges, [], template.diagramJson.nodes, { isPreview: true });

    for (const flowEdge of flowEdges) {
      const source = nodeById.get(flowEdge.source);
      const target = nodeById.get(flowEdge.target);
      const sourceHandleId = toLogicalHandleId(flowEdge.sourceHandle);
      const targetHandleId = toLogicalHandleId(flowEdge.targetHandle);

      assert.ok(source, `${template.id}: ${flowEdge.id} source must exist`);
      assert.ok(target, `${template.id}: ${flowEdge.id} target must exist`);
      assert.ok(sourceHandleId, `${template.id}: ${flowEdge.id} source handle must exist`);
      assert.ok(targetHandleId, `${template.id}: ${flowEdge.id} target handle must exist`);
      assert.equal(
        doesOrthogonalRouteCrossResource(
          source,
          target,
          { sourceHandleId, targetHandleId },
          template.diagramJson.nodes
        ),
        false,
        `${template.id}: ${flowEdge.id} crosses a Resource caption`
      );
    }
  }
});

test("draft catalog hydration preserves user-authored coordinates", () => {
  const savedDraft = createDiagram([
    {
      id: "saved-bucket",
      kind: "resource",
      label: "Saved Bucket",
      locked: false,
      parameters: {
        fileName: "main",
        resourceName: "saved",
        resourceType: "aws_s3_bucket",
        terraformBlockType: "resource",
        values: {}
      },
      position: { x: 173, y: 287 },
      size: { height: 48, width: 48 },
      type: "aws_s3_bucket",
      zIndex: 1
    }
  ]);

  const hydrated = hydrateCatalogResourceNodes(savedDraft);

  assert.deepEqual(hydrated.nodes[0]?.position, { x: 173, y: 287 });
});

function findSiblingVisualCollisions(diagram: DiagramJson): string[] {
  // DiagramEditor renders every persisted node, including parameter-helper resources with captions.
  const renderableNodes = diagram.nodes;
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const groups = new Map<string, DiagramNode[]>();

  for (const node of renderableNodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;
    const parent = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;
    const parentId = parent && isAreaNode(parent) ? parent.id : "__root__";
    const siblings = groups.get(parentId) ?? [];

    siblings.push(node);
    groups.set(parentId, siblings);
  }

  const collisions: string[] = [];

  for (const siblings of groups.values()) {
    for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < siblings.length; rightIndex += 1) {
        const left = siblings[leftIndex];
        const right = siblings[rightIndex];

        if (left && right && intersects(left, right)) {
          collisions.push(`${left.id} <> ${right.id}`);
        }
      }
    }
  }

  return collisions;
}

function getAllMaterializedTemplates() {
  return templateLibrary.listBoardTemplates();
}

function toLogicalHandleId(handleId: string | null | undefined): string | undefined {
  const side = handleId?.match(/(?:source-|target-|handle-)?(left|top|right|bottom)$/u)?.[1];
  return side ? `handle-${side}` : undefined;
}

function intersects(left: DiagramNode, right: DiagramNode): boolean {
  const a = getResourceNodeVisualBounds(left);
  const b = getResourceNodeVisualBounds(right);

  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function createDiagram(nodes: readonly DiagramNode[]): DiagramJson {
  return { edges: [], nodes: [...nodes], viewport: { x: 0, y: 0, zoom: 1 } };
}
