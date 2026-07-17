import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseCostEstimatePeriod,
  parseCostDashboardTab,
  writeCostEstimatePeriod,
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

test("estimate period round-trips supported values and omits the monthly default", () => {
  assert.equal(parseCostEstimatePeriod(new URLSearchParams("period=day")), "day");
  assert.equal(parseCostEstimatePeriod(new URLSearchParams("period=week")), "week");
  assert.equal(parseCostEstimatePeriod(new URLSearchParams("period=invalid")), "month");

  const weekly = writeCostEstimatePeriod(new URLSearchParams("tab=usage"), "week");
  const monthly = writeCostEstimatePeriod(weekly, "month");

  assert.equal(weekly.get("period"), "week");
  assert.equal(weekly.get("tab"), "usage");
  assert.equal(monthly.has("period"), false);
});
