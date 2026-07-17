import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseCostDashboardTab,
  writeCostDashboardTab
} from "./cost-dashboard-url-state";

test("cost tab parsing restores only supported URL values", () => {
  assert.equal(parseCostDashboardTab(new URLSearchParams("tab=usage")), "usage");
  assert.equal(parseCostDashboardTab(new URLSearchParams("tab=estimate")), "estimate");
  assert.equal(parseCostDashboardTab(new URLSearchParams("tab=unknown")), "estimate");
  assert.equal(parseCostDashboardTab(new URLSearchParams()), "estimate");
});

test("cost tab serialization omits the default and preserves unrelated parameters", () => {
  const usage = writeCostDashboardTab(new URLSearchParams("source=notification"), "usage");
  const estimate = writeCostDashboardTab(usage, "estimate");

  assert.equal(usage.get("tab"), "usage");
  assert.equal(usage.get("source"), "notification");
  assert.equal(estimate.has("tab"), false);
  assert.equal(estimate.get("source"), "notification");
});
