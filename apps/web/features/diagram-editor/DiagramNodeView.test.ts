import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramNodeViewSource = readFileSync(
  fileURLToPath(new URL("./DiagramNodeView.tsx", import.meta.url)),
  "utf8"
);

test("diagram node view renders source and target handles matching edge mapper ids", () => {
  assert.match(diagramNodeViewSource, /id=\{`source-\$\{handle\.id\}`\}/);
  assert.match(diagramNodeViewSource, /type="source"/);
  assert.match(diagramNodeViewSource, /id=\{`target-\$\{handle\.id\}`\}/);
  assert.match(diagramNodeViewSource, /type="target"/);
  assert.match(diagramNodeViewSource, /isConnectable=\{canConnect\}/);
});

test("diagram node view renders icon design nodes with resource icon tile layout", () => {
  assert.match(
    diagramNodeViewSource,
    /usesIconTileLayout = isResourceNode \|\| \(node\.kind === "design" && !isArea && Boolean\(node\.iconUrl\)\)/
  );
  assert.match(
    diagramNodeViewSource,
    /usesIconTileLayout \? styles\.nodeShellResource : styles\.nodeShellDesign/
  );
  assert.match(diagramNodeViewSource, /\) : usesIconTileLayout \? \(/);
  assert.match(
    diagramNodeViewSource,
    /resizeMode: usesIconTileLayout && !isArea \? "square" : "free"/
  );
});
