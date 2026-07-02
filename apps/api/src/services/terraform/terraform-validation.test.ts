import { test } from "node:test";
import assert from "node:assert/strict";
import type { TerraformRunResult } from "../../deployments/terraform-runner.js";
import { createTerraformValidationDiagnostics } from "./terraform-validation.js";

test("createTerraformValidationDiagnostics reports Terraform parser errors from fmt check", async () => {
  const diagnostics = await createTerraformValidationDiagnostics(
    `resource "aws_security_group_rule" "ssh" {
  type = "ingress",
}dfgdf`,
    {
      runTerraformFormatCheck: async () =>
        terraformResult({
          exitCode: 2,
          stderr: `Error: Unexpected comma after argument

  on main.tf line 2, in resource "aws_security_group_rule" "ssh":
   2:   type = "ingress",

Argument definitions must be separated by newlines, not commas.`
        })
    }
  );

  assert.equal(diagnostics[0]?.code, "terraform.cli_syntax");
  assert.equal(diagnostics[0]?.line, 2);
  assert.equal(diagnostics[0]?.severity, "error");
  assert.match(diagnostics[0]?.message ?? "", /Unexpected comma after argument/);
  assert.equal(diagnostics[1]?.code, "terraform.unexpected_token");
  assert.equal(diagnostics[1]?.line, 3);
});

test("createTerraformValidationDiagnostics falls back to static diagnostics when Terraform CLI is unavailable", async () => {
  const diagnostics = await createTerraformValidationDiagnostics(
    `resource "aws_instance" "web" {
  ami = "ami-12345678"
}dfgdf`,
    {
      runTerraformFormatCheck: async () =>
        terraformResult({
          exitCode: 127,
          stderr: "spawn terraform ENOENT"
        })
    }
  );

  assert.equal(diagnostics[0]?.code, "terraform.unexpected_token");
  assert.equal(diagnostics[0]?.line, 3);
});

test("createTerraformValidationDiagnostics keeps static warnings when Terraform parser accepts the file", async () => {
  const diagnostics = await createTerraformValidationDiagnostics(
    `resource "aws_subnet" "public" {
  vpc_id = "aws_vpc.main.id"
}`,
    {
      runTerraformFormatCheck: async () =>
        terraformResult({
          exitCode: 0
        })
    }
  );

  assert.equal(diagnostics[0]?.code, "terraform.quoted_reference");
  assert.equal(diagnostics[0]?.severity, "warning");
});

function terraformResult(
  overrides: Partial<TerraformRunResult>
): TerraformRunResult {
  return {
    command: ["terraform", "fmt", "-check", "-no-color"],
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    ...overrides
  };
}
