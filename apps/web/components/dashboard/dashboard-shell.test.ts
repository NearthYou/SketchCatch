import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardShellSource = readFileSync(join(currentDir, "dashboard-shell.tsx"), "utf8");

test("dashboard topbar hides global actions on the requested dashboard pages", () => {
  assert.match(dashboardShellSource, /shouldShowCreateAction/);
  assert.match(dashboardShellSource, /pathname !== "\/projects"/);
  assert.match(dashboardShellSource, /pathname !== "\/templates"/);
  assert.match(dashboardShellSource, /pathname !== "\/costs"/);
  assert.match(dashboardShellSource, /pathname !== "\/settings"/);
  assert.match(dashboardShellSource, /shouldShowCreateAction\s*\?\s*\(/);
});

test("dashboard topbar no longer renders the global notification button", () => {
  assert.doesNotMatch(dashboardShellSource, /DashboardIcon name="bell"/);
  assert.doesNotMatch(dashboardShellSource, /title="알림"/);
  assert.doesNotMatch(dashboardShellSource, /dashboardIconButton/);
});
