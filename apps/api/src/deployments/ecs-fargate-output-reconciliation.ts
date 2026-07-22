import { createHash } from "node:crypto";
import type { EcsFargateRuntimeConfig } from "@sketchcatch/types";

export type TerraformOutputForEcsReconciliation = {
  name: string;
  value: unknown | null;
  sensitive: boolean;
};

export type TerraformResourceForEcsReconciliation = {
  terraformType: string;
  resourceId: string | null;
  region: string;
};

export type ResolvedEcsFargateRuntimeOutputs = {
  outputUrl: string;
  apiOriginUrl: string;
  frontendBucketName: string;
  cloudFrontDistributionId: string;
  cloudFrontDomainName: string;
  ecrRepositoryName: string;
  ecrRepositoryArn: string;
  ecrRepositoryUrl: string;
  clusterName: string;
  serviceName: string;
  taskDefinitionFamily: string;
  taskDefinitionArn: string;
  taskRoleArn: string;
  executionRoleArn: string;
  containerName: string;
  containerPort: number;
  loadBalancerArn: string;
  loadBalancerDnsName: string;
  targetGroupArn: string;
  logGroupNames: string[];
};

export class EcsFargateOutputReconciliationError extends Error {
  constructor(
    message: string,
    readonly code: "DEPLOYMENT_OUTPUT_URL_REQUIRED" | "DEPLOYMENT_OUTPUT_URL_CONFLICT"
  ) {
    super(message);
    this.name = "EcsFargateOutputReconciliationError";
  }
}

export function createEcsFargateRuntimeCoordinatesFingerprint(
  runtimeConfig: EcsFargateRuntimeConfig
): string {
  const coordinates = {
    codeBuildProjectName: runtimeConfig.codeBuildProjectName,
    buildEnvironmentId: runtimeConfig.buildEnvironmentId ?? null,
    ecrRepositoryName: runtimeConfig.ecrRepositoryName,
    ecrRepositoryArn: runtimeConfig.ecrRepositoryArn ?? null,
    ecrRepositoryUrl: runtimeConfig.ecrRepositoryUrl ?? null,
    clusterName: runtimeConfig.clusterName,
    serviceName: runtimeConfig.serviceName,
    containerName: runtimeConfig.containerName,
    containerPort: runtimeConfig.containerPort ?? null,
    taskDefinitionFamily: runtimeConfig.taskDefinitionFamily ?? null,
    taskDefinitionArn: runtimeConfig.taskDefinitionArn ?? null,
    taskRoleArn: runtimeConfig.taskRoleArn ?? null,
    executionRoleArn: runtimeConfig.executionRoleArn ?? null,
    targetGroupArn: runtimeConfig.targetGroupArn ?? null,
    loadBalancerArn: runtimeConfig.loadBalancerArn ?? null,
    loadBalancerDnsName: runtimeConfig.loadBalancerDnsName ?? null,
    apiOriginUrl: runtimeConfig.apiOriginUrl ?? null,
    frontendBucketName: runtimeConfig.frontendBucketName ?? null,
    cloudFrontDistributionId: runtimeConfig.cloudFrontDistributionId ?? null,
    cloudFrontDomainName: runtimeConfig.cloudFrontDomainName ?? null,
    logGroupNames: runtimeConfig.logGroupNames ?? []
  };

  return createHash("sha256").update(JSON.stringify(coordinates)).digest("hex");
}

export function reconcileEcsFargateRuntimeConfig(
  currentRuntimeConfig: EcsFargateRuntimeConfig,
  input: {
    expectedCoordinatesFingerprint: string;
    outputs: ResolvedEcsFargateRuntimeOutputs;
  }
): { runtimeConfig: EcsFargateRuntimeConfig; changed: boolean } {
  const currentFingerprint = createEcsFargateRuntimeCoordinatesFingerprint(currentRuntimeConfig);
  if (currentFingerprint !== input.expectedCoordinatesFingerprint) {
    throw new EcsFargateOutputReconciliationError(
      "ECS runtime coordinates changed after artifact preparation",
      "DEPLOYMENT_OUTPUT_URL_CONFLICT"
    );
  }

  const resolved = input.outputs;
  // These values select the prepared release target. Remaining runtime values are
  // Terraform-managed results verified against the approved state inventory by the caller.
  const conflictingCoordinates = [
    currentRuntimeConfig.ecrRepositoryName !== resolved.ecrRepositoryName
      ? "ecrRepositoryName"
      : null,
    currentRuntimeConfig.clusterName !== resolved.clusterName ? "clusterName" : null,
    currentRuntimeConfig.serviceName !== resolved.serviceName ? "serviceName" : null,
    currentRuntimeConfig.containerName !== resolved.containerName ? "containerName" : null,
    currentRuntimeConfig.containerPort !== undefined &&
    currentRuntimeConfig.containerPort !== resolved.containerPort
      ? "containerPort"
      : null
  ].filter((coordinate): coordinate is string => coordinate !== null);
  if (conflictingCoordinates.length > 0) {
    throw new EcsFargateOutputReconciliationError(
      `ECS web runtime coordinates conflict with the Terraform outputs: ${conflictingCoordinates.join(", ")}`,
      "DEPLOYMENT_OUTPUT_URL_CONFLICT"
    );
  }
  const runtimeConfig: EcsFargateRuntimeConfig = {
    ...currentRuntimeConfig,
    ecrRepositoryArn: resolved.ecrRepositoryArn,
    ecrRepositoryUrl: resolved.ecrRepositoryUrl,
    containerPort: resolved.containerPort,
    taskDefinitionFamily: resolved.taskDefinitionFamily,
    taskDefinitionArn: resolved.taskDefinitionArn,
    taskRoleArn: resolved.taskRoleArn,
    executionRoleArn: resolved.executionRoleArn,
    targetGroupArn: resolved.targetGroupArn,
    loadBalancerArn: resolved.loadBalancerArn,
    loadBalancerDnsName: resolved.loadBalancerDnsName,
    apiOriginUrl: resolved.apiOriginUrl,
    frontendBucketName: resolved.frontendBucketName,
    cloudFrontDistributionId: resolved.cloudFrontDistributionId,
    cloudFrontDomainName: resolved.cloudFrontDomainName,
    logGroupNames: resolved.logGroupNames,
    outputUrl: resolved.outputUrl
  };
  const changed = JSON.stringify(runtimeConfig) !== JSON.stringify(currentRuntimeConfig);
  return { runtimeConfig: changed ? runtimeConfig : currentRuntimeConfig, changed };
}

export function resolveEcsFargateApiBaseUrl(
  outputs: readonly TerraformOutputForEcsReconciliation[]
): string {
  return resolveEcsFargateRuntimeOutputs(outputs).outputUrl;
}

export function resolveEcsFargateRuntimeOutputs(
  outputs: readonly TerraformOutputForEcsReconciliation[]
): ResolvedEcsFargateRuntimeOutputs {
  const outputUrl = requireUrlOutput(outputs, "cloudfront_url", ["https:"]);
  const cloudFrontDomainName = requireStringOutput(outputs, "cloudfront_domain_name");
  const parsedOutputUrl = new URL(outputUrl);
  if (parsedOutputUrl.hostname !== cloudFrontDomainName) throwOutputUrlRequired();
  const resolved = {
    outputUrl,
    apiOriginUrl: requireUrlOutput(outputs, "api_origin_url", ["http:", "https:"]),
    frontendBucketName: requireStringOutput(outputs, "static_bucket_name"),
    cloudFrontDistributionId: requireStringOutput(outputs, "cloudfront_distribution_id"),
    cloudFrontDomainName,
    ecrRepositoryName: requireStringOutput(outputs, "ecr_repository_name"),
    ecrRepositoryArn: requireStringOutput(outputs, "ecr_repository_arn"),
    ecrRepositoryUrl: requireStringOutput(outputs, "ecr_repository_url"),
    clusterName: requireStringOutput(outputs, "ecs_cluster_name"),
    serviceName: requireStringOutput(outputs, "ecs_service_name"),
    taskDefinitionFamily: requireStringOutput(outputs, "ecs_task_definition_family"),
    taskDefinitionArn: requireStringOutput(outputs, "ecs_task_definition_arn"),
    taskRoleArn: requireStringOutput(outputs, "ecs_task_role_arn"),
    executionRoleArn: requireStringOutput(outputs, "ecs_execution_role_arn"),
    containerName: requireStringOutput(outputs, "ecs_container_name"),
    containerPort: requireNumberOutput(outputs, "ecs_container_port"),
    loadBalancerArn: requireStringOutput(outputs, "alb_arn"),
    loadBalancerDnsName: requireStringOutput(outputs, "alb_dns_name"),
    targetGroupArn: requireStringOutput(outputs, "target_group_arn"),
    logGroupNames: requireStringArrayOutput(outputs, "log_group_names")
  };
  const apiOrigin = new URL(resolved.apiOriginUrl);
  if (
    apiOrigin.hostname !== resolved.loadBalancerDnsName ||
    !resolved.cloudFrontDomainName.endsWith(".cloudfront.net")
  ) {
    throwOutputUrlRequired();
  }
  return resolved;
}

export function assertEcsFargateRuntimeInventory(
  outputs: ResolvedEcsFargateRuntimeOutputs,
  resources: readonly TerraformResourceForEcsReconciliation[],
  input: { accountId: string; region: string }
): void {
  for (const arn of [
    outputs.ecrRepositoryArn,
    outputs.taskDefinitionArn,
    outputs.loadBalancerArn,
    outputs.targetGroupArn
  ]) {
    const identity = parseAwsArnIdentity(arn);
    if (identity.accountId !== input.accountId || identity.region !== input.region) {
      throwOutputConflict(
        "Terraform output ARN does not match the approved AWS account and region"
      );
    }
  }
  for (const roleArn of [outputs.taskRoleArn, outputs.executionRoleArn]) {
    const identity = parseAwsArnIdentity(roleArn, true);
    if (identity.accountId !== input.accountId || identity.region !== "") {
      throwOutputConflict("Terraform IAM role ARN does not match the approved AWS account");
    }
  }

  const expectedResources: Array<{
    terraformType: string;
    description: string;
    matches: (resourceId: string) => boolean;
  }> = [
    {
      terraformType: "aws_s3_bucket",
      description: "frontend S3 bucket",
      matches: (resourceId) => resourceId === outputs.frontendBucketName
    },
    {
      terraformType: "aws_cloudfront_distribution",
      description: "CloudFront distribution",
      matches: (resourceId) => resourceId === outputs.cloudFrontDistributionId
    },
    {
      terraformType: "aws_ecr_repository",
      description: "ECR repository",
      matches: (resourceId) =>
        resourceId === outputs.ecrRepositoryName || resourceId === outputs.ecrRepositoryArn
    },
    {
      terraformType: "aws_ecs_cluster",
      description: "ECS cluster",
      matches: (resourceId) =>
        resourceId === outputs.clusterName || resourceId.endsWith(`cluster/${outputs.clusterName}`)
    },
    {
      terraformType: "aws_ecs_service",
      description: "ECS service",
      matches: (resourceId) =>
        resourceId === outputs.serviceName || resourceId.endsWith(`/${outputs.serviceName}`)
    },
    {
      terraformType: "aws_ecs_task_definition",
      description: "ECS task definition",
      matches: (resourceId) => resourceId === outputs.taskDefinitionArn
    },
    {
      terraformType: "aws_iam_role",
      description: "ECS task role",
      matches: (resourceId) => matchesIamRole(resourceId, outputs.taskRoleArn)
    },
    {
      terraformType: "aws_iam_role",
      description: "ECS execution role",
      matches: (resourceId) => matchesIamRole(resourceId, outputs.executionRoleArn)
    },
    {
      terraformType: "aws_lb",
      description: "application load balancer",
      matches: (resourceId) => resourceId === outputs.loadBalancerArn
    },
    {
      terraformType: "aws_lb_target_group",
      description: "target group",
      matches: (resourceId) => resourceId === outputs.targetGroupArn
    }
  ];

  for (const expected of expectedResources) {
    const matched = resources.some(
      (resource) =>
        resource.terraformType === expected.terraformType &&
        resource.region === input.region &&
        typeof resource.resourceId === "string" &&
        expected.matches(resource.resourceId)
    );
    if (!matched) {
      throwOutputConflict(`Terraform state does not contain the approved ${expected.description}`);
    }
  }

  for (const logGroupName of outputs.logGroupNames) {
    const matched = resources.some(
      (resource) =>
        resource.terraformType === "aws_cloudwatch_log_group" &&
        resource.region === input.region &&
        resource.resourceId === logGroupName
    );
    if (!matched) {
      throwOutputConflict(`Terraform state does not contain log group ${logGroupName}`);
    }
  }
}

function requireStringOutput(
  outputs: readonly TerraformOutputForEcsReconciliation[],
  name: string
): string {
  const output = outputs.find((candidate) => candidate.name === name);
  if (
    !output ||
    output.sensitive ||
    typeof output.value !== "string" ||
    output.value.length === 0 ||
    output.value.length > 2048 ||
    output.value !== output.value.trim()
  ) {
    throwOutputUrlRequired();
  }

  return output.value;
}

function requireUrlOutput(
  outputs: readonly TerraformOutputForEcsReconciliation[],
  name: string,
  protocols: string[]
): string {
  const value = requireStringOutput(outputs, name);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throwOutputUrlRequired();
  }

  if (
    !protocols.includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throwOutputUrlRequired();
  }

  return value;
}

function requireNumberOutput(
  outputs: readonly TerraformOutputForEcsReconciliation[],
  name: string
): number {
  const output = outputs.find((candidate) => candidate.name === name);
  if (
    !output ||
    output.sensitive ||
    typeof output.value !== "number" ||
    !Number.isInteger(output.value) ||
    output.value < 1 ||
    output.value > 65_535
  ) {
    throwOutputUrlRequired();
  }
  return output.value;
}

function requireStringArrayOutput(
  outputs: readonly TerraformOutputForEcsReconciliation[],
  name: string
): string[] {
  const output = outputs.find((candidate) => candidate.name === name);
  if (
    !output ||
    output.sensitive ||
    !Array.isArray(output.value) ||
    output.value.length === 0 ||
    output.value.some((value) => typeof value !== "string" || !value.trim())
  ) {
    throwOutputUrlRequired();
  }
  return output.value as string[];
}

function throwOutputUrlRequired(): never {
  throw new EcsFargateOutputReconciliationError(
    "DEPLOYMENT_OUTPUT_URL_REQUIRED",
    "DEPLOYMENT_OUTPUT_URL_REQUIRED"
  );
}

function parseAwsArnIdentity(
  arn: string,
  allowGlobalRegion = false
): { region: string; accountId: string } {
  const parts = arn.split(":");
  if (
    parts.length < 6 ||
    parts[0] !== "arn" ||
    parts[1] !== "aws" ||
    (!allowGlobalRegion && !parts[3]) ||
    !parts[4]
  ) {
    throwOutputConflict("Terraform output contains an invalid AWS ARN");
  }
  return { region: parts[3] ?? "", accountId: parts[4] };
}

function matchesIamRole(resourceId: string, roleArn: string): boolean {
  const roleName = roleArn.split("/").at(-1);
  return resourceId === roleArn || (roleName !== undefined && resourceId === roleName);
}

function throwOutputConflict(message: string): never {
  throw new EcsFargateOutputReconciliationError(message, "DEPLOYMENT_OUTPUT_URL_CONFLICT");
}
