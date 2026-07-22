import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InfrastructureGraph } from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";

const REVERSE_ENGINEERING_ALB_CLOUDFRONT_FIXTURE = "reverse-engineering-alb-cloudfront";
const REVERSE_ENGINEERING_ECS_FIXTURE = "reverse-engineering-ecs";
const REVERSE_ENGINEERING_CLOUDWATCH_LOG_GROUP_FIXTURE =
  "reverse-engineering-cloudwatch-log-group";
const PROVIDERS_TF = `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = "ap-northeast-2"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
}
`;

async function main(): Promise<void> {
  const fixtureName = readFixtureName(process.argv.slice(2));
  const createFixture = fixtureName === REVERSE_ENGINEERING_ALB_CLOUDFRONT_FIXTURE
    ? createAlbCloudFrontFixture
    : fixtureName === REVERSE_ENGINEERING_ECS_FIXTURE
      ? createEcsFixture
      : fixtureName === REVERSE_ENGINEERING_CLOUDWATCH_LOG_GROUP_FIXTURE
        ? createCloudWatchLogGroupFixture
        : null;
  if (!createFixture) {
    throw new Error(
      `Unknown Terraform validation fixture: ${fixtureName ?? "<missing>"}. ` +
        `Expected --fixture ${REVERSE_ENGINEERING_ALB_CLOUDFRONT_FIXTURE} or ` +
        `${REVERSE_ENGINEERING_ECS_FIXTURE} or ` +
        `${REVERSE_ENGINEERING_CLOUDWATCH_LOG_GROUP_FIXTURE}.`
    );
  }

  const terraformBinary = process.env.TERRAFORM_BIN?.trim() || "terraform";
  const workingDirectory = await mkdtemp(join(tmpdir(), "sketchcatch-reverse-engineering-terraform-"));

  try {
    const terraform = renderTerraformFromInfrastructureGraph(createFixture());
    assertStrictFixtureTerraform(fixtureName, terraform);
    await Promise.all([
      writeFile(join(workingDirectory, "main.tf"), `${terraform}\n`, "utf8"),
      writeFile(join(workingDirectory, "providers.tf"), PROVIDERS_TF, "utf8")
    ]);

    runTerraform(
      terraformBinary,
      ["fmt", "-check", "-diff", "main.tf", "providers.tf"],
      workingDirectory
    );
    runTerraform(
      terraformBinary,
      ["init", "-backend=false", "-input=false", "-no-color"],
      workingDirectory,
      "Terraform init could not load hashicorp/aws. Provide network access or a populated TF_PLUGIN_CACHE_DIR."
    );
    runTerraform(terraformBinary, ["validate", "-no-color"], workingDirectory);
    process.stdout.write(
      `Terraform fixture ${fixtureName}: fmt, init, validate passed.\n`
    );
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

function assertStrictFixtureTerraform(fixtureName: string | undefined, terraform: string): void {
  if (fixtureName === REVERSE_ENGINEERING_ALB_CLOUDFRONT_FIXTURE) {
    if (!/^\s*ip_address_type\s+=\s+"dualstack"\s*$/m.test(terraform)) {
      throw new Error(
        "ALB CloudFront fixture must preserve dualstack as aws_lb.ip_address_type before Terraform validation."
      );
    }
    return;
  }

  if (fixtureName === REVERSE_ENGINEERING_CLOUDWATCH_LOG_GROUP_FIXTURE) {
    if (
      !/resource "aws_cloudwatch_log_group" "orders" \{[\s\S]*name\s+= "\/ecs\/orders"[\s\S]*retention_in_days\s+= 30[\s\S]*kms_key_id\s+= "arn:aws:kms:/.test(
        terraform
      )
    ) {
      throw new Error(
        "CloudWatch Log Group fixture must preserve name, retention_in_days, and kms_key_id before Terraform validation."
      );
    }
    if (/log_group_class|stored_bytes|provider_resource_/u.test(terraform)) {
      throw new Error(
        "CloudWatch Log Group fixture must not render observed-only AWS fields."
      );
    }
    return;
  }

  if (fixtureName !== REVERSE_ENGINEERING_ECS_FIXTURE) {
    return;
  }

  if (!/resource "aws_ecs_service" "classic_api" \{[\s\S]*elb_name\s+= "orders-classic-elb"/.test(terraform)) {
    throw new Error(
      "ECS fixture must preserve classic LoadBalancerName as aws_ecs_service.load_balancer.elb_name before Terraform validation."
    );
  }

  if (/\bload_balancer_name\s+=/.test(terraform)) {
    throw new Error("ECS fixture must not render unsupported aws_ecs_service.load_balancer.load_balancer_name.");
  }
}

// gg: 기존 CloudWatch Log Group에서 실제로 관리할 세 필드만 Terraform 검증에 넣습니다.
function createCloudWatchLogGroupFixture(): InfrastructureGraph {
  return {
    nodes: [
      {
        id: "reverse-engineering-cloudwatch-log-group",
        label: "orders logs",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_cloudwatch_log_group",
          resourceName: "orders",
          fileName: "main"
        },
        config: {
          name: "/ecs/orders",
          retentionInDays: 30,
          kmsKeyId:
            "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555",
          logGroupClass: "STANDARD",
          storedBytes: 1234,
          providerResourceId:
            "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders",
          providerResourceType: "AWS::Logs::LogGroup"
        }
      }
    ],
    edges: []
  };
}

function readFixtureName(args: readonly string[]): string | undefined {
  const fixtureFlagIndex = args.indexOf("--fixture");
  const fixtureName = fixtureFlagIndex >= 0 ? args[fixtureFlagIndex + 1] : undefined;

  return fixtureName && fixtureName.trim().length > 0 ? fixtureName : undefined;
}

function runTerraform(
  terraformBinary: string,
  args: readonly string[],
  workingDirectory: string,
  failureHint?: string
): void {
  const result = spawnSync(terraformBinary, [...args], {
    cwd: workingDirectory,
    encoding: "utf8",
    env: createCredentialFreeTerraformEnvironment()
  });
  const command = `${terraformBinary} ${args.join(" ")}`;

  if (result.error) {
    const binaryHint = (result.error as NodeJS.ErrnoException).code === "ENOENT"
      ? ` Terraform binary was not found; set TERRAFORM_BIN or install Terraform.`
      : "";
    throw new Error(`Failed to start ${command}.${binaryHint} ${result.error.message}`.trim());
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} failed with exit code ${result.status}.` +
        `${output ? `\n${output}` : ""}` +
        `${failureHint ? `\n${failureHint}` : ""}`
    );
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (output) {
    process.stdout.write(`${output}\n`);
  }
}

function createCredentialFreeTerraformEnvironment(): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("AWS_"))
  );

  return {
    ...environment,
    AWS_EC2_METADATA_DISABLED: "true",
    TF_IN_AUTOMATION: "1",
    TF_INPUT: "0"
  };
}

function createAlbCloudFrontFixture(): InfrastructureGraph {
  const albArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one";
  const albDomainName = "orders-123.ap-northeast-2.elb.amazonaws.com";
  const cloudFrontArn = "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION";

  return {
    nodes: [
      {
        id: "reverse-engineering-alb",
        label: "orders",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_lb",
          resourceName: "orders",
          fileName: "main"
        },
        config: {
          arn: albArn,
          dnsName: albDomainName,
          ipAddressType: "dualstack",
          name: "orders",
          providerResourceId: albArn,
          providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
          scheme: "internet-facing",
          securityGroupIds: ["sg-0123456789abcdef0"],
          subnetIds: ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"],
          type: "application",
          vpcId: "vpc-0123456789abcdef0"
        }
      },
      {
        id: "reverse-engineering-cloudfront",
        label: "orders edge",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_cloudfront_distribution",
          resourceName: "orders_edge",
          fileName: "main"
        },
        config: {
          arn: cloudFrontArn,
          comment: "orders entry",
          defaultCacheBehavior: {
            allowedMethods: ["GET", "HEAD"],
            cachedMethods: ["GET", "HEAD"],
            forwardedValues: { queryString: false, cookies: { forward: "none" } },
            targetOriginId: "orders-alb",
            viewerProtocolPolicy: "redirect-to-https"
          },
          enabled: true,
          id: "EDISTRIBUTION",
          origin: [
            {
              customOriginConfig: {
                httpPort: 80,
                httpsPort: 443,
                originProtocolPolicy: "https-only",
                originSslProtocols: ["TLSv1.2"]
              },
              domainName: albDomainName,
              originId: "orders-alb"
            }
          ],
          providerResourceId: cloudFrontArn,
          providerResourceType: "AWS::CloudFront::Distribution",
          restrictions: { geoRestriction: { restrictionType: "none" } },
          viewerCertificate: { cloudfrontDefaultCertificate: true }
        }
      }
    ],
    edges: [
      {
        id: "reverse-engineering-cloudfront-origin",
        sourceId: "reverse-engineering-alb",
        targetId: "reverse-engineering-cloudfront",
        label: "depends_on"
      }
    ]
  };
}

function createEcsFixture(): InfrastructureGraph {
  const clusterArn = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
  const taskDefinitionArn =
    "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7";

  return {
    nodes: [
      {
        id: "reverse-engineering-ecs-cluster",
        label: "orders",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_ecs_cluster",
          resourceName: "orders",
          fileName: "main"
        },
        config: {
          name: "orders",
          capacityProviders: ["FARGATE", "FARGATE_SPOT"],
          configuration: {
            executeCommandConfiguration: {
              logging: "OVERRIDE",
              logConfiguration: {
                s3BucketName: "orders-command-logs",
                s3EncryptionEnabled: true
              }
            }
          },
          providerResourceId: clusterArn,
          providerResourceType: "AWS::ECS::Cluster"
        }
      },
      {
        id: "reverse-engineering-ecs-managed-storage-cluster",
        label: "managed-storage",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_ecs_cluster",
          resourceName: "managed_storage",
          fileName: "main"
        },
        config: {
          name: "managed-storage",
          configuration: {
            managedStorageConfiguration: {
              kmsKeyId:
                "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555",
              fargateEphemeralStorageKmsKeyId:
                "arn:aws:kms:ap-northeast-2:123456789012:key/66666666-7777-8888-9999-000000000000"
            }
          },
          providerResourceId:
            "arn:aws:ecs:ap-northeast-2:123456789012:cluster/managed-storage",
          providerResourceType: "AWS::ECS::Cluster"
        }
      },
      {
        id: "reverse-engineering-ecs-task-definition",
        label: "orders:7",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_ecs_task_definition",
          resourceName: "orders",
          fileName: "main"
        },
        config: {
          family: "orders",
          networkMode: "awsvpc",
          requiresCompatibilities: ["FARGATE"],
          cpu: "512",
          memory: "1024",
          executionRoleArn: "arn:aws:iam::123456789012:role/ecs-execution",
          taskRoleArn: "arn:aws:iam::123456789012:role/orders-task",
          containerDefinitions: [
            {
              name: "api",
              image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
              essential: true,
              portMappings: [{ containerPort: 4000, protocol: "tcp" }],
              secrets: [
                {
                  name: "DATABASE_URL",
                  valueFrom:
                    "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:orders-db"
                }
              ]
            }
          ],
          providerResourceId: taskDefinitionArn,
          providerResourceType: "AWS::ECS::TaskDefinition"
        }
      },
      {
        id: "reverse-engineering-ecs-service",
        label: "api",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_ecs_service",
          resourceName: "api",
          fileName: "main"
        },
        config: {
          name: "api",
          clusterArn,
          taskDefinitionArn,
          desiredCount: 2,
          launchType: "FARGATE",
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: ["subnet-0123456789abcdef0"],
              securityGroups: ["sg-0123456789abcdef0"],
              assignPublicIp: "DISABLED"
            }
          },
          loadBalancers: [
            {
              targetGroupArn:
                "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/orders/one",
              containerName: "api",
              containerPort: 4000
            }
          ],
          providerResourceId:
            "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api",
          providerResourceType: "AWS::ECS::Service"
        }
      },
      {
        id: "reverse-engineering-ecs-classic-service",
        label: "classic-api",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_ecs_service",
          resourceName: "classic_api",
          fileName: "main"
        },
        config: {
          name: "classic-api",
          clusterArn,
          taskDefinitionArn,
          desiredCount: 1,
          launchType: "EC2",
          loadBalancers: [
            {
              loadBalancerName: "orders-classic-elb",
              containerName: "api",
              containerPort: 4000
            }
          ],
          providerResourceId:
            "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/classic-api",
          providerResourceType: "AWS::ECS::Service"
        }
      }
    ],
    edges: [
      {
        id: "reverse-engineering-ecs-cluster-service",
        sourceId: "reverse-engineering-ecs-cluster",
        targetId: "reverse-engineering-ecs-service",
        label: "depends_on"
      },
      {
        id: "reverse-engineering-ecs-task-service",
        sourceId: "reverse-engineering-ecs-task-definition",
        targetId: "reverse-engineering-ecs-service",
        label: "depends_on"
      }
    ]
  };
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
