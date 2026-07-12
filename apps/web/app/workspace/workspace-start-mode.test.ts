import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveInitialWorkspaceRightPanelView } from "./workspace-start-mode";

test("resolveInitialWorkspaceRightPanelView never opens non-architecture modes in the right panel", () => {
  assert.equal(resolveInitialWorkspaceRightPanelView("reverse"), undefined);
  assert.equal(resolveInitialWorkspaceRightPanelView("ai"), undefined);
  assert.equal(resolveInitialWorkspaceRightPanelView("deployment"), undefined);
  assert.equal(resolveInitialWorkspaceRightPanelView("blank"), undefined);
  assert.equal(resolveInitialWorkspaceRightPanelView(undefined), undefined);
});
