import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultResourceWorkspaceView,
  getVisibleResourceWorkspaceView
} from "./resource-workspace-view";

test("defaultResourceWorkspaceView starts the resource workspace on the list", () => {
  assert.equal(defaultResourceWorkspaceView, "list");
});

test("getVisibleResourceWorkspaceView shows the list when no node is selected", () => {
  assert.equal(getVisibleResourceWorkspaceView("settings", null), "list");
  assert.equal(getVisibleResourceWorkspaceView("list", null), "list");
});

test("getVisibleResourceWorkspaceView keeps the requested view when a node is selected", () => {
  assert.equal(getVisibleResourceWorkspaceView("settings", "node-1"), "settings");
  assert.equal(getVisibleResourceWorkspaceView("list", "node-1"), "list");
});
