import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const parameterInputPanelPath = join(currentDir, "ParameterInputPanel.tsx");

test("Region combobox restores focus to the trigger when closing from menu interactions", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(source, /const triggerButtonRef = useRef<HTMLButtonElement \| null>\(null\);/);
  assert.match(source, /triggerButtonRef\.current\?\.focus\(\);/);
  assert.match(source, /closeMenu\(\{ restoreFocus: true \}\);/);
});

test("Region combobox options stay out of the tab order", () => {
  const source = readFileSync(parameterInputPanelPath, "utf8");

  assert.match(source, /tabIndex=\{-1\}/);
});
