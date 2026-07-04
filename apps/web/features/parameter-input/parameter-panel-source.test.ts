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

test("ParameterInputPanel validates Availability Zone metadata before save", () => {
  assert.match(panelSource, /getAwsAvailabilityZoneValidationError\(selectedAvailabilityZone\)/);
  assert.match(panelSource, /error=\{availabilityZoneError\}/);
});

test("ParameterInputPanel keeps invalid Availability Zone drafts out of metadata", () => {
  assert.match(panelSource, /function AvailabilityZoneField/);
  assert.match(panelSource, /isAwsAvailabilityZoneCode\(nextAvailabilityZone\)/);
});

function readParameterInputFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
