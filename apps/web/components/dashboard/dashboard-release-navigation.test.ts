import { test } from "node:test";
import assert from "node:assert/strict";
import * as dashboardShell from "./dashboard-shell.js";

type DashboardNavigationItem = {
  readonly href: string;
  readonly label: string;
};

test("release dashboard navigation exposes only active product destinations", () => {
  const getDashboardNavigationItems = (
    dashboardShell as typeof dashboardShell & {
      getDashboardNavigationItems?: () => readonly DashboardNavigationItem[];
    }
  ).getDashboardNavigationItems;

  assert.equal(typeof getDashboardNavigationItems, "function");
  if (!getDashboardNavigationItems) return;

  assert.deepEqual(getDashboardNavigationItems(), [
    { href: "/dashboard", label: "작업 현황" },
    { href: "/dashboard/projects", label: "내 프로젝트" },
    { href: "/dashboard/settings", label: "설정" }
  ]);
});
