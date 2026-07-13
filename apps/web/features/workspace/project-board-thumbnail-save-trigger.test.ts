import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const managerSource = readFileSync(
  fileURLToPath(new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url)),
  "utf8"
);
const editorSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

test("successful server draft saves queue a real Board DOM thumbnail capture", () => {
  const successBranch = managerSource.slice(
    managerSource.indexOf("if (result.ok)"),
    managerSource.indexOf("serverDirtyRef.current = true", managerSource.indexOf("if (result.ok)"))
  );

  assert.match(managerSource, /captureAndUploadProjectBoardThumbnail/);
  assert.match(successBranch, /captureAndUploadProjectBoardThumbnail\(\{ projectId \}\)/);
});

test("DiagramEditor marks the actual ReactFlow surface as the capture source", () => {
  assert.match(editorSource, /data-architecture-board-capture-source="true"/);
  assert.match(editorSource, /<ReactFlow/);
});
