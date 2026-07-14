import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const loginPageSource = readAppFile("login/page.tsx");
const loginFormSource = readAppFile("login/login-form.tsx");
const workspaceAuthGateSource = readAppFile("workspace/workspace-auth-gate.tsx");
const authShellSource = readWebFile("components/auth/auth-shell.tsx");
const authStylesSource = readWebFile("components/auth/auth.css");

test("login route renders the shared authentication shell", () => {
  assert.match(loginPageSource, /AuthShell/);
  assert.match(loginPageSource, /<LoginForm \/>/);
  assert.doesNotMatch(loginPageSource, /RoutePlaceholder/);
});

test("login keeps the home brand inside the card without extra intro copy", () => {
  assert.match(loginPageSource, /brandPlacement="panel"/);
  assert.doesNotMatch(loginPageSource, /description=/);
  assert.doesNotMatch(loginPageSource, /eyebrow=/);
  assert.match(authShellSource, /brandPlacement === "topbar"/);
  assert.match(authShellSource, /brandPlacement === "panel"/);
  assert.match(authShellSource, /<ProductBrand href="\/" \/>/);
  assert.match(authStylesSource, /\.authPanelBrand\s*\{[^}]*margin-bottom:\s*32px;/s);
});

test("login form keeps the authentication contract", () => {
  assert.match(loginFormSource, /const \{ login, status \} = useAuth\(\)/);
  assert.match(loginFormSource, /await login\(payload\)/);
  assert.match(loginFormSource, /getSafeReturnPath/);
  assert.match(loginFormSource, /router\.replace\(returnPath\)/);
});

test("workspace login redirect preserves the requested route", () => {
  assert.match(workspaceAuthGateSource, /returnTo/);
  assert.match(workspaceAuthGateSource, /window\.location\.pathname/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}

function readWebFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}
