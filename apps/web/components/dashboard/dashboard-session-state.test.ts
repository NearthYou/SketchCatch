import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowDashboardSessionState } from "./dashboard-session-state";

test("Dashboard only replaces its shell before any authenticated user is available", () => {
  assert.equal(shouldShowDashboardSessionState("loading", false), true);
  assert.equal(shouldShowDashboardSessionState("unauthenticated", false), true);
  assert.equal(shouldShowDashboardSessionState("authenticated", true), false);
  assert.equal(shouldShowDashboardSessionState("loading", true), false);
});
