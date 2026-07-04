import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFirstBlockingTerraformDiagnostic,
  createTerraformDiagnostics,
  createTerraformValidationDiagnostics
} from "./terraform-diagnostics.js";

test("returns no errors for generated Terraform code", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
});

test("returns no errors for CRLF Terraform code", () => {
  const diagnostics = createTerraformDiagnostics(
    [
      `resource "aws_vpc" "main" {`,
      `  cidr_block = "10.0.0.0/16"`,
      `}`
    ].join("\r\n")
  );

  assert.equal(diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
});

test("returns an error for empty Terraform code", () => {
  assert.deepEqual(createTerraformDiagnostics(""), [
    {
      severity: "error",
      code: "terraform.empty",
      message: "Terraform 코드가 비어 있습니다."
    }
  ]);
});

test("detects unbalanced braces", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"`);

  assert.equal(diagnostics[0]?.code, "terraform.unbalanced");
  assert.equal(diagnostics[0]?.severity, "error");
});

test("returns the first blocking diagnostic in source order", () => {
  const diagnostic = createFirstBlockingTerraformDiagnostic(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" {
}`);

  assert.equal(diagnostic?.code, "terraform.block_header");
  assert.equal(diagnostic?.line, 5);
});

test("detects invalid block headers", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" {
}`);

  assert.equal(diagnostics[0]?.code, "terraform.block_header");
  assert.equal(diagnostics[0]?.line, 1);
});

test("detects duplicate resource addresses", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}`);

  const duplicateDiagnostic = diagnostics.find(
    (diagnostic) => diagnostic.code === "terraform.duplicate_address"
  );

  assert.equal(duplicateDiagnostic?.severity, "error");
});

test("detects quoted Terraform references", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = "aws_vpc.main.id"
}`);

  assert.equal(diagnostics[0]?.code, "terraform.quoted_reference");
  assert.equal(diagnostics[0]?.severity, "warning");
});

test("ignores braces in line comments when checking balance", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16" # ignored {
  tags = {
    Name = "main"
  }
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.unbalanced"), false);
});

test("accepts block headers with trailing comments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" { // network boundary
  cidr_block = "10.0.0.0/16"
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.block_header"), false);
});

test("treats comment-only block bodies as empty", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  # cidr_block will be filled later
} # end`);

  assert.equal(diagnostics[0]?.code, "terraform.empty_block");
});

test("ignores quoted Terraform references inside comments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  # "aws_vpc.main.id" is documented here
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.quoted_reference"), false);
});

test("detects unbalanced parentheses", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  tags = merge(var.tags, {
    Name = "main"
  }
}`);

  assert.equal(diagnostics[0]?.code, "terraform.unbalanced");
  assert.equal(diagnostics[0]?.line, 2);
});

test("detects malformed attribute lines inside resource blocks", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block "10.0.0.0/16"
  tags ==
  name =
}`);

  assert.deepEqual(
    diagnostics
      .filter((diagnostic) => diagnostic.code?.startsWith("terraform.attribute"))
      .map((diagnostic) => ({ code: diagnostic.code, line: diagnostic.line })),
    [
      { code: "terraform.attribute_syntax", line: 2 },
      { code: "terraform.attribute_syntax", line: 3 },
      { code: "terraform.attribute_empty", line: 4 }
    ]
  );
});

test("detects nested block attributes written as object assignments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route = {}
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.nested_block_assignment"),
    {
      severity: "error",
      code: "terraform.nested_block_assignment",
      line: 3,
      resourceAddress: "resource.aws_route_table.public",
      message: "route는 attribute가 아니라 nested block 형식으로 작성해야 합니다."
    }
  );
});

test("allows nested block syntax inside resource blocks", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}`);

  assert.equal(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "terraform.unsupported_block" ||
        diagnostic.code === "terraform.nested_block_assignment" ||
        diagnostic.severity === "error"
    ),
    false
  );
});

test("warns about references to undeclared local Terraform resources", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.undefined_reference"),
    {
      severity: "warning",
      code: "terraform.undefined_reference",
      line: 2,
      resourceAddress: "aws_vpc.main",
      message: "aws_vpc.main reference가 현재 Terraform 코드에 선언되어 있지 않습니다."
    }
  );
});

test("does not warn when referenced local Terraform resources are declared", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "terraform.undefined_reference"),
    false
  );
});

test("warns about aws resources that are not in the shared resource definitions", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_neverland" "main" {
  name = "unknown"
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.unsupported_resource"),
    {
      severity: "warning",
      code: "terraform.unsupported_resource",
      line: 1,
      resourceAddress: "resource.aws_neverland.main",
      message: "resource.aws_neverland.main은 현재 SketchCatch Terraform editor가 아는 리소스가 아닙니다."
    }
  );
});

test("adds source file names while validating virtual Terraform files", () => {
  const diagnostics = createTerraformValidationDiagnostics({
    terraformCode: "",
    terraformFiles: [
      {
        fileName: "network.tf",
        terraformCode: `resource "aws_route_table" "public" {
  route = {}
}`
      }
    ]
  });

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.nested_block_assignment"),
    {
      severity: "error",
      code: "terraform.nested_block_assignment",
      line: 2,
      resourceAddress: "resource.aws_route_table.public",
      sourceFileName: "network.tf",
      message: "route는 attribute가 아니라 nested block 형식으로 작성해야 합니다."
    }
  );
});
