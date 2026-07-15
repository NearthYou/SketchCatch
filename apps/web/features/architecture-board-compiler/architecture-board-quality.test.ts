import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { createBoardAutoOrganizeProposal } from ".";

test("failure reference의 과도한 canvas와 겹침을 재현한 fixture를 자동 정리한다", () => {
  const currentDiagram: DiagramJson = {
    nodes: [
      resourceNode("entry", "aws_lb", 9_000, 8_000),
      resourceNode("compute", "aws_instance", 9_000, 8_000),
      resourceNode("database", "aws_db_instance", 18_000, 16_000),
      resourceNode("logs", "aws_cloudwatch_log_group", 27_000, 24_000)
    ],
    edges: [
      { id: "entry-compute", sourceNodeId: "entry", targetNodeId: "compute", label: "routes" },
      { id: "compute-database", sourceNodeId: "compute", targetNodeId: "database", label: "reads" },
      { id: "compute-logs", sourceNodeId: "compute", targetNodeId: "logs", label: "logs" }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const proposal = createBoardAutoOrganizeProposal(currentDiagram);

  assert.ok(proposal.quality.after.score < proposal.quality.before.score);
  assert.ok(
    proposal.quality.after.metrics["canvasArea"]! < proposal.quality.before.metrics["canvasArea"]!
  );
  assert.ok(proposal.changes.some(({ kind }) => kind === "geometry"));
});

function resourceNode(id: string, resourceType: string, x: number, y: number): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: {
      fileName: "main.tf",
      resourceName: id,
      resourceType,
      terraformBlockType: "resource",
      values: {}
    },
    position: { x, y },
    size: { width: 168, height: 96 },
    type: resourceType,
    zIndex: 1
  };
}
