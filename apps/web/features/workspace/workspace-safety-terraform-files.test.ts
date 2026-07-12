import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkspaceSafetyTerraformFiles } from "./workspace-safety-terraform-files";

test("createWorkspaceSafetyTerraformFiles preserves each populated Terraform file boundary", () => {
  const result = createWorkspaceSafetyTerraformFiles([
    {
      code: 'terraform { required_version = ">= 1.6.0" }\n',
      fileName: "providers.tf"
    },
    {
      code: 'resource "aws_s3_bucket" "assets" {}\n',
      fileName: "main.tf"
    },
    {
      code: "   ",
      fileName: "empty.tf"
    }
  ]);

  assert.deepEqual(result, [
    {
      fileName: "providers.tf",
      terraformCode: 'terraform { required_version = ">= 1.6.0" }\n'
    },
    {
      fileName: "main.tf",
      terraformCode: 'resource "aws_s3_bucket" "assets" {}\n'
    }
  ]);
});
