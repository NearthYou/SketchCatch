import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const statusSource = readFileSync(
  fileURLToPath(new URL("./TerraformCodeStatus.tsx", import.meta.url)),
  "utf8"
);
const statusStyles = readFileSync(
  fileURLToPath(new URL("./TerraformCodeStatus.module.css", import.meta.url)),
  "utf8"
);
const panelSource = readFileSync(
  fileURLToPath(new URL("./TerraformCodePanel.tsx", import.meta.url)),
  "utf8"
);
const rightPanelSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceRightPanel.tsx", import.meta.url)),
  "utf8"
);

test("Terraform status removes the legacy Issues banner and navigation", () => {
  assert.doesNotMatch(statusSource, /terraformIssueBanner/);
  assert.doesNotMatch(statusSource, /Issues 보기/);
  assert.doesNotMatch(statusSource, /data-terraform-issues-navigation/);
  assert.doesNotMatch(statusSource, /onOpenIssues/);
  assert.doesNotMatch(statusStyles, /\.terraformIssueBanner/);
  assert.doesNotMatch(panelSource, /onOpenIssues|handleSeeMore/);
  assert.doesNotMatch(rightPanelSource, /onOpenIssues=|focusTerraformIssuesPane/);
});

test("Terraform status keeps the unsaved-change banner without an action button", () => {
  assert.match(statusSource, /\{state\.saveBanner \? \(/);
  assert.match(
    statusSource,
    /저장하지 않은 Terraform 변경이 있습니다\. Ctrl\/⌘ \+ S로 저장하세요\./
  );
  assert.match(statusSource, /state\.saveBanner\.message/);
  assert.doesNotMatch(statusSource, /<button/);
});
