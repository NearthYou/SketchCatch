import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectsClientSource = readProjectFile("../../app/projects/projects-client.tsx");
const stylesSource = readProjectFile("../../app/globals.css");

test("project delete dialog close clears the deleting project lock", () => {
  const closeDialogSource = getSourceBetween(
    projectsClientSource,
    "function closeDeleteDialog(): void {",
    "function renderDeleteDialog()"
  );

  assert.match(closeDialogSource, /setDeleteDialog\(\{ status: "closed" \}\);/);
  assert.match(closeDialogSource, /setDeletingProjectId\(null\);/);
});

test("destroy delete polling stops when the projects page unmounts", () => {
  const pollingSource = getSourceBetween(
    projectsClientSource,
    "async function waitForProjectDeployment(input:",
    "function isDestroyPlanReadyForApproval"
  );

  assert.match(projectsClientSource, /const isMountedRef = useRef\(true\);/);
  assert.match(projectsClientSource, /isMountedRef\.current = false;/);
  assert.match(pollingSource, /readonly checkMounted\?: \(\(\) => boolean\) \| undefined;/);
  assert.match(pollingSource, /input\.checkMounted\?\.\(\) === false/);
  assert.match(projectsClientSource, /checkMounted: \(\) => isMountedRef\.current/);
});

test("project card actions use natural card layout instead of a fixed y offset", () => {
  const cardActionsRule = getCssRule(stylesSource, "projectCardActions");

  assert.doesNotMatch(cardActionsRule, /position:\s*absolute/);
  assert.doesNotMatch(cardActionsRule, /top:\s*188px/);
  assert.match(cardActionsRule, /align-self:\s*end/);
  assert.match(cardActionsRule, /grid-area:\s*1 \/ 1/);
  assert.match(cardActionsRule, /justify-self:\s*end/);
});

function readProjectFile(filePath: string): string {
  return readFileSync(fileURLToPath(new URL(filePath, import.meta.url)), "utf8");
}

function getSourceBetween(source: string, startToken: string, endToken: string): string {
  const startIndex = source.indexOf(startToken);
  const endIndex = source.indexOf(endToken, startIndex);

  assert.ok(startIndex > -1, `Expected source to include ${startToken}`);
  assert.ok(endIndex > startIndex, `Expected source to include ${endToken} after ${startToken}`);

  return source.slice(startIndex, endIndex);
}

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}
