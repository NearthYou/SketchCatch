import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readLocalFile("index.tsx");

test("resource settings logic keeps provider, resource, template, and module contracts", () => {
  assert.match(panelSource, /Resources/);
  assert.match(panelSource, /Templates/);
  assert.match(panelSource, /<AwsLogo \/>/);
  assert.match(panelSource, /awsProviderVersions/);
  assert.match(panelSource, /<ModuleCatalogPanel onModuleAdd=\{onModuleAdd\} \/>/);
  assert.match(panelSource, /<TemplatesPanel onTemplateApply=\{onTemplateApply\} \/>/);
  assert.match(panelSource, /TemplateLibraryModal/);
});

test("resource settings logic does not bring back the removed Brainboard entry", () => {
  assert.doesNotMatch(panelSource, /brainboardTile|kind: "brainboard"|id: "brainboard"/);
});

test("workspace Template panel renders the complete catalog inside its scrollable panel", () => {
  assert.match(panelSource, /<div className="templateCatalogPanel">/);
  assert.match(panelSource, /\{templates\.map\(\(template\) => \(/);
  assert.doesNotMatch(panelSource, /templates\.slice\(0,\s*3\)/);
});

test("workspace Template cards apply their own template while the library control opens the modal", () => {
  assert.match(
    panelSource,
    /templateCatalogCardWide" onClick=\{\(\) => setModalOpen\(true\)\}/
  );
  assert.match(
    panelSource,
    /templateCatalogCard" key=\{template\.id\} onClick=\{\(\) => onTemplateApply\?\.\(template\)\}/
  );
});

test("resource catalog keeps category grouping and flat search results", () => {
  assert.match(panelSource, /resourceCategoryOrderByArea/);
  assert.match(panelSource, /getResourceCategoryGroups\(section\.id,\s*items\)/);
  assert.match(panelSource, /searchResults\.map\(\(item\) =>/);
  assert.match(panelSource, /VPC Core/);
  assert.match(panelSource, /Routing & Gateways/);
  assert.match(panelSource, /Load Balancing/);
});

function readLocalFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
