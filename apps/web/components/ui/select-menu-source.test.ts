import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const selectMenuSource = readUiFile("SelectMenu.tsx");
const selectMenuStylesSource = readUiFile("select-menu.module.css");

test("SelectMenu exposes a workspace tone for DESIGN.md workspace panels", () => {
  assert.match(
    selectMenuSource,
    /export type SelectMenuTone = "board" \| "default" \| "dashboard" \| "surface" \| "workspace";/
  );
  assert.match(selectMenuSource, /tone === "workspace"/);
  assert.match(selectMenuSource, /return "workspaceTone";/);
  assert.doesNotMatch(selectMenuSource, /purpleTone|tone === "purple"/);
  assert.doesNotMatch(selectMenuStylesSource, /\.purpleTone/);
});

test("SelectMenu surface tone provides the shared dashboard dropdown typography", () => {
  const triggerRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".surfaceTone .selectMenuTrigger"
  );
  const optionLabelRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".surfaceTone .selectMenuOptionLabel"
  );
  const selectedLabelRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".surfaceTone .selectMenuOptionSelected .selectMenuOptionLabel"
  );

  assert.match(triggerRule, /font-family:\s*var\(--font-sans\)/);
  assert.match(triggerRule, /font-size:\s*14px/);
  assert.match(triggerRule, /font-weight:\s*500/);
  assert.match(triggerRule, /min-height:\s*42px/);
  assert.match(optionLabelRule, /font-size:\s*14px/);
  assert.match(optionLabelRule, /font-weight:\s*500/);
  assert.match(selectedLabelRule, /font-weight:\s*600/);

  const surfaceToneStyles = selectMenuStylesSource.slice(
    selectMenuStylesSource.indexOf(".surfaceTone"),
    selectMenuStylesSource.indexOf(".dashboardTone")
  );
  assert.match(surfaceToneStyles, /var\(--color-canvas\)/);
  assert.match(surfaceToneStyles, /var\(--color-hairline-strong\)/);
  assert.match(surfaceToneStyles, /var\(--radius-control\)/);
  assert.doesNotMatch(surfaceToneStyles, /#[0-9a-f]{3,8}\b/i);
});

test("SelectMenu board tone uses the calm Board tokens", () => {
  const triggerRule = getCssRuleContaining(selectMenuStylesSource, ".boardTone .selectMenuTrigger");
  const focusRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".boardTone .selectMenuTriggerOpen"
  );
  const selectedRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".boardTone .selectMenuOptionSelected"
  );

  assert.match(triggerRule, /background:\s*var\(--board-surface,/);
  assert.match(triggerRule, /border-color:\s*var\(--board-border,/);
  assert.match(focusRule, /border-color:\s*var\(--board-primary,/);
  assert.match(focusRule, /box-shadow:[^}]*var\(--board-primary,/s);
  assert.match(selectedRule, /background:\s*var\(--board-primary-soft,/);
});

test("SelectMenu workspace tone uses neutral workspace tokens", () => {
  const workspaceTriggerRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".workspaceTone .selectMenuTrigger"
  );
  const workspaceOpenRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".workspaceTone .selectMenuTriggerOpen"
  );
  const workspaceSelectedRule = getCssRuleContaining(
    selectMenuStylesSource,
    ".workspaceTone .selectMenuOptionSelected"
  );

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

test("SelectMenu keeps option detail out of the closed trigger value", () => {
  assert.match(
    selectMenuSource,
    /function getSelectMenuTriggerLabel\(option: SelectMenuOption\): string \{\s*return option\.label;\s*\}/
  );
  assert.doesNotMatch(
    selectMenuSource,
    /return option\.detail \? `\$\{option\.label\} \| \$\{option\.detail\}` : option\.label;/
  );
  assert.match(selectMenuSource, /className=\{styles\.selectMenuOptionDetail\}/);
});

function readUiFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function getCssRuleContaining(source: string, selectorFragment: string): string {
  const selectorIndex = source.indexOf(selectorFragment);

  assert.ok(selectorIndex > -1, `Expected CSS rule containing ${selectorFragment}`);

  const blockStart = source.indexOf("{", selectorIndex);
  const blockEnd = source.indexOf("}", blockStart);

  assert.ok(
    blockStart > selectorIndex,
    `Expected CSS rule ${selectorFragment} to have a block start`
  );
  assert.ok(blockEnd > blockStart, `Expected CSS rule ${selectorFragment} to have a block end`);

  return source.slice(selectorIndex, blockEnd + 1);
}
