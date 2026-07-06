import assert from "node:assert/strict";
import { test } from "node:test";
import { explainTerraformError } from "./aiTerraformErrorExplanation.js";

test("explainTerraformError includes diagnostic explanation and safe fix metadata", () => {
  const result = explainTerraformError({
    diagnostic: {
      code: "terraform.trailing_comma",
      line: 2,
      message: "Trailing comma is not valid Terraform syntax",
      severity: "error",
      sourceFileName: "main.tf"
    },
    rawMessage: "terraform.trailing_comma\nTrailing comma is not valid Terraform syntax",
    stage: "validate",
    terraformCodeContext: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs",\n}'
  });

  assert.equal(result.wellArchitectedGuidance.length, 0);
  assert.match(result.consensusRecommendation, /Terraform/);
  assert.equal(result.safeFix?.applicable, true);
  assert.equal(result.safeFix?.code, "terraform.trailing_comma");
  assert.equal(result.diagnosticExplanation?.sourceFileName, "main.tf");
  assert.equal(result.diagnosticExplanation?.line, 2);
  assert.equal(result.diagnosticExplanation?.errorType, "terraform.trailing_comma");
  assert.equal(result.diagnosticExplanation?.canApply, true);
  assert.equal(result.diagnosticExplanation?.codeSuggestion?.source, "rule");
  assert.equal(result.diagnosticExplanation?.codeSuggestion?.currentCode, '  bucket = "logs",');
  assert.equal(result.diagnosticExplanation?.codeSuggestion?.suggestedCode, '  bucket = "logs"');
  assert.deepEqual(result.diagnosticExplanation?.codeFrame.map((line) => line.lineNumber), [1, 2, 3]);
});

test("explainTerraformError disables safe fixes for semantic diagnostics", () => {
  const result = explainTerraformError({
    rawMessage: "terraform.attribute_empty\nArgument value is required",
    stage: "validate"
  });

  assert.equal(result.safeFix?.applicable, false);
  assert.equal(result.safeFix?.code, "terraform.attribute_empty");
});

test("explainTerraformError explains unexpected token diagnostics without exposing fallback wording", () => {
  const result = explainTerraformError({
    rawMessage: "terraform.unexpected_token\nERROR | main.tf:13\n닫힌 block 뒤에 알 수 없는 Terraform 코드가 붙어 있습니다.",
    stage: "validate"
  });

  assert.equal(result.category, "syntax");
  assert.match(result.summary, /닫힌 block/);
  assert.doesNotMatch(result.summary, /fallback/);
  assert.doesNotMatch(result.likelyCause, /fallback/);
  assert.equal(result.safeFix?.applicable, false);
  assert.equal(result.safeFix?.code, "terraform.unexpected_token");
});
