import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readParameterInputFile("ParameterInputPanel.tsx");
const stylesSource = readParameterInputFile("ParameterInputPanel.module.css");

test("ParameterInputPanel does not expose Advanced Parameters UI", () => {
  assert.doesNotMatch(panelSource, /Advanced Parameters/);
  assert.doesNotMatch(panelSource, /advanced-parameters/);
  assert.doesNotMatch(panelSource, /advancedParameterQuery/);
  assert.doesNotMatch(panelSource, /addedOptionalParameterNames/);
  assert.doesNotMatch(panelSource, /removeAdvancedParameter/);
});

test("ParameterInputPanel styles do not keep advanced picker rules", () => {
  assert.doesNotMatch(stylesSource, /\.advancedPicker\b/);
  assert.doesNotMatch(stylesSource, /\.advancedOptionList\b/);
  assert.doesNotMatch(stylesSource, /\.advancedOptionButton\b/);
  assert.doesNotMatch(stylesSource, /\.advancedSearch\b/);
});

test("ParameterInputPanel treats list and set nested blocks as repeatable blocks", () => {
  assert.match(panelSource, /definition\.type === "list" \|\| definition\.type === "set"/);
});

test("ParameterInputPanel select menus use the neutral DESIGN.md tone", () => {
  assert.doesNotMatch(panelSource, /tone="purple"/);
  assert.match(panelSource, /tone="workspace"/);
});

test("ParameterInputPanel counts only main definition errors in the Main parameters summary", () => {
  assert.match(
    panelSource,
    /const mainParameterNames = new Set\(mainDefinitions\.map\(\(definition\) => definition\.name\)\);/
  );
  assert.match(
    panelSource,
    /Object\.keys\(validation\.parameterErrors\)\.filter\(\s*\(parameterName\) =>\s*mainParameterNames\.has\(parameterName\)\s*\)\.length/s
  );
  assert.doesNotMatch(
    panelSource,
    /const mainParameterIssueCount = Object\.keys\(validation\.parameterErrors\)\.length;/
  );
});

test("ParameterInputPanel lays out metadata and main parameters for dense scanning", () => {
  const resourceDetailSource = getSourceSlice(
    panelSource,
    "<PanelHeader node={selectedNode} parameters={parameters} />",
    "</aside>"
  );
  const designPassIndex = stylesSource.indexOf("/* DESIGN.md parameter input pass */");

  assert.match(resourceDetailSource, /className=\{`\$\{styles\.section\} \$\{styles\.metadataSection\}`\}/);
  assert.match(resourceDetailSource, /className=\{`\$\{styles\.section\} \$\{styles\.mainParametersSection\}`\}/);
  assert.match(resourceDetailSource, /styles\.metadataGrid/);
  assert.match(resourceDetailSource, /ParameterSummaryBar/);
  assert.match(resourceDetailSource, /styles\.parameterFieldList/);
  assert.match(panelSource, /styles\.parameterDescription/);
  assert.match(panelSource, /styles\.parameterToken/);
  assert.match(panelSource, /styles\.parameterBadge/);

  const sectionRule = getLastCssRuleContainingAfter(stylesSource, ".section {", designPassIndex);
  const sectionHeaderRule = getLastCssRuleAfter(stylesSource, "sectionHeader", designPassIndex);
  const metadataGridRule = getLastCssRuleAfter(stylesSource, "metadataGrid", designPassIndex);
  const parameterSummaryRule = getFirstCssRuleAfter(stylesSource, "parameterSummaryBar", designPassIndex);
  const parameterFieldListRule = getLastCssRuleAfter(stylesSource, "parameterFieldList", designPassIndex);
  const parameterFieldRule = getFirstCssRuleContainingAfter(stylesSource, ".parameterField {", designPassIndex);

  assert.match(sectionRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(sectionRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(sectionRule, /\bborder-radius:\s*8px;/);
  assert.match(sectionRule, /\bpadding:\s*14px;/);
  assert.match(sectionHeaderRule, /\bborder-bottom:\s*1px solid var\(--workspace-line,/);
  assert.match(sectionHeaderRule, /\bpadding-bottom:\s*10px;/);
  assert.match(metadataGridRule, /\bgrid-template-columns:\s*repeat\(auto-fit, minmax\(160px, 1fr\)\);/);
  assert.match(parameterSummaryRule, /\bgrid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(parameterFieldListRule, /\boverflow:\s*hidden;/);
  assert.match(parameterFieldRule, /\bgrid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(stylesSource.slice(designPassIndex), /@container \(min-width: 560px\)/);
  assert.match(
    stylesSource.slice(designPassIndex),
    /\bgrid-template-columns:\s*minmax\(0, 0.86fr\) minmax\(220px, 1.14fr\);/
  );
  assert.doesNotMatch(stylesSource.slice(designPassIndex), /\bborder-left:\s*[2-9]px/);
});

test("Region and AZ area panels avoid duplicate visible selector labels", () => {
  const regionPanelSource = getSourceSlice(
    panelSource,
    "if (isRegionResourceNode(selectedNode) && selectedNode.parameters)",
    "if (isAvailabilityZoneResourceNode(selectedNode) && selectedNode.parameters)"
  );
  const availabilityZonePanelSource = getSourceSlice(
    panelSource,
    "if (isAvailabilityZoneResourceNode(selectedNode) && selectedNode.parameters)",
    "if (selectedNode.kind !== \"resource\")"
  );
  const regionFieldSource = getSourceSlice(panelSource, "function RegionField", "function AvailabilityZoneField");
  const availabilityZoneFieldSource = getSourceSlice(
    panelSource,
    "function AvailabilityZoneField",
    "function getInitialRegionOptionIndex"
  );

  assert.doesNotMatch(regionPanelSource, /<h3>Region<\/h3>/);
  assert.doesNotMatch(availabilityZonePanelSource, /<h3>Availability Zone<\/h3>/);
  assert.match(regionPanelSource, /<RegionField[\s\S]*showLabel=\{false\}/);
  assert.match(availabilityZonePanelSource, /<AvailabilityZoneField[\s\S]*showLabel=\{false\}/);
  assert.match(regionFieldSource, /showLabel \? \(/);
  assert.match(availabilityZoneFieldSource, /showLabel \? \(/);
});

test("ParameterInputPanel styles use the DESIGN.md surface without a legacy skin", () => {
  const designPassIndex = stylesSource.indexOf("/* DESIGN.md parameter input pass */");

  assert.ok(designPassIndex > -1, "Expected the DESIGN.md parameter input pass to exist");
  assert.doesNotMatch(stylesSource, /\/\* Blueprint inspector skin \*\//);
  assert.doesNotMatch(stylesSource, /var\(--bp-/);

  const panelRule = getLastCssRuleAfter(stylesSource, "panel", designPassIndex);
  const iconRule = getLastCssRuleContainingAfter(stylesSource, "div.resourceIcon", designPassIndex);
  const inputRule = getLastCssRuleContainingAfter(stylesSource, ".input,", designPassIndex);
  const focusRule = getLastCssRuleContainingAfter(stylesSource, ".input:focus", designPassIndex);
  const addButtonRule = getLastCssRuleContainingAfter(stylesSource, ".addButton {", designPassIndex);
  const selectedRegionRule = getLastCssRuleAfter(stylesSource, "regionOptionSelected", designPassIndex);

  assert.match(panelRule, /\bbackground:\s*var\(--workspace-surface-muted,/);
  assert.match(panelRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(panelRule, /\bfont-family:\s*var\(--workspace-font,/);
  assert.match(iconRule, /\bbackground:\s*var\(--workspace-surface-strong,/);
  assert.match(iconRule, /\bborder-color:\s*var\(--workspace-line,/);
  assert.match(inputRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(inputRule, /\bborder-color:\s*var\(--workspace-line,/);
  assert.match(inputRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(focusRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(addButtonRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(addButtonRule, /\bcolor:\s*#ffffff;/);
  assert.match(selectedRegionRule, /\bbackground:\s*var\(--workspace-surface-strong,/);
  assert.match(selectedRegionRule, /\bcolor:\s*var\(--workspace-text,/);

  const legacyAccentTokens =
    /var\(--bp-|#6f4cf6|#5f3de8|#f4f1ff|#f1edff|#d6cbff|#8b71ff|#4b2bd6|#ede8ff/i;

  assert.doesNotMatch(stylesSource, legacyAccentTokens);

  for (const designRule of [
    panelRule,
    iconRule,
    inputRule,
    focusRule,
    addButtonRule,
    selectedRegionRule,
  ]) {
    assert.doesNotMatch(designRule, legacyAccentTokens);
  }
});

function readParameterInputFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function getSourceSlice(source: string, startPattern: string, endPattern: string): string {
  const startIndex = source.indexOf(startPattern);
  const endIndex = source.indexOf(endPattern, startIndex);

  assert.ok(startIndex > -1, `Expected source to contain ${startPattern}`);
  assert.ok(endIndex > startIndex, `Expected source to contain ${endPattern} after ${startPattern}`);

  return source.slice(startIndex, endIndex);
}

function getLastCssRuleAfter(source: string, className: string, afterIndex: number): string {
  return getLastCssRuleContainingAfter(source, `.${className}`, afterIndex);
}

function getFirstCssRuleAfter(source: string, className: string, afterIndex: number): string {
  return getFirstCssRuleContainingAfter(source, `.${className}`, afterIndex);
}

function getFirstCssRuleContainingAfter(source: string, selectorFragment: string, afterIndex: number): string {
  const searchSource = source.slice(afterIndex);
  const selectorIndex = searchSource.indexOf(selectorFragment);

  assert.ok(selectorIndex > -1, `Expected CSS rule containing ${selectorFragment}`);

  const blockStart = searchSource.indexOf("{", selectorIndex);
  const blockEnd = searchSource.indexOf("}", blockStart);

  assert.ok(blockStart > selectorIndex, `Expected CSS rule ${selectorFragment} to have a block start`);
  assert.ok(blockEnd > blockStart, `Expected CSS rule ${selectorFragment} to have a block end`);

  return searchSource.slice(selectorIndex, blockEnd + 1);
}

function getLastCssRuleContainingAfter(source: string, selectorFragment: string, afterIndex: number): string {
  const searchSource = source.slice(afterIndex);
  const selectorIndex = searchSource.lastIndexOf(selectorFragment);

  assert.ok(selectorIndex > -1, `Expected CSS rule containing ${selectorFragment}`);

  const blockStart = searchSource.indexOf("{", selectorIndex);
  const blockEnd = searchSource.indexOf("}", blockStart);

  assert.ok(blockStart > selectorIndex, `Expected CSS rule ${selectorFragment} to have a block start`);
  assert.ok(blockEnd > blockStart, `Expected CSS rule ${selectorFragment} to have a block end`);

  return searchSource.slice(selectorIndex, blockEnd + 1);
}
