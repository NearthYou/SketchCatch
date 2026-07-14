import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const landingStyles = readWebFile("features/landing/product-entry.module.css");
const authStyles = readWebFile("components/auth/auth.css");
const dashboardStyles = [
  readWebFile("components/dashboard/dashboard-shell.css"),
  readWebFile("components/dashboard/dashboard-content.css"),
  readWebFile("app/dashboard/dashboard-tools.module.css")
].join("\n");

test("landing user-facing text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(landingStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(landingStyles, /#(?:777b84|999999)/i);
});

test("dashboard text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(dashboardStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(dashboardStyles, /#(?:777b84|999999)/i);
});

test("authentication text keeps the minimum size and muted contrast", () => {
  assert.doesNotMatch(authStyles, /font-size:\s*(?:8|9|10|11)px/);
  assert.doesNotMatch(authStyles, /#(?:777b84|999999)/i);
});

function readWebFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}
