import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import { extractArchitectureBoardKnowledgeCase } from "./architecture-board-knowledge-metrics";

test("knowledge extractor는 metadata flag 없이도 Board Area를 계산한다", () => {
  const diagram: DiagramJson = {
    nodes: [
      node("vpc", "aws_vpc"),
      node("subnet", "aws_subnet", "vpc"),
      node("security-group", "aws_security_group", "subnet")
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const knowledgeCase = extractArchitectureBoardKnowledgeCase("area-fixture", diagram);

  assert.equal(knowledgeCase.areaCount, 3);
  assert.equal(knowledgeCase.parentedNodeCount, 2);
});

function node(id: string, resourceType: string, parentAreaNodeId?: string): DiagramJson["nodes"][number] {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 96 },
    type: resourceType,
    zIndex: 1,
    parameters: {
      fileName: "main.tf",
      resourceName: id,
      resourceType,
      terraformBlockType: "resource",
      values: {}
    },
    ...(parentAreaNodeId === undefined ? {} : { metadata: { parentAreaNodeId } })
  };
}
