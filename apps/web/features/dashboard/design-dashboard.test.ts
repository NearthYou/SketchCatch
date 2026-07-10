import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const dashboardSource = readLocalFile("design-dashboard.tsx");
const accountFooterSource = readLocalFile("design-dashboard-account-footer.tsx");
const globalStyles = readLocalFile("../../app/globals.css");

test("design dashboard replaces the safety footer with an account logout footer", () => {
  assert.match(dashboardSource, /DesignDashboardAccountFooter/);
  assert.doesNotMatch(dashboardSource, /Deployment Safety Gate/);
  assert.doesNotMatch(dashboardSource, /High risk 변경은 사용자 승인 전 실행되지 않습니다/);
  assert.match(accountFooterSource, /useAuth/);
  assert.match(accountFooterSource, /logout/);
  assert.match(accountFooterSource, /router\.replace\("\/login"\)/);
  assert.match(accountFooterSource, /로그아웃/);
});

test("design dashboard account footer follows the DESIGN.md button tokens", () => {
  const footerRule = extractCssRule(".designDashboardSidebarFooter");
  const logoutRule = extractCssRule(".designDashboardLogoutButton");

  assert.match(footerRule, /border-radius:\s*8px/);
  assert.match(logoutRule, /background:\s*var\(--dashboard-design-primary\)/);
  assert.match(logoutRule, /border-radius:\s*8px/);
  assert.match(logoutRule, /min-height:\s*40px/);
  assert.doesNotMatch(globalStyles, /Deployment Safety Gate/);
});

test("mobile dashboard keeps the logout action in the brand header", () => {
  assert.match(dashboardSource, /designDashboardSidebarHeader/);
  assert.match(dashboardSource, /<DesignDashboardAccountFooter compact \/>/);
  assert.match(accountFooterSource, /compact\?: boolean/);
  assert.match(globalStyles, /\.designDashboardMobileAccount\s*{[^}]*display:\s*none/s);
  assert.match(
    globalStyles,
    /@media \(max-width: 920px\)[\s\S]*\.designDashboardMobileAccount\s*{[^}]*display:\s*grid/
  );
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractCssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalStyles.match(new RegExp(`${escapedSelector}\\s*{[^}]*}`, "s"));
  assert.ok(match, `Expected ${selector} rule to exist`);
  return match[0];
}
