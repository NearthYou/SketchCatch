import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertTerraformArtifactIsSafe,
  TerraformArtifactSafetyError
} from "./terraform-artifact-safety.js";

test("assertTerraformArtifactIsSafe accepts the MVP AWS resource subset", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
      terraform {
        required_providers {
          aws = {
            source = "hashicorp/aws"
            version = "~> 5.0"
          }
        }
      }

      provider "aws" {
        region = "ap-northeast-2"
      }

      resource "aws_vpc" "main" {
        cidr_block = "10.0.0.0/16"
        tags = {
          Name = "sketchcatch-demo"
        }
      }
    `)
  );
});

test("assertTerraformArtifactIsSafe rejects Terraform module blocks", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        module "network" {
          source = "git::https://example.com/network.git"
        }
      `),
    TerraformArtifactSafetyError
  );
});

test("assertTerraformArtifactIsSafe rejects Terraform module blocks split across lines", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        module
          "network"
        {
          source = "git::https://example.com/network.git"
        }
      `),
    TerraformArtifactSafetyError
  );
});

test("assertTerraformArtifactIsSafe rejects data sources before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data "aws_ami" "ubuntu" {
          most_recent = true
        }
      `),
    /top-level block "data" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects provisioners", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "web" {
          ami           = "ami-1234567890abcdef0"
          instance_type = "t3.micro"

          provisioner "local-exec" {
            command = "echo unsafe"
          }
        }
      `),
    /block "provisioner" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects provisioners split across lines", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "web" {
          ami           = "ami-1234567890abcdef0"
          instance_type = "t3.micro"

          provisioner
            "local-exec"
          {
            command = "echo unsafe"
          }
        }
      `),
    /block "provisioner" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects custom provider sources", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        terraform {
          required_providers {
            aws = {
              source = "example.com/custom/aws"
            }
          }
        }

        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `),
    /provider source "example.com\/custom\/aws" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects custom provider sources split after equals", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        terraform {
          required_providers {
            aws = {
              source =
                "example.com/custom/aws"
            }
          }
        }

        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `),
    /provider source "example.com\/custom\/aws" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects AWS provider region drift", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        provider "aws" {
          region = "us-east-1"
        }

        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `),
    /AWS provider region must be ap-northeast-2/
  );
});

test("assertTerraformArtifactIsSafe rejects dynamic AWS provider regions", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        provider "aws" {
          region = var.aws_region
        }

        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `),
    /AWS provider region must be ap-northeast-2/
  );
});

test("assertTerraformArtifactIsSafe rejects AWS provider credential overrides", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        provider "aws" {
          region     = "ap-northeast-2"
          access_key = "AKIAIOSFODNN7EXAMPLE"
        }

        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `),
    /AWS provider attribute "access_key" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects AWS provider nested overrides", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        provider "aws" {
          region = "ap-northeast-2"

          endpoints {
            s3 = "http://localhost:4566"
          }
        }

        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `),
    /provider nested block "endpoints" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects local file access functions", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "web" {
          ami           = "ami-1234567890abcdef0"
          instance_type = "t3.micro"
          user_data     = file("/etc/passwd")
        }
      `),
    /function "file" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects local file functions inside interpolation", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "web" {
          ami           = "ami-1234567890abcdef0"
          instance_type = "t3.micro"
          user_data     = "\${templatefile("/etc/passwd", {})}"
        }
      `),
    /function "templatefile" is not allowed/
  );
});

test("assertTerraformArtifactIsSafe rejects heredoc values", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "web" {
          ami           = "ami-1234567890abcdef0"
          instance_type = "t3.micro"
          user_data     = <<EOF
        hello
        EOF
        }
      `),
    /heredoc values are not allowed/
  );
});
