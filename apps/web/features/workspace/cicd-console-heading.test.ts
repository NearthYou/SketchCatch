import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./CicdConsoleScreen.tsx", import.meta.url), "utf8");

test("CI/CD handoff keeps its title without the redundant Git / CI / CD eyebrow", () => {
  assert.doesNotMatch(source, /<p>Git \/ CI \/ CD<\/p>/);
  assert.match(source, /<h3 id="cicd-handoff-title">배포 Pull Request<\/h3>/);
});
