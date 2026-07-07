import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("assertTerraformArtifactIsSafe accepts supported AWS AMI data sources", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
      data "aws_ami" "ubuntu" {
        most_recent = true
        owners = ["099720109477"]

        filter {
          name   = "name"
          values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
        }
      }
    `)
  );
});

test("assertTerraformArtifactIsSafe rejects unsupported data sources before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data "aws_caller_identity" "current" {
        }
      `),
    /data source "aws_caller_identity" is not allowed/
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

test("assertTerraformArtifactIsSafe rejects EC2 user_data before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "web" {
          ami           = "ami-1234567890abcdef0"
          instance_type = "t3.micro"
          user_data     = "echo hello"
        }
      `),
    /EC2 user_data is not allowed/
  );
});

test("assertTerraformArtifactIsSafe accepts managed demo launch template user data for demo profile", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `
        resource "aws_launch_template" "api" {
          name_prefix   = "sketchcatch-demo-"
          image_id      = "ami-1234567890abcdef0"
          instance_type = "t3.micro"
          user_data     = "${createManagedDemoUserDataBase64()}"
        }

        resource "aws_lb" "web" {
          name               = "sketchcatch-demo"
          load_balancer_type = "application"
          subnets            = ["subnet-1", "subnet-2"]
        }
      `,
      { liveProfile: "demo_web_service" }
    )
  );
});

test("assertTerraformArtifactIsSafe rejects demo launch template user data outside the demo profile", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_launch_template" "api" {
          name_prefix      = "sketchcatch-demo-"
          image_id         = "ami-1234567890abcdef0"
          instance_type    = "t3.micro"
          user_data        = "${createManagedDemoUserDataBase64()}"
        }
      `),
    /launch template user_data is not allowed for practice/
  );
});

test("assertTerraformArtifactIsSafe rejects unmarked demo launch template user data", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        `
          resource "aws_launch_template" "api" {
            name_prefix      = "sketchcatch-demo-"
            image_id         = "ami-1234567890abcdef0"
            instance_type    = "t3.micro"
            user_data        = "${Buffer.from("#!/bin/bash\necho unsafe\n").toString("base64")}"
          }
        `,
        { liveProfile: "demo_web_service" }
      ),
    /missing the SketchCatch managed marker/
  );
});

test("assertTerraformArtifactIsSafe rejects public S3 bucket ACLs", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_s3_bucket" "files" {
          bucket = "sketchcatch-demo-files"
          acl    = "public-read"
        }
      `),
    /public S3 bucket ACL/
  );
});

test("assertTerraformArtifactIsSafe rejects world-open SSH ingress rules", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_security_group" "web" {
          name = "web"

          ingress {
            from_port   = 22
            to_port     = 22
            protocol    = "tcp"
            cidr_blocks = ["0.0.0.0/0"]
          }
        }
      `),
    /public SSH or RDP ingress/
  );
});

test("assertTerraformArtifactIsSafe rejects world-open RDP security group rules", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_security_group_rule" "rdp" {
          type              = "ingress"
          from_port         = 3389
          to_port           = 3389
          protocol          = "tcp"
          security_group_id = aws_security_group.web.id
          cidr_blocks       = ["0.0.0.0/0"]
        }
      `),
    /public SSH or RDP ingress/
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

function createManagedDemoUserDataBase64(): string {
  const hashPrefix = "sketchcatch-demo-managed-user-data-sha256:";
  const normalized = [
    "#!/bin/bash",
    "# sketchcatch-demo-managed-user-data:v1",
    `# ${hashPrefix}`,
    "echo sketchcatch-demo"
  ].join("\n");
  const hash = createHash("sha256").update(`${normalized}\n`).digest("hex");
  const script = normalized.replace(`# ${hashPrefix}`, `# ${hashPrefix}${hash}`);

  return Buffer.from(`${script}\n`, "utf8").toString("base64");
}
