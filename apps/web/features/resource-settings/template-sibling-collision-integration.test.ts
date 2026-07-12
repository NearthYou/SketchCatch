import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { isRenderableDiagramNode } from "../diagram-editor/diagram-node-visibility";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import { hydrateCatalogResourceNodes } from "./template-resource-materializer";
import * as templateLibrary from "./template-library";

test("every materialized built-in Template has zero visible sibling collisions", () => {
  const listLegacyBoardTemplates = (
    templateLibrary as typeof templateLibrary & {
      readonly listLegacyBoardTemplates?: typeof templateLibrary.listBoardTemplates;
    }
  ).listLegacyBoardTemplates;
  const templates = [
    ...templateLibrary.listBoardTemplates(),
    ...(listLegacyBoardTemplates?.() ?? [])
  ];

  assert.ok(templates.length >= 4);
  for (const template of templates) {
    assert.deepEqual(findSiblingVisualCollisions(template.diagramJson), [], template.id);
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
  const renderableNodes = diagram.nodes.filter(isRenderableDiagramNode);
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
