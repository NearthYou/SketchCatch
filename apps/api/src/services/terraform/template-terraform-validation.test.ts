import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATE_IDS } from "@sketchcatch/types";
import { assertTerraformArtifactIsSafe } from "../../deployments/terraform-artifact-safety.js";
import { createTemplateTerraformValidationFiles } from "./template-terraform-validation.js";

test("creates provider-aware Terraform validation files for AWS and EKS templates", () => {
  // Given
  const input = { projectSlug: "validation", shortId: "test01" };

  // When
  const staticFiles = createTemplateTerraformValidationFiles("static-web-hosting", input);
  const minimalFiles = createTemplateTerraformValidationFiles("minimal-serverless-api", input);
  const eksFiles = createTemplateTerraformValidationFiles("eks-container-app", input);

  // Then
  assert.deepEqual(staticFiles.map((file) => file.fileName), ["providers.tf", "main.tf"]);
  assert.match(staticFiles[0]?.terraformCode ?? "", /source\s*= "hashicorp\/aws"/);
  assert.match(staticFiles[0]?.terraformCode ?? "", /version\s*= "~> 5\.0"/);
  assert.doesNotMatch(staticFiles[0]?.terraformCode ?? "", /hashicorp\/kubernetes/);
  assert.match(minimalFiles[0]?.terraformCode ?? "", /source\s*= "hashicorp\/archive"/);
  assert.match(eksFiles[0]?.terraformCode ?? "", /source\s*= "hashicorp\/kubernetes"/);
  assert.match(eksFiles[0]?.terraformCode ?? "", /provider "kubernetes"/);
  assert.match(eksFiles[0]?.terraformCode ?? "", /data "aws_eks_cluster_auth" "sketchcatch"/);
  assert.match(eksFiles[1]?.terraformCode ?? "", /resource "kubernetes_deployment"/);
});

test("all template Terraform files pass the live deployment safety profile", () => {
  for (const templateId of TEMPLATE_IDS) {
    const terraformCode = createTemplateTerraformValidationFiles(templateId, {
      projectSlug: "safety",
      shortId: "test01"
    }).map((file) => file.terraformCode).join("\n\n");

    assert.doesNotThrow(
      () => assertTerraformArtifactIsSafe(terraformCode, {
        liveProfile: "demo_web_service_with_rds"
      }),
      templateId
    );
  }
});
