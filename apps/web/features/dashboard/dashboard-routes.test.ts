import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = new URL("../../app/", import.meta.url);
const dashboardRoutes = [
  "dashboard/page.tsx",
  "dashboard/projects/page.tsx",
  "dashboard/projects/[projectId]/page.tsx",
  "dashboard/projects/[projectId]/settings/page.tsx",
  "dashboard/templates/page.tsx",
  "dashboard/costs/page.tsx",
  "dashboard/settings/page.tsx"
] as const;
const dashboardLayoutSource = readAppFile("dashboard/layout.tsx");

test("dashboard routes use the rebuilt shell without temporary placeholders", () => {
  assert.match(dashboardLayoutSource, /DashboardShell/);

  for (const route of dashboardRoutes) {
    const source = readAppFile(route);

    assert.equal(existsSync(fileURLToPath(new URL(route, appRoot))), true);
    assert.doesNotMatch(source, /RoutePlaceholder/);
  }
});

test("dashboard route entry points keep every rebuilt product surface active", () => {
  assert.match(readAppFile("dashboard/page.tsx"), /DashboardOverview/);
  assert.match(readAppFile("dashboard/projects/page.tsx"), /DashboardProjectsRoute/);
  assert.match(readAppFile("dashboard/templates/page.tsx"), /BuiltInTemplateLibrary/);
  assert.match(readAppFile("dashboard/projects/[projectId]/page.tsx"), /ProjectDetailClient/);
  assert.match(
    readAppFile("dashboard/projects/[projectId]/settings/page.tsx"),
    /ProjectGitHubSettingsClient/
  );
  assert.match(readAppFile("dashboard/costs/page.tsx"), /CostDashboardClient/);
  assert.match(readAppFile("dashboard/settings/page.tsx"), /SettingsDashboardClient/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, appRoot)), "utf8");
}
