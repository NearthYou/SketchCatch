import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const loginPageSource = readAppFile("login/page.tsx");
const loginFormSource = readAppFile("login/login-form.tsx");
const workspaceAuthGateSource = readAppFile("workspace/workspace-auth-gate.tsx");

test("login route renders the shared authentication shell", () => {
  assert.match(loginPageSource, /AuthShell/);
  assert.match(loginPageSource, /<LoginForm \/>/);
  assert.doesNotMatch(loginPageSource, /RoutePlaceholder/);
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
