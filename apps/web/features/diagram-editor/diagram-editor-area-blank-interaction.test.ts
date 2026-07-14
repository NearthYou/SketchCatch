import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

test("DiagramEditor resolves Area blank interaction from pointer coordinates", () => {
  assert.match(source, /findAreaBlankInteractionNodeAtPoint/);
  assert.match(source, /const getAreaNodeFromPointerEvent = useCallback/);
  assert.doesNotMatch(source, /isAreaBlankInteractionNode/);
});

test("DiagramEditor pane clicks select an eligible Area or clear outside every Area", () => {
  const handlePaneClickSource = source.match(
    /const handlePaneClick = useCallback\([\s\S]*?\n {2}\);/
  )?.[0];

  assert.ok(handlePaneClickSource);
  assert.match(handlePaneClickSource, /screenToFlowPosition/);
  assert.match(handlePaneClickSource, /findAreaBlankInteractionNodeAtPoint/);
  assert.match(handlePaneClickSource, /setSelectedNodeIds\(areaNode \? \[areaNode\.id\] : \[\]\)/);
});
