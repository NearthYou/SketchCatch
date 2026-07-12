import assert from "node:assert/strict";
import { test } from "node:test";
import { scanTerraformWithDeterministicGate } from "./deterministic-terraform-gate.js";

test("deterministic Terraform gate detects the four immediate blocking risk families", () => {
  const findings = scanTerraformWithDeterministicGate([
    {
      fileName: "main.tf",
      terraformCode: `
resource "aws_s3_bucket_acl" "public" { acl = "public-read" }
resource "aws_security_group" "ssh" {
  ingress { from_port = 22 cidr_blocks = ["0.0.0.0/0"] }
}
resource "aws_db_instance" "db" { publicly_accessible = true }
resource "aws_iam_policy" "admin" {
  policy = jsonencode({ Statement = [{ Action = "*" }] })
}
`
    }
  ]);

  assert.deepEqual(
    findings.map((finding) => finding.riskFamily),
    ["S3_PUBLIC_ACCESS", "PUBLIC_SSH", "PUBLIC_RDS", "IAM_WILDCARD"]
  );
  assert.ok(findings.every((finding) => finding.severity === "high"));
});

test("deterministic Terraform gate leaves private least-privilege resources clear", () => {
  const findings = scanTerraformWithDeterministicGate([
    {
      fileName: "safe.tf",
      terraformCode: `
resource "aws_s3_bucket" "private" {}
resource "aws_db_instance" "db" { publicly_accessible = false }
resource "aws_iam_policy" "reader" {
  policy = jsonencode({ Statement = [{ Action = "s3:GetObject" }] })
}
`
    }
  ]);

  assert.deepEqual(findings, []);
});

test("deterministic Terraform gate does not attribute an IAM wildcard to a private S3 block", () => {
  const findings = scanTerraformWithDeterministicGate([
    {
      fileName: "mixed.tf",
      terraformCode: `
resource "aws_s3_bucket" "private" {}
resource "aws_iam_policy" "admin" {
  policy = jsonencode({ Statement = [{ Action = "*" }] })
}
`
    }
  ]);

  assert.deepEqual(findings.map((finding) => finding.riskFamily), ["IAM_WILDCARD"]);
  assert.equal(findings[0]?.resourceId, "aws_iam_policy.admin");
});
