import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { InfrastructureGraph } from "@sketchcatch/types";
import {
  TerraformDiagramValidationError,
  renderTerraformFromInfrastructureGraph
} from "./diagram-to-terraform.js";

test("renders Terraform code from InfrastructureGraph nodes", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "node-1",
        label: "main_vpc",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main"
        },
        config: {
          cidrBlock: "10.0.0.0/16",
          enableDnsSupport: true,
          enableDnsHostnames: true,
          tags: {
            Name: "main-vpc"
          }
        }
      },
      {
        id: "node-2",
        label: "public_subnet",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main"
        },
        config: {
          vpcId: "aws_vpc.main.id",
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true,
          tags: {
            Name: "public-subnet",
            "kubernetes.io/cluster/main": "owned"
          }
        }
      }
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "node-1",
        targetId: "node-2"
      }
    ]
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
    "kubernetes.io/cluster/main" = "owned"
  }
}`
  );
});

test("rejects unsafe Terraform identifiers while rendering InfrastructureGraph", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "node-1",
        label: "web",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: `web" {\n}\nresource "aws_s3_bucket" "owned`,
          fileName: "main"
        },
        config: {
          ami: "ami-1234567890abcdef0"
        }
      }
    ],
    edges: []
  };

  assert.throws(
    () => renderTerraformFromInfrastructureGraph(graph),
    TerraformDiagramValidationError
  );
});

test("normalizes compact S3 main parameters into Terraform nested blocks", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "versioning-node",
        label: "bucket_versioning",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket_versioning",
          resourceName: "logs",
          fileName: "main"
        },
        config: {
          bucket: "aws_s3_bucket.logs.id",
          status: "Enabled"
        }
      },
      {
        id: "encryption-node",
        label: "bucket_encryption",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket_server_side_encryption_configuration",
          resourceName: "logs",
          fileName: "main"
        },
        config: {
          bucket: "aws_s3_bucket.logs.id",
          sseAlgorithm: "aws:kms",
          kmsMasterKeyId: "aws_kms_key.logs.arn"
        }
      },
      {
        id: "lifecycle-node",
        label: "bucket_lifecycle",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket_lifecycle_configuration",
          resourceName: "logs",
          fileName: "main"
        },
        config: {
          bucket: "aws_s3_bucket.logs.id",
          rule: [
            {
              id: "expire-old-objects",
              status: "Enabled",
              expirationDays: 30
            }
          ]
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id = "expire-old-objects"
    status = "Enabled"
    expiration {
      days = 30
    }
  }
}`
  );
});

test("renders catalog nested-block main parameters as Terraform blocks", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "dynamodb-node",
        label: "table",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_dynamodb_table",
          resourceName: "sessions",
          fileName: "main"
        },
        config: {
          name: "practice-sessions",
          billingMode: "PAY_PER_REQUEST",
          hashKey: "id",
          attribute: [
            {
              name: "id",
              type: "S"
            }
          ]
        }
      },
      {
        id: "lambda-node",
        label: "handler",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_lambda_function",
          resourceName: "handler",
          fileName: "main"
        },
        config: {
          functionName: "practice-handler",
          role: "aws_iam_role.lambda.arn",
          handler: "index.handler",
          runtime: "nodejs22.x",
          filename: "dist/handler.zip",
          environment: {
            variables: {
              LOG_LEVEL: "info"
            }
          }
        }
      },
      {
        id: "asg-node",
        label: "asg",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_autoscaling_group",
          resourceName: "web",
          fileName: "main"
        },
        config: {
          minSize: 1,
          maxSize: 2,
          vpcZoneIdentifier: ["aws_subnet.public.id"],
          launchTemplate: [
            {
              id: "aws_launch_template.web.id",
              version: "$Latest"
            }
          ],
          tag: [
            {
              key: "Name",
              value: "practice-web",
              propagateAtLaunch: true
            }
          ]
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_dynamodb_table" "sessions" {
  name = "practice-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_lambda_function" "handler" {
  function_name = "practice-handler"
  role = aws_iam_role.lambda.arn
  handler = "index.handler"
  runtime = "nodejs22.x"
  filename = "dist/handler.zip"
  environment {
    variables = {
      LOG_LEVEL = "info"
    }
  }
}

resource "aws_autoscaling_group" "web" {
  min_size = 1
  max_size = 2
  vpc_zone_identifier = [
    aws_subnet.public.id,
  ]
  launch_template {
    id = aws_launch_template.web.id
    version = "$Latest"
  }
  tag {
    key = "Name"
    value = "practice-web"
    propagate_at_launch = true
  }
}`
  );
});

test("diagram-to-terraform renderer does not import diagram projection concerns", () => {
  const source = readFileSync(new URL("./diagram-to-terraform.ts", import.meta.url), "utf8");

  assert.equal(source.includes("DiagramJson"), false);
  assert.equal(source.includes("buildInfrastructureGraphFromDiagramJson"), false);
});
