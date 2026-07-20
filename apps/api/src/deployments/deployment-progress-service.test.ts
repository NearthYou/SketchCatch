import assert from "node:assert/strict";
import test from "node:test";
import type {
  DeploymentFailureStage,
  DeploymentPlanSummary,
  DeploymentStage,
  DeploymentStatus
} from "@sketchcatch/types";
import { createDeploymentProgressSnapshot } from "./deployment-progress-service.js";

const fixedUpdatedAt = "2026-07-20T10:00:00.000Z";
const fixedStartedAt = "2026-07-20T10:00:00.000Z";
const fixedLogCreatedAt = "2026-07-20T10:00:01.000Z";

test("running apply reports unique completed Terraform resources", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: "apply",
      planSummary: createPlanSummary({
        createCount: 2,
        deleteCount: 1,
        updateCount: 1
      }),
      status: "RUNNING"
    }),
    logs: [
      createLog("apply", "aws_s3_bucket.site: Creation complete after 1s"),
      createLog("apply", "aws_s3_bucket.site: Creation complete after 1s"),
      createLog("apply", "aws_ecs_service.api: Modifications complete after 2s"),
      createLog("plan", "aws_db_instance.main: Creation complete after 3s")
    ]
  });

  assert.deepEqual(progress.measurement, {
    kind: "resource_count",
    completedUnits: 2,
    totalUnits: 4,
    percent: 50
  });
});

test("running destroy counts destruction completion logs", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: "destroy",
      planSummary: createPlanSummary({ deleteCount: 2 }),
      status: "RUNNING"
    }),
    logs: [
      createLog("destroy", "aws_s3_bucket.site: Destruction complete after 1s")
    ]
  });

  assert.deepEqual(progress.measurement, {
    kind: "resource_count",
    completedUnits: 1,
    totalUnits: 2,
    percent: 50
  });
});

test("running progress ignores completion logs from a previous attempt", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: "apply",
      planSummary: createPlanSummary({ createCount: 2 }),
      startedAt: fixedStartedAt,
      status: "RUNNING"
    }),
    logs: [
      createLog(
        "apply",
        "aws_s3_bucket.previous: Creation complete after 1s",
        "2026-07-20T09:59:59.000Z"
      ),
      createLog("apply", "aws_s3_bucket.current: Creation complete after 1s")
    ]
  });

  assert.deepEqual(progress.measurement, {
    kind: "resource_count",
    completedUnits: 1,
    totalUnits: 2,
    percent: 50
  });
});

test("running progress keeps indexed module resource addresses distinct", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: "apply",
      planSummary: createPlanSummary({ createCount: 2 }),
      status: "RUNNING"
    }),
    logs: [
      createLog(
        "apply",
        'module.group[0].aws_instance.web["blue"]: Creation complete after 1s'
      ),
      createLog(
        "apply",
        'module.group[1].aws_instance.web["blue"]: Creation complete after 1s'
      )
    ]
  });

  assert.deepEqual(progress.measurement, {
    kind: "resource_count",
    completedUnits: 2,
    totalUnits: 2,
    percent: 99
  });
});

test("unmeasurable running stages never invent a percentage", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({ activeStage: "plan", status: "RUNNING" }),
    logs: [createLog("plan", "[progress] Terraform plan is still running")]
  });

  assert.deepEqual(progress.measurement, { kind: "indeterminate" });
});

test("running resource progress without an expected total stays indeterminate", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: "apply",
      planSummary: createPlanSummary(),
      status: "RUNNING"
    }),
    logs: [createLog("apply", "aws_s3_bucket.site: Creation complete after 1s")]
  });

  assert.deepEqual(progress.measurement, { kind: "indeterminate" });
});

test("running resource progress is capped below completion", () => {
  const progress = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: "destroy",
      planSummary: createPlanSummary({ deleteCount: 1 }),
      status: "RUNNING"
    }),
    logs: [
      createLog("destroy", "aws_s3_bucket.site: Destruction complete after 1s")
    ]
  });

  assert.deepEqual(progress.measurement, {
    kind: "resource_count",
    completedUnits: 1,
    totalUnits: 1,
    percent: 99
  });
});

test("only successful terminal deployments report completion", () => {
  const success = createDeploymentProgressSnapshot({
    deployment: createDeployment({ activeStage: null, status: "SUCCESS" }),
    logs: []
  });
  const destroyed = createDeploymentProgressSnapshot({
    deployment: createDeployment({ activeStage: null, status: "DESTROYED" }),
    logs: []
  });
  const failed = createDeploymentProgressSnapshot({
    deployment: createDeployment({
      activeStage: null,
      failureStage: "apply",
      status: "FAILED"
    }),
    logs: []
  });

  assert.deepEqual(success.measurement, { kind: "complete", percent: 100 });
  assert.deepEqual(destroyed.measurement, { kind: "complete", percent: 100 });
  assert.deepEqual(failed.measurement, { kind: "indeterminate" });
  assert.equal(failed.failureStage, "apply");
});

function createDeployment(
  overrides: Partial<{
    activeStage: DeploymentStage | null;
    failureStage: DeploymentFailureStage | null;
    planSummary: DeploymentPlanSummary | null;
    startedAt: string | null;
    status: DeploymentStatus;
    updatedAt: string;
  }> = {}
) {
  return {
    id: "deployment-1",
    activeStage: null,
    failureStage: null,
    planSummary: null,
    startedAt: fixedStartedAt,
    status: "PENDING" as DeploymentStatus,
    updatedAt: fixedUpdatedAt,
    ...overrides
  };
}

function createLog(
  stage: DeploymentStage,
  message: string,
  createdAt = fixedLogCreatedAt
) {
  return { stage, message, createdAt };
}

function createPlanSummary(
  overrides: Partial<DeploymentPlanSummary> = {}
): DeploymentPlanSummary {
  return {
    blocked: false,
    createCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    updateCount: 0,
    warnings: [],
    ...overrides
  };
}
