import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "@sketchcatch/types";

import { isAreaNode } from "../diagram-editor/area-nodes";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import { resourceCatalog } from "../resource-settings/catalog";
import {
  getWorkspaceDiagramFixture,
  getWorkspaceDiagramFixtureViewState
} from "./workspace-diagram-fixtures";

test("conventions keeps the existing eleven-node Architecture Board fixture", () => {
  const fixture = getWorkspaceDiagramFixture("conventions");

  assert.ok(fixture);
  assert.equal(fixture.nodes.length, 11);
  assert.equal(fixture.edges.length, 9);
  assert.ok(fixture.nodes.some((node) => node.label === "CDN Public Entry"));
  assert.ok(fixture.edges.some((edge) => edge.label === "monitors errors"));
  const policyNode = fixture.nodes.find((node) => node.id === "lambda-execution-policy");
  const roleNode = fixture.nodes.find((node) => node.id === "lambda-execution-role");

  assert.ok(policyNode);
  assert.ok(roleNode);
  assert.ok(
    Math.abs(policyNode.position.x - roleNode.position.x) >= 192,
    "horizontal topology lanes must reserve room for an edge label shield"
  );
  assert.deepEqual(getWorkspaceDiagramFixture("conventions"), fixture);
});

test("resource-gallery covers all 126 catalog entries in deterministic Resource and Area groups", () => {
  const fixture = getWorkspaceDiagramFixture("resource-gallery");

  assert.ok(fixture);

  const catalogNodes = resourceCatalog
    .map((item, index) => ({
      item,
      node: {
        id: `catalog-probe-${item.id}`,
        type: item.nodeDefaults.type,
        kind:
          item.id.startsWith("design-") || item.nodeDefaults.type.startsWith("sketchcatch_")
            ? ("design" as const)
            : ("resource" as const),
        position: { x: 0, y: 0 },
        size: item.nodeDefaults.size,
        label: item.nodeDefaults.label,
        locked: false,
        zIndex: index,
        ...(item.id.startsWith("design-") || item.nodeDefaults.type.startsWith("sketchcatch_")
          ? {}
          : {
              parameters: {
                resourceType: item.nodeDefaults.type,
                resourceName: item.id.replace(/-/gu, "_"),
                fileName: "main",
                values: {}
              }
            })
      }
    }));
  const expectedResourceIds = catalogNodes
    .filter(({ node }) => !isAreaNode(node))
    .map(({ item }) => `fixture-resource-${item.id}`);
  const expectedAreaIds = catalogNodes
    .filter(({ node }) => isAreaNode(node))
    .map(({ item }) => `fixture-resource-${item.id}`);

  assert.equal(resourceCatalog.length, 126);
  assert.equal(expectedResourceIds.length, 119);
  assert.equal(expectedAreaIds.length, 7);
  assert.deepEqual(
    fixture.nodes.map((node) => node.id),
    [...expectedResourceIds, ...expectedAreaIds]
  );
  assert.equal(fixture.nodes.length, resourceCatalog.length);
  assert.equal(fixture.edges.length, 0);

  const resourceNodes = fixture.nodes.filter((node) => !isAreaNode(node));

  assert.ok(
    resourceNodes.every((node) => node.size.width === 48 && node.size.height === 48),
    "all 119 non-Area catalog nodes must keep 48×48 logical geometry"
  );

  for (const [index, node] of resourceNodes.entries()) {
    const bounds = getResourceNodeVisualBounds(node);

    for (const otherNode of resourceNodes.slice(index + 1)) {
      assert.equal(
        doBoundsOverlap(bounds, getResourceNodeVisualBounds(otherNode)),
        false,
        `${node.id} visual footprint overlaps ${otherNode.id}`
      );
    }
  }

  const duplicateIconGroups = [...groupNodesByIcon(resourceNodes).values()].filter(
    (nodes) => nodes.length > 1
  );

  assert.equal(duplicateIconGroups.length, 29);
  assert.equal(
    duplicateIconGroups.reduce((total, nodes) => total + nodes.length, 0),
    78
  );
  assert.ok(
    duplicateIconGroups.every(
      (nodes) => new Set(nodes.map((node) => node.label)).size === nodes.length
    ),
    "every duplicated icon must retain a unique visible label"
  );

  assert.deepEqual(getWorkspaceDiagramFixture("resource-gallery"), fixture);
});

test("area-matrix provides a contained Region to workload Area hierarchy with border variants", () => {
  const fixture = getWorkspaceDiagramFixture("area-matrix");

  assert.ok(fixture);

  const expectedParents = new Map<string, string | undefined>([
    ["area-region", undefined],
    ["area-availability-zone", "area-region"],
    ["area-vpc", "area-availability-zone"],
    ["area-subnet", "area-vpc"],
    ["area-security-group", "area-subnet"],
    ["area-autoscaling-group", "area-subnet"]
  ]);
  const areas = fixture.nodes.filter(isAreaNode);

  assert.deepEqual(
    areas.map((node) => node.id),
    [...expectedParents.keys()]
  );
  assert.deepEqual(
    areas.map((node) => [node.id, node.metadata?.parentAreaNodeId]),
    [...expectedParents.entries()]
  );
  assert.deepEqual(
    new Set(areas.map((node) => node.style?.borderStyle)),
    new Set(["solid", "dashed", "dotted"])
  );
  assert.ok(areas.some((node) => node.style?.borderColor === "#5269b3"));
  assert.equal(areas.find((node) => node.id === "area-security-group")?.locked, true);
  assert.deepEqual(areas.find((node) => node.id === "area-region")?.size, {
    width: 1320,
    height: 700
  });

  for (const node of areas) {
    const parentId = node.metadata?.parentAreaNodeId;

    if (!parentId) {
      continue;
    }

    const parent: DiagramNode | undefined = fixture.nodes.find(
      (candidate) => candidate.id === parentId
    );
    assert.ok(parent);
    assert.ok(node.position.x >= parent.position.x);
    assert.ok(node.position.y >= parent.position.y);
    assert.ok(node.position.x + node.size.width <= parent.position.x + parent.size.width);
    assert.ok(node.position.y + node.size.height <= parent.position.y + parent.size.height);
  }

  assert.deepEqual(getWorkspaceDiagramFixture("area-matrix"), fixture);
});

test("resource-stress-matrix covers long labels, fallback, optical families, and duplicate icons", () => {
  const fixture = getWorkspaceDiagramFixture("resource-stress-matrix");

  assert.ok(fixture);
  assert.equal(fixture.nodes.length, 20);
  assert.equal(fixture.nodes.filter((node) => node.label.length >= 24).length, 20);
  assert.ok(fixture.nodes.some((node) => node.label.length >= 40));
  assert.equal(fixture.nodes.find((node) => node.id === "stress-fallback-icon")?.iconUrl, undefined);
  assert.deepEqual(fixture.nodes.find((node) => node.id === "stress-resource-icon")?.size, {
    width: 28,
    height: 28
  });
  assert.ok(fixture.nodes.some((node) => node.iconUrl?.includes("Architecture-Service-Icons_")));
  assert.ok(fixture.nodes.some((node) => node.iconUrl?.includes("Resource-Icons_")));
  assert.ok(fixture.nodes.some((node) => node.iconUrl?.includes("Architecture-Group-Icons_")));

  const duplicateIcons = fixture.nodes.filter((node) => node.id.startsWith("stress-duplicate-icon-"));

  assert.equal(duplicateIcons.length, 4);
  assert.equal(new Set(duplicateIcons.map((node) => node.iconUrl)).size, 1);

  for (const [index, node] of fixture.nodes.entries()) {
    const bounds = getResourceNodeVisualBounds(node);

    for (const otherNode of fixture.nodes.slice(index + 1)) {
      assert.equal(
        doBoundsOverlap(bounds, getResourceNodeVisualBounds(otherNode)),
        false,
        `${node.id} visual footprint overlaps ${otherNode.id}`
      );
    }
  }
});

test("edge-matrix renders every path, line style, and width combination once", () => {
  const fixture = getWorkspaceDiagramFixture("edge-matrix");
  const viewState = getWorkspaceDiagramFixtureViewState("edge-matrix");

  assert.ok(fixture);

  const pathTypes = ["default", "smoothstep", "step", "straight"] as const;
  const lineStyles = ["solid", "dashed", "dotted"] as const;
  const widths = ["thin", "medium", "thick"] as const;
  const expectedCombinations = pathTypes.flatMap((pathType) =>
    lineStyles.flatMap((lineStyle) => widths.map((width) => `${pathType}/${lineStyle}/${width}`))
  );
  const actualCombinations = fixture.edges.map(
    (edge) => `${edge.type}/${edge.style?.lineStyle}/${edge.style?.width}`
  );

  assert.equal(fixture.nodes.length, 72);
  assert.equal(fixture.edges.length, 36);
  assert.deepEqual(actualCombinations, expectedCombinations);
  assert.ok(fixture.edges.every((edge) => edge.style?.animated === false));
  assert.ok(
    fixture.edges.every((edge) => {
      const source = fixture.nodes.find((node) => node.id === edge.sourceNodeId);
      const target = fixture.nodes.find((node) => node.id === edge.targetNodeId);

      return source && target && target.position.y - source.position.y === 48;
    }),
    "every path specimen must have a visible vertical delta"
  );
  assert.equal(
    new Set(
      fixture.edges.map((edge) =>
        fixture.nodes.find((node) => node.id === edge.sourceNodeId)?.position.x
      )
    ).size,
    4,
    "the four path kinds must occupy distinct comparison columns"
  );
  assert.ok(
    fixture.edges.every((edge) => fixture.nodes.some((node) => node.id === edge.sourceNodeId))
  );
  assert.ok(
    fixture.edges.every((edge) => fixture.nodes.some((node) => node.id === edge.targetNodeId))
  );
  assert.deepEqual(viewState, { selectedEdgeIds: ["edge-matrix-1"] });
  assert.deepEqual(getWorkspaceDiagramFixture("edge-matrix"), fixture);
});

test("edge-state-matrix provides deterministic default and patch-state geometry", () => {
  const fixture = getWorkspaceDiagramFixture("edge-state-matrix");
  const viewState = getWorkspaceDiagramFixtureViewState("edge-state-matrix");

  assert.ok(fixture);
  assert.deepEqual(
    fixture.edges.map((edge) => edge.id),
    ["edge-state-default", "edge-state-added", "edge-state-modified", "edge-state-deleted"]
  );
  assert.equal(fixture.edges[0]?.label, undefined);
  assert.ok((fixture.edges[2]?.label?.length ?? 0) >= 40);
  assert.deepEqual(
    fixture.edges.map((edge) => edge.style?.lineStyle),
    ["solid", "solid", "dashed", "dotted"]
  );
  assert.deepEqual(viewState?.previewDiagram, fixture);
  assert.deepEqual(viewState?.previewAnnotations, {
    nodeStates: {
      "edge-state-added-target": "added",
      "edge-state-modified-target": "modified",
      "edge-state-deleted-target": "deleted"
    },
    edgeStates: {
      "edge-state-added": "added",
      "edge-state-modified": "modified",
      "edge-state-deleted": "deleted"
    }
  });
});

test("state-matrix exposes deterministic interaction targets and persisted visual states", () => {
  const fixture = getWorkspaceDiagramFixture("state-matrix");
  const viewState = getWorkspaceDiagramFixtureViewState("state-matrix");

  assert.ok(fixture);
  assert.deepEqual(
    fixture.nodes.map((node) => node.id),
    [
      "state-area-reference-target",
      "state-area-locked",
      "state-resource-default",
      "state-resource-selection-target",
      "state-resource-dimmed-comparison",
      "state-resource-locked",
      "state-reference-source"
    ]
  );
  assert.equal(fixture.nodes.find((node) => node.id === "state-resource-locked")?.locked, true);
  assert.equal(fixture.nodes.find((node) => node.id === "state-area-locked")?.locked, true);
  assert.equal(
    fixture.nodes.find((node) => node.id === "state-area-locked")?.metadata?.parentAreaNodeId,
    "state-area-reference-target"
  );
  assert.deepEqual(
    fixture.edges.map((edge) => edge.id),
    ["state-edge-default", "state-edge-selection-target", "state-edge-explicit-animation"]
  );
  assert.equal(
    fixture.edges.find((edge) => edge.id === "state-edge-explicit-animation")?.style?.animated,
    true
  );
  for (const edge of fixture.edges.filter((candidate) => candidate.label)) {
    const source: DiagramNode | undefined = fixture.nodes.find(
      (node) => node.id === edge.sourceNodeId
    );
    const target: DiagramNode | undefined = fixture.nodes.find(
      (node) => node.id === edge.targetNodeId
    );

    assert.ok(source);
    assert.ok(target);
    assert.ok(
      getResourceNodeVisualBounds(target).x -
        (getResourceNodeVisualBounds(source).x + getResourceNodeVisualBounds(source).width) >=
        150,
      `${edge.id} must reserve a 150px clear lane for its visible label`
    );
  }
  assert.deepEqual(viewState, {
    selectedNodeIds: ["state-resource-selection-target"],
    referenceDropTargetNodeId: "state-area-reference-target"
  });
  assert.deepEqual(getWorkspaceDiagramFixture("state-matrix"), fixture);
});

test("state-default-matrix keeps the same nodes without selection-driven dimming", () => {
  const defaultFixture = getWorkspaceDiagramFixture("state-default-matrix");
  const interactiveFixture = getWorkspaceDiagramFixture("state-matrix");

  assert.ok(defaultFixture);
  assert.ok(interactiveFixture);
  assert.deepEqual(defaultFixture, interactiveFixture);
  assert.equal(getWorkspaceDiagramFixtureViewState("state-default-matrix"), undefined);
});

test("visual fixtures stay unavailable for unknown names and production", () => {
  assert.equal(getWorkspaceDiagramFixture("unknown"), undefined);
  assert.equal(getWorkspaceDiagramFixtureViewState("unknown"), undefined);

  const previousNodeEnv = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", "production");

  try {
    for (const fixtureName of [
      "conventions",
      "resource-gallery",
      "area-matrix",
      "edge-state-matrix",
      "edge-matrix",
      "resource-stress-matrix",
      "state-default-matrix",
      "state-matrix"
    ]) {
      assert.equal(getWorkspaceDiagramFixture(fixtureName), undefined);
      assert.equal(getWorkspaceDiagramFixtureViewState(fixtureName), undefined);
    }
  } finally {
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
    }
  }
});

function doBoundsOverlap(
  left: ReturnType<typeof getResourceNodeVisualBounds>,
  right: ReturnType<typeof getResourceNodeVisualBounds>
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function groupNodesByIcon(nodes: readonly DiagramNode[]): Map<string, DiagramNode[]> {
  const groups = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    if (!node.iconUrl) {
      continue;
    }

    const group = groups.get(node.iconUrl) ?? [];
    group.push(node);
    groups.set(node.iconUrl, group);
  }

  return groups;
}
