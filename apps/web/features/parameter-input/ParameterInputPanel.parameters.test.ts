import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const parameterInputPanelPath = join(currentDir, "ParameterInputPanel.tsx");

test("ParameterInputPanel renders only required definitions in Main parameters", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(source, /getRequiredDefinitions/);
  assert.match(
    source,
    /const catalogDefinitions = parameterCatalog\.resources\[parameters\.resourceType\] \?\? \[\];/
  );
  assert.match(source, /const mainDefinitions = getRequiredDefinitions\(catalogDefinitions\);/);
  assert.match(source, /mainDefinitions\.map\(\(definition\) =>/);
  assert.doesNotMatch(source, /definitions\.map\(\(definition\) =>/);
});

test("ParameterInputPanel validates required and stored optional definitions", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(source, /getValidationDefinitions/);
  assert.match(
    source,
    /const validationDefinitions = getValidationDefinitions\(\s*catalogDefinitions,\s*parameters\.values\s*\);/
  );
  assert.match(source, /validateParameters\(\s*parameters,\s*validationDefinitions,/);
  assert.match(
    source,
    /const nextValidationDefinitions = getValidationDefinitions\(\s*catalogDefinitions,\s*nextParameters\.values\s*\);/
  );
  assert.match(source, /validateParameters\(\s*nextParameters,\s*nextValidationDefinitions,/);
});

test("ParameterInputPanel renders stored and newly added optional definitions in Advanced parameters", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(source, /getActiveOptionalDefinitions/);
  assert.match(source, /getOptionalDefinitions/);
  assert.match(source, /const \[advancedParameterQuery, setAdvancedParameterQuery\] = useState\(""\);/);
  assert.match(source, /const \[addedOptionalParameterNames, setAddedOptionalParameterNames\] = useState<string\[\]>\(\[\]\);/);
  assert.match(
    source,
    /const advancedDefinitions = getAdvancedDefinitions\(\s*activeOptionalDefinitions,\s*optionalDefinitions,\s*addedOptionalParameterNames\s*\);/
  );
  assert.match(source, /aria-label="Advanced Parameters"/);
  assert.match(source, /advancedDefinitions\.map\(\(definition\) =>/);
});

test("ParameterInputPanel lets users search and add hidden optional parameters", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(
    source,
    /const availableAdvancedDefinitions = filterAdvancedDefinitions\(\s*optionalDefinitions,\s*advancedDefinitions,\s*advancedParameterQuery\s*\);/
  );
  assert.match(source, /placeholder="Search optional parameter\.\.\."/);
  assert.match(source, /aria-label="Optional parameter search"/);
  assert.match(source, /setAdvancedParameterQuery\(event\.currentTarget\.value\)/);
  assert.match(source, /availableAdvancedDefinitions\.map\(\(definition\) =>/);
  assert.match(source, /const addAdvancedParameter = \(definition: ParameterCatalogDefinition\) => \{/);
  assert.match(
    source,
    /setAddedOptionalParameterNames\(\(currentNames\) =>\s*currentNames\.includes\(definition\.name\)/
  );
  assert.match(source, /setAdvancedParameterQuery\(""\);/);
  assert.match(source, /onClick=\{\(\) => addAdvancedParameter\(definition\)\}/);
});

test("ParameterInputPanel lets users remove advanced optional parameters and stored values", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(source, /const removeAdvancedParameter = \(definition: ParameterCatalogDefinition\) => \{/);
  assert.match(
    source,
    /setAddedOptionalParameterNames\(\(currentNames\) =>\s*currentNames\.filter\(\(name\) => name !== definition\.name\)\s*\);/
  );
  assert.match(source, /values: deleteRecordValue\(parameters\.values, definition\.name\)/);
  assert.match(source, /onRemove=\{\(\) => removeAdvancedParameter\(definition\)\}/);
  assert.match(source, /label=\{`\$\{definition\.label\} 삭제`\}/);
});
