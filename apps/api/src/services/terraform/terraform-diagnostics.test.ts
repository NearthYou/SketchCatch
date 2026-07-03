import { test } from "node:test";
import assert from "node:assert/strict";
import { createTerraformDiagnostics } from "./terraform-diagnostics.js";

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

test("detects invalid block headers", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" {
}`);

  assert.equal(diagnostics[0]?.code, "terraform.block_header");
  assert.equal(diagnostics[0]?.line, 1);
});

test("detects unexpected tokens after a closed block", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_instance" "web" {
  ami = "ami-12345678"
}dfgdf`);

  assert.equal(diagnostics[0]?.code, "terraform.unexpected_token");
  assert.equal(diagnostics[0]?.line, 3);
  assert.equal(diagnostics[0]?.severity, "error");
});

test("detects trailing commas after attribute assignments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_security_group_rule" "ssh" {
  type = "ingress",
}`);

  assert.equal(diagnostics[0]?.code, "terraform.trailing_comma");
  assert.equal(diagnostics[0]?.line, 2);
  assert.equal(diagnostics[0]?.severity, "error");
});

test("detects duplicate resource addresses", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "terraform.duplicate_address"),
    true
  );
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
