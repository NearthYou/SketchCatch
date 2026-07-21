import type {
  GitCicdHandoff,
  GitCicdHandoffConfigurationPreview,
  GitCicdPipelineRun,
  GitCicdReadinessItem,
  ProjectDeliveryBuildVerification,
  ProjectDeliveryProfile,
  ProjectDeploymentTarget
} from "@sketchcatch/types";

export type CicdPhaseId = "source" | "target" | "pr" | "pipeline";

export type CicdTaskId =
  | "connect_repository"
  | "configure_monitoring"
  | "configure_target"
  | "approve_apply_plan"
  | "deploy_initial_application"
  | "create_pr"
  | "inspect_pipeline";

export type CicdSetupDrawerId = "repository" | "monitoring" | "target";

export type CicdTaskAction =
  | { readonly kind: "drawer"; readonly drawer: CicdSetupDrawerId }
  | {
      readonly kind: "direct_deployment";
      readonly scope: "application" | "full_stack" | null;
    }
  | { readonly kind: "review_pr" }
  | { readonly kind: "section"; readonly sectionId: "cicd-pipeline" };

export type CicdTaskPresentation = {
  readonly id: CicdTaskId;
  readonly phase: CicdPhaseId;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly action: CicdTaskAction;
};

export type CicdPhaseTone = "current" | "complete" | "pending" | "success" | "error";

export type CicdPhasePresentation = {
  readonly id: CicdPhaseId;
  readonly number: "01" | "02" | "03" | "04";
  readonly title: string;
  readonly summary: string;
  readonly statusLabel: string;
  readonly tone: CicdPhaseTone;
};

export type CicdReadinessPresentation = {
  readonly currentPhase: CicdPhaseId;
  readonly currentTask: CicdTaskPresentation;
  readonly phaseStatus: Readonly<Record<CicdPhaseId, string>>;
  readonly taskStatus: "action_required" | "ready";
  readonly pipelineRunStatus: "실행 전" | "실행 대기" | "실행 중" | "성공" | "실패";
  readonly lastRefreshedAt: string;
  readonly phases: readonly CicdPhasePresentation[];
};

export type CicdReadinessPresentationInput = {
  readonly currentHandoff: GitCicdHandoff | null;
  readonly profile: ProjectDeliveryProfile;
  readonly runs: readonly GitCicdPipelineRun[];
};

export type CicdTargetSettingState = {
  readonly awsConnectionReady: boolean;
  readonly regionReady: boolean;
  readonly runtimeTargetReady: boolean;
  readonly buildConfigReady: boolean;
};

export type CicdBuildVerificationPresentation = {
  readonly complete: boolean;
  readonly label: string;
};

export type CicdDeploymentOutputItem = {
  readonly complete: boolean;
  readonly label: string;
  readonly url: string | null;
};

export type CicdDeploymentOutputPresentation = {
  readonly staticSite: CicdDeploymentOutputItem;
  readonly apiBase: CicdDeploymentOutputItem;
};

const phaseDefinitions = [
  {
    id: "source",
    number: "01",
    title: "저장소 및 변경 감지",
    summary: "GitHub 저장소와 변경 감지 기준을 설정합니다."
  },
  {
    id: "target",
    number: "02",
    title: "AWS 배포 대상",
    summary: "AWS 계정, Region과 실행 방식을 설정합니다."
  },
  {
    id: "pr",
    number: "03",
    title: "PR 준비",
    summary: "Apply Plan, 최초 앱 배포와 PR 생성 조건을 확인합니다."
  },
  {
    id: "pipeline",
    number: "04",
    title: "Pipeline",
    summary: "PR 생성 이후 Pipeline 실행 상태를 확인합니다."
  }
] as const;

export function getCicdReadinessPresentation(
  input: CicdReadinessPresentationInput
): CicdReadinessPresentation {
  const readinessByKey = new Map(input.profile.readiness.items.map((item) => [item.key, item]));
  const sourceReady =
    input.profile.sourceRepository !== null &&
    isReadyOrAbsent(readinessByKey.get("source_repository"));
  const monitoringReady =
    input.profile.monitoringConfig !== null &&
    isReadyOrAbsent(readinessByKey.get("monitoring_config"));
  const targetReady = isUserConfiguredTarget(
    input.profile,
    readinessByKey.get("deployment_target")
  );
  const applyPlanItem = readinessByKey.get("approved_apply_plan");
  const applyPlanReady =
    input.profile.readiness.approvedApplyPlanArtifactId !== null ||
    applyPlanItem?.status === "ready";
  const initialReleaseItem = readinessByKey.get("initial_application_release");
  const initialReleaseReady =
    initialReleaseItem === undefined ||
    input.profile.readiness.initialApplicationReleaseId !== null ||
    initialReleaseItem?.status === "ready";
  const handoffReady = isCreatedHandoff(input.currentHandoff);
  const currentTask = selectCurrentTask({
    applyPlanReady,
    handoffReady,
    initialReleaseItem,
    initialReleaseReady,
    monitoringReady,
    sourceReady,
    targetReady
  });
  const pipelineRunStatus = getPipelineRunStatus(input.currentHandoff, input.runs);
  const phaseStatus = {
    source: getSourcePhaseStatus(currentTask.phase, sourceReady && monitoringReady),
    target: getTargetPhaseStatus(currentTask.phase, targetReady),
    pr: getPrPhaseStatus(currentTask.phase, handoffReady),
    pipeline: currentTask.phase === "pipeline" ? pipelineRunStatus : "PR 생성 후 실행"
  } as const;

  return {
    currentPhase: currentTask.phase,
    currentTask,
    phaseStatus,
    taskStatus: currentTask.id === "inspect_pipeline" ? "ready" : "action_required",
    pipelineRunStatus,
    lastRefreshedAt: input.profile.readiness.checkedAt,
    phases: phaseDefinitions.map((phase) => ({
      ...phase,
      statusLabel: phaseStatus[phase.id],
      tone: getPhaseTone(phase.id, currentTask.phase, phaseStatus[phase.id])
    }))
  };
}

export function getCicdTargetSettingState(
  profile: ProjectDeliveryProfile
): CicdTargetSettingState {
  const item = profile.readiness.items.find(({ key }) => key === "deployment_target");
  const missing = new Set(item?.missingKeys ?? []);
  const target = profile.deploymentTarget;
  return {
    awsConnectionReady: Boolean(
      item && target?.connectionId && !missing.has("aws_connection")
    ),
    regionReady: Boolean(item && target?.region && !missing.has("aws_connection")),
    runtimeTargetReady: Boolean(target?.runtimeTargetKind),
    buildConfigReady: Boolean(
      item && target?.confirmedBuildConfig && !missing.has("build_config")
    )
  };
}

export function getCicdBuildVerificationPresentation(
  verification: ProjectDeliveryBuildVerification
): CicdBuildVerificationPresentation {
  switch (verification.status) {
    case "not_started":
      return { complete: false, label: "Plan 생성 시 자동 준비" };
    case "preparing":
      return { complete: false, label: "검증 중" };
    case "verified":
      return { complete: true, label: "검증 완료" };
    case "failed":
      return { complete: false, label: verification.statusReason ?? "검증 실패" };
  }
}

export function getCicdDeploymentOutputPresentation(input: {
  readonly configurationPreview: GitCicdHandoffConfigurationPreview | null;
  readonly deploymentSucceeded: boolean;
  readonly target: ProjectDeploymentTarget | null;
}): CicdDeploymentOutputPresentation {
  const ecsWeb = Boolean(input.target?.confirmedBuildConfig?.ecsWeb);
  const staticSiteApplicable =
    input.target?.runtimeTargetKind === "static_site" ||
    (input.target?.runtimeTargetKind === "ecs_fargate" && ecsWeb);
  const apiBaseApplicable =
    input.target?.runtimeTargetKind === "lambda" ||
    input.target?.runtimeTargetKind === "ec2_asg" ||
    input.target?.runtimeTargetKind === "ecs_fargate";
  return {
    staticSite: toCicdDeploymentOutputItem({
      applicable: staticSiteApplicable,
      deploymentSucceeded: input.deploymentSucceeded,
      url: input.configurationPreview?.staticSiteUrl ?? null
    }),
    apiBase: toCicdDeploymentOutputItem({
      applicable: apiBaseApplicable,
      deploymentSucceeded: input.deploymentSucceeded,
      url: input.configurationPreview?.apiBaseUrl ?? null
    })
  };
}

function toCicdDeploymentOutputItem(input: {
  readonly applicable: boolean;
  readonly deploymentSucceeded: boolean;
  readonly url: string | null;
}): CicdDeploymentOutputItem {
  if (!input.applicable) {
    return { complete: true, label: "생성 대상 아님", url: null };
  }
  if (input.url) {
    return { complete: true, label: input.url, url: input.url };
  }
  return {
    complete: false,
    label: input.deploymentSucceeded ? "확인 필요" : "배포 후 자동 확인",
    url: null
  };
}

function selectCurrentTask(input: {
  readonly applyPlanReady: boolean;
  readonly handoffReady: boolean;
  readonly initialReleaseItem: GitCicdReadinessItem | undefined;
  readonly initialReleaseReady: boolean;
  readonly monitoringReady: boolean;
  readonly sourceReady: boolean;
  readonly targetReady: boolean;
}): CicdTaskPresentation {
  if (!input.sourceReady) {
    return {
      id: "connect_repository",
      phase: "source",
      title: "GitHub 저장소 연결",
      description: "배포에 사용할 GitHub 계정, Repository와 Branch를 선택하세요.",
      actionLabel: "저장소 연결하기",
      action: { kind: "drawer", drawer: "repository" }
    };
  }
  if (!input.monitoringReady) {
    return {
      id: "configure_monitoring",
      phase: "source",
      title: "변경 감지 설정",
      description: "배포를 감지할 Branch와 앱·인프라 경로를 확인하세요.",
      actionLabel: "변경 감지 설정하기",
      action: { kind: "drawer", drawer: "monitoring" }
    };
  }
  if (!input.targetReady) {
    return {
      id: "configure_target",
      phase: "target",
      title: "AWS 배포 대상 설정",
      description: "AWS 계정, Region과 실행 방식을 선택하세요.",
      actionLabel: "배포 대상 설정하기",
      action: { kind: "drawer", drawer: "target" }
    };
  }
  if (!input.applyPlanReady) {
    return {
      id: "approve_apply_plan",
      phase: "pr",
      title: "Apply Plan 승인",
      description: "Terraform 적용 계획을 검토하고 승인하세요.",
      actionLabel: "배포에서 Plan 검토하기",
      action: { kind: "direct_deployment", scope: null }
    };
  }
  if (!input.initialReleaseReady) {
    return {
      id: "deploy_initial_application",
      phase: "pr",
      title: "최초 앱 배포",
      description: "애플리케이션 실행 결과를 생성하고 확인하세요.",
      actionLabel: "최초 앱 배포하기",
      action: {
        kind: "direct_deployment",
        scope: input.initialReleaseItem?.recommendedDeploymentScope ?? "full_stack"
      }
    };
  }
  if (!input.handoffReady) {
    return {
      id: "create_pr",
      phase: "pr",
      title: "배포 PR 생성",
      description: "후속 배포를 위한 Workflow와 Repository 설정을 검토하세요.",
      actionLabel: "PR 생성 검토하기",
      action: { kind: "review_pr" }
    };
  }
  return {
    id: "inspect_pipeline",
    phase: "pipeline",
    title: "Pipeline 확인",
    description: "최근 Pipeline 실행 상태와 로그를 확인하세요.",
    actionLabel: "Pipeline 확인하기",
    action: { kind: "section", sectionId: "cicd-pipeline" }
  };
}

function isReadyOrAbsent(item: GitCicdReadinessItem | undefined): boolean {
  return item === undefined || item.status === "ready";
}

function isUserConfiguredTarget(
  profile: ProjectDeliveryProfile,
  item: GitCicdReadinessItem | undefined
): boolean {
  const target = profile.deploymentTarget;
  if (!target?.connectionId || !target.confirmedBuildConfig) return false;
  return item?.status === "ready";
}

function isCreatedHandoff(handoff: GitCicdHandoff | null): boolean {
  return Boolean(handoff && handoff.status !== "draft" && handoff.status !== "cancelled");
}

function getPipelineRunStatus(
  currentHandoff: GitCicdHandoff | null,
  runs: readonly GitCicdPipelineRun[]
): CicdReadinessPresentation["pipelineRunStatus"] {
  if (!isCreatedHandoff(currentHandoff)) return "실행 전";
  const relatedRuns = currentHandoff?.id
    ? runs.filter((run) => run.handoffId === currentHandoff.id)
    : runs;
  const latestRun = [...relatedRuns].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  )[0];
  if (!latestRun) {
    if (currentHandoff?.status === "pipeline_running") return "실행 중";
    if (currentHandoff?.status === "pipeline_success") return "성공";
    if (currentHandoff?.status === "pipeline_failed") return "실패";
    return "실행 대기";
  }
  if (latestRun.status === "running") return "실행 중";
  if (latestRun.status === "succeeded") return "성공";
  if (latestRun.status === "failed" || latestRun.status === "cancelled") return "실패";
  return "실행 대기";
}

function getSourcePhaseStatus(currentPhase: CicdPhaseId, complete: boolean): string {
  if (complete) return "완료";
  return currentPhase === "source" ? "진행 중" : "시작 전";
}

function getTargetPhaseStatus(currentPhase: CicdPhaseId, complete: boolean): string {
  if (complete) return "완료";
  return currentPhase === "target" ? "진행 중" : "시작 전";
}

function getPrPhaseStatus(currentPhase: CicdPhaseId, complete: boolean): string {
  if (complete) return "완료";
  return currentPhase === "pr" ? "진행 중" : "선행 작업 필요";
}

function getPhaseTone(
  phase: CicdPhaseId,
  currentPhase: CicdPhaseId,
  statusLabel: string
): CicdPhaseTone {
  if (phase === currentPhase) {
    if (statusLabel === "성공") return "success";
    if (statusLabel === "실패") return "error";
    return "current";
  }
  return statusLabel === "완료" ? "complete" : "pending";
}
