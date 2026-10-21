import assert from "node:assert/strict";
import test from "node:test";
import type {
  DeploymentFailureStage,
  DeploymentScope,
  DeploymentProgressSnapshot,
  DeploymentStage,
  DeploymentStatus
} from "@sketchcatch/types";
import {
  getDeploymentProgressPresentation,
  resolveDeploymentProgressOperation
} from "./deployment-progress";

test("progress stays hidden when no operation or server snapshot is active", () => {
  assert.equal(
    getDeploymentProgressPresentation({
      deployment: createDeployment({ status: "SUCCESS" }),
      isStarting: false,
      operationHint: null,
      snapshot: null
    }),
    null
  );
});

test("a requested Plan shows an explicitly approximate starting percentage", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: null, status: "PENDING" }),
    isStarting: true,
    operationHint: "plan",
    snapshot: null
  });

  assert.equal(progress?.operation, "plan");
  assert.equal(progress?.mode, "estimated");
  assert.equal(progress?.percent, 5);
  assert.equal(progress?.valueLabel, "약 5%");
  assert.match(progress?.detail ?? "", /실행 요청/);
});

test("server resource progress is displayed without catch-up delay", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "apply", status: "RUNNING" }),
    isStarting: false,
    operationHint: "apply",
    snapshot: createProgressSnapshot({
      activeStage: "apply",
      measurement: {
        kind: "resource_count",
        completedUnits: 2,
        totalUnits: 4,
        percent: 50
      },
      status: "RUNNING"
    })
  });

  assert.equal(progress?.mode, "determinate");
  assert.equal(progress?.percent, 50);
  assert.equal(progress?.valueLabel, "50%");
});

test("fallback Plan progress shows a stage-based approximate percentage", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "plan", status: "RUNNING" }),
    isStarting: false,
    operationHint: "plan",
    snapshot: null
  });

  assert.equal(progress?.mode, "estimated");
  assert.equal(progress?.percent, 75);
  assert.equal(progress?.valueLabel, "약 75%");
  assert.match(progress?.detail ?? "", /리소스를 계산/);
});

test("application-only Plan progress describes the app release instead of Terraform resources", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({
      activeStage: "plan",
      scope: "application",
      status: "RUNNING"
    }),
    isStarting: false,
    operationHint: "plan",
    snapshot: null
  });

  assert.equal(progress?.title, "앱 배포 준비 중");
  assert.equal(progress?.detail, "앱 빌드와 릴리스에 필요한 변경사항을 확인하고 있습니다.");
  assert.doesNotMatch(`${progress?.title} ${progress?.detail}`, /Terraform|리소스/);
});

test("application-only execution uses app release wording instead of Terraform Apply", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ scope: "application", status: "PENDING" }),
    isStarting: true,
    operationHint: "apply",
    snapshot: null
  });

  assert.equal(progress?.title, "앱 배포 중");
  assert.equal(progress?.detail, "검증된 앱 Artifact를 빌드하고 릴리스하고 있습니다.");
  assert.doesNotMatch(`${progress?.title} ${progress?.detail}`, /Terraform/);
});

test("preflight progress describes safety checks instead of cloud apply", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "preflight", status: "RUNNING" }),
    isStarting: false,
    operationHint: "plan",
    snapshot: null
  });

  assert.equal(progress?.title, "배포 전 안전 검사 중");
  assert.equal(progress?.mode, "estimated");
  assert.equal(progress?.percent, 30);
  assert.match(progress?.detail ?? "", /Repository 실행 조건/);
  assert.doesNotMatch(progress?.detail ?? "", /클라우드에 적용/);
});

test("application release progress does not regress to a Plan title", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "application_release", status: "RUNNING" }),
    isStarting: false,
    operationHint: null,
    snapshot: createProgressSnapshot({
      activeStage: "application_release",
      status: "RUNNING"
    })
  });

  assert.equal(progress?.title, "애플리케이션 릴리즈 중");
  assert.equal(progress?.mode, "estimated");
  assert.equal(progress?.percent, 99);
  assert.equal(progress?.valueLabel, "약 99%");
  assert.match(progress?.detail ?? "", /Artifact/);
});

test("rollback progress explains recovery instead of a new Apply", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "rollback", status: "RUNNING" }),
    isStarting: false,
    operationHint: null,
    snapshot: createProgressSnapshot({ activeStage: "rollback", status: "RUNNING" })
  });

  assert.equal(progress?.title, "배포 롤백 중");
  assert.match(progress?.detail ?? "", /이전 상태로 되돌리고/);
});

test("successful server snapshot renders exact completion", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: null, status: "RUNNING" }),
    isStarting: false,
    operationHint: "apply",
    snapshot: createProgressSnapshot({
      activeStage: null,
      measurement: { kind: "complete", percent: 100 },
      status: "SUCCESS"
    })
  });

  assert.equal(progress?.mode, "complete");
  assert.equal(progress?.percent, 100);
  assert.equal(progress?.title, "배포 완료");
  assert.equal(progress?.valueLabel, "100% 완료");
});

test("failed server snapshot never reports completion", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "apply", status: "RUNNING" }),
    isStarting: false,
    operationHint: "apply",
    snapshot: createProgressSnapshot({
      activeStage: null,
      failureStage: "apply",
      status: "FAILED"
    })
  });

  assert.equal(progress?.mode, "status");
  assert.equal(progress?.percent, null);
  assert.equal(progress?.title, "배포 실패");
  assert.equal(progress?.valueLabel, "실패");
});

test("a snapshot for another deployment cannot replace the current fallback", () => {
  const progress = getDeploymentProgressPresentation({
    deployment: createDeployment({ activeStage: "plan", id: "deployment-2", status: "RUNNING" }),
    isStarting: false,
    operationHint: "plan",
    snapshot: createProgressSnapshot({
      deploymentId: "deployment-1",
      measurement: { kind: "complete", percent: 100 },
      status: "SUCCESS"
    })
  });

  assert.equal(progress?.mode, "estimated");
  assert.equal(progress?.percent, 75);
  assert.equal(progress?.title, "Terraform Plan 생성 중");
});

test("a reloaded running destroy Plan is inferred from the persisted operation", () => {
  assert.equal(
    resolveDeploymentProgressOperation(
      createDeployment({
        activeStage: "plan",
        currentPlanOperation: "destroy",
        status: "RUNNING"
      }),
      null
    ),
    "destroy-plan"
  );
});

function createDeployment(
  overrides: Partial<{
    scope: DeploymentScope;
    activeStage: DeploymentStage | null;
    currentPlanOperation: "apply" | "destroy" | null;
    failureStage: DeploymentFailureStage | null;
    id: string;
    status: DeploymentStatus;
  }> = {}
) {
  return {
    scope: "full_stack" as DeploymentScope,
    activeStage: null,
    currentPlanOperation: null,
    failureStage: null,
    id: "deployment-1",
    status: "PENDING" as DeploymentStatus,
    ...overrides
  };
}

function createProgressSnapshot(
  overrides: Partial<DeploymentProgressSnapshot> = {}
): DeploymentProgressSnapshot {
  return {
    activeStage: null,
    deploymentId: "deployment-1",
    failureStage: null,
    measurement: { kind: "indeterminate" },
    status: "PENDING",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...overrides
  };
}
