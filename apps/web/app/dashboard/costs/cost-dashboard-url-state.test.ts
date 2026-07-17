import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseCostEstimatePeriod,
  parseCostUsageConnectionId,
  parseCostUsageProjectKey,
  parseCostUsageRange,
  parseExpectedUserCount,
  parseCostDashboardTab,
  writeCostEstimatePeriod,
  writeCostUsageConnectionId,
  writeCostUsageProjectKey,
  writeCostUsageRange,
  writeExpectedUserCount,
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

test("expected user count stores only normalized committed values", () => {
  assert.equal(parseExpectedUserCount(new URLSearchParams("users=1")), 1);
  assert.equal(parseExpectedUserCount(new URLSearchParams("users=1000000")), 1_000_000);
  assert.equal(parseExpectedUserCount(new URLSearchParams("users=invalid")), 1000);
  assert.equal(parseExpectedUserCount(new URLSearchParams("users=0")), 1000);

  const custom = writeExpectedUserCount(new URLSearchParams("period=week"), 2500);
  const defaultUsers = writeExpectedUserCount(custom, 1000);

  assert.equal(custom.get("users"), "2500");
  assert.equal(custom.get("period"), "week");
  assert.equal(defaultUsers.has("users"), false);
});

test("AWS connection selection round-trips without dropping other filters", () => {
  assert.equal(
    parseCostUsageConnectionId(new URLSearchParams("connection=connection%3Aseoul")),
    "connection:seoul"
  );
  assert.equal(parseCostUsageConnectionId(new URLSearchParams()), "");

  const selected = writeCostUsageConnectionId(
    new URLSearchParams("tab=usage&range=7d"),
    "connection:seoul"
  );
  const cleared = writeCostUsageConnectionId(selected, "");

  assert.equal(selected.get("connection"), "connection:seoul");
  assert.equal(selected.get("tab"), "usage");
  assert.equal(selected.get("range"), "7d");
  assert.equal(cleared.has("connection"), false);
});

test("usage project keys are encoded, restored, and omitted for all projects", () => {
  const projectKey = "project-id:alpha/beta";
  const selected = writeCostUsageProjectKey(new URLSearchParams("tab=usage"), projectKey);
  const allProjects = writeCostUsageProjectKey(selected, "all-projects");

  assert.equal(parseCostUsageProjectKey(selected), projectKey);
  assert.match(selected.toString(), /project=project-id%3Aalpha%2Fbeta/);
  assert.equal(selected.get("tab"), "usage");
  assert.equal(parseCostUsageProjectKey(new URLSearchParams()), "all-projects");
  assert.equal(allProjects.has("project"), false);
});

test("usage range restores supported values and omits the 30 day default", () => {
  assert.equal(parseCostUsageRange(new URLSearchParams("range=7d")), "7d");
  assert.equal(
    parseCostUsageRange(new URLSearchParams("range=month_to_date")),
    "month_to_date"
  );
  assert.equal(parseCostUsageRange(new URLSearchParams("range=invalid")), "30d");

  const sevenDays = writeCostUsageRange(new URLSearchParams("tab=usage"), "7d");
  const thirtyDays = writeCostUsageRange(sevenDays, "30d");

  assert.equal(sevenDays.get("range"), "7d");
  assert.equal(sevenDays.get("tab"), "usage");
  assert.equal(thirtyDays.has("range"), false);
});
