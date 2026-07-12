import type { ResourceType } from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";

export type SupportedArchitectureResourceCatalogItem = {
  readonly id: string;
  readonly displayName: string;
  readonly deploymentConfig: Record<string, unknown>;
  readonly deploymentNotes: readonly string[];
  readonly nodeType: ResourceType;
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
  readonly terraformPreview: boolean;
  readonly terraformSync: boolean;
};

export const SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG: readonly SupportedArchitectureResourceCatalogItem[] =
  resourceDefinitions
    .filter((definition) => definition.resourceType !== "UNKNOWN")
    .map((definition) => ({
      id: definition.id,
      displayName: formatResourceDefinitionDisplayName(definition.id),
      deploymentConfig: createDeploymentConfig(definition.terraform.resourceType),
      deploymentNotes: createDeploymentNotes(definition.terraform.resourceType),
      nodeType: definition.resourceType,
      terraformBlockType: definition.terraform.blockType,
      terraformResourceType: definition.terraform.resourceType,
      terraformPreview: definition.capabilities.terraformPreview,
      terraformSync: definition.capabilities.terraformSync
    }));

export const SUPPORTED_ARCHITECTURE_RESOURCE_TYPES = Array.from(
  new Set(SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG.map((definition) => definition.nodeType))
) satisfies ResourceType[];

function formatResourceDefinitionDisplayName(id: string): string {
  return id
    .replace(/^aws-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function createArchitectureResourceDeploymentConfig(
  terraformResourceType: string
): Record<string, unknown> {
  return createDeploymentConfig(terraformResourceType);
}

function createDeploymentConfig(terraformResourceType: string): Record<string, unknown> {
  switch (terraformResourceType) {
    case "aws_caller_identity":
      return {};
    case "aws_ssm_parameter":
      return {
        name: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
      };
    case "aws_codebuild_project":
      return {
        name: "sketchcatch-build",
        serviceRole: "aws_iam_role.codebuild_service_role.arn",
        artifacts: {
          type: "NO_ARTIFACTS"
        },
        environment: {
          computeType: "BUILD_GENERAL1_SMALL",
          image: "aws/codebuild/standard:7.0",
          type: "LINUX_CONTAINER"
        },
        source: {
          type: "NO_SOURCE",
          buildspec: "version: 0.2\nphases:\n  build:\n    commands:\n      - echo \"SketchCatch build placeholder\""
        }
      };
    case "aws_codedeploy_app":
      return {
        name: "sketchcatch-app",
        computePlatform: "Server"
      };
    case "aws_codedeploy_deployment_group":
      return {
        appName: "aws_codedeploy_app.codedeploy_app.name",
        deploymentGroupName: "sketchcatch-deployment-group",
        serviceRoleArn: "aws_iam_role.codedeploy_service_role.arn",
        deploymentStyle: {
          deploymentOption: "WITHOUT_TRAFFIC_CONTROL",
          deploymentType: "IN_PLACE"
        }
      };
    case "aws_codepipeline":
      return {
        name: "sketchcatch-pipeline",
        roleArn: "aws_iam_role.codepipeline_service_role.arn",
        artifactStore: {
          location: "aws_s3_bucket.codepipeline_artifacts.bucket",
          type: "S3"
        },
        stage: [
          {
            name: "Source",
            action: [
              {
                category: "Source",
                configuration: {
                  BranchName: "main",
                  ConnectionArn: "aws_codestarconnections_connection.github.arn",
                  FullRepositoryId: "example-org/example-repo"
                },
                name: "Source",
                outputArtifacts: ["source_output"],
                owner: "AWS",
                provider: "CodeStarSourceConnection",
                version: "1"
              }
            ]
          },
          {
            name: "Build",
            action: [
              {
                category: "Build",
                configuration: {
                  ProjectName: "aws_codebuild_project.build.name"
                },
                inputArtifacts: ["source_output"],
                name: "Build",
                outputArtifacts: ["build_output"],
                owner: "AWS",
                provider: "CodeBuild",
                version: "1"
              }
            ]
          }
        ]
      };
    case "aws_codestarconnections_connection":
      return {
        name: "sketchcatch-github",
        providerType: "GitHub"
      };
    default:
      return {};
  }
}

function createDeploymentNotes(terraformResourceType: string): readonly string[] {
  switch (terraformResourceType) {
    case "aws_codebuild_project":
      return [
        "Requires an IAM service role trusted by codebuild.amazonaws.com.",
        "Use source/artifacts/environment blocks; NO_SOURCE and NO_ARTIFACTS are valid for a minimal placeholder project."
      ];
    case "aws_codedeploy_deployment_group":
      return [
        "Requires an aws_codedeploy_app and an IAM service role trusted by codedeploy.amazonaws.com."
      ];
    case "aws_codepipeline":
      return [
        "Requires an IAM service role, S3 artifact bucket, source connection, and at least source/build stages."
      ];
    case "aws_codestarconnections_connection":
      return [
        "Connection creation can require a user to complete provider authorization after Terraform creates the pending connection."
      ];
    case "aws_ssm_parameter":
      return [
        "Use an existing public or account-owned SSM parameter name; the default public AMI parameter is deploy-check friendly."
      ];
    default:
      return [];
  }
}
