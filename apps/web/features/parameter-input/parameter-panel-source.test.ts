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
