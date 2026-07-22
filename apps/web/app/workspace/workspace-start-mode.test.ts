import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialWorkspaceRightPanelView } from "./workspace-start-mode.js";

test("opens Delivery in the deployment modal from a stable workspace URL", () => {
  assert.equal(resolveInitialWorkspaceRightPanelView("delivery"), "deployment");
  assert.equal(resolveInitialWorkspaceRightPanelView("unknown"), undefined);
});
