import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorStylesSource = readFileSync(
  fileURLToPath(new URL("./diagram-editor.module.css", import.meta.url)),
  "utf8"
);

test("diagram editor uses partial box selection for overlapping area nodes", () => {
  assert.match(diagramEditorSource, /selectionOnDrag=\{interactionMode === "select"\}/);
  assert.match(diagramEditorSource, /selectionMode=\{SelectionMode\.Partial\}/);
});

test("compact resource node shell does not keep the generic minimum height", () => {
  const resourceShellRule = getCssRule(diagramEditorStylesSource, "nodeShellResource");

  assert.match(resourceShellRule, /\bmin-height:\s*0;/);
});

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}
