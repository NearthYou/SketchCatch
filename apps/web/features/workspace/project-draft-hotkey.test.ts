import assert from "node:assert/strict";
import { test } from "node:test";
import { isProjectDraftSaveShortcut } from "./project-draft-hotkey";

test("Ctrl+S and Command+S are project draft save shortcuts", () => {
  assert.equal(isProjectDraftSaveShortcut({ key: "s", ctrlKey: true, metaKey: false }), true);
  assert.equal(isProjectDraftSaveShortcut({ key: "S", ctrlKey: false, metaKey: true }), true);
  assert.equal(isProjectDraftSaveShortcut({ key: "s", ctrlKey: false, metaKey: false }), false);
});
