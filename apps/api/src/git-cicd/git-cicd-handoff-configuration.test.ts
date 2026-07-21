import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, ProjectDeploymentTarget } from "@sketchcatch/types";
import { deriveGitCicdHandoffConfigurationPreview } from "./git-cicd-handoff-configuration.js";

type HandoffDeploymentTarget = Pick<
  ProjectDeploymentTarget,
  "runtimeTargetKind" | "confirmedBuildConfig" | "runtimeConfig"
>;

const emptyArchitecture: ArchitectureJson = {
  nodes: [],
  edges: []
};

function architectureWithTerraformResourceType(
  terraformResourceType: unknown
): ArchitectureJson {
  return {
    nodes: [
      {
        id: "database",
        type: "RDS",
        positionX: 0,
        positionY: 0,
        config: { terraformResourceType }
      }
    ],
    edges: []
  };
}

test("derives a static site's public HTTPS output URL", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "static_site",
    confirmedBuildConfig: null,
    runtimeConfig: {
      runtimeTargetKind: "static_site",
      hostingBucketName: "example-site",
      cloudFrontDistributionId: "E1234567890",
      cloudFrontOriginId: "example-origin",
      outputUrl: "https://static.example.com"
    }
  };

  assert.deepEqual(
    deriveGitCicdHandoffConfigurationPreview({
      architectureJson: emptyArchitecture,
      deploymentTarget
    }),
    {
      rdsEnabled: false,
      staticSiteUrl: "https://static.example.com",
      apiBaseUrl: null
    }
  );
});

test("derives a Lambda public HTTPS output URL as the API base URL", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "lambda",
    confirmedBuildConfig: null,
    runtimeConfig: {
      runtimeTargetKind: "lambda",
      functionLogicalId: "ApiFunction",
      functionName: "example-api",
      aliasName: "live",
      codeDeployApplicationName: "example-api",
      codeDeployDeploymentGroupName: "example-api-live",
      outputUrl: "https://api.example.com"
    }
  };

  assert.deepEqual(
    deriveGitCicdHandoffConfigurationPreview({
      architectureJson: emptyArchitecture,
      deploymentTarget
    }),
    {
      rdsEnabled: false,
      staticSiteUrl: null,
      apiBaseUrl: "https://api.example.com"
    }
  );
});

test("derives an EC2 Auto Scaling public HTTPS output URL as the API base URL", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "ec2_asg",
    confirmedBuildConfig: null,
    runtimeConfig: {
      runtimeTargetKind: "ec2_asg",
      codeDeployApplicationName: "example-api",
      codeDeployDeploymentGroupName: "example-api-live",
      autoScalingGroupName: "example-api-asg",
      outputUrl: "https://ec2-api.example.com"
    }
  };

  assert.deepEqual(
    deriveGitCicdHandoffConfigurationPreview({
      architectureJson: emptyArchitecture,
      deploymentTarget
    }),
    {
      rdsEnabled: false,
      staticSiteUrl: null,
      apiBaseUrl: "https://ec2-api.example.com"
    }
  );
});

test("derives a legacy ECS output URL as the API base URL only", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: null,
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-22T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "example-api",
      ecrRepositoryName: "example-api",
      clusterName: "example-cluster",
      serviceName: "example-service",
      containerName: "api",
      outputUrl: "https://legacy-ecs.example.com"
    }
  };

  assert.deepEqual(
    deriveGitCicdHandoffConfigurationPreview({
      architectureJson: emptyArchitecture,
      deploymentTarget
    }),
    {
      rdsEnabled: false,
      staticSiteUrl: null,
      apiBaseUrl: "https://legacy-ecs.example.com"
    }
  );
});

test("derives both ECS web URLs from outputUrl without exposing apiOriginUrl", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: "apps/api",
      evidence: [
        { kind: "dockerfile", path: "apps/api/Dockerfile" },
        { kind: "package_manifest", path: "apps/web/package.json" },
        { kind: "static_output", path: "apps/web/out" }
      ],
      installPreset: "pnpm_frozen_lockfile",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "apps/api/Dockerfile",
      packageManifestPath: "apps/web/package.json",
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: "apps/web/out",
      exactSemVerTag: null,
      manifestVersion: null,
      confirmedCommitSha: "b".repeat(40),
      confirmedAt: "2026-07-22T00:00:00.000Z",
      ecsWeb: {
        api: {
          sourceRoot: "apps/api",
          dockerfilePath: "apps/api/Dockerfile",
          containerPort: 8080,
          healthCheckPath: "/health"
        },
        frontend: {
          sourceRoot: "apps/web",
          packageManifestPath: "apps/web/package.json",
          lockfilePath: "pnpm-lock.yaml",
          packageManager: "pnpm",
          packageManagerVersion: "10.13.1",
          installPreset: "pnpm_frozen_lockfile",
          buildPreset: "pnpm_build",
          outputPath: "apps/web/out"
        }
      }
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "example-api",
      ecrRepositoryName: "example-api",
      clusterName: "example-cluster",
      serviceName: "example-service",
      containerName: "api",
      apiOriginUrl: "http://internal-alb.local",
      outputUrl: "https://app.example.com"
    }
  };

  assert.deepEqual(
    deriveGitCicdHandoffConfigurationPreview({
      architectureJson: emptyArchitecture,
      deploymentTarget
    }),
    {
      rdsEnabled: false,
      staticSiteUrl: "https://app.example.com",
      apiBaseUrl: "https://app.example.com"
    }
  );
});

test("enables RDS only for primary Terraform database resource types", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "static_site",
    confirmedBuildConfig: null,
    runtimeConfig: {
      runtimeTargetKind: "static_site",
      hostingBucketName: "example-site",
      cloudFrontDistributionId: "E1234567890",
      cloudFrontOriginId: "example-origin",
      outputUrl: "https://static.example.com"
    }
  };

  for (const terraformResourceType of [
    "aws_db_instance",
    "aws_rds_cluster",
    "aws_rds_cluster_instance"
  ]) {
    assert.equal(
      deriveGitCicdHandoffConfigurationPreview({
        architectureJson: architectureWithTerraformResourceType(terraformResourceType),
        deploymentTarget
      }).rdsEnabled,
      true,
      terraformResourceType
    );
  }
});

test("does not enable RDS for supporting or malformed Terraform resource types", () => {
  const deploymentTarget: HandoffDeploymentTarget = {
    runtimeTargetKind: "static_site",
    confirmedBuildConfig: null,
    runtimeConfig: null
  };

  for (const terraformResourceType of [
    "aws_db_subnet_group",
    "aws_db_parameter_group",
    "aws_db_option_group",
    "aws_db_snapshot",
    " aws_db_instance",
    { value: "aws_db_instance" }
  ]) {
    assert.equal(
      deriveGitCicdHandoffConfigurationPreview({
        architectureJson: architectureWithTerraformResourceType(terraformResourceType),
        deploymentTarget
      }).rdsEnabled,
      false,
      JSON.stringify(terraformResourceType)
    );
  }
});

test("rejects empty, HTTP, credentialed, query, and fragment output URLs", () => {
  for (const outputUrl of [
    "",
    "http://static.example.com",
    "https://user:password@static.example.com",
    "https://static.example.com?token=secret",
    "https://static.example.com#fragment"
  ]) {
    const deploymentTarget: HandoffDeploymentTarget = {
      runtimeTargetKind: "static_site",
      confirmedBuildConfig: null,
      runtimeConfig: {
        runtimeTargetKind: "static_site",
        hostingBucketName: "example-site",
        cloudFrontDistributionId: "E1234567890",
        cloudFrontOriginId: "example-origin",
        outputUrl
      }
    };

    assert.deepEqual(
      deriveGitCicdHandoffConfigurationPreview({
        architectureJson: emptyArchitecture,
        deploymentTarget
      }),
      {
        rdsEnabled: false,
        staticSiteUrl: null,
        apiBaseUrl: null
      },
      outputUrl
    );
  }
});
