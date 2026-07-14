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
const editorTypesSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/types.ts", import.meta.url)),
  "utf8"
);
const thumbnailSource = readFileSync(
  fileURLToPath(new URL("./project-board-thumbnail.ts", import.meta.url)),
  "utf8"
);

test("successful stable server draft saves await the thumbnail lifecycle before returning", () => {
  const successBranch = managerSource.slice(
    managerSource.indexOf("if (result.ok)"),
    managerSource.indexOf("serverDirtyRef.current = true", managerSource.indexOf("if (result.ok)"))
  );

  assert.doesNotMatch(managerSource, /void captureAndUploadProjectBoardThumbnail/);
  assert.doesNotMatch(managerSource, /showServerSaveToast/);
  assert.match(
    successBranch,
    /setServerSaveState\("server-saved"\)[\s\S]*await thumbnailLifecycle\.requestSavedRevision\(result\.serverDraft\.revision\)[\s\S]*return result/
  );
});

test("server loads request initial thumbnail backfill while local and empty loads defer", () => {
  const loadBranch = managerSource.slice(
    managerSource.indexOf("const loadedDraft = await repository.load"),
    managerSource.indexOf("setLoadState(\"ready\")")
  );

  assert.match(
    loadBranch,
    /loadedDraft\.source === "server"[\s\S]*loadedDraft\.serverDraft[\s\S]*requestInitialServerRevision\(loadedDraft\.serverDraft\.revision\)/
  );
  assert.equal(loadBranch.match(/requestInitialServerRevision/g)?.length, 1);
});

test("DiagramEditor delivers the exact marked ReactFlow element from its current canvas", () => {
  const initBranch = editorSource.slice(
    editorSource.indexOf("const handleInit"),
    editorSource.indexOf("const handleNodesChange")
  );

  assert.match(editorTypesSource, /onBoardReady\?: \(\(element: HTMLElement\) => void\)/);
  assert.match(initBranch, /canvasPanelRef\.current\?\.querySelector<HTMLElement>/);
  assert.match(initBranch, /BOARD_THUMBNAIL_CAPTURE_CONTRACT\.sourceSelector/);
  assert.match(initBranch, /onBoardReady\?\.\(captureElement\)/);
  assert.match(editorSource, /data-architecture-board-capture-source="true"/);
  assert.match(managerSource, /onBoardReady=\{handleBoardReady\}/);
});

test("project Board thumbnails capture a fitted full Board instead of the current viewport crop", () => {
  assert.match(thumbnailSource, /createFullBoardCaptureClone/);
  assert.match(thumbnailSource, /getLogicalBoardBoundsFromRenderedNodes/);
  assert.match(thumbnailSource, /getFullBoardThumbnailViewport/);
  assert.match(thumbnailSource, /cloneViewport\.style\.transform/);
});

test("fitted Board clone stays capturable without appearing over the live Board", () => {
  assert.match(thumbnailSource, /const captureHost = document\.createElement\("div"\)/);
  assert.match(thumbnailSource, /captureHost\.style\.opacity = "0"/);
  assert.match(thumbnailSource, /captureHost\.append\(clone\)/);
  assert.match(thumbnailSource, /document\.body\.append\(captureHost\)/);
  assert.match(
    thumbnailSource,
    /clone\.removeAttribute\("data-architecture-board-capture-source"\)/
  );
  assert.doesNotMatch(thumbnailSource, /clone\.style\.zIndex = "2147483647"/);
});
