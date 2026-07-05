import assert from "node:assert/strict";
import { test } from "node:test";
import { explainTerraformError } from "./aiTerraformErrorExplanation.js";

test("explainTerraformError includes Well-Architected guidance and safe fix metadata", () => {
  const result = explainTerraformError({
    rawMessage: "terraform.trailing_comma\nTrailing comma is not valid Terraform syntax",
    stage: "validate"
  });

  assert.equal(result.wellArchitectedGuidance.length, 6);
  assert.deepEqual(
    result.wellArchitectedGuidance.map((guidance) => guidance.pillar),
    ["operational_excellence", "security", "reliability", "performance_efficiency", "cost_optimization", "sustainability"]
  );
  assert.match(result.consensusRecommendation, /Terraform/);
  assert.equal(result.safeFix?.applicable, true);
  assert.equal(result.safeFix?.code, "terraform.trailing_comma");
});

test("explainTerraformError disables safe fixes for semantic diagnostics", () => {
  const result = explainTerraformError({
    rawMessage: "terraform.attribute_empty\nArgument value is required",
    stage: "validate"
  });

  assert.equal(result.safeFix?.applicable, false);
  assert.equal(result.safeFix?.code, "terraform.attribute_empty");
});
