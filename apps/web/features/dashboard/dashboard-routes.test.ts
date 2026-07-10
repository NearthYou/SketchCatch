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

test("dashboard routes remain available without the old dashboard presentation", () => {
  for (const route of dashboardRoutes) {
    const source = readAppFile(route);

    assert.equal(existsSync(fileURLToPath(new URL(route, appRoot))), true);
    assert.match(source, /RoutePlaceholder|SettingsIntegrationsClient/);
    assert.doesNotMatch(source, /designDashboard|DashboardShell|DesignDashboardPage/);
  }
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, appRoot)), "utf8");
}
