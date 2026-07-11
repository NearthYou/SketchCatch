import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareTerraformWorkspace } from "./terraform-workspace.js";

test("prepareTerraformWorkspace writes safe Terraform files into an isolated temp directory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sketchcatch-workspace-test-"));
  const workspace = await prepareTerraformWorkspace(
    {
      objectKey: "projects/project-id/assets/terraform_file/main.tf",
      fileName: "../main.tf"
    },
    {
      rootDir,
      downloadTerraformArtifact: async () => "terraform { required_version = \">= 1.6.0\" }\n"
    }
  );

  try {
    assert.equal(workspace.mainFilePath.endsWith("main.tf"), true);
    assert.equal(await readFile(workspace.mainFilePath, "utf8"), "terraform { required_version = \">= 1.6.0\" }\n");
  } finally {
    await workspace.cleanup();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("prepareTerraformWorkspace rejects Terraform artifacts larger than the configured limit", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sketchcatch-workspace-test-"));

  try {
    await assert.rejects(
      () =>
        prepareTerraformWorkspace(
          {
            objectKey: "projects/project-id/assets/terraform_file/main.tf",
            fileName: "main.tf"
          },
          {
            rootDir,
            maxTerraformArtifactBytes: 16,
            downloadTerraformArtifact: async () => "x".repeat(17)
          }
        ),
      /exceeds the 16 byte size limit/
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("prepareTerraformWorkspace expands a multi-file Terraform bundle", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sketchcatch-workspace-test-"));
  const workspace = await prepareTerraformWorkspace(
    {
      objectKey: "projects/project-id/assets/terraform_file/terraform-files.json",
      fileName: "terraform-files.json",
      contentType: "application/vnd.sketchcatch.terraform-files+json"
    },
    {
      rootDir,
      downloadTerraformArtifact: async () => JSON.stringify({
        schemaVersion: 1,
        files: [
          { fileName: "providers.tf", terraformCode: 'terraform { required_version = ">= 1.6.0" }\n' },
          { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}\n' }
        ]
      })
    }
  );

  try {
    const files = await readdir(workspace.workdir);
    assert.deepEqual(files.sort(), [".sketchcatch-artifact.txt", "main.tf", "providers.tf"]);
    assert.match(await readFile(join(workspace.workdir, "providers.tf"), "utf8"), /required_version/);
    assert.match(await readFile(join(workspace.workdir, "main.tf"), "utf8"), /aws_s3_bucket/);
    assert.match(await readFile(workspace.mainFilePath, "utf8"), /SketchCatch file: providers.tf/);
  } finally {
    await workspace.cleanup();
    await rm(rootDir, { recursive: true, force: true });
  }
});
