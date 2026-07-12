import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readParameterInputFile("ParameterInputPanel.tsx");
const stylesSource = readParameterInputFile("ParameterInputPanel.module.css");

test("ParameterInputPanel separates required inputs from optional additional settings", () => {
  assert.match(panelSource, /getRequiredDefinitions/);
  assert.match(panelSource, /getOptionalDefinitions/);
  assert.match(panelSource, /getActiveOptionalDefinitions/);
  assert.match(panelSource, /getAdvancedDefinitions/);
  assert.match(panelSource, /advancedParameterQuery/);
  assert.match(panelSource, /addedOptionalParameterNamesByNodeId/);
  assert.match(panelSource, /removeAdvancedParameter/);
  assert.match(panelSource, />필수 파라미터</);
  assert.match(panelSource, />추가 설정</);
});

test("ParameterInputPanel styles provide an inline optional-parameter picker", () => {
  assert.match(stylesSource, /\.advancedPicker\b/);
  assert.match(stylesSource, /\.advancedOptionList\b/);
  assert.match(stylesSource, /\.advancedOptionButton\b/);
  assert.match(stylesSource, /\.advancedSearch\b/);
  assert.match(stylesSource, /\.advancedToggle\b/);
});

test("ParameterInputPanel treats list and set nested blocks as repeatable blocks", () => {
  assert.match(panelSource, /definition\.type === "list" \|\| definition\.type === "set"/);
});

test("ParameterInputPanel select menus use the neutral DESIGN.md tone", () => {
  assert.doesNotMatch(panelSource, /tone="purple"/);
  assert.match(panelSource, /tone="workspace"/);
});

test("ParameterInputPanel counts only required definition errors in the required summary", () => {
  assert.match(
    panelSource,
    /const requiredParameterNames = new Set\(\s*requiredDefinitions\.map\(\(definition\) => definition\.name\)\s*\);/s
  );
  assert.match(
    panelSource,
    /Object\.keys\(validation\.parameterErrors\)\.filter\(\s*\(parameterName\) =>\s*requiredParameterNames\.has\(parameterName\)\s*\)\.length/s
  );
});

test("resource identity edits do not overwrite the friendly diagram label", () => {
  const updateMetadataFieldSource = getSourceSlice(
    panelSource,
    "const updateMetadataField",
    "const updateParameterValue"
  );

  assert.match(updateMetadataFieldSource, /commitParameters\(nextParameters\)/);
  assert.doesNotMatch(updateMetadataFieldSource, /updateNodeMetadata/);
});

test("Area display-name editors still update diagram metadata labels", () => {
  assert.match(
    panelSource,
    /<DesignAreaNameSection[\s\S]*?onChange=\{\(label\) => updateNodeMetadata\(selectedNode\.id, \{ label \}\)\}/
  );
});

test("ParameterInputPanel keeps resource settings in one continuous inspector", () => {
  const resourceDetailSource = getSourceSlice(
    panelSource,
    "<PanelHeader node={selectedNode} parameters={parameters} />",
    "</aside>"
  );
  const restoredLayoutIndex = stylesSource.indexOf("/* Restored inspector layout */");

  assert.match(resourceDetailSource, /className=\{`\$\{styles\.section\} \$\{styles\.metadataSection\}`\}/);
  assert.match(resourceDetailSource, /styles\.requiredParametersSection/);
  assert.match(resourceDetailSource, /styles\.advancedParametersSection/);
  assert.match(resourceDetailSource, /styles\.metadataGrid/);
  assert.match(resourceDetailSource, /ParameterSummaryBar/);
  assert.match(resourceDetailSource, /styles\.parameterFieldList/);
  assert.match(panelSource, /styles\.parameterDescription/);
  assert.match(panelSource, /styles\.parameterToken/);
  assert.match(panelSource, /styles\.parameterBadge/);

  const sectionRule = getLastCssRuleContainingAfter(stylesSource, ".section {", restoredLayoutIndex);
  const sectionHeaderRule = getLastCssRuleAfter(stylesSource, "sectionHeader", restoredLayoutIndex);
  const metadataGridRule = getLastCssRuleAfter(stylesSource, "metadataGrid", restoredLayoutIndex);
  const parameterSummaryRule = getFirstCssRuleAfter(stylesSource, "parameterSummaryBar", restoredLayoutIndex);
  const parameterFieldListRule = getLastCssRuleAfter(stylesSource, "parameterFieldList", restoredLayoutIndex);
  const parameterFieldRule = getFirstCssRuleContainingAfter(stylesSource, ".parameterField {", restoredLayoutIndex);

  assert.ok(restoredLayoutIndex > -1, "Expected the restored inspector layout to exist");
  assert.match(sectionRule, /\bborder-top:\s*1px solid var\(--workspace-line,/);
  assert.match(sectionRule, /\bbackground:\s*transparent;/);
  assert.match(sectionRule, /\bborder-radius:\s*0;/);
  assert.match(sectionRule, /\bpadding:\s*16px 0 0;/);
  assert.match(sectionHeaderRule, /\bborder-bottom:\s*0;/);
  assert.match(sectionHeaderRule, /\bpadding-bottom:\s*0;/);
  assert.match(metadataGridRule, /\bgrid-template-columns:\s*repeat\(auto-fit, minmax\(160px, 1fr\)\);/);
  assert.match(parameterSummaryRule, /\bgrid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(parameterFieldListRule, /\boverflow:\s*visible;/);
  assert.match(parameterFieldRule, /\bgrid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(stylesSource.slice(restoredLayoutIndex), /@container \(min-width: 560px\)/);
  assert.match(
    stylesSource.slice(restoredLayoutIndex),
    /\bgrid-template-columns:\s*minmax\(0, 0.86fr\) minmax\(220px, 1.14fr\);/
  );
  assert.doesNotMatch(stylesSource.slice(restoredLayoutIndex), /\bborder-left:\s*[2-9]px/);
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

test("ParameterInputPanel removes the nested-card DESIGN pass without restoring the legacy skin", () => {
  const restoredLayoutIndex = stylesSource.indexOf("/* Restored inspector layout */");

  assert.ok(restoredLayoutIndex > -1, "Expected the restored inspector layout to exist");
  assert.doesNotMatch(stylesSource, /\/\* DESIGN\.md parameter input pass \*\//);
  assert.doesNotMatch(stylesSource, /\/\* Blueprint inspector skin \*\//);
  assert.doesNotMatch(stylesSource, /var\(--bp-/);

  const panelRule = getLastCssRuleAfter(stylesSource, "panel", restoredLayoutIndex);
  const iconRule = getLastCssRuleContainingAfter(stylesSource, "div.resourceIcon", restoredLayoutIndex);
  const inputRule = getLastCssRuleContainingAfter(stylesSource, ".input,", restoredLayoutIndex);
  const focusRule = getLastCssRuleContainingAfter(stylesSource, ".input:focus", restoredLayoutIndex);
  const addButtonRule = getLastCssRuleContainingAfter(stylesSource, ".addButton {", restoredLayoutIndex);
  const selectedRegionRule = getLastCssRuleAfter(stylesSource, "regionOptionSelected", restoredLayoutIndex);

  assert.match(panelRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(panelRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(panelRule, /\bfont-family:\s*var\(--workspace-font,/);
  assert.match(iconRule, /\bbackground:\s*var\(--workspace-surface-strong,/);
  assert.match(iconRule, /\bborder-color:\s*var\(--workspace-line,/);
  assert.match(inputRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(inputRule, /\bborder-color:\s*var\(--workspace-line,/);
  assert.match(inputRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(focusRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(addButtonRule, /\bbackground:\s*var\(--workspace-accent-soft,/);
  assert.match(addButtonRule, /\bcolor:\s*var\(--workspace-accent,/);
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
