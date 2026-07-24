import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const selectMenuSource = readFileSync(new URL("./SelectMenu.tsx", import.meta.url), "utf8");
const selectMenuStyles = readFileSync(new URL("./select-menu.module.css", import.meta.url), "utf8");

test("SelectMenu renders its listbox through a body portal", () => {
  assert.match(selectMenuSource, /createPortal/);
  assert.match(selectMenuSource, /document\.body/);
  assert.match(selectMenuSource, /dropdownRef/);
});

test("the portaled SelectMenu listbox uses viewport positioning", () => {
  assert.match(selectMenuSource, /getSelectMenuDropdownPosition/);
  assert.match(selectMenuStyles, /\.selectMenuDropdownPortal\s*\{[^}]*position:\s*fixed;/s);
});

test("workspace selects render an unselected value like a quiet placeholder", () => {
  assert.match(selectMenuSource, /styles\.selectMenuTriggerEmpty/);
  assert.match(
    selectMenuStyles,
    /\.workspaceTone \.selectMenuTriggerEmpty\s*\{[^}]*color:\s*var\(--workspace-placeholder,/s
  );
});
