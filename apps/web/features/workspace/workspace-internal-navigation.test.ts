import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const cicdSource = readSource("./CicdConsoleScreen.tsx");
const directDeploymentSource = readSource("./DirectDeploymentScreen.tsx");
const reverseEngineeringSource = readSource("./ReverseEngineeringScanCriteriaForm.tsx");

test("Workspace settings and project routes use client navigation", () => {
  for (const source of [cicdSource, directDeploymentSource, reverseEngineeringSource]) {
    assert.match(source, /import Link from "next\/link";/);
  }

  assert.doesNotMatch(cicdSource, /<a[^>]+href=\{(?:projectSettingsHref|githubAccountSettingsHref|repositoryHref|item\.href)\}/);
  assert.doesNotMatch(directDeploymentSource, /<a[^>]+href="\/(?:dashboard|workspace)/);
  assert.doesNotMatch(reverseEngineeringSource, /<a[^>]+href="\/dashboard/);
});

test("Workspace deployment output and GitHub links remain external anchors", () => {
  assert.match(
    cicdSource,
    /<a href=\{existingHandoff\.pullRequestUrl\} rel="noreferrer" target="_blank">/
  );
  assert.match(
    directDeploymentSource,
    /href=\{outputUrl\}[\s\S]{0,80}rel="noreferrer"[\s\S]{0,80}target="_blank"/
  );
  assert.match(directDeploymentSource, /getSafeReleaseOutputUrl\(release\?\.outputUrl/);
});
