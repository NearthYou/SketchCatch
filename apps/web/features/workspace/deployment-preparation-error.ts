import { getApiErrorMessage } from "../../lib/api-client";
import type {
  DeploymentScope,
  DiagramJson,
  ProjectDeploymentTarget
} from "@sketchcatch/types";

export type DeploymentPreparationStage =
  | "terraform_prepare"
  | "project_draft_save"
  | "architecture_snapshot"
  | "asset_upload_request"
  | "asset_upload"
  | "asset_upload_confirm";

const STAGE_MESSAGES: Record<DeploymentPreparationStage, string> = {
  terraform_prepare:
    "Terraform 산출물 준비 단계에서 실패했습니다. Terraform 오류를 확인한 뒤 다시 시도해 주세요.",
  project_draft_save:
    "프로젝트 저장 단계에서 실패했습니다. 보드 변경사항을 다시 저장한 뒤 배포 준비를 실행해 주세요.",
  architecture_snapshot:
    "아키텍처 스냅샷 저장 단계에서 실패했습니다. 프로젝트 저장 상태와 서버 연결을 확인해 주세요.",
  asset_upload_request:
    "Terraform 파일 업로드 준비 단계에서 실패했습니다. 프로젝트 저장소 설정과 서버 연결을 확인해 주세요.",
  asset_upload:
    "Terraform 파일 업로드 단계에서 실패했습니다. 업로드 권한과 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
  asset_upload_confirm:
    "Terraform 파일 업로드 확인 단계에서 실패했습니다. 업로드된 파일 상태를 확인한 뒤 다시 시도해 주세요."
};

export class DeploymentPreparationError extends Error {
  readonly cause: unknown;
  readonly stage: DeploymentPreparationStage;

  constructor({
    cause,
    stage
  }: {
    readonly cause: unknown;
    readonly stage: DeploymentPreparationStage;
  }) {
    super(STAGE_MESSAGES[stage]);
    this.name = "DeploymentPreparationError";
    this.cause = cause;
    this.stage = stage;
  }
}

export type DeploymentTargetPrerequisite = Readonly<{
  action?: "repository_analysis" | undefined;
  message: string;
  title: string;
}>;

export function getDeploymentTargetPrerequisite({
  awsConnectionId,
  diagramJson,
  scope,
  target
}: {
  readonly awsConnectionId: string;
  readonly diagramJson: DiagramJson;
  readonly scope: DeploymentScope | "auto";
  readonly target: Readonly<
    Pick<ProjectDeploymentTarget, "connectionId" | "confirmedBuildConfig">
  > | null;
}): DeploymentTargetPrerequisite | null {
  const requiresApplicationTarget =
    scope === "application" ||
    scope === "full_stack" ||
    (scope === "auto" && hasEcsApplicationResource(diagramJson));

  if (!requiresApplicationTarget) {
    return null;
  }

  if (!target?.confirmedBuildConfig) {
    return scope === "application"
      ? {
          message:
            "애플리케이션 배포 전에 Source Repository와 프로젝트 배포 타깃을 연결하고 빌드 설정을 저장해 주세요.",
          title: "애플리케이션 배포 선행 설정 필요"
        }
      : {
          message:
            "전체 스택 배포 전에 Source Repository와 프로젝트 배포 타깃을 연결하고 ECS 빌드 설정을 저장해 주세요.",
          title: "전체 스택 선행 설정 필요"
        };
  }

  if (target.connectionId !== awsConnectionId) {
    return {
      message:
        "프로젝트 배포 타깃이 다른 AWS 연결을 사용하고 있습니다. 현재 AWS 연결로 배포 타깃을 다시 저장해 주세요.",
      title: "AWS 연결과 배포 타깃 불일치"
    };
  }

  return null;
}

export function getDeploymentRuntimeSecretPrerequisite({
  diagramJson,
  scope,
  target
}: {
  readonly diagramJson: DiagramJson;
  readonly scope: DeploymentScope | "auto";
  readonly target: Readonly<
    Pick<ProjectDeploymentTarget, "connectionId" | "confirmedBuildConfig">
  > | null;
}): DeploymentTargetPrerequisite | null {
  if (!target?.confirmedBuildConfig) {
    return null;
  }

  const requiredRuntimeSecrets =
    target.confirmedBuildConfig.ecsWeb?.api.requiredRuntimeSecrets ?? [];
  const requiresFullStackRuntimeSecretContract =
    scope === "full_stack" || (scope === "auto" && hasEcsApplicationResource(diagramJson));
  if (
    requiresFullStackRuntimeSecretContract &&
    requiredRuntimeSecrets.includes("CHECK_IN_SIGNING_SECRET") &&
    !hasCheckInSigningSecretDiagramContract(diagramJson)
  ) {
    return {
      action: "repository_analysis",
      message:
        "Repository가 요구하는 CHECK_IN_SIGNING_SECRET이 현재 Terraform 초안에 없습니다. Repository를 다시 분석하고 Fixed Template Board를 다시 생성·저장한 뒤 검증을 실행해 주세요.",
      title: "Repository와 Terraform 시크릿 연결 불일치"
    };
  }

  return null;
}

export function getDeploymentPreparationErrorMessage(
  error: unknown,
  fallbackMessage: string
): string {
  return error instanceof DeploymentPreparationError
    ? getApiErrorMessage(error.cause, error.message)
    : getApiErrorMessage(error, fallbackMessage);
}

function hasEcsApplicationResource(diagramJson: DiagramJson): boolean {
  return diagramJson.nodes.some((node) => {
    if (node.kind !== "resource") return false;
    const resourceType = node.parameters?.resourceType ?? node.type;
    return [
      "ECS_SERVICE",
      "ECS_TASK_DEFINITION",
      "aws_ecs_service",
      "aws_ecs_task_definition"
    ].includes(resourceType);
  });
}

function hasCheckInSigningSecretDiagramContract(diagramJson: DiagramJson): boolean {
  const resources = diagramJson.nodes.filter(isTerraformResourceNode);
  const secretVersions = resources.filter(
    (node) => node.parameters.resourceType === "aws_secretsmanager_secret_version"
  );

  return secretVersions.some((secretVersion) => {
    const secretResourceName = matchTerraformReference(
      secretVersion.parameters.values.secretId,
      "aws_secretsmanager_secret",
      "id"
    );
    const generatedMaterialResourceName = matchTerraformReference(
      secretVersion.parameters.values.secretString,
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
      .filter((node) => node.parameters.resourceType === "aws_ecs_task_definition")
      .some((taskDefinition) =>
        hasCompleteEcsRuntimeSecretChain(resources, taskDefinition, secretResourceName)
      );
  });
}

type TerraformResourceNode = DiagramJson["nodes"][number] & {
  readonly kind: "resource";
  readonly parameters: NonNullable<DiagramJson["nodes"][number]["parameters"]>;
};

function isTerraformResourceNode(
  node: DiagramJson["nodes"][number]
): node is TerraformResourceNode {
  return node.kind === "resource" && node.parameters !== undefined;
}

function hasCompleteEcsRuntimeSecretChain(
  resources: readonly TerraformResourceNode[],
  taskDefinition: TerraformResourceNode,
  secretResourceName: string
): boolean {
  const executionRoleName = matchTerraformReference(
    taskDefinition.parameters.values.executionRoleArn,
    "aws_iam_role",
    "arn"
  );
  if (
    !executionRoleName ||
    !hasTerraformResource(resources, "aws_iam_role", executionRoleName) ||
    !hasTaskSecretMapping(taskDefinition, secretResourceName)
  ) {
    return false;
  }

  const hasExactExecutionRolePolicy = resources
    .filter((node) => node.parameters.resourceType === "aws_iam_role_policy")
    .some((policy) =>
      hasExactSecretReadPolicy(policy, executionRoleName, secretResourceName)
    );
  const isTaskUsedByService = resources
    .filter((node) => node.parameters.resourceType === "aws_ecs_service")
    .some(
      (service) =>
        matchTerraformReference(
          service.parameters.values.taskDefinition,
          "aws_ecs_task_definition",
          "arn"
        ) === taskDefinition.parameters.resourceName
    );

  return hasExactExecutionRolePolicy && isTaskUsedByService;
}

function hasTaskSecretMapping(
  taskDefinition: TerraformResourceNode,
  secretResourceName: string
): boolean {
  const containerDefinitions = taskDefinition.parameters.values.containerDefinitions;
  if (typeof containerDefinitions !== "string") {
    return false;
  }

  try {
    const definitions: unknown = JSON.parse(containerDefinitions);
    return (
      Array.isArray(definitions) &&
      definitions.some(
        (definition) =>
          isRecord(definition) &&
          Array.isArray(definition["secrets"]) &&
          definition["secrets"].some(
            (secret) =>
              isRecord(secret) &&
              secret["name"] === "CHECK_IN_SIGNING_SECRET" &&
              secret["valueFrom"] ===
                `\${aws_secretsmanager_secret.${secretResourceName}.arn}`
          )
      )
    );
  } catch {
    return false;
  }
}

function hasExactSecretReadPolicy(
  policyNode: TerraformResourceNode,
  executionRoleName: string,
  secretResourceName: string
): boolean {
  const roleReference = matchTerraformReference(
    policyNode.parameters.values.role,
    "aws_iam_role",
    "id"
  );
  const policy = parseJsonRecord(policyNode.parameters.values.policy);
  if (roleReference !== executionRoleName || !policy) {
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

function hasTerraformResource(
  resources: readonly TerraformResourceNode[],
  resourceType: string,
  resourceName: string
): boolean {
  return resources.some(
    (node) =>
      node.parameters.resourceType === resourceType &&
      node.parameters.resourceName === resourceName
  );
}

function matchTerraformReference(
  value: unknown,
  resourceType: string,
  attribute: string
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const prefix = `${resourceType}.`;
  const suffix = `.${attribute}`;
  if (!value.startsWith(prefix) || !value.endsWith(suffix)) {
    return null;
  }

  const resourceName = value.slice(prefix.length, -suffix.length);
  return /^[a-z_][a-z0-9_]*$/u.test(resourceName) ? resourceName : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
