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

test("createTerraformDiagnosticLineNumbers ignores source-less diagnostics for a selected file", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(
      [{ line: 1, message: "missing source", severity: "error" }],
      {
        codeLineCount: 2,
        sourceFileName: "network.tf"
      }
    ),
    []
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

test("createTerraformDiagnosticLineNumbers keeps unclosed string errors on their source line", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(
      [
        {
          code: "terraform.unbalanced",
          line: 20,
          message: "문자열 따옴표가 닫히지 않았습니다.",
          severity: "error",
          sourceFileName: "main.tf"
        }
      ],
      {
        codeLineCount: 26,
        sourceFileName: "main.tf"
      }
    ),
    [20]
  );
});

test("createTerraformDiagnosticLineNumbers maps unclosed string errors inside resource code mode", () => {
  assert.deepEqual(
    createTerraformDiagnosticLineNumbers(
      [
        {
          code: "terraform.unbalanced",
          line: 20,
          message: "문자열 따옴표가 닫히지 않았습니다.",
          severity: "error",
          sourceFileName: "network.tf"
        }
      ],
      {
        codeLineCount: 8,
        sourceFileName: "network.tf",
        sourceLineOffset: 17
      }
    ),
    [3]
  );
});
