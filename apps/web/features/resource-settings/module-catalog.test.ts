import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "../../../../packages/types/src";
import { resourceCatalog } from "./catalog";
import { expandCuratedModuleIntoDiagram } from "./module-catalog";

test("expandCuratedModuleIntoDiagram expands curated modules into normal resource nodes", () => {
  const diagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const nextDiagram = expandCuratedModuleIntoDiagram({
    diagram,
    moduleId: "aws-network-vpc",
    resources: resourceCatalog
  });

  assert.equal(nextDiagram.nodes.length, 3);
  assert.deepEqual(
    nextDiagram.nodes.map((node) => node.parameters?.resourceType),
    ["aws_vpc", "aws_subnet", "aws_internet_gateway"]
  );
  assert.equal(nextDiagram.nodes.every((node) => node.metadata?.moduleSource?.moduleId === "aws-network-vpc"), true);
  assert.equal(nextDiagram.variables?.some((variable) => variable.name === "tags"), true);
  assert.equal(
    nextDiagram.nodes.every((node) => node.parameters?.values.tags === "var.tags"),
    true
  );
});

test("expandCuratedModuleIntoDiagram keeps resource names unique", () => {
  const diagram = expandCuratedModuleIntoDiagram({
    diagram: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    moduleId: "aws-storage-s3",
    resources: resourceCatalog
  });
  const nextDiagram = expandCuratedModuleIntoDiagram({
    diagram,
    moduleId: "aws-storage-s3",
    resources: resourceCatalog
  });

  assert.deepEqual(
    nextDiagram.nodes.map((node) => node.parameters?.resourceName),
    ["module_bucket", "module_bucket_2"]
  );
});
