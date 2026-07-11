import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { InfrastructureGraph } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "../services/terraform/diagram-to-terraform.js";
import {
  assertTerraformArtifactIsSafe,
  TerraformArtifactSafetyError
} from "./terraform-artifact-safety.js";

test("generated practice S3 artifacts omit synthetic public access blocks and pass safety", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "bucket-1",
        label: "service_bucket",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "service_bucket",
          fileName: "storage"
        },
        config: {
          bucket: "service-bucket"
        }
      }
    ],
    edges: []
  };
  const terraformCode = renderTerraformFromInfrastructureGraph(graph);

  assert.doesNotMatch(terraformCode, /aws_s3_bucket_public_access_block/);
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(terraformCode, { liveProfile: "practice" })
  );
});

test("practice safety accepts legacy S3 public access block artifacts", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `resource "aws_s3_bucket_public_access_block" "service_bucket_public_access" {
        bucket = aws_s3_bucket.service_bucket.id
        block_public_acls = true
        block_public_policy = true
        ignore_public_acls = true
        restrict_public_buckets = true
      }`,
      { liveProfile: "practice" }
    )
  );
});

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

test("assertTerraformArtifactIsSafe accepts approved Kubernetes template resources", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `terraform {
        required_providers {
          aws = {
            source = "hashicorp/aws"
            version = "~> 6.0"
          }
          kubernetes = {
            source = "hashicorp/kubernetes"
            version = "~> 2.0"
          }
        }
      }

      provider "aws" {
        region = "ap-northeast-2"
      }

      provider "kubernetes" {}

      resource "kubernetes_namespace" "app" {
        metadata {
          name = "app"
        }
      }
      resource "kubernetes_service" "app" {
        metadata {
          name = "app"
        }
      }`,
      { liveProfile: "demo_web_service_with_rds" }
    )
  );
});

test("assertTerraformArtifactIsSafe accepts generated Lambda archives and EKS auth data", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `terraform {
        required_providers {
          aws = {
            source = "hashicorp/aws"
            version = "~> 5.0"
          }
          archive = {
            source = "hashicorp/archive"
            version = "~> 2.0"
          }
        }
      }

      data "archive_file" "handler" {
        type                    = "zip"
        source_content          = "export const handler = async () => ({ statusCode: 200 })"
        source_content_filename = "index.mjs"
        output_path             = "handler.zip"
      }

      data "aws_eks_cluster_auth" "sketchcatch" {
        name = "practice-cluster"
      }`,
      { liveProfile: "demo_web_service_with_rds" }
    )
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

test("assertTerraformArtifactIsSafe rejects unmanaged EC2 user_data before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        `
          resource "aws_instance" "web" {
            ami           = "ami-1234567890abcdef0"
            instance_type = "t3.micro"
            user_data     = "echo hello"
          }
        `,
        { liveProfile: "demo_web_service" }
      ),
    /must be a literal managed base64 value/
  );
});

test("assertTerraformArtifactIsSafe accepts managed demo EC2 user data for demo profile", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `
        resource "aws_instance" "api" {
          ami              = "ami-1234567890abcdef0"
          instance_type    = "t3.micro"
          user_data_base64 = "${createManagedDemoUserDataBase64()}"
        }
      `,
      { liveProfile: "demo_web_service" }
    )
  );
});

test("assertTerraformArtifactIsSafe accepts canonical managed hashes with CRLF user data", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `
        resource "aws_instance" "api" {
          ami              = "ami-1234567890abcdef0"
          instance_type    = "t3.micro"
          user_data_base64 = "${createManagedDemoUserDataBase64("\r\n")}"
        }
      `,
      { liveProfile: "demo_web_service" }
    )
  );
});

test("assertTerraformArtifactIsSafe rejects managed demo EC2 user data outside the demo profile", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        resource "aws_instance" "api" {
          ami              = "ami-1234567890abcdef0"
          instance_type    = "t3.micro"
          user_data_base64 = "${createManagedDemoUserDataBase64()}"
        }
      `),
    /EC2 user_data_base64 is not allowed for practice/
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

test("assertTerraformArtifactIsSafe accepts only the bounded Live Observation scaling resources", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(createLiveObservationScalingTerraform(), {
      liveProfile: "demo_web_service"
    })
  );
});

test("assertTerraformArtifactIsSafe accepts renderer-style trailing commas in bounded reference lists", () => {
  const rendererStyleTerraform = createLiveObservationScalingTerraform().replace(
    /\.arn\]/g,
    ".arn,\n      ]"
  );

  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(rendererStyleTerraform, {
      liveProfile: "demo_web_service"
    })
  );
});

test("assertTerraformArtifactIsSafe rejects scale-in or expanded Live Observation capacity", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        createLiveObservationScalingTerraform()
          .replace('resource "aws_autoscaling_policy" "scale_out"', 'resource "aws_autoscaling_policy" "scale_in"')
          .replace("scaling_adjustment = 1", "scaling_adjustment = -1"),
        { liveProfile: "demo_web_service" }
      ),
    /bounded Live Observation autoscaling policy/
  );

  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        createLiveObservationScalingTerraform().replace(/max_size\s*=\s*2/, "max_size = 3"),
        { liveProfile: "demo_web_service" }
      ),
    /bounded Live Observation Auto Scaling Group/
  );
});

test("assertTerraformArtifactIsSafe rejects a changed Live Observation alarm threshold", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        createLiveObservationScalingTerraform().replace(/threshold\s*=\s*60/, "threshold = 600"),
        { liveProfile: "demo_web_service" }
      ),
    /bounded Live Observation CloudWatch alarm/
  );
});

test("assertTerraformArtifactIsSafe does not impose Live Observation shape on the RDS demo profile", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `
        resource "aws_autoscaling_group" "rds_demo_api" {
          min_size         = 1
          desired_capacity = 2
          max_size         = 3
        }
      `,
      { liveProfile: "demo_web_service_with_rds" }
    )
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

function createManagedDemoUserDataBase64(lineEnding: "\n" | "\r\n" = "\n"): string {
  const hashPrefix = "sketchcatch-demo-managed-user-data-sha256:";
  const normalized = [
    "#!/bin/bash",
    "# sketchcatch-demo-managed-user-data:v1",
    `# ${hashPrefix}`,
    "echo sketchcatch-demo"
  ].join("\n");
  const hash = createHash("sha256").update(`${normalized}\n`).digest("hex");
  const script = normalized
    .replace(`# ${hashPrefix}`, `# ${hashPrefix}${hash}`)
    .replace(/\n/g, lineEnding);

  return Buffer.from(`${script}${lineEnding}`, "utf8").toString("base64");
}

function createLiveObservationScalingTerraform(): string {
  return `
    resource "aws_autoscaling_group" "api" {
      min_size                  = 1
      desired_capacity         = 1
      max_size                  = 2
      health_check_type         = "ELB"
      health_check_grace_period = 120
      default_instance_warmup   = 60
      target_group_arns         = [aws_lb_target_group.api.arn]
    }

    resource "aws_autoscaling_policy" "scale_out" {
      autoscaling_group_name    = aws_autoscaling_group.api.name
      policy_type               = "StepScaling"
      adjustment_type           = "ChangeInCapacity"
      cooldown                  = 180
      estimated_instance_warmup = 60

      step_adjustment {
        metric_interval_lower_bound = 0
        scaling_adjustment          = 1
      }
    }

    resource "aws_cloudwatch_metric_alarm" "scale_out" {
      comparison_operator = "GreaterThanOrEqualToThreshold"
      evaluation_periods  = 1
      datapoints_to_alarm = 1
      metric_name         = "RequestCountPerTarget"
      namespace           = "AWS/ApplicationELB"
      period              = 60
      statistic           = "Sum"
      threshold           = 60
      treat_missing_data  = "notBreaching"
      dimensions = {
        LoadBalancer = aws_lb.demo.arn_suffix
        TargetGroup  = aws_lb_target_group.api.arn_suffix
      }
      alarm_actions = [aws_autoscaling_policy.scale_out.arn]
    }
  `;
}
