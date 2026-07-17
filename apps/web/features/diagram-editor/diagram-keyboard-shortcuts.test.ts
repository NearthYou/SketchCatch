import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDiagramCopyShortcut } from "./diagram-keyboard-shortcuts";

test("keeps native copy when text and diagram nodes are both selected", () => {
  assert.equal(
    resolveDiagramCopyShortcut({
      key: "c",
      ctrlKey: true,
      metaKey: false,
      selectedNodeCount: 1,
      selectedText: "Workspace text"
    }),
    "native"
  );
});

test("copies selected diagram nodes when no text is selected", () => {
  assert.equal(
    resolveDiagramCopyShortcut({
      key: "c",
      ctrlKey: true,
      metaKey: false,
      selectedNodeCount: 1,
      selectedText: ""
    }),
    "copy_nodes"
  );
});

test("keeps native copy when neither text nor diagram nodes are selected", () => {
  assert.equal(
    resolveDiagramCopyShortcut({
      key: "c",
      ctrlKey: true,
      metaKey: false,
      selectedNodeCount: 0,
      selectedText: ""
    }),
    "native"
  );
});

test("ignores keys that are not a copy shortcut", () => {
  assert.equal(
    resolveDiagramCopyShortcut({
      key: "c",
      ctrlKey: false,
      metaKey: false,
      selectedNodeCount: 1,
      selectedText: ""
    }),
    "ignore"
  );
  assert.equal(
    resolveDiagramCopyShortcut({
      key: "v",
      ctrlKey: true,
      metaKey: false,
      selectedNodeCount: 1,
      selectedText: ""
    }),
    "ignore"
  );
});

test("treats Ctrl+C and Meta+C as the same copy shortcut", () => {
  const commonInput = {
    key: "C",
    selectedNodeCount: 1,
    selectedText: ""
  };

  assert.equal(
    resolveDiagramCopyShortcut({ ...commonInput, ctrlKey: true, metaKey: false }),
    "copy_nodes"
  );
  assert.equal(
    resolveDiagramCopyShortcut({ ...commonInput, ctrlKey: false, metaKey: true }),
    "copy_nodes"
  );
});
