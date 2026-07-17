import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeGeneratedTerraformFiles } from "./terraform-panel-utils";

test("provider generation does not add providers.tf when the existing module declares required_providers", () => {
  const existingFiles = [
    {
      fileName: "main.tf",
      code: `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

resource "aws_s3_bucket" "assets" {}`
    }
  ];
  const generatedFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}`
    },
    {
      fileName: "main.tf",
      code: `resource "aws_s3_bucket" "assets" {}`
    }
  ];

  const result = mergeGeneratedTerraformFiles(existingFiles, generatedFiles, new Set());

  assert.deepEqual(result.map((file) => file.fileName), ["main.tf"]);
  assert.equal(result[0]?.code.match(/required_providers/g)?.length, 1);
});
