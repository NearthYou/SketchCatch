import assert from "node:assert/strict";
import { test } from "node:test";
import { getResourceCardKeyboardActivation } from "./resource-card-interaction";

test("getResourceCardKeyboardActivation maps Enter to settings entry", () => {
  assert.equal(getResourceCardKeyboardActivation("Enter"), "open-settings");
});

test("getResourceCardKeyboardActivation maps Space to selection without viewport focus", () => {
  assert.equal(getResourceCardKeyboardActivation(" "), "select-only");
  assert.equal(getResourceCardKeyboardActivation("Spacebar"), "select-only");
});

test("getResourceCardKeyboardActivation ignores unrelated keys", () => {
  assert.equal(getResourceCardKeyboardActivation("ArrowDown"), "ignore");
  assert.equal(getResourceCardKeyboardActivation("Escape"), "ignore");
});
