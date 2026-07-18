import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";

import { areDiagramsEqual, updateDiagramViewport } from "./diagram-utils";

function createDiagram(values: Record<string, unknown>): DiagramJson {
  return {
    edges: [],
    nodes: [
      {
        id: "bucket",
        kind: "resource",
        label: "Bucket",
        locked: false,
        parameters: {
          fileName: "main.tf",
          resourceName: "bucket",
          resourceType: "aws_s3_bucket",
          values
        },
        position: { x: 40, y: 80 },
        size: { height: 96, width: 168 },
        type: "aws_s3_bucket",
        zIndex: 1
      }
    ],
    viewport: { x: 12, y: 24, zoom: 1 }
  };
}

test("Diagram equality is structural and ignores object key insertion order", () => {
  const first = createDiagram({ enabled: true, forceDestroy: false });
  const second = createDiagram({ forceDestroy: false, enabled: true });

  assert.equal(areDiagramsEqual(first, second), true);
});

test("an unchanged viewport preserves the Diagram reference", () => {
  const diagram = createDiagram({ enabled: true });

  assert.equal(updateDiagramViewport(diagram, { ...diagram.viewport }), diagram);
  assert.notEqual(updateDiagramViewport(diagram, { ...diagram.viewport, zoom: 1.2 }), diagram);
});
