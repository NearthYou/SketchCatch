import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository start screen exposes the Template-unselected AI fallback", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  assert.match(source, /원하는 Template이 없어요/);
  assert.match(source, /Template 없이 AI로 생성/);
  assert.match(source, /fallbackAdditionalRequirements/);
  assert.match(source, /direct_deployment/);
  assert.match(source, /git_cicd_deployment/);
  assert.match(source, /CI\/CD handoff 포함/);
});
