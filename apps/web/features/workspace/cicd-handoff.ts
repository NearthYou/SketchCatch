import type {
  CreateGitCicdHandoffRequest,
  Deployment,
  GitCicdReadinessAction,
  GitCicdDeploymentTargetReadinessKey,
  GitCicdReadinessItemKey,
  GitCicdReadinessSnapshot,
  GitCicdMonitoringConfig,
  SourceRepository
} from "@sketchcatch/types";

export type GitCicdReadinessNavigation = {
  readonly actionLabel: string;
  readonly href: string | null;
  readonly readinessKey: GitCicdReadinessItemKey;
  readonly directDeploymentScope: "application" | "full_stack" | null;
};

export function createGitCicdReadinessNavigation(input: {
  readonly projectId: string;
  readonly projectName?: string | null | undefined;
  readonly readinessAction: GitCicdReadinessAction;
  readonly recommendedDeploymentScope?: "application" | "full_stack" | undefined;
}): GitCicdReadinessNavigation {
  const action = readinessNavigationByAction[input.readinessAction];
  if (action.destination === "direct_deployment") {
    return {
      actionLabel: action.actionLabel,
      href: null,
      readinessKey: action.readinessKey,
      directDeploymentScope:
        input.readinessAction === "deploy_initial_application"
          ? input.recommendedDeploymentScope ?? "full_stack"
          : null
    };
  }

  const returnSearch = new URLSearchParams({
    projectId: input.projectId,
    deploymentView: "cicd",
    readinessKey: action.readinessKey
  });
  const projectName = input.projectName?.trim();
  if (projectName) returnSearch.set("projectName", projectName);

  const destinationSearch = new URLSearchParams({
    returnTo: `/workspace?${returnSearch.toString()}`,
    readinessKey: action.readinessKey
  });
  const projectPath = encodeURIComponent(input.projectId);
  const pathname = action.destination === "repository"
    ? `/dashboard/projects/${projectPath}/repository`
    : `/dashboard/projects/${projectPath}/settings`;

  return {
    actionLabel: action.actionLabel,
    href: `${pathname}?${destinationSearch.toString()}${action.hash}`,
    readinessKey: action.readinessKey,
    directDeploymentScope: null
  };
}

const readinessNavigationByAction: Record<
  GitCicdReadinessAction,
  {
    readonly actionLabel: string;
    readonly destination: "direct_deployment" | "repository" | "settings";
    readonly hash: string;
    readonly readinessKey: GitCicdReadinessItemKey;
  }
> = {
  approve_apply_plan: {
    actionLabel: "Apply Plan 승인하기",
    destination: "direct_deployment",
    hash: "",
    readinessKey: "approved_apply_plan"
  },
  deploy_initial_application: {
    actionLabel: "최초 앱 배포하기",
    destination: "direct_deployment",
    hash: "",
    readinessKey: "initial_application_release"
  },
  select_repository: {
    actionLabel: "Repository 선택하기",
    destination: "repository",
    hash: "",
    readinessKey: "source_repository"
  },
  confirm_monitoring_config: {
    actionLabel: "Branch와 경로 확인하기",
    destination: "settings",
    hash: "#project-cicd-settings-title",
    readinessKey: "monitoring_config"
  },
  select_aws_connection: {
    actionLabel: "AWS 연결 선택하기",
    destination: "settings",
    hash: "#deployment-target-title",
    readinessKey: "deployment_target"
  },
  confirm_build_config: {
    actionLabel: "빌드 설정 확인하기",
    destination: "settings",
    hash: "#deployment-target-title",
    readinessKey: "deployment_target"
  },
  inspect_runtime_outputs: {
    actionLabel: "배포 결과 확인하기",
    destination: "settings",
    hash: "#deployment-target-title",
    readinessKey: "deployment_target"
  },
  inspect_output_url: {
    actionLabel: "배포 URL 확인하기",
    destination: "settings",
    hash: "#deployment-target-title",
    readinessKey: "deployment_target"
  }
};

export type GitCicdHandoffReadinessItem = {
  readonly key: GitCicdReadinessItemKey;
  readonly label: string;
  readonly description: string;
  readonly ready: boolean;
  readonly status: "ready" | "action_required";
  readonly action: GitCicdReadinessAction | null;
  readonly actionLabel: string | null;
  readonly href: string | null;
  readonly directDeploymentScope: "application" | "full_stack" | null;
  readonly statusLabel: string;
  readonly missingKeys: readonly GitCicdDeploymentTargetReadinessKey[];
  readonly details?: readonly GitCicdDeploymentTargetDetail[] | undefined;
};

export type GitCicdDeploymentTargetDetail = {
  readonly key: GitCicdDeploymentTargetReadinessKey;
  readonly label: string;
  readonly ready: boolean;
};

export type GitCicdReloadCoordinator = {
  readonly activeGeneration: number;
  readonly inFlight: boolean;
};

export type GitCicdReloadStart = {
  readonly coordinator: GitCicdReloadCoordinator;
  readonly generation: number | null;
};

export function createGitCicdReloadCoordinator(): GitCicdReloadCoordinator {
  return { activeGeneration: 0, inFlight: false };
}

export function beginGitCicdReload(
  coordinator: GitCicdReloadCoordinator
): GitCicdReloadStart {
  if (coordinator.inFlight) return { coordinator, generation: null };
  const generation = coordinator.activeGeneration + 1;
  return {
    coordinator: { activeGeneration: generation, inFlight: true },
    generation
  };
}

export function isGitCicdReloadOwner(
  coordinator: GitCicdReloadCoordinator,
  generation: number
): boolean {
  return coordinator.inFlight && coordinator.activeGeneration === generation;
}

export function completeGitCicdReload(
  coordinator: GitCicdReloadCoordinator,
  generation: number
): GitCicdReloadCoordinator {
  return isGitCicdReloadOwner(coordinator, generation)
    ? { ...coordinator, inFlight: false }
    : coordinator;
}

export function invalidateGitCicdReload(
  coordinator: GitCicdReloadCoordinator
): GitCicdReloadCoordinator {
  return { activeGeneration: coordinator.activeGeneration + 1, inFlight: false };
}

type GitCicdSourceDeployment = Pick<
  Deployment,
  "id" | "architectureId" | "terraformArtifactId" | "source"
>;

export function selectGitCicdSourceDeployment(
  deployments: readonly GitCicdSourceDeployment[],
  sourceDeploymentId: string | null
): GitCicdSourceDeployment | null {
  if (!sourceDeploymentId) return null;
  return (
    deployments.find(
      (deployment) =>
        deployment.id === sourceDeploymentId && deployment.source === "direct"
    ) ?? null
  );
}

export function getGitCicdHandoffReadiness(input: {
  readonly projectId: string;
  readonly projectName?: string | null | undefined;
  readonly readiness: GitCicdReadinessSnapshot;
}): readonly GitCicdHandoffReadinessItem[] {
  return input.readiness.items.map((item) => {
    const navigation = item.action
      ? createGitCicdReadinessNavigation({
          projectId: input.projectId,
          projectName: input.projectName,
          readinessAction: item.action,
          ...(item.recommendedDeploymentScope
            ? { recommendedDeploymentScope: item.recommendedDeploymentScope }
            : {})
        })
      : null;
    const completedCount = item.completedCount ?? 0;
    const totalCount = item.totalCount ?? 0;

    return {
      key: item.key,
      label: item.label,
      description: readinessDescriptionByKey[item.key],
      ready: item.status === "ready",
      status: item.status,
      action: item.action,
      actionLabel: navigation?.actionLabel ?? null,
      href: navigation?.href ?? null,
      directDeploymentScope: navigation?.directDeploymentScope ?? null,
      statusLabel:
        item.key === "deployment_target" && totalCount > 0
          ? `${completedCount}/${totalCount} 완료`
          : item.status === "ready"
            ? "완료"
            : "설정 필요",
      missingKeys: item.missingKeys,
      details:
        item.key === "deployment_target"
          ? deploymentTargetDetailKeys.map((key) => ({
              key,
              label: deploymentTargetDetailLabels[key],
              ready: !item.missingKeys.includes(key)
            }))
          : undefined
    };
  });
}

const readinessDescriptionByKey: Record<GitCicdReadinessItemKey, string> = {
  approved_apply_plan: "Direct Deployment에서 승인한 Terraform Apply Plan을 사용합니다.",
  initial_application_release:
    "인프라는 준비됐지만 실제 애플리케이션 릴리즈 증거가 없습니다.",
  source_repository: "이 프로젝트에 사용할 활성 GitHub Repository를 연결합니다.",
  monitoring_config: "배포를 감지할 branch와 애플리케이션·인프라 경로를 확인합니다.",
  deployment_target: "검증된 AWS 연결과 빌드·Runtime·HTTPS 배포 결과를 확인합니다."
};

const deploymentTargetDetailKeys: readonly GitCicdDeploymentTargetReadinessKey[] = [
  "aws_connection",
  "build_config",
  "runtime_config",
  "output_url"
];

const deploymentTargetDetailLabels: Record<GitCicdDeploymentTargetReadinessKey, string> = {
  aws_connection: "AWS 연결",
  build_config: "Repository 빌드 근거",
  runtime_config: "Runtime 좌표",
  output_url: "HTTPS Output URL"
};

export function isGitCicdHandoffReady(
  input: {
    readonly readiness: GitCicdReadinessSnapshot | null;
    readonly isRefreshing: boolean;
    readonly hasError: boolean;
  }
): boolean {
  return Boolean(input.readiness?.ready && !input.isRefreshing && !input.hasError);
}

export function isGitCicdHandoffCreationEnabled(input: {
  readonly hasApprovedApplyPlanArtifact: boolean;
  readonly hasExistingHandoff: boolean;
  readonly hasMonitoringConfig: boolean;
  readonly hasRepository: boolean;
  readonly hasSourceDeployment: boolean;
  readonly isBusy: boolean;
  readonly isConsoleDataFresh: boolean;
  readonly isReadinessReady: boolean;
}): boolean {
  return (
    input.isReadinessReady &&
    input.isConsoleDataFresh &&
    input.hasRepository &&
    input.hasMonitoringConfig &&
    input.hasSourceDeployment &&
    input.hasApprovedApplyPlanArtifact &&
    !input.hasExistingHandoff &&
    !input.isBusy
  );
}

export function buildGitCicdHandoffRequest({
  approvedApplyPlanArtifactId,
  deployment,
  monitoringConfig,
  repository
}: {
  readonly approvedApplyPlanArtifactId: string | null;
  readonly deployment: GitCicdSourceDeployment;
  readonly monitoringConfig: GitCicdMonitoringConfig;
  readonly repository: SourceRepository;
}): CreateGitCicdHandoffRequest {
  if (!approvedApplyPlanArtifactId) {
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
    userAcceptedChangeId: approvedApplyPlanArtifactId
  };
}
