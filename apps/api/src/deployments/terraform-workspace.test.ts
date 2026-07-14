import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystemProjectAssetStorage } from "../projects/filesystem-project-asset-storage.js";
import {
  createTerraformArtifactCanonicalContent,
  createTerraformFilesSafetyContent,
  parseTerraformArtifactBundle,
  prepareTerraformWorkspace
} from "./terraform-workspace.js";

const TERRAFORM_BUNDLE_INPUT = {
  objectKey: "projects/project-id/assets/terraform_file/terraform-files.json",
  fileName: "terraform-files.json",
  contentType: "application/vnd.sketchcatch.terraform-files+json"
} as const;

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
    assert.deepEqual(workspace.terraformFiles, [
      {
        fileName: "main.tf",
        terraformCode: "terraform { required_version = \">= 1.6.0\" }\n"
      }
    ]);
  } finally {
    await workspace.cleanup();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("prepareTerraformWorkspace reads from the configured Project asset storage", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sketchcatch-workspace-test-"));
  const assetRoot = join(await realpath(rootDir), "project-assets");
  const projectAssetStorage = createFilesystemProjectAssetStorage({ rootDirectory: assetRoot });
  const objectKey = "projects/project-id/assets/terraform_file/main.tf";
  const terraformCode = 'resource "aws_s3_bucket" "assets" {}\n';

  await projectAssetStorage.putObject({
    objectKey,
    contentType: "text/plain",
    body: terraformCode
  });

  const workspace = await prepareTerraformWorkspace(
    {
      objectKey,
      fileName: "main.tf",
      contentType: "text/plain"
    },
    {
      rootDir,
      projectAssetStorage
    }
  );

  try {
    assert.equal(await readFile(workspace.mainFilePath, "utf8"), terraformCode);
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
    assert.deepEqual(JSON.parse(await readFile(workspace.mainFilePath, "utf8")), {
      schemaVersion: 1,
      files: [
        {
          fileName: "providers.tf",
          terraformCode: 'terraform { required_version = ">= 1.6.0" }\n'
        },
        {
          fileName: "main.tf",
          terraformCode: 'resource "aws_s3_bucket" "assets" {}\n'
        }
      ]
    });
    assert.deepEqual(workspace.terraformFiles, [
      {
        fileName: "providers.tf",
        terraformCode: 'terraform { required_version = ">= 1.6.0" }\n'
      },
      {
        fileName: "main.tf",
        terraformCode: 'resource "aws_s3_bucket" "assets" {}\n'
      }
    ]);
  } finally {
    await workspace.cleanup();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("prepareTerraformWorkspace restores tftpl support files without treating them as HCL", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "sketchcatch-workspace-test-"));
  const mainCode = `resource "aws_launch_template" "traffic" {
  user_data = base64encode(templatefile("\${path.module}/user-data.sh.tftpl", {}))
}\n`;
  const templateCode = "#!/bin/bash\necho ready\n";
  const workspace = await prepareTerraformWorkspace(
    TERRAFORM_BUNDLE_INPUT,
    {
      rootDir,
      downloadTerraformArtifact: async () => JSON.stringify({
        schemaVersion: 1,
        files: [
          { fileName: "main.tf", terraformCode: mainCode },
          { fileName: "user-data.sh.tftpl", terraformCode: templateCode }
        ]
      })
    }
  );

  try {
    assert.equal(await readFile(join(workspace.workdir, "user-data.sh.tftpl"), "utf8"), templateCode);
    assert.equal(createTerraformFilesSafetyContent(workspace.terraformFiles, ""), mainCode);
  } finally {
    await workspace.cleanup();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("parseTerraformArtifactBundle rejects unrelated support file extensions", () => {
  assert.throws(
    () =>
      parseTerraformArtifactBundle(JSON.stringify({
        schemaVersion: 1,
        files: [
          { fileName: "main.tf", terraformCode: "terraform {}" },
          { fileName: "bootstrap.sh", terraformCode: "#!/bin/bash" }
        ]
      })),
    /unsafe or duplicate file name/
  );
});

test("createTerraformArtifactCanonicalContent keeps file boundaries unambiguous", () => {
  const firstBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      {
        fileName: "first.tf",
        terraformCode: "value-a\n\n# SketchCatch file: second.tf\nvalue-b"
      }
    ]
  });
  const secondBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "first.tf", terraformCode: "value-a" },
      { fileName: "second.tf", terraformCode: "value-b" }
    ]
  });

  const firstCanonicalContent = createTerraformArtifactCanonicalContent(
    TERRAFORM_BUNDLE_INPUT,
    firstBundle
  );
  const secondCanonicalContent = createTerraformArtifactCanonicalContent(
    TERRAFORM_BUNDLE_INPUT,
    secondBundle
  );

  assert.notDeepEqual(firstCanonicalContent, secondCanonicalContent);
});

test("createTerraformArtifactCanonicalContent preserves Terraform whitespace", () => {
  const compactBundle = JSON.stringify({
    schemaVersion: 1,
    files: [{ fileName: "main.tf", terraformCode: "resource {}" }]
  });
  const paddedBundle = JSON.stringify({
    schemaVersion: 1,
    files: [{ fileName: "main.tf", terraformCode: "\nresource {}\n" }]
  });

  const compactCanonicalContent = createTerraformArtifactCanonicalContent(
    TERRAFORM_BUNDLE_INPUT,
    compactBundle
  );
  const paddedCanonicalContent = createTerraformArtifactCanonicalContent(
    TERRAFORM_BUNDLE_INPUT,
    paddedBundle
  );

  assert.notDeepEqual(compactCanonicalContent, paddedCanonicalContent);
});
