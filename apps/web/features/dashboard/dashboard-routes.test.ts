import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = new URL("../../app/", import.meta.url);
const featureRoot = new URL("./", import.meta.url);
const dashboardShellSource = readAppFile("../components/dashboard/dashboard-shell.tsx");
const designDashboardSource = readFeatureFile("design-dashboard.tsx");
const globalStyles = readLocalFile("../../app/globals.css");
const loginFormSource = readAppFile("login/login-form.tsx");
const signupFormSource = readAppFile("signup/signup-form.tsx");
const dashboardRoutes = [
  { path: "dashboard/page.tsx", view: "overview" },
  { path: "dashboard/projects/page.tsx", view: "projects" },
  { path: "dashboard/projects/[projectId]/page.tsx", view: "project-detail" },
  { path: "dashboard/projects/[projectId]/settings/page.tsx", view: "project-settings" },
  { path: "dashboard/templates/page.tsx", view: "templates" },
  { path: "dashboard/costs/page.tsx", view: "costs" },
  { path: "dashboard/settings/page.tsx", view: "settings" }
] as const;

test("dashboard pages are owned by the /dashboard route group", () => {
  for (const route of dashboardRoutes) {
    assert.equal(appFileExists(route.path), true, `Expected ${route.path} to exist`);
  }
});

test("dashboard route pages render the new DESIGN.md dashboard surface", () => {
  for (const route of dashboardRoutes) {
    const source = readAppFile(route.path);

    assert.match(source, /DesignDashboardPage/, `Expected ${route.path} to use DesignDashboardPage`);
    assert.match(source, new RegExp(`view="${route.view}"`), `Expected ${route.path} to pass ${route.view}`);
    assert.doesNotMatch(source, /return null;/, `Expected ${route.path} not to stay blank`);
    assert.doesNotMatch(source, /DashboardShell/, `Expected ${route.path} not to render the old shell`);
  }
});

test("new dashboard implementation is not built from the legacy dashboard UI", () => {
  assert.match(designDashboardSource, /SketchCatch/);
  assert.match(designDashboardSource, /Requirement Input/);
  assert.match(designDashboardSource, /Practice Architecture/);
  assert.match(designDashboardSource, /IaC Preview/);
  assert.match(designDashboardSource, /Pre-Deployment Check/);
  assert.match(designDashboardSource, /Direct Deployment Path/);
  assert.match(designDashboardSource, /Git\/CI\/CD Deployment Path/);
  assert.match(designDashboardSource, /Reverse Engineering/);
  assert.match(designDashboardSource, /Deployment History/);
  assert.match(designDashboardSource, /Auto Cleanup/);
  assert.match(designDashboardSource, /lucide-react/);
  assert.doesNotMatch(
    designDashboardSource,
    /from "\.\.\/\.\.\/components\/dashboard|from "\.\.\/\.\.\/app\/projects|<DashboardShell|<ProjectCard|<ProjectsClient|<TemplatesClient|<CostsClient|<SettingsIntegrationsClient/
  );
});

test("new dashboard styles follow the DESIGN.md product surface tokens", () => {
  const pageRule = extractCssRule(".designDashboardPage");
  const shellRule = extractCssRule(".designDashboardShell");
  const panelRule = extractCssRule(".designDashboardPanel");
  const primaryActionRule = extractCssRule(".designDashboardPrimaryAction");

  assert.match(pageRule, /--dashboard-design-primary:\s*#000000/);
  assert.match(pageRule, /--dashboard-design-ink:\s*#171717/);
  assert.match(pageRule, /--dashboard-design-body:\s*#60646c/);
  assert.match(pageRule, /--dashboard-design-link:\s*#0d74ce/);
  assert.match(pageRule, /--dashboard-design-canvas:\s*#ffffff/);
  assert.match(pageRule, /--dashboard-design-sans:\s*"Pretendard", "Noto Sans KR", Inter, Geist, sans-serif/);
  assert.match(pageRule, /font-family:\s*var\(--dashboard-design-sans\)/);
  assert.doesNotMatch(pageRule, /radial-gradient/);
  assert.match(shellRule, /grid-template-columns:\s*248px minmax\(0,\s*1fr\)/);
  assert.match(panelRule, /border-radius:\s*8px/);
  assert.match(primaryActionRule, /background:\s*var\(--dashboard-design-primary\)/);
  assert.match(primaryActionRule, /border-radius:\s*8px/);
  assert.match(globalStyles, /@media \(max-width: 920px\)[\s\S]*\.designDashboardShell/);
});

test("legacy top-level dashboard tab pages are removed", () => {
  for (const route of [
    "projects/page.tsx",
    "projects/[projectId]/page.tsx",
    "projects/[projectId]/settings/page.tsx",
    "templates/page.tsx",
    "costs/page.tsx",
    "settings/page.tsx"
  ]) {
    assert.equal(appFileExists(route), false, `Expected ${route} to be removed`);
  }
});

test("dashboard shell navigation points at /dashboard and no longer treats /mypage as the app home", () => {
  assert.match(dashboardShellSource, /href: "\/dashboard"/);
  assert.match(dashboardShellSource, /href: "\/dashboard\/projects"/);
  assert.match(dashboardShellSource, /href: "\/dashboard\/templates"/);
  assert.match(dashboardShellSource, /href: "\/dashboard\/costs"/);
  assert.match(dashboardShellSource, /href: "\/dashboard\/settings"/);
  assert.doesNotMatch(dashboardShellSource, /href: "\/mypage"/);
  assert.doesNotMatch(dashboardShellSource, /href: "\/projects"/);
  assert.doesNotMatch(dashboardShellSource, /href: "\/templates"/);
  assert.doesNotMatch(dashboardShellSource, /href: "\/costs"/);
  assert.doesNotMatch(dashboardShellSource, /href: "\/settings"/);
});

test("auth success redirects enter the dashboard shell instead of mypage", () => {
  assert.match(loginFormSource, /router\.replace\("\/dashboard"\)/);
  assert.match(signupFormSource, /router\.replace\("\/dashboard"\)/);
  assert.doesNotMatch(loginFormSource, /\/mypage/);
  assert.doesNotMatch(signupFormSource, /\/mypage/);
});

function appFileExists(path: string): boolean {
  return existsSync(fileURLToPath(new URL(path, appRoot)));
}

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, appRoot)), "utf8");
}

function readFeatureFile(path: string): string {
  const filePath = fileURLToPath(new URL(path, featureRoot));

  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractCssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalStyles.match(new RegExp(`${escapedSelector}\\s*{[^}]*}`, "s"));

  assert.ok(match, `Expected ${selector} rule to exist`);

  return match[0];
}
