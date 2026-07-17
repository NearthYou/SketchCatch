import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Deployment,
  GitCicdReadinessSnapshot,
  GitCicdMonitoringConfig,
  SourceRepository
} from "@sketchcatch/types";
import {
  beginGitCicdReload,
  buildGitCicdHandoffRequest,
  completeGitCicdReload,
  createGitCicdReloadCoordinator,
  createGitCicdReadinessNavigation,
  getGitCicdHandoffReadiness,
  isGitCicdHandoffCreationEnabled,
  isGitCicdHandoffReady,
  invalidateGitCicdReload,
  selectGitCicdSourceDeployment
} from "./cicd-handoff";

test("builds a safe settings round trip for a missing build configuration", () => {
  const action = createGitCicdReadinessNavigation({
    projectId: "project-1",
    projectName: "demo 2",
    readinessAction: "confirm_build_config"
  });
  const url = new URL(action.href ?? "", "https://sketchcatch.local");

  assert.equal(action.readinessKey, "deployment_target");
  assert.equal(url.pathname, "/dashboard/projects/project-1/settings");
  assert.equal(url.searchParams.get("readinessKey"), "deployment_target");
  assert.match(url.searchParams.get("returnTo") ?? "", /^\/workspace\?/u);
});

test("maps one server readiness snapshot to five rows and deployment target progress", () => {
  const readiness = createReadinessSnapshot({
    requiredActionCount: 1,
    items: [
      readinessItem("approved_apply_plan"),
      readinessItem("initial_application_release"),
      readinessItem("source_repository"),
      readinessItem("monitoring_config"),
      readinessItem("deployment_target", {
        status: "action_required",
        completedCount: 3,
        totalCount: 4,
        missingKeys: ["build_config"],
        action: "confirm_build_config"
      })
    ]
  });

  const items = getGitCicdHandoffReadiness({
    projectId: "project-1",
    projectName: "demo 2",
    readiness
  });
  const target = items.find((item) => item.key === "deployment_target");

  assert.equal(items.length, 5);
  assert.equal(target?.statusLabel, "3/4 완료");
  assert.deepEqual(target?.missingKeys, ["build_config"]);
  assert.equal(target?.actionLabel, "빌드 설정 확인하기");
  assert.equal(target?.details?.filter((detail) => !detail.ready).length, 1);
  assert.deepEqual(items.map((item) => item.key), [
    "approved_apply_plan",
    "initial_application_release",
    "source_repository",
    "monitoring_config",
    "deployment_target"
  ]);
  assert.ok(items.slice(0, 4).every((item) => item.action === null));
});

test("provides one concrete CTA for every server readiness action", () => {
  const expected = {
    approve_apply_plan: "Apply Plan 승인하기",
    deploy_initial_application: "최초 앱 배포하기",
    select_repository: "Repository 선택하기",
    confirm_monitoring_config: "Branch와 경로 확인하기",
    select_aws_connection: "AWS 연결 선택하기",
    confirm_build_config: "빌드 설정 확인하기",
    inspect_runtime_outputs: "배포 결과 확인하기",
    inspect_output_url: "배포 URL 확인하기"
  } as const;

  for (const [readinessAction, actionLabel] of Object.entries(expected)) {
    const navigation = createGitCicdReadinessNavigation({
      projectId: "project-1",
      readinessAction: readinessAction as keyof typeof expected
    });

    assert.equal(navigation.actionLabel, actionLabel);
    if (
      readinessAction === "approve_apply_plan" ||
      readinessAction === "deploy_initial_application"
    ) {
      assert.equal(navigation.href, null);
    } else {
      assert.match(navigation.href ?? "", /returnTo=/u);
      assert.match(navigation.href ?? "", /readinessKey=/u);
    }
  }
});

test("uses the server-recommended scope for initial application deployment", () => {
  const readiness = createReadinessSnapshot({
    items: [
      readinessItem("initial_application_release", {
        status: "action_required",
        action: "deploy_initial_application",
        recommendedDeploymentScope: "application"
      })
    ]
  });

  const [item] = getGitCicdHandoffReadiness({ projectId: "project-1", readiness });

  assert.equal(item?.actionLabel, "최초 앱 배포하기");
  assert.equal(item?.directDeploymentScope, "application");
  assert.match(item?.description ?? "", /실제 애플리케이션 릴리즈 증거/u);
});

test("does not expose the previous ambiguous readiness wording", () => {
  const readiness = createReadinessSnapshot({
    items: [
      readinessItem("approved_apply_plan", {
        status: "action_required",
        action: "approve_apply_plan"
      })
    ]
  });
  const renderedText = JSON.stringify(
    getGitCicdHandoffReadiness({ projectId: "project-1", readiness })
  );

  for (const forbidden of ["확인 필요", "배포 타깃 열기", "설정 완료 후 다시 확인"]) {
    assert.doesNotMatch(renderedText, new RegExp(forbidden, "u"));
  }
});

test("disables handoff review while readiness is refreshing or failed", () => {
  const readiness = createReadinessSnapshot({ ready: true, requiredActionCount: 0 });

  assert.equal(
    isGitCicdHandoffReady({ readiness, isRefreshing: true, hasError: false }),
    false
  );
  assert.equal(
    isGitCicdHandoffReady({ readiness, isRefreshing: false, hasError: true }),
    false
  );
  assert.equal(
    isGitCicdHandoffReady({ readiness, isRefreshing: false, hasError: false }),
    true
  );
});

test("keeps PR creation disabled when readiness succeeds but console data is stale", () => {
  const available = {
    hasApprovedApplyPlanArtifact: true,
    hasExistingHandoff: false,
    hasMonitoringConfig: true,
    hasRepository: true,
    hasSourceDeployment: true,
    isBusy: false,
    isConsoleDataFresh: true,
    isReadinessReady: true
  } as const;

  assert.equal(isGitCicdHandoffCreationEnabled(available), true);
  for (const unavailable of [
    { isReadinessReady: false },
    { isConsoleDataFresh: false },
    { hasApprovedApplyPlanArtifact: false },
    { hasSourceDeployment: false },
    { hasRepository: false },
    { hasMonitoringConfig: false },
    { hasExistingHandoff: true },
    { isBusy: true }
  ]) {
    assert.equal(
      isGitCicdHandoffCreationEnabled({ ...available, ...unavailable }),
      false
    );
  }
});

test("serializes automatic and manual reloads and discards late completions", () => {
  let coordinator = createGitCicdReloadCoordinator();
  const automatic = beginGitCicdReload(coordinator);
  coordinator = automatic.coordinator;

  const manualWhileAutomaticRuns = beginGitCicdReload(coordinator);
  assert.equal(manualWhileAutomaticRuns.generation, null);

  coordinator = completeGitCicdReload(coordinator, automatic.generation!);
  const manual = beginGitCicdReload(coordinator);
  coordinator = manual.coordinator;

  const automaticWhileManualRuns = beginGitCicdReload(coordinator);
  assert.equal(automaticWhileManualRuns.generation, null);

  coordinator = invalidateGitCicdReload(coordinator);
  const afterLateManualCompletion = completeGitCicdReload(
    coordinator,
    manual.generation!
  );
  assert.deepEqual(afterLateManualCompletion, coordinator);
  assert.equal(afterLateManualCompletion.inFlight, false);
});

function deployment(
  overrides: Partial<Deployment> & Pick<Deployment, "id" | "createdAt">
): Deployment {
  const { createdAt, id, ...remainingOverrides } = overrides;

  return {
    id,
    projectId: "project-1",
    architectureId: "architecture-1",
    terraformArtifactId: "terraform-1",
    awsConnectionId: "connection-1",
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    awsConnectionNameSnapshot: "123456789012",
    liveProfile: "practice",
    scope: "full_stack",
    targetKind: "ecs_fargate",
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
    currentPlanArtifactId: "plan-1",
    currentPlanOperation: "apply",
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: "2026-07-15T00:00:00.000Z",
    approvedByUserId: "user-1",
    approvedTerraformArtifactId: "terraform-1",
    approvedPlanArtifactId: "approved-plan-1",
    approvedTerraformArtifactHash: "terraform-hash",
    approvedTfplanHash: "plan-hash",
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt,
    updatedAt: createdAt,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    ...remainingOverrides
  };
}

function createReadinessSnapshot(
  overrides: Partial<GitCicdReadinessSnapshot> = {}
): GitCicdReadinessSnapshot {
  return {
    projectId: "project-1",
    checkedAt: "2026-07-17T00:00:00.000Z",
    ready: false,
    requiredActionCount: 1,
    sourceDeploymentId: "deployment-1",
    approvedApplyPlanArtifactId: "apply-plan-1",
    initialApplicationReleaseId: null,
    items: [],
    ...overrides
  };
}

function readinessItem(
  key: GitCicdReadinessSnapshot["items"][number]["key"],
  overrides: Partial<GitCicdReadinessSnapshot["items"][number]> = {}
): GitCicdReadinessSnapshot["items"][number] {
  return {
    key,
    label: key,
    status: "ready",
    missingKeys: [],
    action: null,
    ...overrides
  };
}

test("selects the source deployment recorded by the readiness snapshot", () => {
  const selected = selectGitCicdSourceDeployment([
    deployment({ id: "server-selected", createdAt: "2026-07-13T00:00:00.000Z" }),
    deployment({ id: "newer-apply-plan", createdAt: "2026-07-15T00:00:00.000Z" })
  ], "server-selected");

  assert.equal(selected?.id, "server-selected");
});

test("uses the server-recorded approved plan artifact as the user acceptance id", () => {
  const sourceDeployment = deployment({
    id: "deployment-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    approvedPlanArtifactId: "approved-plan-artifact"
  });
  const repository = {
    id: "repository-1",
    owner: "whiskend",
    name: "audience-live-check"
  } as SourceRepository;
  const monitoringConfig = {
    monitorBranch: "main"
  } as GitCicdMonitoringConfig;

  const request = buildGitCicdHandoffRequest({
    approvedApplyPlanArtifactId: "approved-plan-artifact",
    deployment: sourceDeployment,
    monitoringConfig,
    repository
  });

  assert.equal(request.userAcceptedChangeId, "approved-plan-artifact");
  assert.equal(request.sourceDeploymentId, "deployment-1");
  assert.equal(request.sourceRepositoryId, "repository-1");
  assert.equal(request.targetBranch, "main");
  assert.equal(request.deploymentMode, "infra_and_app");
});

test("uses the readiness-selected Apply artifact instead of the deployment current approval", () => {
  const sourceDeployment = deployment({
    id: "deployment-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    currentPlanOperation: "destroy",
    approvedPlanArtifactId: "current-destroy-plan"
  });

  const request = buildGitCicdHandoffRequest({
    deployment: sourceDeployment,
    approvedApplyPlanArtifactId: "readiness-apply-plan",
    monitoringConfig: { monitorBranch: "main" } as GitCicdMonitoringConfig,
    repository: { id: "repository-1" } as SourceRepository
  });

  assert.equal(request.userAcceptedChangeId, "readiness-apply-plan");
});
