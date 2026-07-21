import type {
  ArchitectureJson,
  GitCicdHandoffConfigurationPreview,
  ProjectDeploymentTarget
} from "@sketchcatch/types";
import { credentialFreeHttpsUrlSchema } from "../runtime-convergence/runtime-convergence-schemas.js";

const PRIMARY_RDS_TERRAFORM_RESOURCE_TYPES = new Set([
  "aws_db_instance",
  "aws_rds_cluster",
  "aws_rds_cluster_instance"
]);

export function deriveGitCicdHandoffConfigurationPreview(input: {
  architectureJson: ArchitectureJson;
  deploymentTarget: Pick<
    ProjectDeploymentTarget,
    "runtimeTargetKind" | "confirmedBuildConfig" | "runtimeConfig"
  >;
}): GitCicdHandoffConfigurationPreview {
  const rdsEnabled = input.architectureJson.nodes.some((node) =>
    PRIMARY_RDS_TERRAFORM_RESOURCE_TYPES.has(readTerraformResourceType(node.config) ?? "")
  );
  const publicOutputUrl = normalizePublicHandoffOutputUrl(
    input.deploymentTarget.runtimeConfig?.outputUrl
  );

  if (input.deploymentTarget.runtimeTargetKind === "ecs_fargate") {
    return input.deploymentTarget.confirmedBuildConfig?.ecsWeb
      ? {
          rdsEnabled,
          staticSiteUrl: publicOutputUrl,
          apiBaseUrl: publicOutputUrl
        }
      : {
          rdsEnabled,
          staticSiteUrl: null,
          apiBaseUrl: publicOutputUrl
        };
  }

  if (
    input.deploymentTarget.runtimeTargetKind === "lambda" ||
    input.deploymentTarget.runtimeTargetKind === "ec2_asg"
  ) {
    return {
      rdsEnabled,
      staticSiteUrl: null,
      apiBaseUrl: publicOutputUrl
    };
  }

  return {
    rdsEnabled,
    staticSiteUrl: publicOutputUrl,
    apiBaseUrl: null
  };
}

function readTerraformResourceType(
  config: ArchitectureJson["nodes"][number]["config"]
): string | null {
  const terraformResourceType = config.terraformResourceType;
  return typeof terraformResourceType === "string" ? terraformResourceType : null;
}

function normalizePublicHandoffOutputUrl(value: unknown): string | null {
  const result = credentialFreeHttpsUrlSchema.safeParse(value);
  return result.success ? result.data : null;
}
