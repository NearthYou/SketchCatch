import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterDeploymentHistoryEntries,
  getDeploymentHistoryEntries,
  getDeploymentFailureDeveloperCheck,
  getDeploymentHistoryMetrics,
  getDeploymentStatusPresentation,
  getLatestCompletedDeploymentStep,
  getRecentDeploymentResultTitle,
  resolveDeploymentHistorySelection
} from "./deployment-presentation";

test("Deployment History filters unchanged versions and aggregates only measured durations", () => {
  const entries = getDeploymentHistoryEntries([
    {
      id: "deployment-changed",
      createdAt: "2026-07-18T10:00:00.000Z",
      status: "SUCCESS" as const,
      startedAt: "2026-07-18T10:00:00.000Z",
      completedAt: "2026-07-18T10:02:00.000Z",
      failedAt: null,
      cancelledAt: null,
      updatedAt: "2026-07-18T10:02:00.000Z",
      planSummary: {
        createCount: 2,
        updateCount: 0,
        deleteCount: 1,
        replaceCount: 0,
        blocked: false,
        warnings: []
      }
    },
    {
      id: "deployment-unchanged",
      createdAt: "2026-07-18T09:00:00.000Z",
      status: "DESTROYED" as const,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      updatedAt: "2026-07-18T09:00:00.000Z",
      planSummary: {
        createCount: 0,
        updateCount: 0,
        deleteCount: 0,
        replaceCount: 0,
        blocked: false,
        warnings: []
      }
    }
  ]);

  assert.deepEqual(
    filterDeploymentHistoryEntries(entries, "unchanged").map(({ deployment }) => deployment.id),
    ["deployment-unchanged"]
  );
  assert.equal(filterDeploymentHistoryEntries(entries, "complete").length, 2);
  assert.deepEqual(getDeploymentHistoryMetrics(entries), {
    averageDurationMs: 120_000,
    completedCount: 2,
    totalChangeCount: 3,
    totalCount: 2
  });
});

test("Deployment History does not infer unchanged state when a Plan summary is unavailable", () => {
  const entries = getDeploymentHistoryEntries([
    {
      id: "deployment-without-plan-summary",
      createdAt: "2026-07-18T11:00:00.000Z",
      status: "SUCCESS" as const,
      planSummary: null
    }
  ]);

  assert.deepEqual(filterDeploymentHistoryEntries(entries, "unchanged"), []);
});

test("infrastructure deployments appear as versioned Deployment History entries", () => {
  const entries = getDeploymentHistoryEntries([
    {
      id: "deployment-2",
      createdAt: "2026-07-16T02:00:00.000Z",
      status: "SUCCESS"
    },
    {
      id: "deployment-failed",
      createdAt: "2026-07-16T01:30:00.000Z",
      status: "FAILED"
    },
    {
      id: "deployment-1",
      createdAt: "2026-07-16T01:00:00.000Z",
      status: "SUCCESS"
    }
  ]);

  assert.deepEqual(
    entries.map((entry) => ({
      deploymentId: entry.deployment.id,
      versionLabel: entry.versionLabel
    })),
    [
      { deploymentId: "deployment-2", versionLabel: "v20260716-020000-000-yment2" },
      { deploymentId: "deployment-1", versionLabel: "v20260716-010000-000-yment1" }
    ]
  );
});

test("Deployment History defaults to the latest successful version and ignores failures", () => {
  const selection = resolveDeploymentHistorySelection({
    currentSelectionId: "",
    deployments: [
      {
        id: "deployment-failed",
        createdAt: "2026-07-16T03:00:00.000Z",
        status: "FAILED"
      },
      {
        id: "deployment-success-2",
        createdAt: "2026-07-16T02:00:00.000Z",
        status: "SUCCESS"
      },
      {
        id: "deployment-success-1",
        createdAt: "2026-07-16T01:00:00.000Z",
        status: "DESTROYED"
      }
    ],
    previousLatestDeploymentId: ""
  });

  assert.deepEqual(selection, {
    latestDeploymentId: "deployment-success-2",
    selectedDeploymentId: "deployment-success-2"
  });
});

test("Deployment History selects a newly successful deployment but preserves manual browsing", () => {
  const deployments = [
    {
      id: "deployment-success-3",
      createdAt: "2026-07-16T03:00:00.000Z",
      status: "SUCCESS" as const
    },
    {
      id: "deployment-success-2",
      createdAt: "2026-07-16T02:00:00.000Z",
      status: "SUCCESS" as const
    },
    {
      id: "deployment-success-1",
      createdAt: "2026-07-16T01:00:00.000Z",
      status: "DESTROYED" as const
    }
  ];

  assert.deepEqual(
    resolveDeploymentHistorySelection({
      currentSelectionId: "deployment-success-1",
      deployments,
      previousLatestDeploymentId: "deployment-success-2"
    }),
    {
      latestDeploymentId: "deployment-success-3",
      selectedDeploymentId: "deployment-success-3"
    }
  );
  assert.deepEqual(
    resolveDeploymentHistorySelection({
      currentSelectionId: "deployment-success-1",
      deployments,
      previousLatestDeploymentId: "deployment-success-3"
    }),
    {
      latestDeploymentId: "deployment-success-3",
      selectedDeploymentId: "deployment-success-1"
    }
  );
});

test("Deployment History clears its selection when the active filter has no visible version", () => {
  const selection = resolveDeploymentHistorySelection({
    currentSelectionId: "deployment-success",
    deployments: [
      {
        id: "deployment-success",
        createdAt: "2026-07-16T02:00:00.000Z",
        status: "SUCCESS" as const
      }
    ],
    previousLatestDeploymentId: "deployment-success",
    visibleDeploymentIds: []
  });

  assert.equal(selection.selectedDeploymentId, "");
});

test("Deployment History preserves a visible selection when a new version is excluded by the filter", () => {
  const selection = resolveDeploymentHistorySelection({
    currentSelectionId: "deployment-unchanged",
    deployments: [
      {
        id: "deployment-changed",
        createdAt: "2026-07-16T03:00:00.000Z",
        status: "SUCCESS" as const
      },
      {
        id: "deployment-unchanged",
        createdAt: "2026-07-16T02:00:00.000Z",
        status: "SUCCESS" as const
      }
    ],
    previousLatestDeploymentId: "deployment-unchanged",
    visibleDeploymentIds: ["deployment-unchanged"]
  });

  assert.equal(selection.selectedDeploymentId, "deployment-unchanged");
});

test("Deployment History versions remain unique for deployments created in the same millisecond", () => {
  const entries = getDeploymentHistoryEntries([
    { id: "deployment-aaaaaa", createdAt: "2026-07-16T02:00:00.000Z", status: "SUCCESS" },
    { id: "deployment-bbbbbb", createdAt: "2026-07-16T02:00:00.000Z", status: "SUCCESS" }
  ]);

  assert.deepEqual(
    entries.map((entry) => entry.versionLabel),
    ["v20260716-020000-000-bbbbbb", "v20260716-020000-000-aaaaaa"]
  );
});

test("deployment statuses use Korean labels and semantic tones", () => {
  assert.deepEqual(getDeploymentStatusPresentation("FAILED"), {
    label: "실패",
    tone: "error"
  });
  assert.deepEqual(getDeploymentStatusPresentation("RUNNING"), {
    label: "실행 중",
    tone: "running"
  });
  assert.deepEqual(getDeploymentStatusPresentation("SUCCESS"), {
    label: "성공",
    tone: "success"
  });
  assert.equal(getDeploymentStatusPresentation("PENDING").label, "대기 중");
  assert.equal(getDeploymentStatusPresentation("CANCELLED").label, "취소됨");
  assert.equal(getDeploymentStatusPresentation("DESTROYED").label, "정리 완료");
  assert.deepEqual(getDeploymentStatusPresentation("PARTIALLY_FAILED"), {
    label: "부분 실패",
    tone: "error"
  });
  assert.deepEqual(getDeploymentStatusPresentation("PARTIALLY_CANCELED"), {
    label: "부분 취소",
    tone: "neutral"
  });
});

test("development deployment failures name the concrete evidence developers must inspect", () => {
  assert.match(
    getDeploymentFailureDeveloperCheck("application_release", "development") ?? "",
    /CodeBuild 로그.*ECR image digest.*ECS task health.*S3·CloudFront/u
  );
  assert.match(
    getDeploymentFailureDeveloperCheck("plan", "development") ?? "",
    /Terraform plan stderr.*state refresh/u
  );
  assert.equal(getDeploymentFailureDeveloperCheck("plan", "production"), null);
});

test("deployment target identity failures do not point developers to CodeBuild logs", () => {
  const check = getDeploymentFailureDeveloperCheck(
    "apply",
    "development",
    "Application runtime release failed: Prepared release deployment target fingerprint no longer matches the confirmed target"
  );

  assert.match(check ?? "", /runtimeConfig.*runtimeTarget.*deploymentTargetFingerprint/u);
  assert.doesNotMatch(check ?? "", /CodeBuild/u);
});

test("output reconciliation failures do not point developers to Terraform apply stderr", () => {
  const check = getDeploymentFailureDeveloperCheck(
    "apply",
    "development",
    "Application output reconciliation failed: ECS web runtime coordinates conflict with the Terraform outputs"
  );

  assert.match(check ?? "", /ecrRepositoryName.*containerPort.*Terraform state/u);
  assert.doesNotMatch(check ?? "", /taskDefinitionArn revision/u);
  assert.doesNotMatch(check ?? "", /apply stderr|tfplan hash|AWS 권한/u);
});

test("a failed unapproved run is presented as a validation result", () => {
  assert.equal(
    getRecentDeploymentResultTitle({ approvedAt: null, status: "FAILED" }),
    "최근 검증 결과"
  );
  assert.equal(
    getRecentDeploymentResultTitle({
      approvedAt: "2026-07-15T00:00:00.000Z",
      status: "FAILED"
    }),
    "최근 배포 결과"
  );
});

test("an absent run uses a neutral recent result title", () => {
  assert.equal(getRecentDeploymentResultTitle(null), "최근 실행 결과");
  assert.equal(
    getRecentDeploymentResultTitle({ approvedAt: null, status: "PENDING" }),
    "최근 실행 결과"
  );
});

test("the recent result names the most recently completed Deployment step", () => {
  assert.equal(
    getLatestCompletedDeploymentStep({
      approvedAt: null,
      currentPlanArtifactId: "plan-1",
      currentPlanOperation: "apply",
      status: "PENDING"
    }),
    "Plan 생성"
  );
  assert.equal(
    getLatestCompletedDeploymentStep({
      approvedAt: "2026-07-16T00:00:00.000Z",
      currentPlanArtifactId: "plan-1",
      currentPlanOperation: "apply",
      status: "PENDING"
    }),
    "Plan 승인"
  );
  assert.equal(
    getLatestCompletedDeploymentStep({
      approvedAt: "2026-07-16T00:00:00.000Z",
      currentPlanArtifactId: "plan-1",
      currentPlanOperation: "apply",
      status: "SUCCESS"
    }),
    "배포 실행"
  );
});
