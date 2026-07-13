import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const viewSource = readLocalFile("design-projects-view.tsx");
const routeSource = readLocalFile("../../app/dashboard/projects/page.tsx");
const routeViewSource = readLocalFile("../dashboard/dashboard-projects-route.tsx");
const projectsClientSource = readLocalFile("../../app/projects/projects-client.tsx");
const globalStyles = readLocalFile("../../app/globals.css");
const dashboardStyles = readLocalFile("../../components/dashboard/dashboard-content.css");

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

test("dashboard projects keeps one clear heading and readable project controls", () => {
  assert.match(
    routeViewSource,
    /설계한 프로젝트를 확인하고, 이어서 작업하거나 배포 상태를 관리합니다\./
  );
  assert.doesNotMatch(projectsClientSource, /Worked projects|내가 작업한 프로젝트/);
  assert.equal(projectsClientSource.match(/tone="default"/g)?.length, 2);
  assert.doesNotMatch(projectsClientSource, /tone="dashboard"/);
  assert.match(projectsClientSource, /settingsField projectDeploymentFilterField/);
  assert.match(
    dashboardStyles,
    /\.settingsField\.projectSortField\s*\{[^}]*min-width:\s*176px/s
  );
  assert.match(
    dashboardStyles,
    /\.settingsField\.projectDeploymentFilterField\s*\{[^}]*min-width:\s*120px/s
  );
  assert.match(
    dashboardStyles,
    /\.projectCardActionMenuItem \.dashboardIcon\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s
  );
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
