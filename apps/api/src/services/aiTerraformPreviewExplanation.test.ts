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
  assert.equal(result.wellArchitectedGuidance.length, 6);
  assert.equal(
    result.wellArchitectedGuidance.some((guidance) => guidance.title === "성능 효율성 에이전트"),
    true
  );
  assert.match(result.consensusRecommendation, /결론/);
});

test("explainTerraformPreview evaluates open SSH with six Well-Architected agents", () => {
  const result = explainTerraformPreview(`
resource "aws_security_group_rule" "ssh" {
  type = "ingress"
  from_port = 22
  to_port = 22
  cidr_blocks = ["0.0.0.0/0"]
}
`);

  const securityGuidance = result.wellArchitectedGuidance.find((guidance) => guidance.pillar === "security");

  assert.equal(result.wellArchitectedGuidance.length, 6);
  assert.ok(securityGuidance);
  assert.match(securityGuidance.observation, /SSH 22번 포트/);
  assert.match(securityGuidance.recommendation, /관리자 고정 IP|VPN CIDR/);
  assert.match(result.consensusRecommendation, /보안 위험/);
});
