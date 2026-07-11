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
const dashboardShellStyles = readLocalFile("../../components/dashboard/dashboard-shell.css");

test("dashboard route entry points no longer use the removed presentation or placeholders", () => {
  for (const route of dashboardRoutes) {
    const source = readAppFile(route);

    assert.doesNotMatch(source, /RoutePlaceholder|DesignDashboardPage|designDashboard/);
  }
});

test("mobile dashboard menu open state overrides the hidden sidebar transform", () => {
  assert.match(
    dashboardShellStyles,
    /\.dashboardSidebar\.dashboardSidebarOpen\s*\{\s*transform:\s*translateX\(0\)/
  );
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}

function readLocalFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}
