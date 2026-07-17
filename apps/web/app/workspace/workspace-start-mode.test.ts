import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialWorkspaceRightPanelView } from "./workspace-start-mode.js";

test("opens the independent Delivery panel from a stable workspace URL", () => {
  assert.equal(resolveInitialWorkspaceRightPanelView("delivery"), "delivery");
  assert.equal(resolveInitialWorkspaceRightPanelView("unknown"), undefined);
});
