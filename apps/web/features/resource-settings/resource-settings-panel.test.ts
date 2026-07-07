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
  assert.match(panelSource, /<AwsLogo \/>/);
  assert.match(panelSource, /aria-label="AWS provider"/);
  assert.match(panelSource, /className="providerSelect"/);
  assert.doesNotMatch(panelSource, /aria-pressed="true"/);
  assert.doesNotMatch(panelSource, /providerSelectActive/);
  assert.doesNotMatch(panelSource, /"azure"/);
  assert.doesNotMatch(panelSource, /"gcp"/);
  assert.match(panelSource, /awsProviderVersions/);
  assert.match(panelSource, /aria-label="Terraform AWS provider version"/);
  assert.match(panelSource, /className="providerVersionMenu"/);
  assert.match(panelSource, /className="providerSelect providerVersionSelect providerVersionTrigger"/);
  assert.match(panelSource, /6\.47\.0/);
  assert.match(panelSource, /6\.46\.0/);
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

test("left resource catalog does not render the legacy Brainboard tab", () => {
  assert.doesNotMatch(panelSource, /\{ id: "brainboard", label: "Brainboard"/);
  assert.doesNotMatch(panelSource, /kind: "brainboard"/);
  assert.doesNotMatch(panelSource, /className="brainboardTile"/);
  assert.doesNotMatch(stylesSource, /\.brainboardTile/);
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
  const providerDropdownRule = getCssRule(stylesSource, "providerDropdown");
  const resourceAreaLabelRule = getCssRule(stylesSource, "resourceAreaLabel");
  const moduleCatalogPanelRule = getCssRule(stylesSource, "moduleCatalogPanel");

  assert.match(resourcePanelRule, /\bmin-height:\s*0;/);
  assert.match(resourcePanelRule, /\boverflow:\s*hidden;/);
  assert.match(resourceTabsRule, /\bmin-height:\s*43px;/);
  assert.match(providerControlsRule, /\bdisplay:\s*inline-flex;/);
  assert.match(providerDropdownRule, /\bposition:\s*relative;/);
  assert.match(stylesSource, /\.providerVersionMenu\s*\{[^}]*\bposition:\s*absolute;/s);
  assert.match(resourceAreaLabelRule, /\bfont-size:\s*1rem;/);
  assert.match(resourceAreaLabelRule, /\bline-height:\s*3\.2;/);
  assert.match(stylesSource, /\.diagramEditor \.resourceAreaLabel\s*\{[^}]*\bfont-size:\s*1rem;/s);
  assert.match(stylesSource, /\.resourceViewToggle,\s*\.resourceViewToggleActive\s*\{[^}]*\bheight:\s*32px;[^}]*\bwidth:\s*32px;/s);
  assert.match(moduleCatalogPanelRule, /\boverflow:\s*auto;/);
});

test("resource tiles follow the compact tile contract", () => {
  const resourceTileRule = getCssRule(stylesSource, "resourceTile");

  assert.match(resourceTileRule, /\bheight:\s*60px;/);
  assert.match(resourceTileRule, /\bmin-height:\s*60px;/);
  assert.match(resourceTileRule, /\boutline:\s*1px solid #dfe7f1;/);
  assert.match(stylesSource, /\.resourceTileLabel,[\s\S]*-webkit-line-clamp:\s*1;/);
  assert.match(stylesSource, /\.resourceTile:not\(\.resourceTileDisabled\):hover,[\s\S]*\.resourceTile:not\(\.resourceTileDisabled\):focus-visible/);
});

test("resource panel preserves templates, search, and section states", () => {
  assert.match(panelSource, /<TemplatesPanel onTemplateApply=\{onTemplateApply\} \/>/);
  assert.match(panelSource, /Search results/);
  assert.match(panelSource, /No resources found\./);
  assert.match(panelSource, /resourceAreaChevronOpen/);
  assert.match(panelSource, /resourceModulesEmptyState/);

  for (const label of [
    "Modules",
    "Design",
    "Containers",
    "Compute",
    "Network",
    "Storage",
    "Database",
    "Security & Identity",
    "Tools",
    "AI",
    "Analytics",
    "Application",
    "IoT",
    "Other"
  ]) {
    assert.match(panelSource, new RegExp(label.replace(/[&]/g, "&")));
  }
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
