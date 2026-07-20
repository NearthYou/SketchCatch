import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = [
  "DeliveryCenterPanel.tsx",
  "CicdConsoleScreen.tsx",
  "CicdHandoffPanel.tsx",
  "CicdPipelineRunsPanel.tsx"
].map((file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n");

test("CI/CD uses one task-oriented heading hierarchy", () => {
  assert.match(source, /<h2>CI\/CD<\/h2>/);
  assert.match(source, /<h3[^>]*>배포 준비<\/h3>/);
  assert.match(source, /<h3[^>]*>배포 PR<\/h3>/);
  assert.match(source, /<h3[^>]*>Pipeline<\/h3>/);
  assert.doesNotMatch(source, /Project Delivery|INFRASTRUCTURE DEPLOYMENT|>배포 Pull Request</);
});

test("each primary CI/CD section label is rendered once", () => {
  for (const label of ["배포 준비", "배포 PR", "Pipeline"]) {
    const heading = new RegExp(`>\\s*${label}\\s*<\\/h3>`, "gu");
    assert.equal(source.match(heading)?.length, 1, label);
  }
});
