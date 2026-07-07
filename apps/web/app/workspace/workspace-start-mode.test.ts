import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveInitialWorkspaceRightPanelView } from "./workspace-start-mode";

test("resolveInitialWorkspaceRightPanelView opens Reverse panel only for reverse start mode", () => {
  assert.equal(resolveInitialWorkspaceRightPanelView("reverse"), "reverse");
  assert.equal(resolveInitialWorkspaceRightPanelView("ai"), undefined);
  assert.equal(resolveInitialWorkspaceRightPanelView("blank"), undefined);
  assert.equal(resolveInitialWorkspaceRightPanelView(undefined), undefined);
});
