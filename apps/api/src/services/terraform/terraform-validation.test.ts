import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  prepareTerraformValidationWorkspace,
  validateTerraformPreviewCode
} from "./terraform-validation.js";
import type {
  RunTerraformInitOptions,
  TerraformRunResult
} from "../../deployments/terraform-runner.js";

test("full validation stops at the first static error before Terraform CLI runs", async () => {
  const result = await validateTerraformPreviewCode(
    {
      mode: "full",
      terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"`
    },
    {
      runTerraformInit: async () => {
        throw new Error("terraform init should not run after a static error");
      },
      runTerraformValidateJson: async () => {
        throw new Error("terraform validate should not run after a static error");
      }
    }
  );

  assert.equal(result.mode, "full");
  assert.equal(result.stage, "static");
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "terraform.unbalanced");
});

test("full validation maps the first Terraform CLI error by virtual file source order", async () => {
  let capturedWorkdir = "";

  const result = await validateTerraformPreviewCode(
    {
      mode: "full",
      projectId: "project-1",
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "main.tf",
          terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
        },
        {
          fileName: "network.tf",
          terraformCode: `resource "aws_route" "default" {
  route = {}
}`
        }
      ]
    },
    {
      runTerraformInit: async (
        workdir,
        options = {}
      ): Promise<TerraformRunResult> => {
        capturedWorkdir = workdir;
        const fileNames = await readdir(workdir);

        assert.deepEqual(fileNames.sort(), [
          ".terraform-home",
          "main.tf",
          "network.tf",
          "sketchcatch_provider.tf"
        ]);
        assert.equal(options?.env?.AWS_EC2_METADATA_DISABLED, "true");
        assert.equal(typeof options?.env?.HOME, "string");
        assert.equal(typeof options?.env?.TF_CLI_CONFIG_FILE, "string");

        return successfulTerraformResult(["terraform", "init"]);
      },
      runTerraformValidateJson: async (workdir): Promise<TerraformRunResult> => {
        assert.equal(workdir, capturedWorkdir);
        const providerSupport = await readFile(`${workdir}/sketchcatch_provider.tf`, "utf8");

        assert.match(providerSupport, /required_providers/);
        assert.match(providerSupport, /hashicorp\/aws/);

        return {
          ...successfulTerraformResult(["terraform", "validate", "-json"]),
          exitCode: 1,
          stdout: JSON.stringify({
            valid: false,
            diagnostics: [
              {
                severity: "error",
                summary: "Unsupported argument",
                detail:
                  'An argument named "route" is not expected here. Did you mean to define a block of type "route"?',
                range: {
                  filename: "network.tf",
                  start: {
                    line: 2
                  }
                }
              },
              {
                severity: "error",
                summary: "Another error",
                range: {
                  filename: "main.tf",
                  start: {
                    line: 1
                  }
                }
              }
            ]
          })
        };
      }
    }
  );

  assert.equal(result.mode, "full");
  assert.equal(result.stage, "cli_validate");
  assert.equal(result.status, "failed");
  assert.deepEqual(result.diagnostics, [
    {
      severity: "error",
      code: "terraform.cli.validate",
      line: 1,
      message: "Another error",
      sourceFileName: "main.tf"
    }
  ]);
});

test("full validation blocks editor-unsafe Terraform root blocks before Terraform CLI runs", async () => {
  const result = await validateTerraformPreviewCode(
    {
      mode: "full",
      terraformCode: `module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
}`
    },
    {
      runTerraformInit: async () => {
        throw new Error("terraform init should not run for editor-unsafe blocks");
      },
      runTerraformValidateJson: async () => {
        throw new Error("terraform validate should not run for editor-unsafe blocks");
      }
    }
  );

  assert.equal(result.mode, "full");
  assert.equal(result.stage, "static");
  assert.equal(result.status, "failed");
  assert.deepEqual(result.diagnostics, [
    {
      severity: "error",
      code: "terraform.validation.unsupported_cli_block",
      line: 1,
      message:
        "Editor CLI 검증에서는 module/provider/terraform 설정 block을 실행하지 않습니다.",
      sourceFileName: "main.tf"
    }
  ]);
});

test("full validation allows resource-level provider meta arguments through static checks", async () => {
  let initCalled = false;

  const result = await validateTerraformPreviewCode(
    {
      mode: "full",
      terraformCode: `resource "aws_instance" "web" {
  provider = aws.primary
  instance_type = "t3.micro"
}`
    },
    {
      runTerraformInit: async (): Promise<TerraformRunResult> => {
        initCalled = true;
        return successfulTerraformResult(["terraform", "init"]);
      },
      runTerraformValidateJson: async () =>
        successfulTerraformResult(["terraform", "validate", "-json"])
    }
  );

  assert.equal(initCalled, true);
  assert.equal(result.mode, "full");
  assert.equal(result.stage, "cli_validate");
  assert.equal(result.status, "passed");
});

test("full validation keeps static warnings when Terraform CLI validation passes", async () => {
  const result = await validateTerraformPreviewCode(
    {
      mode: "full",
      terraformCode: `resource "aws_instance" "web" {
  subnet_id = "aws_subnet.public.id"
}`
    },
    {
      runTerraformInit: async () => successfulTerraformResult(["terraform", "init"]),
      runTerraformValidateJson: async () =>
        successfulTerraformResult(["terraform", "validate", "-json"])
    }
  );

  assert.equal(result.mode, "full");
  assert.equal(result.stage, "cli_validate");
  assert.equal(result.status, "passed");
  assert.deepEqual(result.diagnostics, [
    {
      severity: "warning",
      code: "terraform.quoted_reference",
      line: 2,
      message: "aws_subnet.public.id Terraform reference가 문자열로 감싸져 있습니다.",
      resourceAddress: "aws_subnet.public.id",
      sourceFileName: "main.tf"
    }
  ]);
});

test("full validation rejects unsafe virtual file names before Terraform CLI runs", async () => {
  const result = await validateTerraformPreviewCode(
    {
      mode: "full",
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "network prod.tf",
          terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
        }
      ]
    },
    {
      runTerraformInit: async () => {
        throw new Error("terraform init should not run for unsafe file names");
      },
      runTerraformValidateJson: async () => {
        throw new Error("terraform validate should not run for unsafe file names");
      }
    }
  );

  assert.equal(result.mode, "full");
  assert.equal(result.stage, "static");
  assert.equal(result.status, "failed");
  assert.deepEqual(result.diagnostics, [
    {
      severity: "error",
      code: "terraform.validation.file_name",
      message: "Terraform 파일명에는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.",
      sourceFileName: "network prod.tf"
    }
  ]);
});

test("static validation mode does not create a Terraform workspace", async () => {
  const result = await validateTerraformPreviewCode(
    {
      mode: "static",
      terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
    },
    {
      runTerraformInit: async () => {
        throw new Error("terraform init should not run for static mode");
      },
      runTerraformValidateJson: async () => {
        throw new Error("terraform validate should not run for static mode");
      }
    }
  );

  assert.equal(result.mode, "static");
  assert.equal(result.stage, "static");
  assert.equal(result.status, "passed");
  assert.deepEqual(result.diagnostics, []);
});

test("prepare endpoint warms the Terraform plugin cache without returning secrets", async () => {
  let receivedOptions: RunTerraformInitOptions | undefined;

  const result = await prepareTerraformValidationWorkspace(
    {
      projectId: "project-1",
      provider: "aws"
    },
    {
      warmTerraformPluginCache: async (options = {}): Promise<TerraformRunResult> => {
        receivedOptions = options;
        return successfulTerraformResult(["terraform", "init", "-backend=false"]);
      }
    }
  );

  assert.equal(result.stage, "cli_prepare");
  assert.equal(result.status, "passed");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(receivedOptions?.env?.AWS_REGION, "ap-northeast-2");
  assert.equal(receivedOptions?.env?.AWS_EC2_METADATA_DISABLED, "true");
  assert.equal(receivedOptions?.env?.TF_INPUT, "0");
  assert.equal(typeof receivedOptions?.env?.HOME, "string");
  assert.equal(receivedOptions?.env?.AWS_SECRET_ACCESS_KEY, undefined);
});

function successfulTerraformResult(command: string[]): TerraformRunResult {
  return {
    command,
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false
  };
}
