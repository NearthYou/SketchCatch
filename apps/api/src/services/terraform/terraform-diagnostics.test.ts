import { test } from "node:test";
import assert from "node:assert/strict";
import { createTerraformDiagnostics } from "./terraform-diagnostics.js";

test("returns no errors for generated Terraform code", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`);

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