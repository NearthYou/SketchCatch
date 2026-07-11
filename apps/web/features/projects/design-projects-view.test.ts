import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const viewSource = readLocalFile("design-projects-view.tsx");
const routeSource = readLocalFile("../../app/dashboard/projects/page.tsx");
const routeViewSource = readLocalFile("../dashboard/dashboard-projects-route.tsx");
const projectsClientSource = readLocalFile("../../app/projects/projects-client.tsx");
const globalStyles = readLocalFile("../../app/globals.css");

test("dashboard projects route loads projects owned by the authenticated user", () => {
  assert.match(routeSource, /DashboardProjectsRoute/);
  assert.match(routeViewSource, /ProjectsClient/);
  assert.match(projectsClientSource, /listProjects\(\)/);
  assert.match(routeViewSource, /searchQuery/);
  assert.match(viewSource, /filterProjectsByName/);
  assert.match(viewSource, /sortProjectsByMode/);
  assert.match(viewSource, /getWorkspaceHref\(project\)/);
  assert.doesNotMatch(viewSource, /Commerce API Launch|Ops Recovery Scan|Team Git Handoff/);
});

test("live project inventory includes loading, error, empty, and search-empty states", () => {
  assert.match(viewSource, /프로젝트를 불러오는 중입니다/);
  assert.match(viewSource, /프로젝트 목록을 불러오지 못했습니다/);
  assert.match(viewSource, /아직 생성한 프로젝트가 없습니다/);
  assert.match(viewSource, /일치하는 프로젝트가 없습니다/);
  assert.match(viewSource, /다시 불러오기/);
  assert.match(viewSource, /새 설계 시작/);
  assert.match(viewSource, /value="recent_work">최근 작업 순/);
  assert.match(viewSource, /value="recent_created">생성 순/);
});

test("live project inventory follows the dashboard responsive surface", () => {
  assert.match(globalStyles, /\.designProjectsView \.designDashboardPanel\s*{/);
  assert.match(globalStyles, /\.designDashboardProjectRow\.designProjectsRow\s*{/);
  assert.match(
    globalStyles,
    /@media \(max-width: 720px\)[\s\S]*\.designDashboardProjectRow\.designProjectsRow\s*{[^}]*grid-template-columns:\s*1fr/
  );
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
