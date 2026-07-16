import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerraformArtifactCanonicalContent } from "./terraform-workspace.js";

test("Terraform bundle canonical content is stable across file order and line endings", () => {
  const input = {
    objectKey: "projects/project/assets/terraform-files.json",
    fileName: "terraform-files.json",
    contentType: "application/vnd.sketchcatch.terraform-files+json"
  };
  const first = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "variables.tf", terraformCode: 'variable "environment" {}\r\n' },
      { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}\r\n' }
    ]
  });
  const second =
    '{"files":[' +
    '{"terraformCode":"resource \\"aws_s3_bucket\\" \\"assets\\" {}\\n","fileName":"main.tf"},' +
    '{"terraformCode":"variable \\"environment\\" {}\\n","fileName":"variables.tf"}' +
    '],"schemaVersion":1}';

  assert.deepEqual(
    createTerraformArtifactCanonicalContent(input, first),
    createTerraformArtifactCanonicalContent(input, second)
  );
});
