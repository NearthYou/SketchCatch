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

test("createTerraformDiagnosticLineHighlights filters diagnostics by displayed source file", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineHighlights(
      [
        { line: 1, message: "network error", severity: "error", sourceFileName: "network.tf" },
        { line: 1, message: "compute error", severity: "error", sourceFileName: "compute.tf" }
      ],
      {
        codeLineCount: 2,
        lineHeight: 20,
        scrollTop: 0,
        sourceFileName: "compute.tf",
        verticalPadding: 12
      }
    ),
    [{ line: 1, style: { top: "30px" } }]
  );
});

test("createTerraformDiagnosticLineHighlights maps source file lines to resource code lines", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineHighlights(
      [
        { line: 8, message: "inside block", severity: "error", sourceFileName: "network.tf" },
        { line: 3, message: "outside block", severity: "error", sourceFileName: "network.tf" }
      ],
      {
        codeLineCount: 3,
        lineHeight: 20,
        scrollTop: 0,
        sourceFileName: "network.tf",
        sourceLineOffset: 6,
        verticalPadding: 12
      }
    ),
    [{ line: 2, style: { top: "50px" } }]
  );
});
