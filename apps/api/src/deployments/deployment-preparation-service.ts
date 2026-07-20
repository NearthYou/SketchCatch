import { createHash } from "node:crypto";
import type {
  ConfirmedBuildConfig,
  DeploymentConsolePhase,
  DeploymentLiveProfile,
  DeploymentScope,
  DeploymentStatus,
  DiagramJson,
  RuntimeTargetKind,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { DeploymentConflictError } from "./deployment-service.js";
import {
  listTerraformResourceBlocks,
  type TerraformResourceBlock
} from "./terraform-artifact-safety.js";
import { findAnalysisExcludedTerraformConflicts } from "../services/terraform/analysis-excluded-terraform-guard.js";
import { listTerraformBlockIdentities } from "../services/terraform/terraform-to-diagram.js";
import { getRecommendedLiveApplyProfile } from "./deployment-plan-summary.js";

export type DeploymentPreparationDraft = {
  revision: number;
  diagramJson: DiagramJson;
  terraformFiles: TerraformSyncFileInput[] | null;
};

export type DeploymentPreparationTarget = {
  connectionId: string;
  runtimeTargetKind: RuntimeTargetKind;
  confirmedBuildConfig: ConfirmedBuildConfig | null;
  deploymentTargetFingerprint: string | null;
};

export type DeploymentPreparationRepository = {
  findProjectDraftForPreparation(
    projectId: string
  ): Promise<DeploymentPreparationDraft | undefined>;
  findProjectTargetForPreparation(
    projectId: string
  ): Promise<DeploymentPreparationTarget | undefined>;
};

export type ResolveDeploymentPreparationInput = {
  projectId: string;
  awsConnectionId: string;
  draftRevision: number;
  requestedScope: DeploymentScope | "auto";
};

export type ResolvedDeploymentPreparation = {
  liveProfile: DeploymentLiveProfile;
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
  deploymentTargetFingerprint: string | null;
  preparedDraftRevision: number;
  preparedSnapshotHash: string;
};

export async function resolveDeploymentPreparation(
  input: ResolveDeploymentPreparationInput,
  repository: DeploymentPreparationRepository
): Promise<ResolvedDeploymentPreparation> {
  const draft = await repository.findProjectDraftForPreparation(input.projectId);
  if (!draft) {
    throw new DeploymentConflictError("A saved draft is required before deployment prepare");
  }
  if (draft.revision !== input.draftRevision) {
    throw new DeploymentConflictError(
      `Project draft revision is stale: expected ${draft.revision}, received ${input.draftRevision}`
    );
  }

  assertDraftTerraformDoesNotIncludeAnalysisExcludedResource(draft);

  const target = await repository.findProjectTargetForPreparation(input.projectId);
  if (
    input.requestedScope === "auto" &&
    isEcsFargateDraft(draft) &&
    !target?.confirmedBuildConfig
  ) {
    throw new DeploymentConflictError(
      "A confirmed project deployment target is required for automatic ECS application deployment"
    );
  }
  const scope =
    input.requestedScope === "auto"
      ? detectDeploymentScope({ draft, target })
      : input.requestedScope;

  if (scope !== "infrastructure") {
    if (!target?.confirmedBuildConfig) {
      throw new DeploymentConflictError(
        "A confirmed project deployment target is required for application deployment"
      );
    }
    if (target.connectionId !== input.awsConnectionId) {
      throw new DeploymentConflictError(
        "Deployment connection must match the confirmed project target connection"
      );
    }
  }

  if (scope === "full_stack" && target?.confirmedBuildConfig) {
    assertRequiredRuntimeSecretsAreWiredInTerraform(draft, target.confirmedBuildConfig);
  }

  return {
    liveProfile: getRecommendedLiveApplyProfile(getDraftResourceTypes(draft)),
    scope,
    targetKind: scope === "infrastructure" ? null : (target?.runtimeTargetKind ?? null),
    deploymentTargetFingerprint:
      scope === "infrastructure" ? null : (target?.deploymentTargetFingerprint ?? null),
    preparedDraftRevision: draft.revision,
    preparedSnapshotHash: createPreparedDraftSnapshotHash(draft)
  };
}

export function assertRequiredRuntimeSecretsAreWiredInTerraform(
  draft: DeploymentPreparationDraft,
  confirmedBuildConfig: ConfirmedBuildConfig
): void {
  const requiredRuntimeSecrets = confirmedBuildConfig.ecsWeb?.api.requiredRuntimeSecrets ?? [];
  if (requiredRuntimeSecrets.length === 0) {
    return;
  }

  const terraformFiles =
    draft.terraformFiles?.filter((file) => file.fileName.endsWith(".tf")) ?? [];
  const terraformCode = terraformFiles.map((file) => file.terraformCode).join("\n");

  for (const secretName of requiredRuntimeSecrets) {
    if (
      secretName !== "CHECK_IN_SIGNING_SECRET" ||
      !hasCheckInSigningSecretContract(terraformCode)
    ) {
      throw new DeploymentConflictError(
        `${secretName} is required by the Repository build contract but the Terraform runtime Secret mapping is incomplete`
      );
    }
  }
}

function hasCheckInSigningSecretContract(terraformCode: string): boolean {
  const resources = listTerraformResourceBlocks(terraformCode);
  const secretVersions = resources.filter(
    (resource) => resource.type === "aws_secretsmanager_secret_version"
  );

  return secretVersions.some((secretVersion) => {
    const secretResourceName = matchTerraformReference(
      secretVersion.body,
      "secret_id",
      "aws_secretsmanager_secret",
      "id"
    );
    const generatedMaterialResourceName = matchTerraformReference(
      secretVersion.body,
      "secret_string",
      "random_password",
      "result"
    );
    if (
      !secretResourceName ||
      !generatedMaterialResourceName ||
      !hasTerraformResource(resources, "aws_secretsmanager_secret", secretResourceName) ||
      !hasTerraformResource(resources, "random_password", generatedMaterialResourceName)
    ) {
      return false;
    }

    return resources
      .filter((resource) => resource.type === "aws_ecs_task_definition")
      .some((taskDefinition) =>
        hasCompleteEcsRuntimeSecretChain(resources, taskDefinition, secretResourceName)
      );
  });
}

function hasCompleteEcsRuntimeSecretChain(
  resources: readonly TerraformResourceBlock[],
  taskDefinition: TerraformResourceBlock,
  secretResourceName: string
): boolean {
  const executionRoleName = matchTerraformReference(
    taskDefinition.body,
    "execution_role_arn",
    "aws_iam_role",
    "arn"
  );
  if (
    !executionRoleName ||
    !hasTerraformResource(resources, "aws_iam_role", executionRoleName) ||
    !hasTaskSecretMapping(taskDefinition.body, secretResourceName)
  ) {
    return false;
  }

  const hasExactExecutionRolePolicy = resources
    .filter((resource) => resource.type === "aws_iam_role_policy")
    .some((policy) =>
      hasExactSecretReadPolicy(policy.body, executionRoleName, secretResourceName)
    );
  const isTaskUsedByService = resources
    .filter((resource) => resource.type === "aws_ecs_service")
    .some(
      (service) =>
        matchTerraformReference(
          service.body,
          "task_definition",
          "aws_ecs_task_definition",
          "arn"
        ) === taskDefinition.name
    );

  return hasExactExecutionRolePolicy && isTaskUsedByService;
}

function hasTaskSecretMapping(body: string, secretResourceName: string): boolean {
  const normalizedBody = body.replaceAll('\\"', '"');
  const escapedSecretResourceName = escapeRegExpLiteral(secretResourceName);
  return new RegExp(
    String.raw`"name"\s*:\s*"CHECK_IN_SIGNING_SECRET"[^}]{0,500}"valueFrom"\s*:\s*"\$\{aws_secretsmanager_secret\.${escapedSecretResourceName}\.arn\}"`,
    "u"
  ).test(normalizedBody);
}

function hasExactSecretReadPolicy(
  body: string,
  executionRoleName: string,
  secretResourceName: string
): boolean {
  const roleReference = matchTerraformReference(body, "role", "aws_iam_role", "id");
  const policy = parseTerraformJsonStringAttribute(body, "policy");
  if (roleReference !== executionRoleName || !isRecord(policy)) {
    return false;
  }

  const statements = policy["Statement"];
  if (
    !hasExactKeys(policy, ["Statement", "Version"]) ||
    policy["Version"] !== "2012-10-17" ||
    !Array.isArray(statements) ||
    statements.length !== 1 ||
    !isRecord(statements[0])
  ) {
    return false;
  }

  const statement = statements[0];
  return (
    hasExactKeys(statement, ["Action", "Effect", "Resource", "Sid"]) &&
    statement["Sid"] === "ReadCheckInSigningSecret" &&
    statement["Effect"] === "Allow" &&
    Array.isArray(statement["Action"]) &&
    statement["Action"].length === 1 &&
    statement["Action"][0] === "secretsmanager:GetSecretValue" &&
    statement["Resource"] ===
      `\${aws_secretsmanager_secret.${secretResourceName}.arn}`
  );
}

function matchTerraformReference(
  body: string,
  attributeName: string,
  resourceType: string,
  attribute: string
): string | null {
  const pattern = new RegExp(
    String.raw`\b${escapeRegExpLiteral(attributeName)}\s*=\s*${escapeRegExpLiteral(resourceType)}\.([a-zA-Z0-9_-]+)\.${escapeRegExpLiteral(attribute)}\b`,
    "u"
  );
  return pattern.exec(body)?.[1] ?? null;
}

function hasTerraformResource(
  resources: readonly TerraformResourceBlock[],
  resourceType: string,
  resourceName: string
): boolean {
  return resources.some(
    (resource) => resource.type === resourceType && resource.name === resourceName
  );
}

function parseTerraformJsonStringAttribute(body: string, attributeName: string): unknown {
  const pattern = new RegExp(
    String.raw`\b${escapeRegExpLiteral(attributeName)}\s*=\s*"((?:\\.|[^"\\])*)"`,
    "su"
  );
  const encodedValue = pattern.exec(body)?.[1];
  if (!encodedValue) {
    return null;
  }

  try {
    const decodedValue: unknown = JSON.parse(`"${encodedValue}"`);
    return typeof decodedValue === "string" ? JSON.parse(decodedValue) : null;
  } catch {
    return null;
  }
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expectedKeys].sort().join("\0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function assertDraftTerraformDoesNotIncludeAnalysisExcludedResource(
  draft: DeploymentPreparationDraft
): void {
  const terraformFiles =
    draft.terraformFiles?.filter((file) => file.fileName.endsWith(".tf")) ?? [];
  const conflicts = findAnalysisExcludedTerraformConflicts(
    draft.diagramJson,
    listTerraformBlockIdentities({ terraformCode: "", terraformFiles })
  );

  if (conflicts.length === 0) {
    return;
  }

  throw new DeploymentConflictError(createAnalysisExcludedDeploymentMessage(conflicts[0]!));
}

export function createAnalysisExcludedDeploymentMessage(conflict: {
  resourceAddress: string;
}): string {
  return `${conflict.resourceAddress} matches an analysis-excluded resource and cannot be prepared for deployment`;
}

function isEcsFargateDraft(draft: DeploymentPreparationDraft): boolean {
  return getDraftResourceTypes(draft).some((resourceType) =>
    ["ECS_SERVICE", "ECS_TASK_DEFINITION", "aws_ecs_service", "aws_ecs_task_definition"].includes(
      resourceType
    )
  );
}

function getDraftResourceTypes(draft: DeploymentPreparationDraft): string[] {
  return draft.diagramJson.nodes.flatMap((node) => {
    if (node.kind !== "resource") return [];
    const resourceType = node.parameters?.resourceType ?? node.type;
    return resourceType ? [resourceType] : [];
  });
}

export function detectDeploymentScope({
  draft,
  target
}: {
  draft: DeploymentPreparationDraft;
  target: DeploymentPreparationTarget | undefined;
}): DeploymentScope {
  const hasTerraform = Boolean(
    draft.terraformFiles?.some((file) => file.terraformCode.trim().length > 0)
  );
  const hasApplication = Boolean(target?.confirmedBuildConfig);
  if (hasTerraform && hasApplication) return "full_stack";
  if (hasApplication) return "application";
  return "infrastructure";
}

export function createPreparedDraftSnapshotHash(value: {
  revision: number;
  diagramJson: DiagramJson;
  terraformFiles: TerraformSyncFileInput[] | null;
}): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function createPreparedReleaseSnapshotHash(input: {
  candidateId: string;
  commitSha: string;
  compositeDigest: string;
  configFingerprint: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        releaseCandidate: {
          id: input.candidateId,
          commitSha: input.commitSha,
          compositeDigest: input.compositeDigest,
          configFingerprint: input.configFingerprint
        }
      })
    )
    .digest("hex");
}

export function createDeploymentPreparationKey(input: {
  awsConnectionId: string;
  deploymentTargetFingerprint: string | null;
  preparedDraftRevision: number;
  preparedSnapshotHash: string;
  projectId: string;
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
}): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export function getDeploymentConsolePhase(deployment: {
  status: DeploymentStatus;
  currentPlanArtifactId: string | null;
  approvedAt: Date | string | null;
}): DeploymentConsolePhase {
  if (["SUCCESS", "FAILED", "CANCELLED", "DESTROYED"].includes(deployment.status)) {
    return "deployment";
  }
  if (!deployment.currentPlanArtifactId) return "validation";
  if (!deployment.approvedAt) return "approval";
  return "deployment";
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  const toJSON = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof toJSON === "function") {
    return canonicalJson(toJSON.call(value));
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}
