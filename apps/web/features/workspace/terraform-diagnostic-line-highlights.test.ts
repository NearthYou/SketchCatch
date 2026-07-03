import assert from "node:assert/strict";
import { test } from "node:test";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import { createTerraformDiagnosticLineNumbers } from "./terraform-diagnostic-line-highlights";

test("createTerraformDiagnosticLineNumbers returns sorted unique error line numbers", () => {
  const diagnostics: TerraformDiagnostic[] = [
    { line: 3, message: "missing closing brace", severity: "error" },
    { line: 2, message: "quoted reference", severity: "warning" },
    { line: 3, message: "same line duplicate", severity: "error" },
    { line: 1, message: "invalid resource header", severity: "error" },
    { message: "file level error", severity: "error" }
  ];

  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(diagnostics, {
      codeLineCount: 4
    }),
    [1, 3]
  );
});

test("createTerraformDiagnosticLineNumbers ignores diagnostics outside the displayed code", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(
      [
        { line: 0, message: "invalid line", severity: "error" },
        { line: 3, message: "outside current editor", severity: "error" },
        { line: 1, message: "only visible error", severity: "error" }
      ],
      {
        codeLineCount: 2
      }
    ),
    [1]
  );
});

test("createTerraformDiagnosticLineNumbers filters diagnostics by displayed source file", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(
      [
        { line: 1, message: "network error", severity: "error", sourceFileName: "network.tf" },
        { line: 1, message: "compute error", severity: "error", sourceFileName: "compute.tf" }
      ],
      {
        codeLineCount: 2,
        sourceFileName: "compute.tf"
      }
    ),
    [1]
  );
});

test("createTerraformDiagnosticLineNumbers maps source file lines to resource code lines", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(
      [
        { line: 8, message: "inside block", severity: "error", sourceFileName: "network.tf" },
        { line: 3, message: "outside block", severity: "error", sourceFileName: "network.tf" }
      ],
      {
        codeLineCount: 3,
        sourceFileName: "network.tf",
        sourceLineOffset: 6
      }
    ),
    [2]
  );
});
