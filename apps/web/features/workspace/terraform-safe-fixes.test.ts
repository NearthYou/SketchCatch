import assert from "node:assert/strict";
import { test } from "node:test";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import {
  applyTerraformCodeReplacement,
  applyTerraformSafeFix,
  getTerraformSafeFix
} from "./terraform-safe-fixes";

test("getTerraformSafeFix enables trailing comma and quoted reference fixes only", () => {
  assert.equal(getTerraformSafeFix({ code: "terraform.trailing_comma" } as TerraformDiagnostic)?.applicable, true);
  assert.equal(getTerraformSafeFix({ code: "terraform.quoted_reference" } as TerraformDiagnostic)?.applicable, true);
  assert.equal(getTerraformSafeFix({ code: "terraform.attribute_empty" } as TerraformDiagnostic)?.applicable, false);
});

test("applyTerraformSafeFix removes only the diagnostic line trailing comma", () => {
  const result = applyTerraformSafeFix({
    code: `resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16",\n  tags = {}\n}`,
    diagnostic: {
      code: "terraform.trailing_comma",
      line: 2,
      message: "Trailing comma",
      severity: "error"
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.code, `resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n  tags = {}\n}`);
});

test("applyTerraformSafeFix unquotes a simple Terraform reference on the diagnostic line", () => {
  const result = applyTerraformSafeFix({
    code: `resource "aws_subnet" "public" {\n  vpc_id = "aws_vpc.main.id"\n}`,
    diagnostic: {
      code: "terraform.quoted_reference",
      line: 2,
      message: "Quoted reference",
      severity: "warning"
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.code, `resource "aws_subnet" "public" {\n  vpc_id = aws_vpc.main.id\n}`);
});

test("applyTerraformSafeFix refuses fixes without a usable line", () => {
  const result = applyTerraformSafeFix({
    code: `cidr_block = "10.0.0.0/16",`,
    diagnostic: {
      code: "terraform.trailing_comma",
      message: "Trailing comma",
      severity: "error"
    }
  });

  assert.equal(result.applied, false);
});

test("applyTerraformCodeReplacement applies the reviewed Amazon Q snippet exactly once", () => {
  const result = applyTerraformCodeReplacement({
    code: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs",\n}',
    preview: {
      currentCode: 'bucket = "logs",',
      nextCode: 'bucket = "logs"'
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.code, 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs"\n}');
});

