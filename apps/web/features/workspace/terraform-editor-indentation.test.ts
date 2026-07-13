import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTerraformEditorIndentation } from "./terraform-editor-indentation";

test("Tab inserts two spaces at a collapsed cursor", () => {
  assert.deepEqual(
    applyTerraformEditorIndentation({
      code: "abc",
      outdent: false,
      selectionEnd: 1,
      selectionStart: 1
    }),
    {
      code: "a  bc",
      selectionEnd: 3,
      selectionStart: 3
    }
  );
});

test("Tab indents every selected line", () => {
  const code = 'resource {\nname = "x"\n}';

  assert.deepEqual(
    applyTerraformEditorIndentation({
      code,
      outdent: false,
      selectionEnd: code.length,
      selectionStart: 0
    }),
    {
      code: '  resource {\n  name = "x"\n  }',
      selectionEnd: code.length + 6,
      selectionStart: 2
    }
  );
});

test("Tab excludes a final line when the selection ends at its start", () => {
  assert.deepEqual(
    applyTerraformEditorIndentation({
      code: "a\nb\nc",
      outdent: false,
      selectionEnd: 4,
      selectionStart: 0
    }),
    {
      code: "  a\n  b\nc",
      selectionEnd: 8,
      selectionStart: 2
    }
  );
});

test("Shift+Tab removes up to two leading spaces from the current line", () => {
  assert.deepEqual(
    applyTerraformEditorIndentation({
      code: "  name",
      outdent: true,
      selectionEnd: 4,
      selectionStart: 4
    }),
    {
      code: "name",
      selectionEnd: 2,
      selectionStart: 2
    }
  );
});

test("Shift+Tab outdents selected lines with spaces or a tab", () => {
  const code = "  a\n b\n\tc\nd";

  assert.deepEqual(
    applyTerraformEditorIndentation({
      code,
      outdent: true,
      selectionEnd: code.length,
      selectionStart: 0
    }),
    {
      code: "a\nb\nc\nd",
      selectionEnd: 7,
      selectionStart: 0
    }
  );
});

test("multi-line indentation preserves CRLF line endings", () => {
  assert.deepEqual(
    applyTerraformEditorIndentation({
      code: "a\r\nb",
      outdent: false,
      selectionEnd: 4,
      selectionStart: 0
    }),
    {
      code: "  a\r\n  b",
      selectionEnd: 8,
      selectionStart: 2
    }
  );
});
