import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dashboardRoutes = [
  "dashboard/page.tsx",
  "dashboard/projects/page.tsx",
  "dashboard/projects/[projectId]/page.tsx",
  "dashboard/projects/[projectId]/settings/page.tsx",
  "dashboard/templates/page.tsx",
  "dashboard/costs/page.tsx",
  "dashboard/settings/page.tsx"
] as const;

test("dashboard route entry points use the minimal shell", () => {
  for (const route of dashboardRoutes) {
    const source = readAppFile(route);

    assert.match(source, /RoutePlaceholder/);
    assert.doesNotMatch(source, /DesignDashboardPage|DashboardShell|designDashboard/);
  }
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}
