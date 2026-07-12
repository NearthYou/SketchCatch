import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const terraformCodePanelSource = readFileSync(
  new URL("./TerraformCodePanel.tsx", import.meta.url),
  "utf8"
);

test("Terraform editor handles Tab indentation and restores the selection", () => {
  assert.match(terraformCodePanelSource, /applyTerraformEditorIndentation/);
  assert.match(terraformCodePanelSource, /event\.key === "Tab"/);
  assert.match(terraformCodePanelSource, /outdent: event\.shiftKey/);
  assert.match(terraformCodePanelSource, /requestAnimationFrame/);
  assert.match(
    terraformCodePanelSource,
    /setSelectionRange\(\s*indentation\.selectionStart,\s*indentation\.selectionEnd\s*\)/
  );
});

test("Terraform editor keeps the Ctrl or Command save shortcut", () => {
  assert.match(
    terraformCodePanelSource,
    /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key\.toLowerCase\(\) === "s"/
  );
  assert.match(terraformCodePanelSource, /void saveCodeToDiagram\(\)/);
});
