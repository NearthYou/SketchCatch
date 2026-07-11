import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const requestPageSource = readAppFile("password-reset/page.tsx");
const confirmPageSource = readAppFile("password-reset/confirm/page.tsx");

test("password reset routes use the same authentication shell", () => {
  assert.match(requestPageSource, /AuthShell/);
  assert.match(requestPageSource, /<PasswordResetRequestForm \/>/);
  assert.match(confirmPageSource, /AuthShell/);
  assert.match(confirmPageSource, /<PasswordResetConfirmForm initialToken=\{token\} \/>/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}
