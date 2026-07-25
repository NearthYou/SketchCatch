import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
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

test("Terraform bundle canonical content uses locale-independent file ordering", () => {
  const input = {
    objectKey: "projects/project/assets/terraform-files.json",
    fileName: "terraform-files.json",
    contentType: "application/vnd.sketchcatch.terraform-files+json"
  };
  const content = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "z.tf", terraformCode: "# z\n" },
      { fileName: "A.tf", terraformCode: "# A\n" },
      { fileName: "a.tf", terraformCode: "# a\n" },
      { fileName: "Z.tf", terraformCode: "# Z\n" }
    ]
  });
  const canonical = JSON.parse(
    createTerraformArtifactCanonicalContent(input, content).toString("utf8")
  ) as { files: Array<{ fileName: string }> };

  assert.deepEqual(
    canonical.files.map((file) => file.fileName),
    ["A.tf", "Z.tf", "a.tf", "z.tf"]
  );
});

test("Terraform bundle fingerprint includes the server-owned imports.tf content", () => {
  const input = {
    objectKey: "projects/project/assets/artifact-main.tf",
    fileName: "terraform-files.json",
    contentType: "application/vnd.sketchcatch.terraform-files+json"
  };
  const bundle = (importId: string) =>
    JSON.stringify({
      schemaVersion: 1,
      files: [
        {
          fileName: "main.tf",
          terraformCode: 'resource "aws_s3_bucket" "existing_bucket" {}\n'
        },
        {
          fileName: "imports.tf",
          terraformCode: `import {\n  to = aws_s3_bucket.existing_bucket\n  id = "${importId}"\n}\n`
        }
      ]
    });
  const fingerprint = (content: string) =>
    createHash("sha256")
      .update(createTerraformArtifactCanonicalContent(input, content))
      .digest("hex");

  assert.notEqual(fingerprint(bundle("existing-bucket")), fingerprint(bundle("other-bucket")));
});
