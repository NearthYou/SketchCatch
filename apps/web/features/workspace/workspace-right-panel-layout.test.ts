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
  const deploymentPanelContentRule = getCssRule(stylesSource, "deploymentPanelContent");

  assert.match(deploymentPanelRule, /\bheight:\s*100%;/);
  assert.match(deploymentPanelRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelRule, /\boverflow:\s*hidden;/);
  assert.match(deploymentPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/);
  assert.match(deploymentPanelContentRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelContentRule, /\boverflow-y:\s*auto;/);
});

test("deployment mode switch keeps tabs the same size across modes", () => {
  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");
  const modeSwitchRule = getCssRule(stylesSource, "deploymentModeSwitch");
  const modeButtonRule = getCssRule(stylesSource, "deploymentModeButton");

  assert.match(deploymentPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/);
  assert.match(modeSwitchRule, /\bgrid-auto-rows:\s*40px;/);
  assert.match(modeSwitchRule, /\balign-items:\s*center;/);
  assert.match(modeButtonRule, /\bheight:\s*40px;/);
});

test("deployment mode switch is pinned after the scrollable content area", () => {
  const contentIndex = componentSource.indexOf("className={styles.deploymentPanelContent}");
  const modeSwitchIndex = componentSource.indexOf("className={styles.deploymentModeSwitch}");

  assert.notEqual(contentIndex, -1);
  assert.notEqual(modeSwitchIndex, -1);
  assert.ok(contentIndex < modeSwitchIndex);
});

test("deployment expanded logs use a single terminal scrollbar", () => {
  const expandedLogsRule = getCssRule(stylesSource, "deploymentExpandedLogs");
  const expandedLogSectionRule = getDescendantCssRule(
    stylesSource,
    "deploymentExpandedLogs",
    "deploymentSection"
  );
  const logListRule = getCssRule(stylesSource, "deploymentLogList");

  assert.match(expandedLogsRule, /\boverflow:\s*hidden;/);
  assert.match(expandedLogSectionRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(logListRule, /\boverflow:\s*auto;/);
  assert.doesNotMatch(logListRule, /\bmax-height:/);
});

test("deployment log prefix omits the level label because color carries severity", () => {
  assert.doesNotMatch(componentSource, /log\.level\.padEnd/);
});

test("deployment results render as compact rows instead of cards", () => {
  const resultRowsRule = getCssRule(stylesSource, "deploymentResultRows");
  const resultRowRule = getCssRule(stylesSource, "deploymentResultRow");

  assert.match(componentSource, /className=\{styles\.deploymentResultRows\}/);
  assert.doesNotMatch(stylesSource, /\.deploymentResultList\s+div\s*\{/);
  assert.match(resultRowsRule, /\bgap:\s*0;/);
  assert.match(resultRowRule, /\bgrid-template-columns:\s*minmax\(0,\s*1\.15fr\) minmax\(88px,\s*0\.45fr\) minmax\(0,\s*1fr\);/);
  assert.match(resultRowRule, /\bmin-height:\s*32px;/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}

function getDescendantCssRule(source: string, parentClassName: string, childClassName: string): string {
  const match = new RegExp(
    `\\.${parentClassName}\\s+\\.${childClassName}\\s*\\{(?<body>[^}]*)\\}`
  ).exec(source);

  assert.ok(
    match?.groups?.body,
    `Expected .${parentClassName} .${childClassName} CSS rule to exist`
  );

  return match.groups.body;
}
