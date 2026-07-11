import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTerraformDiagnosticSeverity } from "./terraform-diagnostic-presentation";

test("formatTerraformDiagnosticSeverity keeps error, warning, and info distinct", () => {
  assert.equal(formatTerraformDiagnosticSeverity("error"), "오류");
  assert.equal(formatTerraformDiagnosticSeverity("warning"), "경고");
  assert.equal(formatTerraformDiagnosticSeverity("info"), "정보");
});
