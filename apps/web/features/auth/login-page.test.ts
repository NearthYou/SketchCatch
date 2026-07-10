import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const loginPageSource = readAppFile("login/page.tsx");
const loginFormSource = readAppFile("login/login-form.tsx");

test("login route keeps the authentication form in the minimal shell", () => {
  assert.match(loginPageSource, /RoutePlaceholder/);
  assert.match(loginPageSource, /<LoginForm \/>/);
  assert.match(loginPageSource, /href: "\/signup"/);
  assert.doesNotMatch(loginPageSource, /authDesignPage|authDesignPanel|authDesignShell/);
});

test("login form keeps the authentication contract", () => {
  assert.match(loginFormSource, /const \{ login \} = useAuth\(\)/);
  assert.match(loginFormSource, /await login\(payload\)/);
  assert.match(loginFormSource, /router\.replace\("\/dashboard"\)/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}
