import type {
  CreateGitCicdHandoffRequest,
  Deployment,
  GitCicdMonitoringConfig,
  ProjectDeploymentTarget,
  SourceRepository
} from "@sketchcatch/types";

export type GitCicdDeploymentTargetBlocker =
  | "target_confirmation_required"
  | "output_url_required"
  | null;

type GitCicdSourceDeployment = Pick<
  Deployment,
  | "id"
  | "architectureId"
  | "terraformArtifactId"
  | "source"
  | "currentPlanOperation"
  | "approvedAt"
  | "approvedByUserId"
  | "approvedTerraformArtifactId"
  | "approvedPlanArtifactId"
  | "createdAt"
>;

export function selectGitCicdSourceDeployment(
  deployments: readonly GitCicdSourceDeployment[]
): GitCicdSourceDeployment | null {
  return (
    [...deployments]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .find(
        (deployment) =>
          deployment.source === "direct" &&
          deployment.currentPlanOperation === "apply" &&
          deployment.approvedAt !== null &&
          deployment.approvedByUserId !== null &&
          deployment.approvedTerraformArtifactId === deployment.terraformArtifactId &&
          deployment.approvedPlanArtifactId !== null
      ) ?? null
  );
}

export function getGitCicdDeploymentTargetBlocker(
  target: ProjectDeploymentTarget | null
): GitCicdDeploymentTargetBlocker {
  if (!target?.confirmedBuildConfig) {
    return "target_confirmation_required";
  }

  if (
    target.runtimeTargetKind === "ecs_fargate" &&
    !target.runtimeConfig?.outputUrl?.trim()
  ) {
    return "output_url_required";
  }

  if (
    !target.runtimeConfig ||
    target.runtimeConfig.runtimeTargetKind !== target.runtimeTargetKind
  ) {
    return "target_confirmation_required";
  }

  return null;
}

export function buildGitCicdHandoffRequest({
  deployment,
  monitoringConfig,
  repository
}: {
  readonly deployment: GitCicdSourceDeployment;
  readonly monitoringConfig: GitCicdMonitoringConfig;
  readonly repository: SourceRepository;
}): CreateGitCicdHandoffRequest {
  if (!deployment.approvedPlanArtifactId) {
    throw new Error("CI/CD PR 생성에는 승인된 Terraform apply plan이 필요합니다.");
  }

  return {
    architectureId: deployment.architectureId,
    terraformArtifactId: deployment.terraformArtifactId,
    handoffKind: "terraform_iac",
    deploymentMode: "infra_and_app",
    sourceDeploymentId: deployment.id,
    sourceRepositoryId: repository.id,
    targetBranch: monitoringConfig.monitorBranch,
    environmentName: "sketchcatch-production",
    pullRequestTitle: "Deploy: SketchCatch 인프라와 앱 배포 연결",
    commitMessage: "chore: SketchCatch CI/CD 배포 구성",
    userAcceptedChangeId: deployment.approvedPlanArtifactId
  };
}
