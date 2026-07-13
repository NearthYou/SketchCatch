import assert from "node:assert/strict";
import { test } from "node:test";

import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";

import { createTerraformDiagnostics } from "./terraform-diagnostics.js";

test("recognizes the EC2 managed prefix list data source", () => {
  const terraformCode = `data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}`;

  const diagnostics = createTerraformDiagnostics(terraformCode);
  const definition = getResourceDefinitionByTerraform("data", "aws_ec2_managed_prefix_list");

  assert.ok(definition);
  assert.equal(definition.terraform.blockType, "data");
  assert.equal(definition.capabilities.terraformPreview, true);
  assert.equal(definition.capabilities.terraformSync, true);
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "terraform.unsupported_resource"),
    false
  );
});
