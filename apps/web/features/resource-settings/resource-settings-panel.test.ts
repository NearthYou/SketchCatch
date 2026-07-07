import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readLocalFile("index.tsx");
const stylesSource = readFeatureFile("../../app/globals.css");

test("resource settings panel exposes Resources, Templates, provider, and module controls", () => {
  assert.match(panelSource, /role="tablist" aria-label="Resource panel tabs"/);
  assert.match(panelSource, /Resources/);
  assert.match(panelSource, /Templates/);
  assert.match(panelSource, /\(\["aws", "azure", "gcp"\] as const\)\.map/);
  assert.match(panelSource, /aria-label="Resource view mode"/);
  assert.match(panelSource, /title="Resources"/);
  assert.match(panelSource, /title="Modules"/);
  assert.match(panelSource, /<ModuleCatalogPanel onModuleAdd=\{onModuleAdd\} \/>/);
});

test("template cards open the board template modal instead of leaving the board", () => {
  assert.match(panelSource, /onTemplateApply/);
  assert.match(panelSource, /TemplateLibraryModal/);
  assert.match(panelSource, /큰 모달/);
  assert.doesNotMatch(panelSource, /href="\/templates"/);
  assert.doesNotMatch(panelSource, /href="\/brainboard"/);
});

test("module catalog cards are real buttons that call onModuleAdd with the curated module id", () => {
  assert.match(panelSource, /className="moduleCatalogCard"/);
  assert.match(panelSource, /onClick=\{\(\) => onModuleAdd\?\.\(moduleDefinition\.id\)\}/);
  assert.match(panelSource, /type="button"/);
});

test("left catalog controls keep stable dimensions and scroll instead of overflowing on small workspaces", () => {
  const resourcePanelRule = getCssRule(stylesSource, "resourcePanel");
  const resourceTabsRule = getCssRule(stylesSource, "resourceTabs");
  const providerControlsRule = getCssRule(stylesSource, "providerControls");
  const moduleCatalogPanelRule = getCssRule(stylesSource, "moduleCatalogPanel");

  assert.match(resourcePanelRule, /\bmin-height:\s*0;/);
  assert.match(resourcePanelRule, /\boverflow:\s*hidden;/);
  assert.match(resourceTabsRule, /\bmin-height:\s*54px;/);
  assert.match(providerControlsRule, /\bdisplay:\s*inline-flex;/);
  assert.match(stylesSource, /\.resourceViewToggle,\s*\.resourceViewToggleActive\s*\{[^}]*\bheight:\s*38px;[^}]*\bwidth:\s*38px;/s);
  assert.match(moduleCatalogPanelRule, /\boverflow:\s*auto;/);
});

function readLocalFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function readFeatureFile(filePath: string): string {
  return readFileSync(fileURLToPath(new URL(filePath, import.meta.url)), "utf8");
}

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}
