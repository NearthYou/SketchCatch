import assert from "node:assert/strict";
import { test } from "node:test";
import { explainTerraformPreview } from "./aiTerraformPreviewExplanation.js";

test("explainTerraformPreview ignores braces inside Terraform comments and strings when parsing blocks", () => {
  const result = explainTerraformPreview(`
resource "aws_s3_bucket" "assets" {
  # This literal } must not close the resource block.
  bucket = "sketchcatch-assets"
}

resource "aws_instance" "web" {
  user_data = "echo }"
  instance_type = "t3.micro"
}
`);

  const bucket = result.detectedResources.find((resource) => resource.terraformType === "aws_s3_bucket");
  const instance = result.detectedResources.find((resource) => resource.terraformType === "aws_instance");

  assert.ok(bucket);
  assert.ok(instance);
  assert.match(bucket.explanation, /sketchcatch-assets/);
  assert.match(instance.explanation, /t3\.micro/);
});
