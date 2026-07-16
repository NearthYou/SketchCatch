import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDeploymentHistoryEntries,
  getDeploymentStatusPresentation,
  getLatestCompletedDeploymentStep,
  getRecentDeploymentResultTitle,
  resolveDeploymentHistorySelection
} from "./deployment-presentation";

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
