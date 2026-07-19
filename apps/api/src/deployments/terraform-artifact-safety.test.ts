import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { InfrastructureGraph } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "../services/terraform/diagram-to-terraform.js";
import {
  assertTerraformArtifactIsSafe,
  TerraformArtifactSafetyError
} from "./terraform-artifact-safety.js";

const boundedRuntimeSecretPolicyLiteral = JSON.stringify(JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Sid: "ReadCheckInSigningSecret",
    Effect: "Allow",
    Action: ["secretsmanager:GetSecretValue"],
    Resource: "${aws_secretsmanager_secret.runtime.arn}"
  }]
}));
const broadRuntimeSecretPolicyLiteral = JSON.stringify(JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: ["secretsmanager:*"], Resource: "*" }]
}));

test("generated S3 artifacts omit synthetic public access blocks and pass safety", () => {
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
    assertTerraformArtifactIsSafe(terraformCode, { liveProfile: "demo_web_service" })
  );
});

test("ECS web-service safety accepts legacy S3 public access block artifacts", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `resource "aws_s3_bucket_public_access_block" "service_bucket_public_access" {
        bucket = aws_s3_bucket.service_bucket.id
        block_public_acls = true
        block_public_policy = true
        ignore_public_acls = true
        restrict_public_buckets = true
      }`,
      { liveProfile: "demo_web_service" }
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

test("ECS web-service safety accepts generated NAT gateway networking resources for planning", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `resource "aws_eip" "nat" {
        domain = "vpc"
      }

      resource "aws_nat_gateway" "nat" {
        allocation_id = aws_eip.nat.id
        subnet_id     = aws_subnet.public.id
      }`,
      { liveProfile: "demo_web_service", resourceValidationMode: "plan" }
    )
  );
});

test("ECS web-service live apply safety accepts every Terraform resource in the Repository ECS diagram", () => {
  const resourceTypes = [
    "aws_cloudfront_distribution",
    "aws_cloudfront_origin_access_control",
    "aws_cloudwatch_log_group",
    "aws_ecr_repository",
    "aws_ecs_cluster",
    "aws_ecs_service",
    "aws_ecs_task_definition",
    "aws_eip",
    "aws_iam_role",
    "aws_iam_role_policy_attachment",
    "aws_internet_gateway",
    "aws_lb",
    "aws_lb_listener",
    "aws_lb_target_group",
    "aws_nat_gateway",
    "aws_route_table",
    "aws_route_table_association",
    "aws_s3_bucket",
    "aws_s3_bucket_policy",
    "aws_s3_bucket_public_access_block",
    "aws_s3_bucket_versioning",
    "aws_s3_object",
    "aws_secretsmanager_secret",
    "aws_security_group",
    "aws_subnet",
    "aws_vpc"
  ];
  const terraformCode = resourceTypes
    .map((resourceType, index) => `resource "${resourceType}" "diagram_${index}" {}`)
    .join("\n");

  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(terraformCode, { liveProfile: "demo_web_service" })
  );
});

test("ECS web-service safety accepts the bounded generated runtime-secret bundle", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `terraform {
        required_providers {
          random = {
            source  = "hashicorp/random"
            version = "~> 3.0"
          }
        }
      }
      resource "random_password" "runtime" {
        length  = 48
        special = false
      }
      resource "aws_secretsmanager_secret" "runtime" {}
      resource "aws_secretsmanager_secret_version" "runtime" {
        secret_id     = aws_secretsmanager_secret.runtime.id
        secret_string = random_password.runtime.result
      }
      resource "aws_iam_role_policy" "runtime" {
        name   = "runtime-secret-read"
        role   = aws_iam_role.execution.id
        policy = ${boundedRuntimeSecretPolicyLiteral}
      }`,
      { liveProfile: "demo_web_service" }
    )
  );
});

test("ECS web-service safety rejects literal runtime Secret values and broad inline IAM", () => {
  assert.throws(
    () => assertTerraformArtifactIsSafe(
      `resource "aws_secretsmanager_secret_version" "runtime" {
        secret_id     = aws_secretsmanager_secret.runtime.id
        secret_string = "known-value"
      }`,
      { liveProfile: "demo_web_service" }
    ),
    /must reference generated password material/u
  );
  assert.throws(
    () => assertTerraformArtifactIsSafe(
      `resource "aws_iam_role_policy" "runtime" {
        name   = "runtime-secret-read"
        role   = aws_iam_role.execution.id
        policy = ${broadRuntimeSecretPolicyLiteral}
      }`,
      { liveProfile: "demo_web_service" }
    ),
    /must grant only exact Secrets Manager read access/u
  );
});

test("ECS web-service live apply safety still rejects RDS resources", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`resource "aws_db_instance" "database" {}`, {
        liveProfile: "demo_web_service"
      }),
    /Terraform resource "aws_db_instance" is not allowed before live deployment/
  );
});

test("ECS web-service safety accepts the ECS Fargate runtime resources used by project deployment", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `resource "aws_cloudwatch_log_group" "app" {}
      resource "aws_iam_role_policy_attachment" "task_execution" {}
      resource "aws_ecs_cluster" "app" {}
      resource "aws_ecs_task_definition" "app" {}
      resource "aws_ecs_service" "app" {}
      resource "aws_lb" "app" {}
      resource "aws_lb_listener" "http" {}
      resource "aws_lb_target_group" "app" {}
      resource "aws_cloudfront_distribution" "app" {}`,
      { liveProfile: "demo_web_service" }
    )
  );
});

test("default live apply safety accepts ECS Application Auto Scaling resources", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
      resource "aws_appautoscaling_target" "ecs_service_requests" {}
      resource "aws_appautoscaling_policy" "ecs_service_requests" {}
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
        output_path             = "\${path.module}/handler.zip"
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

test("assertTerraformArtifactIsSafe accepts the CloudFront origin-facing managed prefix list", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
      data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
        name = "com.amazonaws.global.cloudfront.origin-facing"
      }
    `)
  );
});

test("assertTerraformArtifactIsSafe accepts AI-generated CI/CD resource types", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
      provider "aws" {
        region = "ap-northeast-2"
      }

      resource "aws_iam_role" "codebuild_service_role" {
        name = "sketchcatch-codebuild-service-role"
        assume_role_policy = jsonencode({
          Version = "2012-10-17"
          Statement = [{
            Effect = "Allow"
            Principal = {
              Service = "codebuild.amazonaws.com"
            }
            Action = "sts:AssumeRole"
          }]
        })
      }

      resource "aws_codebuild_project" "build" {
        name = "sketchcatch-build"
        service_role = aws_iam_role.codebuild_service_role.arn

        artifacts {
          type = "NO_ARTIFACTS"
        }

        environment {
          compute_type = "BUILD_GENERAL1_SMALL"
          image = "aws/codebuild/standard:7.0"
          type = "LINUX_CONTAINER"
        }

        source {
          type = "NO_SOURCE"
          buildspec = "version: 0.2"
        }
      }

      resource "aws_codedeploy_app" "app" {
        name = "sketchcatch-app"
        compute_platform = "Server"
      }

      resource "aws_iam_role" "codedeploy_service_role" {
        name = "sketchcatch-codedeploy-service-role"
        assume_role_policy = jsonencode({
          Version = "2012-10-17"
          Statement = [{
            Effect = "Allow"
            Principal = {
              Service = "codedeploy.amazonaws.com"
            }
            Action = "sts:AssumeRole"
          }]
        })
      }

      resource "aws_codedeploy_deployment_group" "group" {
        app_name = aws_codedeploy_app.app.name
        deployment_group_name = "sketchcatch-deployment-group"
        service_role_arn = aws_iam_role.codedeploy_service_role.arn
      }

      resource "aws_codestarconnections_connection" "github" {
        name = "sketchcatch-github"
        provider_type = "GitHub"
      }

      resource "aws_s3_bucket" "codepipeline_artifacts" {
        bucket = "sketchcatch-pipeline-artifacts-example"
      }

      resource "aws_iam_role" "codepipeline_service_role" {
        name = "sketchcatch-codepipeline-service-role"
        assume_role_policy = jsonencode({
          Version = "2012-10-17"
          Statement = [{
            Effect = "Allow"
            Principal = {
              Service = "codepipeline.amazonaws.com"
            }
            Action = "sts:AssumeRole"
          }]
        })
      }

      resource "aws_codepipeline" "pipeline" {
        name = "sketchcatch-pipeline"
        role_arn = aws_iam_role.codepipeline_service_role.arn

        artifact_store {
          location = aws_s3_bucket.codepipeline_artifacts.bucket
          type = "S3"
        }

        stage {
          name = "Source"

          action {
            category = "Source"
            name = "Source"
            owner = "AWS"
            provider = "CodeStarSourceConnection"
            version = "1"
            output_artifacts = ["source_output"]

            configuration = {
              BranchName = "main"
              ConnectionArn = aws_codestarconnections_connection.github.arn
              FullRepositoryId = "example-org/example-repo"
            }
          }
        }

        stage {
          name = "Build"

          action {
            category = "Build"
            name = "Build"
            owner = "AWS"
            provider = "CodeBuild"
            version = "1"
            input_artifacts = ["source_output"]
            output_artifacts = ["build_output"]

            configuration = {
              ProjectName = aws_codebuild_project.build.name
            }
          }
        }
      }

      data "aws_caller_identity" "current" {}

      data "aws_ssm_parameter" "ami" {
        name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
      }
    `)
  );
});

test("assertTerraformArtifactIsSafe accepts inline archive data for Lambda artifacts", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
      data "archive_file" "handler" {
        type                    = "zip"
        output_path             = "\${path.module}/lambda-handler.zip"
        source_content          = "exports.handler = async () => ({ statusCode: 200 })"
        source_content_filename = "index.js"
      }
    `)
  );
});

test("assertTerraformArtifactIsSafe rejects archive source files before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data "archive_file" "env" {
          type        = "zip"
          output_path = "./env.zip"
          source_file = "../.env"
        }
      `),
    /archive_file must use inline source_content/
  );
});

test("assertTerraformArtifactIsSafe rejects archive source files with comments in the header", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data/* keep header readable */"archive_file"/* resource label follows */"env"{
          type        = "zip"
          output_path = "./env.zip"
          source_file = "../.env"
        }
      `),
    /archive_file must use inline source_content/
  );
});

test("assertTerraformArtifactIsSafe rejects archive source directories before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data "archive_file" "workspace" {
          type       = "zip"
          output_path = "./workspace.zip"
          source_dir = "../"
        }
      `),
    /archive_file must use inline source_content/
  );
});

test("assertTerraformArtifactIsSafe rejects archive output paths outside the workspace", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data "archive_file" "handler" {
          type                    = "zip"
          output_path             = "../handler.zip"
          source_content          = "exports.handler = async () => ({ statusCode: 200 })"
          source_content_filename = "index.js"
        }
      `),
    /archive_file output_path must stay in the Terraform workspace/
  );
});

test("assertTerraformArtifactIsSafe rejects unsupported data sources before live deployment", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(`
        data "aws_region" "current" {
        }
      `),
    /data source "aws_region" is not allowed/
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
    /templatefile is allowed only for base64encoded user_data/
  );
});

test("assertTerraformArtifactIsSafe accepts a module-local tftpl for demo launch template user data", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(
      `
        resource "aws_launch_template" "traffic" {
          image_id      = "ami-1234567890abcdef0"
          instance_type = "t3.micro"
          user_data = base64encode(templatefile("\${path.module}/user-data.sh.tftpl", {
            traffic_api_bundle_url_json = jsonencode("https://example.test/api.tar.gz")
          }))
        }
      `,
      { liveProfile: "demo_web_service_with_rds" }
    )
  );
});

test("assertTerraformArtifactIsSafe rejects traversing tftpl paths", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        `
          resource "aws_launch_template" "traffic" {
            image_id      = "ami-1234567890abcdef0"
            instance_type = "t3.micro"
            user_data     = base64encode(templatefile("\${path.module}/../user-data.sh.tftpl", {}))
          }
        `,
        { liveProfile: "demo_web_service_with_rds" }
      ),
    /templatefile must use a static module-local \.tftpl basename/
  );
});

test("assertTerraformArtifactIsSafe rejects nested tftpl paths", () => {
  assert.throws(
    () =>
      assertTerraformArtifactIsSafe(
        `
          resource "aws_launch_template" "traffic" {
            image_id      = "ami-1234567890abcdef0"
            instance_type = "t3.micro"
            user_data     = base64encode(templatefile("\${path.module}/scripts/user-data.sh.tftpl", {}))
          }
        `,
        { liveProfile: "demo_web_service_with_rds" }
      ),
    /templatefile must use a static module-local \.tftpl basename/
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

test("assertTerraformArtifactIsSafe uses the ECS web-service profile by default", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
        resource "aws_instance" "api" {
          ami              = "ami-1234567890abcdef0"
          instance_type    = "t3.micro"
          user_data_base64 = "${createManagedDemoUserDataBase64()}"
        }
      `)
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

test("assertTerraformArtifactIsSafe accepts managed launch template user data by default", () => {
  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(`
        resource "aws_launch_template" "api" {
          name_prefix      = "sketchcatch-demo-"
          image_id         = "ami-1234567890abcdef0"
          instance_type    = "t3.micro"
          user_data        = "${createManagedDemoUserDataBase64()}"
        }
      `)
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
