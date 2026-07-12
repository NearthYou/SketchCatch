import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const signupPageSource = readAppFile("signup/page.tsx");
const signupFormSource = readAppFile("signup/signup-form.tsx");
const authStylesSource = readAppFile("../components/auth/auth.css");

test("signup route renders the shared authentication shell", () => {
  assert.match(signupPageSource, /AuthShell/);
  assert.match(signupPageSource, /<SignupForm \/>/);
  assert.doesNotMatch(signupPageSource, /RoutePlaceholder/);
});

test("signup form keeps the authentication contract", () => {
  assert.match(signupFormSource, /const \{ signup[^}]*\} = useAuth\(\)/);
  assert.match(signupFormSource, /await signup\(payload\)/);
  assert.match(signupFormSource, /router\.replace\("\/dashboard"\)/);
});

test("signup password fields keep their controls top-aligned when help text is present", () => {
  assert.match(
    authStylesSource,
    /\.authField\s*\{[^}]*align-content:\s*start;/s
  );
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}
