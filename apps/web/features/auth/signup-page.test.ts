import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const signupPageSource = readAppFile("signup/page.tsx");
const signupFormSource = readAppFile("signup/signup-form.tsx");

test("signup route keeps the signup form in the minimal shell", () => {
  assert.match(signupPageSource, /RoutePlaceholder/);
  assert.match(signupPageSource, /<SignupForm \/>/);
  assert.match(signupPageSource, /href: "\/login"/);
  assert.doesNotMatch(signupPageSource, /authDesignPage|authDesignPanel|authDesignShell/);
});

test("signup form keeps the authentication contract", () => {
  assert.match(signupFormSource, /const \{ signup[^}]*\} = useAuth\(\)/);
  assert.match(signupFormSource, /await signup\(payload\)/);
  assert.match(signupFormSource, /router\.replace\("\/dashboard"\)/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}
