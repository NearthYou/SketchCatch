import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import {
  validateArchitectureBoardCompilerEvidenceSources
} from "./architecture-board-compiler-evidence-validation";

test("evidence source validation은 node geometry, Area, edge endpoint, viewport 이상을 template별로 분리해 기록한다", () => {
  const malformedDiagram = {
    nodes: [
      {
        id: "missing-geometry",
        position: undefined,
        size: undefined
      },
      {
        id: "invalid-geometry",
        kind: "resource",
        type: "aws_vpc",
        position: { x: Number.NaN, y: 10 },
        size: { width: 0, height: Number.POSITIVE_INFINITY }
      }
    ],
    edges: [
      { id: "missing-endpoint", sourceNodeId: "missing-geometry", targetNodeId: "" },
      { id: "dangling-endpoint", sourceNodeId: "missing-geometry", targetNodeId: "absent" },
      { id: "duplicate-edge", sourceNodeId: "missing-geometry", targetNodeId: "invalid-geometry" },
      { id: "duplicate-edge", sourceNodeId: "missing-geometry", targetNodeId: "invalid-geometry" }
    ],
    viewport: { x: 0, y: Number.NaN, zoom: 0 }
  } as unknown as DiagramJson;

  const validation = validateArchitectureBoardCompilerEvidenceSources({
    availableTemplates: [
      {
        id: "repository:malformed",
        title: "Malformed",
        source: "repository",
        sourceDiagram: malformedDiagram
      }
    ],
    unavailableTemplates: [
      {
        id: "brainboard:unavailable",
        title: "Unavailable",
        source: "brainboard",
        reason: "capture unavailable"
      }
    ]
  });

  assert.deepEqual(validation.summary, {
    sourceEvidenceCount: 2,
    availableTemplateCount: 1,
    unavailableTemplateCount: 1,
    validAvailableTemplateCount: 0,
    invalidAvailableTemplateCount: 1,
    findingCounts: {
      "node.missing_geometry": 1,
      "node.invalid_geometry": 1,
      "area.missing_geometry": 0,
      "area.invalid_geometry": 1,
      "edge.missing_endpoint": 1,
      "edge.dangling_endpoint": 1,
      "edge.duplicate_id": 1,
      "viewport.missing": 0,
      "viewport.invalid": 1
    }
  });
  assert.deepEqual(validation.templates[0]?.findings.map((finding) => finding.code), [
    "node.missing_geometry",
    "node.invalid_geometry",
    "area.invalid_geometry",
    "edge.missing_endpoint",
    "edge.dangling_endpoint",
    "edge.duplicate_id",
    "viewport.invalid"
  ]);
  assert.deepEqual(validation.unavailableTemplates, [
    {
      id: "brainboard:unavailable",
      source: "brainboard",
      title: "Unavailable",
      reason: "capture unavailable"
    }
  ]);
});
