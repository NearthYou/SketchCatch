import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const selectMenuSource = readUiFile("SelectMenu.tsx");
const selectMenuStylesSource = readUiFile("select-menu.module.css");

test("SelectMenu exposes a workspace tone for DESIGN.md workspace panels", () => {
  assert.match(selectMenuSource, /export type SelectMenuTone = "default" \| "dashboard" \| "purple" \| "workspace";/);
  assert.match(selectMenuSource, /tone === "workspace"/);
  assert.match(selectMenuSource, /return "workspaceTone";/);
});

test("SelectMenu workspace tone uses neutral workspace tokens", () => {
  const workspaceTriggerRule = getCssRuleContaining(selectMenuStylesSource, ".workspaceTone .selectMenuTrigger");
  const workspaceOpenRule = getCssRuleContaining(selectMenuStylesSource, ".workspaceTone .selectMenuTriggerOpen");
  const workspaceSelectedRule = getCssRuleContaining(selectMenuStylesSource, ".workspaceTone .selectMenuOptionSelected");

  assert.match(workspaceTriggerRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(workspaceTriggerRule, /\bborder-color:\s*var\(--workspace-line,/);
  assert.match(workspaceTriggerRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(workspaceOpenRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(workspaceSelectedRule, /\bbackground:\s*var\(--workspace-surface-strong,/);
  assert.match(workspaceSelectedRule, /\bcolor:\s*var\(--workspace-text,/);

  for (const workspaceRule of [workspaceTriggerRule, workspaceOpenRule, workspaceSelectedRule]) {
    assert.doesNotMatch(workspaceRule, /#2f6db3|#1f5fbf|#eef4ff|#f0f7ff|#8b71ff|#5f3de8/i);
  }
});

function readUiFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function getCssRuleContaining(source: string, selectorFragment: string): string {
  const selectorIndex = source.indexOf(selectorFragment);

  assert.ok(selectorIndex > -1, `Expected CSS rule containing ${selectorFragment}`);

  const blockStart = source.indexOf("{", selectorIndex);
  const blockEnd = source.indexOf("}", blockStart);

  assert.ok(blockStart > selectorIndex, `Expected CSS rule ${selectorFragment} to have a block start`);
  assert.ok(blockEnd > blockStart, `Expected CSS rule ${selectorFragment} to have a block end`);

  return source.slice(selectorIndex, blockEnd + 1);
}
