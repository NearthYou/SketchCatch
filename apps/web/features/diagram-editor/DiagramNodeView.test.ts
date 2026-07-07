import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramNodeViewSource = readFileSync(
  fileURLToPath(new URL("./DiagramNodeView.tsx", import.meta.url)),
  "utf8"
);

test("diagram node view renders source and target handles matching edge mapper ids", () => {
  assert.match(diagramNodeViewSource, /id=\{`source-handle-\$\{handle\.side\}`\}/);
  assert.match(diagramNodeViewSource, /type="source"/);
  assert.match(diagramNodeViewSource, /id=\{`target-handle-\$\{handle\.side\}`\}/);
  assert.match(diagramNodeViewSource, /type="target"/);
  assert.match(diagramNodeViewSource, /isConnectable=\{canConnect\}/);
});
