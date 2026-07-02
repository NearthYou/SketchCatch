import assert from "node:assert/strict";
import { test } from "node:test";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import { createTerraformDiagnosticLineHighlights } from "./terraform-diagnostic-line-highlights";

test("createTerraformDiagnosticLineHighlights returns sorted unique red underline positions for error lines", () => {
  const diagnostics: TerraformDiagnostic[] = [
    { line: 3, message: "missing closing brace", severity: "error" },
    { line: 2, message: "quoted reference", severity: "warning" },
    { line: 3, message: "same line duplicate", severity: "error" },
    { line: 1, message: "invalid resource header", severity: "error" },
    { message: "file level error", severity: "error" }
  ];

  assert.deepEqual(
    createTerraformDiagnosticLineHighlights(diagnostics, {
      codeLineCount: 4,
      lineHeight: 20,
      scrollTop: 10,
      verticalPadding: 12
    }),
    [
      { line: 1, style: { top: "20px" } },
      { line: 3, style: { top: "60px" } }
    ]
  );
});

test("createTerraformDiagnosticLineHighlights ignores diagnostics outside the displayed code", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineHighlights(
      [
        { line: 0, message: "invalid line", severity: "error" },
        { line: 3, message: "outside current editor", severity: "error" },
        { line: 1, message: "only visible error", severity: "error" }
      ],
      {
        codeLineCount: 2,
        lineHeight: 19.2,
        scrollTop: 0,
        verticalPadding: 12
      }
    ),
    [{ line: 1, style: { top: "29.2px" } }]
  );
});
