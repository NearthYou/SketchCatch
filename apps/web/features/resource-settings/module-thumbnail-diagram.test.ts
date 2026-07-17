import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { DiagramJson } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { EMPTY_DIAGRAM } from "../diagram-editor/constants";
import { getBoardThumbnailPersistentLabelScale } from "../workspace/project-board-thumbnail-viewbox";
import { curatedModules, materializeCuratedModulePattern } from "./module-catalog";
import {
  createModuleThumbnailDiagram,
  serializeModuleThumbnailDiagram
} from "./module-thumbnail-diagram";

const FIXED_EXPANDED_AT = "2000-01-01T00:00:00.000Z";
const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(currentDir, "../../app/dev/module-thumbnail/page.tsx"), "utf8");
const captureClientSource = readFileSync(
  join(currentDir, "../../app/dev/module-thumbnail/module-thumbnail-capture-client.tsx"),
  "utf8"
);
const stylesSource = readFileSync(
  join(currentDir, "../../app/dev/module-thumbnail/module-thumbnail.module.css"),
  "utf8"
);
const projectBoardThumbnailSource = readFileSync(
  join(currentDir, "../workspace/project-board-thumbnail.ts"),
  "utf8"
);
const diagramNodeViewSource = readFileSync(
  join(currentDir, "../diagram-editor/DiagramNodeView.tsx"),
  "utf8"
);

test("Module thumbnail diagrams are deterministic and materialize every source node, Area, and edge", () => {
  for (const pattern of curatedModules) {
    const first = createModuleThumbnailDiagram(pattern.id);
    const second = createModuleThumbnailDiagram(pattern.id);

    if (!first) {
      assert.fail(`${pattern.id} should materialize`);
    }
    const expected = materializeCuratedModulePattern({
      diagram: structuredClone(EMPTY_DIAGRAM),
      expandedAt: FIXED_EXPANDED_AT,
      pattern
    });

    assert.deepEqual(first, second, `${pattern.id} should be deterministic`);
    assert.deepEqual(first, expected, `${pattern.id} should match empty-Board materialization`);
    assert.equal(first.nodes.length, pattern.nodes.length, `${pattern.id} node count`);
    assert.equal(first.edges.length, pattern.edges.length, `${pattern.id} edge count`);

    const materializedNodeIds = new Map(
      pattern.nodes.map((sourceNode, index) => [sourceNode.id, first.nodes[index]!.id])
    );

    for (const [index, sourceNode] of pattern.nodes.entries()) {
      const materializedNode: DiagramJson["nodes"][number] = first.nodes[index]!;
      assert.equal(
        materializedNode.metadata?.moduleSource?.expandedAt,
        FIXED_EXPANDED_AT,
        `${pattern.id}/${sourceNode.id} expandedAt`
      );
      assert.equal(
        materializedNode.metadata?.moduleSource?.moduleId,
        pattern.id,
        `${pattern.id}/${sourceNode.id} module source`
      );
      assert.equal(
        isAreaNode(materializedNode),
        isAreaNode(sourceNode as unknown as DiagramJson["nodes"][number]),
        `${pattern.id}/${sourceNode.id} Area materialization`
      );
    }

    for (const [index, sourceEdge] of pattern.edges.entries()) {
      const materializedEdge: DiagramJson["edges"][number] = first.edges[index]!;
      assert.equal(
        materializedEdge.sourceNodeId,
        materializedNodeIds.get(sourceEdge.sourceNodeId),
        `${pattern.id}/${sourceEdge.id} source`
      );
      assert.equal(
        materializedEdge.targetNodeId,
        materializedNodeIds.get(sourceEdge.targetNodeId),
        `${pattern.id}/${sourceEdge.id} target`
      );
    }
  }
});

test("Module thumbnail diagrams return null for an unknown Module", () => {
  assert.equal(createModuleThumbnailDiagram("unknown-module"), null);
});

test("Module thumbnail serialization sorts nested object keys without reordering arrays", () => {
  const first = {
    viewport: { zoom: 1, y: 0, x: 0 },
    edges: [],
    nodes: [
      {
        zeta: "last",
        alpha: { beta: 2, alpha: 1 },
        array: [{ second: 2, first: 1 }, "kept-second"]
      }
    ]
  } as unknown as DiagramJson;
  const second = {
    nodes: [
      {
        array: [{ first: 1, second: 2 }, "kept-second"],
        alpha: { alpha: 1, beta: 2 },
        zeta: "last"
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  } as unknown as DiagramJson;

  const serialized = serializeModuleThumbnailDiagram(first);

  assert.equal(serialized, serializeModuleThumbnailDiagram(second));
  assert.equal(
    serialized,
    '{"edges":[],"nodes":[{"alpha":{"alpha":1,"beta":2},"array":[{"first":1,"second":2},"kept-second"],"zeta":"last"}],"viewport":{"x":0,"y":0,"zoom":1}}'
  );
});

test("Module thumbnail serialization orders non-ASCII object keys by UTF-16 code unit", () => {
  const diagram = {
    viewport: { x: 0, y: 0, zoom: 1 },
    edges: [],
    nodes: [{ ä: "umlaut", z: "ascii" }]
  } as unknown as DiagramJson;

  assert.equal(
    serializeModuleThumbnailDiagram(diagram),
    '{"edges":[],"nodes":[{"z":"ascii","ä":"umlaut"}],"viewport":{"x":0,"y":0,"zoom":1}}'
  );
});

test("Module thumbnail route is dev-only and rejects an invalid Module", () => {
  assert.match(pageSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(pageSource, /notFound\(\)/);
  assert.match(pageSource, /createModuleThumbnailDiagram\(moduleId\)/);
  assert.match(pageSource, /if \(!diagram\)\s*\{\s*notFound\(\);\s*\}/s);
  assert.match(pageSource, /if \(Array\.isArray\(value\)\) return undefined;/);
});

test("Module thumbnail capture stages the real viewer and exposes a 1280 by 720 WebP data image", () => {
  assert.match(captureClientSource, /captureActualBoardElement/);
  assert.match(captureClientSource, /document\.fonts\.ready/);
  assert.match(captureClientSource, /querySelectorAll<HTMLImageElement>\("img"\)/);
  assert.match(captureClientSource, /requestAnimationFrame/);
  assert.match(captureClientSource, /mode="viewer"/);
  assert.match(captureClientSource, /initialDiagram=\{diagram\}/);
  assert.match(captureClientSource, /initialPreviewDiagram=\{diagram\}/);
  assert.match(captureClientSource, /rightPanel=\{null\}/);
  assert.match(captureClientSource, /showSaveAction=\{false\}/);
  assert.match(captureClientSource, /data-module-thumbnail-ready="true"/);
  assert.match(captureClientSource, /data-module-thumbnail-error="true"/);
  assert.match(captureClientSource, /captureBoard\(element\).*\.catch\(/s);
  assert.match(captureClientSource, /Module thumbnail capture failed\./);
  assert.match(captureClientSource, /const THUMBNAIL_WIDTH = 1280/);
  assert.match(captureClientSource, /const THUMBNAIL_HEIGHT = 720/);
  assert.match(captureClientSource, /width=\{THUMBNAIL_WIDTH\}/);
  assert.match(captureClientSource, /height=\{THUMBNAIL_HEIGHT\}/);
  assert.match(captureClientSource, /readAsDataURL/);
  assert.match(captureClientSource, /data:image\/webp;base64,/);
  assert.match(stylesSource, /width:\s*1280px/);
  assert.match(stylesSource, /height:\s*720px/);
});

test("Module thumbnail capture keeps resource labels readable at its fitted clone zoom", () => {
  assert.equal(getBoardThumbnailPersistentLabelScale(0.1), 7.5);
  assert.equal(getBoardThumbnailPersistentLabelScale(0.5), 1.5);
  assert.equal(getBoardThumbnailPersistentLabelScale(0.75), 1);
  assert.equal(getBoardThumbnailPersistentLabelScale(1), 1);
  assert.match(
    captureClientSource,
    /captureActualBoardElement\(element,\s*\{\s*preserveLowZoomLabels:\s*true\s*\}\)/s
  );
  assert.match(
    projectBoardThumbnailSource,
    /querySelectorAll<HTMLElement>\(\s*BOARD_THUMBNAIL_PERSISTENT_LABEL_SELECTOR\s*\)/s
  );
  assert.match(
    projectBoardThumbnailSource,
    /clone\.style\.setProperty\(\s*"--board-lod-label-scale",\s*String\(labelScale\)\s*\)/s
  );
  assert.match(diagramNodeViewSource, /data-board-thumbnail-persistent-label="true"/);
});
