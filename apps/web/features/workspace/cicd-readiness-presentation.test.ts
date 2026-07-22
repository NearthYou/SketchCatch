import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitCicdHandoff,
  GitCicdPipelineRun,
  GitCicdReadinessItem,
  ProjectDeliveryProfile
} from "@sketchcatch/types";

type PresentationModule = typeof import("./cicd-readiness-presentation");

async function loadPresentationModule(): Promise<PresentationModule> {
  const loaded = await import("./cicd-readiness-presentation").catch(() => null);
  assert.ok(loaded, "CI/CD 프레젠테이션 모델이 구현되어야 합니다.");
  return loaded;
}

test("Repository 미연결을 다른 준비 조건보다 먼저 안내한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      sourceRepository: null,
      readinessItems: [
        readinessItem("approved_apply_plan", "action_required", "approve_apply_plan"),
        readinessItem("source_repository", "action_required", "select_repository")
      ]
    }),
    runs: []
  });

  assert.equal(presentation.currentTask.id, "connect_repository");
  assert.equal(presentation.currentPhase, "source");
  assert.equal(presentation.currentTask.title, "GitHub 저장소 연결");
  assert.equal(presentation.currentTask.actionLabel, "저장소 연결하기");
});

test("저장소 이후 변경 감지와 AWS 배포 대상을 순서대로 안내한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const monitoring = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      readinessItems: [
        readinessItem("source_repository", "ready", null),
        readinessItem("monitoring_config", "action_required", "confirm_monitoring_config")
      ]
    }),
    runs: []
  });
  const target = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: null,
      readinessItems: [
        readinessItem("source_repository", "ready", null),
        readinessItem("monitoring_config", "ready", null),
        readinessItem("deployment_target", "action_required", "select_aws_connection", [
          "aws_connection",
          "build_config"
        ])
      ]
    }),
    runs: []
  });

  assert.equal(monitoring.currentTask.id, "configure_monitoring");
  assert.equal(monitoring.currentPhase, "source");
  assert.equal(target.currentTask.id, "configure_target");
  assert.equal(target.currentPhase, "target");
});

test("Runtime과 서비스 주소 자동 확인은 AWS 사용자 설정 작업으로 승격하지 않는다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: deploymentTarget(),
      readinessItems: [
        readinessItem("source_repository", "ready", null),
        readinessItem("monitoring_config", "ready", null),
        readinessItem("deployment_target", "ready", null),
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem(
          "initial_application_release",
          "action_required",
          "deploy_initial_application"
        )
      ]
    }),
    runs: []
  });

  assert.equal(presentation.currentTask.id, "deploy_initial_application");
  assert.equal(presentation.currentPhase, "pr");
});

test("서버가 누락으로 판정한 AWS 설정은 저장 값이 있어도 완료로 표시하지 않는다", async () => {
  const { getCicdReadinessPresentation, getCicdTargetSettingState } =
    await loadPresentationModule();
  const inputProfile = profile({
    monitoringConfig: monitoringConfig(),
    deploymentTarget: deploymentTarget(),
    readinessItems: [
      readinessItem("source_repository", "ready", null),
      readinessItem("monitoring_config", "ready", null),
      readinessItem("deployment_target", "action_required", "select_aws_connection", [
        "aws_connection",
        "build_config"
      ]),
      readinessItem("approved_apply_plan", "action_required", "approve_apply_plan")
    ]
  });

  const presentation = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: inputProfile,
    runs: []
  });
  const settingState = getCicdTargetSettingState(inputProfile);

  assert.equal(presentation.currentPhase, "target");
  assert.equal(settingState.awsConnectionReady, false);
  assert.equal(settingState.regionReady, false);
  assert.equal(settingState.runtimeTargetReady, true);
  assert.equal(settingState.buildConfigReady, false);
});

test("Apply Plan, 최초 앱 배포, PR 생성 순서를 유지한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const base = {
    monitoringConfig: monitoringConfig(),
    deploymentTarget: deploymentTarget()
  };
  const plan = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      ...base,
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "action_required", "approve_apply_plan"),
        readinessItem(
          "initial_application_release",
          "action_required",
          "deploy_initial_application"
        )
      ])
    }),
    runs: []
  });
  const deploy = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      ...base,
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem(
          "initial_application_release",
          "action_required",
          "deploy_initial_application"
        )
      ])
    }),
    runs: []
  });
  const pullRequest = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      ...base,
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem("initial_application_release", "ready", null)
      ])
    }),
    runs: []
  });

  assert.equal(plan.currentTask.id, "approve_apply_plan");
  assert.equal(plan.currentTask.actionLabel, "배포에서 Plan 검토하기");
  assert.equal(deploy.currentTask.id, "deploy_initial_application");
  assert.equal(pullRequest.currentTask.id, "create_pr");
});

test("Repository build verification 상태를 Phase 3 문구로 변환한다", async () => {
  const { getCicdBuildVerificationPresentation } = await loadPresentationModule();
  const base = {
    requestedCommitSha: null,
    resolvedCommitSha: null,
    statusReason: null,
    verifiedAt: null
  } as const;

  assert.deepEqual(
    getCicdBuildVerificationPresentation({ ...base, status: "not_started" }),
    { complete: false, label: "Plan 생성 시 자동 준비" }
  );
  assert.deepEqual(
    getCicdBuildVerificationPresentation({ ...base, status: "preparing" }),
    { complete: false, label: "검증 중" }
  );
  assert.deepEqual(
    getCicdBuildVerificationPresentation({
      ...base,
      status: "verified",
      verifiedAt: "2026-07-22T03:00:00.000Z"
    }),
    { complete: true, label: "검증 완료" }
  );
  assert.deepEqual(
    getCicdBuildVerificationPresentation({
      ...base,
      status: "failed",
      statusReason: "Repository checkout 실패"
    }),
    { complete: false, label: "Repository checkout 실패" }
  );
});

test("배포 결과 URL을 자동 확인 예정, 완료, 누락으로 구분한다", async () => {
  const { getCicdDeploymentOutputPresentation } = await loadPresentationModule();
  const target = {
    ...deploymentTarget(),
    confirmedBuildConfig: { ecsWeb: {} } as NonNullable<
      ProjectDeliveryProfile["deploymentTarget"]
    >["confirmedBuildConfig"]
  };

  const pending = getCicdDeploymentOutputPresentation({
    configurationPreview: null,
    deploymentSucceeded: false,
    target
  });
  assert.equal(pending.staticSite.label, "배포 후 자동 확인");
  assert.equal(pending.apiBase.label, "배포 후 자동 확인");

  const ready = getCicdDeploymentOutputPresentation({
    configurationPreview: {
      rdsEnabled: false,
      staticSiteUrl: "https://app.example.com",
      apiBaseUrl: "https://app.example.com"
    },
    deploymentSucceeded: true,
    target
  });
  assert.equal(ready.staticSite.url, "https://app.example.com");
  assert.equal(ready.apiBase.url, "https://app.example.com");
  assert.equal(ready.staticSite.complete, true);
  assert.equal(ready.apiBase.complete, true);

  const missing = getCicdDeploymentOutputPresentation({
    configurationPreview: {
      rdsEnabled: false,
      staticSiteUrl: null,
      apiBaseUrl: null
    },
    deploymentSucceeded: true,
    target
  });
  assert.equal(missing.staticSite.label, "확인 필요");
  assert.equal(missing.apiBase.label, "확인 필요");
});

test("신규 프로젝트가 대상 저장부터 Plan 검증과 배포 결과를 거쳐 PR 준비로 전환된다", async () => {
  const {
    getCicdBuildVerificationPresentation,
    getCicdDeploymentOutputPresentation,
    getCicdReadinessPresentation
  } = await loadPresentationModule();
  const target = deploymentTarget();
  const savedTargetProfile = profile({
    monitoringConfig: monitoringConfig(),
    deploymentTarget: target,
    readinessItems: readySetupItems([
      readinessItem("approved_apply_plan", "action_required", "approve_apply_plan")
    ])
  });

  const beforePlan = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: savedTargetProfile,
    runs: []
  });
  assert.equal(beforePlan.currentPhase, "pr");
  assert.equal(beforePlan.currentTask.id, "approve_apply_plan");
  assert.deepEqual(
    getCicdBuildVerificationPresentation(savedTargetProfile.buildVerification),
    { complete: false, label: "Plan 생성 시 자동 준비" }
  );

  assert.deepEqual(
    getCicdBuildVerificationPresentation({
      status: "verified",
      requestedCommitSha: "a".repeat(40),
      resolvedCommitSha: "a".repeat(40),
      statusReason: null,
      verifiedAt: "2026-07-22T03:00:00.000Z"
    }),
    { complete: true, label: "검증 완료" }
  );

  const afterDeployment = getCicdDeploymentOutputPresentation({
    configurationPreview: {
      rdsEnabled: false,
      staticSiteUrl: "https://app.example.com",
      apiBaseUrl: "https://app.example.com"
    },
    deploymentSucceeded: true,
    target: {
      ...target,
      confirmedBuildConfig: { ecsWeb: {} } as NonNullable<
        ProjectDeliveryProfile["deploymentTarget"]
      >["confirmedBuildConfig"]
    }
  });
  assert.equal(afterDeployment.staticSite.url, "https://app.example.com");
  assert.equal(afterDeployment.apiBase.url, "https://app.example.com");

  const prReady = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: target,
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem("initial_application_release", "ready", null)
      ])
    }),
    runs: []
  });
  assert.equal(prReady.currentPhase, "pr");
  assert.equal(prReady.currentTask.id, "create_pr");
});

test("최초 앱 배포 항목이 없는 대상은 해당 작업을 건너뛰고 PR 생성을 안내한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: null,
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: deploymentTarget(),
      readinessItems: readySetupItems([readinessItem("approved_apply_plan", "ready", null)])
    }),
    runs: []
  });

  assert.equal(presentation.currentTask.id, "create_pr");
  assert.equal(presentation.currentPhase, "pr");
});

test("PR만 생성되고 외부 설정 검증이 남으면 Phase 3에서 설정 계속하기를 안내한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: setupHandoff({
      status: "pr_created",
      pullRequestUrl: "https://github.com/jh-9999/audience-live-check/pull/10",
      repositorySettingsPreview: {
        environmentName: "sketchcatch-production",
        variables: {},
        secrets: [],
        workflowFiles: [],
        applied: true,
        appliedAt: "2026-07-22T10:00:00.000Z",
        verified: false
      },
      awsRoleDiff: null
    }),
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: deploymentTarget(),
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem("initial_application_release", "ready", null)
      ])
    }),
    runs: []
  });

  assert.equal(presentation.currentTask.id, "create_pr");
  assert.equal(presentation.currentTask.actionLabel, "설정 계속하기");
  assert.equal(presentation.currentPhase, "pr");
  assert.equal(presentation.phases.find((phase) => phase.id === "pr")?.statusLabel, "진행 중");
});

test("PR 생성 이후 Pipeline 실행 상태를 별도 실행 상태로 표시한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: setupHandoff({
      id: "handoff-current",
      status: "pr_created",
      pullRequestUrl: "https://github.com/jh-9999/audience-live-check/pull/10",
      repositorySettingsPreview: {
        environmentName: "sketchcatch-production",
        variables: {},
        secrets: [],
        workflowFiles: [],
        applied: true,
        appliedAt: "2026-07-22T10:00:00.000Z",
        verified: true
      },
      awsRoleDiff: null
    }),
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: deploymentTarget(),
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem("initial_application_release", "ready", null)
      ])
    }),
    runs: [
      {
        id: "run-other",
        handoffId: "handoff-other",
        status: "failed",
        createdAt: "2026-07-21T10:01:00.000Z"
      } as GitCicdPipelineRun,
      {
        id: "run-current",
        handoffId: "handoff-current",
        status: "succeeded",
        createdAt: "2026-07-21T10:00:00.000Z"
      } as GitCicdPipelineRun
    ]
  });

  assert.equal(presentation.currentTask.id, "inspect_pipeline");
  assert.equal(presentation.currentPhase, "pipeline");
  assert.equal(presentation.pipelineRunStatus, "성공");
  assert.equal(presentation.phases.find((phase) => phase.id === "pipeline")?.statusLabel, "성공");
});

test("관련 Run이 아직 없어도 Handoff의 Pipeline 상태를 fallback으로 표시한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: setupHandoff({
      id: "handoff-current",
      status: "pipeline_failed",
      pullRequestUrl: "https://github.com/jh-9999/audience-live-check/pull/10",
      repositorySettingsPreview: {
        environmentName: "sketchcatch-production",
        variables: {},
        secrets: [],
        workflowFiles: [],
        applied: true,
        appliedAt: "2026-07-22T10:00:00.000Z",
        verified: true
      },
      awsRoleDiff: null
    }),
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: deploymentTarget(),
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem("initial_application_release", "ready", null)
      ])
    }),
    runs: []
  });

  assert.equal(presentation.pipelineRunStatus, "실패");
});

test("Pipeline 실패는 Phase 3 완료를 유지하고 설정 재적용 CTA를 제공한다", async () => {
  const { getCicdReadinessPresentation } = await loadPresentationModule();
  const presentation = getCicdReadinessPresentation({
    currentHandoff: setupHandoff({
      id: "handoff-current",
      status: "pipeline_failed",
      pullRequestUrl: "https://github.com/jh-9999/audience-live-check/pull/10",
      repositorySettingsPreview: {
        environmentName: "sketchcatch-production",
        variables: {},
        secrets: [],
        workflowFiles: [],
        applied: true,
        appliedAt: "2026-07-22T10:00:00.000Z",
        verified: true
      },
      awsRoleDiff: null
    }),
    profile: profile({
      monitoringConfig: monitoringConfig(),
      deploymentTarget: deploymentTarget(),
      readinessItems: readySetupItems([
        readinessItem("approved_apply_plan", "ready", null),
        readinessItem("initial_application_release", "ready", null)
      ])
    }),
    runs: []
  });

  assert.equal(presentation.currentTask.id, "retry_setup");
  assert.deepEqual(presentation.currentTask.action, { kind: "retry_setup" });
  assert.equal(presentation.currentTask.actionLabel, "설정 재적용 및 Retry PR 생성");
  assert.equal(presentation.currentPhase, "pipeline");
  assert.equal(presentation.taskStatus, "action_required");
  assert.equal(presentation.phases.find((phase) => phase.id === "pr")?.statusLabel, "완료");
  assert.equal(presentation.phases.find((phase) => phase.id === "pipeline")?.statusLabel, "실패");
});

function profile(input: {
  readonly sourceRepository?: ProjectDeliveryProfile["sourceRepository"];
  readonly monitoringConfig?: ProjectDeliveryProfile["monitoringConfig"];
  readonly deploymentTarget?: ProjectDeliveryProfile["deploymentTarget"];
  readonly readinessItems: GitCicdReadinessItem[];
}): ProjectDeliveryProfile {
  return {
    githubInstallations: [],
    repositoryAnalysisTarget: null,
    sourceRepository:
      input.sourceRepository === undefined
        ? ({
            id: "repository-1",
            owner: "jh-9999",
            name: "audience-live-check",
            defaultBranch: "main"
          } as ProjectDeliveryProfile["sourceRepository"])
        : input.sourceRepository,
    monitoringConfig: input.monitoringConfig ?? null,
    deploymentTarget: input.deploymentTarget ?? null,
    environmentName: null,
    buildVerification: {
      status: "not_started",
      requestedCommitSha: null,
      resolvedCommitSha: null,
      statusReason: null,
      verifiedAt: null
    },
    handoffConfigurationPreview: null,
    readiness: {
      projectId: "project-1",
      checkedAt: "2026-07-21T10:09:00.000Z",
      ready: input.readinessItems.every((item) => item.status === "ready"),
      requiredActionCount: input.readinessItems.filter((item) => item.status !== "ready").length,
      sourceDeploymentId: "deployment-1",
      approvedApplyPlanArtifactId: null,
      initialApplicationReleaseId: null,
      items: input.readinessItems
    }
  };
}

function setupHandoff(overrides: Record<string, unknown>): GitCicdHandoff {
  return {
    id: "handoff-1",
    status: "draft",
    pullRequestUrl: null,
    repositorySettingsPreview: null,
    awsRoleDiff: null,
    ...overrides
  } as unknown as GitCicdHandoff;
}

function readinessItem(
  key: GitCicdReadinessItem["key"],
  status: GitCicdReadinessItem["status"],
  action: GitCicdReadinessItem["action"],
  missingKeys: GitCicdReadinessItem["missingKeys"] = []
): GitCicdReadinessItem {
  return { key, label: key, status, missingKeys, action };
}

function readySetupItems(extra: GitCicdReadinessItem[]): GitCicdReadinessItem[] {
  return [
    readinessItem("source_repository", "ready", null),
    readinessItem("monitoring_config", "ready", null),
    readinessItem("deployment_target", "ready", null),
    ...extra
  ];
}

function monitoringConfig(): NonNullable<ProjectDeliveryProfile["monitoringConfig"]> {
  return {
    sourceRepositoryId: "repository-1",
    enabled: true,
    monitorBranch: "main",
    appPath: { mode: "subdirectory", path: "apps/web" },
    infraPath: { mode: "subdirectory", path: "infra" },
    validationStatus: "valid",
    validationMessage: null,
    validatedAt: "2026-07-21T10:00:00.000Z",
    updatedAt: "2026-07-21T10:00:00.000Z"
  };
}

function deploymentTarget(): NonNullable<ProjectDeliveryProfile["deploymentTarget"]> {
  return {
    projectId: "project-1",
    provider: "aws",
    connectionId: "connection-1",
    region: "ap-northeast-2",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {} as NonNullable<
      ProjectDeliveryProfile["deploymentTarget"]
    >["confirmedBuildConfig"],
    runtimeConfig: null,
    rolloutStrategy: "all_at_once",
    createdAt: "2026-07-21T10:00:00.000Z",
    updatedAt: "2026-07-21T10:00:00.000Z"
  };
}
