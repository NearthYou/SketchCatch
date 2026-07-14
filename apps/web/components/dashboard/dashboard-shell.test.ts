import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardShellSource = readFileSync(join(currentDir, "dashboard-shell.tsx"), "utf8");

test("dashboard topbar hides global actions on the requested dashboard pages", () => {
  assert.match(dashboardShellSource, /shouldShowCreateAction/);
  assert.match(
    dashboardShellSource,
    /const shouldShowCreateAction =\s*pathname === "\/dashboard" \|\| pathname === "\/dashboard\/projects";/
  );
  assert.match(dashboardShellSource, /shouldShowCreateAction\s*\?\s*\(/);
});

test("dashboard topbar no longer renders the global notification button", () => {
  assert.doesNotMatch(dashboardShellSource, /DashboardIcon name="bell"/);
  assert.doesNotMatch(dashboardShellSource, /title="알림"/);
  assert.doesNotMatch(dashboardShellSource, /dashboardIconButton/);
});

test("dashboard topbar only renders the localized page title", () => {
  assert.doesNotMatch(dashboardShellSource, /<span>Dashboard<\/span>/);
  assert.match(dashboardShellSource, /<strong>\{pageTitle\}<\/strong>/);
});
