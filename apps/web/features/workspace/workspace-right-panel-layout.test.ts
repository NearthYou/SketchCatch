import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const componentSource = readWorkspaceFile("WorkspaceRightPanel.tsx");
const stylesSource = readWorkspaceFile("workspace.module.css");

test("deployment panel uses the right panel body scroll area", () => {
  const deploymentPanelIndex = componentSource.indexOf("<DeploymentPanel");
  const previousViewOpenIndex = componentSource.lastIndexOf(
    "<div className={styles.rightPanelView}",
    deploymentPanelIndex
  );
  const previousDivCloseIndex = componentSource.lastIndexOf("</div>", deploymentPanelIndex);

  assert.notEqual(deploymentPanelIndex, -1);
  assert.ok(
    previousViewOpenIndex > previousDivCloseIndex,
    "DeploymentPanel should be rendered inside a rightPanelView body wrapper"
  );

  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");

  assert.match(deploymentPanelRule, /\bheight:\s*100%;/);
  assert.match(deploymentPanelRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelRule, /\boverflow-y:\s*auto;/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}
