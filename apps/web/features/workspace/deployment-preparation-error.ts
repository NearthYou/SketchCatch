import { getApiErrorMessage } from "../../lib/api-client";
import type { DeploymentScope, DiagramJson } from "@sketchcatch/types";

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
  readonly target: Readonly<{
    connectionId: string | null;
    confirmedBuildConfig: unknown | null;
  }> | null;
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
