import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readLocalFile("index.tsx");
const editorStyles = readLocalFile("../diagram-editor/diagram-editor.module.css");
const modalStyles = readLocalFile("template-library-modal.module.css");

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
    /templateCatalogCard templateLibraryOpenCard"[\s\S]*onClick=\{\(\) => setModalOpen\(true\)\}/
  );
  assert.match(
    panelSource,
    /templateCatalogCard templateApplyCard"[\s\S]*key=\{template\.id\}[\s\S]*onClick=\{\(\) => onTemplateApply\?\.\(template\)\}/
  );
  assert.match(panelSource, /aria-label="Template library 큰 미리보기 열기"/);
  assert.match(panelSource, /aria-label=\{`\$\{template\.title\} Template 적용`\}/);
});

test("workspace Template 전체보기 uses a body Portal below the project navigator", () => {
  assert.match(panelSource, /import \{ createPortal \} from "react-dom"/);
  assert.match(panelSource, /aria-label="템플릿 전체보기"/);
  assert.match(panelSource, /return createPortal\([\s\S]*document\.body/);

  const overlayStyle = readCssRule(modalStyles, ".overlay");
  const dialogStyle = readCssRule(modalStyles, ".dialog");
  assert.match(overlayStyle, /inset:\s*64px 0 0/);
  assert.match(dialogStyle, /max-height:\s*calc\(100dvh - 112px\)/);
});

test("workspace Template catalog owns a stable scroll viewport with all rows top-aligned", () => {
  const catalogStyle = readCssRule(editorStyles, ".leftRail :global(.templateCatalogPanel)");

  assert.match(catalogStyle, /align-content:\s*start/);
  assert.match(catalogStyle, /grid-auto-rows:\s*max-content/);
  assert.match(catalogStyle, /overflow-y:\s*auto/);
  assert.match(catalogStyle, /overscroll-behavior:\s*contain/);
  assert.match(catalogStyle, /scrollbar-gutter:\s*stable/);
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

function readCssRule(source: string, selector: string): string {
  const selectorIndex = source.indexOf(selector);

  assert.ok(selectorIndex >= 0, `Missing CSS selector: ${selector}`);
  const ruleStart = source.indexOf("{", selectorIndex);
  const ruleEnd = source.indexOf("}", ruleStart);

  assert.ok(ruleStart >= 0 && ruleEnd > ruleStart, `Invalid CSS rule: ${selector}`);
  return source.slice(ruleStart, ruleEnd + 1);
}
