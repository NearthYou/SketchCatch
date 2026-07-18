import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const deploymentSource = readFileSync(
  fileURLToPath(new URL("DirectDeploymentScreen.tsx", import.meta.url)),
  "utf8"
);
const workspaceStyles = readFileSync(
  fileURLToPath(new URL("workspace.module.css", import.meta.url)),
  "utf8"
);

test("pre-deployment results are collapsed by default behind an accessible summary", () => {
  const componentStart = deploymentSource.indexOf("function DeploymentPreDeploymentSummary");
  const componentEnd = deploymentSource.indexOf(
    "function DeploymentPreDeploymentFindingItem",
    componentStart
  );
  const componentSource = deploymentSource.slice(componentStart, componentEnd);

  assert.match(
    componentSource,
    /<details className=\{styles\.deploymentPreflightSummary\} data-level=\{gateLevel\}>/
  );
  assert.match(
    componentSource,
    /<summary className=\{styles\.deploymentGateHeader\}>[\s\S]*?배포 안전성 검사 결과[\s\S]*?<\/summary>/
  );
  assert.match(componentSource, /className=\{styles\.deploymentPreflightBody\}/);
  assert.match(componentSource, /className=\{styles\.deploymentPreflightChevron\}/);
  assert.doesNotMatch(componentSource, /<details[^>]*\sopen(?:=|\s|>)/);
});

test("pre-deployment disclosure styles expose focus and reduced-motion states", () => {
  assert.match(workspaceStyles, /\.deploymentGateHeader:focus-visible/);
  assert.match(
    workspaceStyles,
    /\.deploymentPreflightSummary\[open\] \.deploymentPreflightChevron/
  );
  assert.match(
    workspaceStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.deploymentPreflightChevron/
  );
});
