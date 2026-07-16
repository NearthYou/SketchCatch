import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceDisplayedDeploymentProgress,
  getDeploymentProgress,
  resolveDeploymentProgressOperation
} from "./deployment-progress";

type ProgressInput = Parameters<typeof getDeploymentProgress>[0];
type TestDeployment = NonNullable<ProgressInput["deployment"]>;
type TestLog = ProgressInput["logs"][number];

const fixedNowMs = Date.parse("2026-07-17T03:00:00.000Z");

test("progress stays hidden when no Terraform operation is running", () => {
  assert.equal(
    getDeploymentProgress({
      deployment: createDeployment({ status: "SUCCESS" }),
      isStarting: false,
      logs: [],
      nowMs: fixedNowMs,
      operationHint: null
    }),
    null
  );
});

test("a requested Plan starts with a small moving percentage", () => {
  const progress = getDeploymentProgress({
    deployment: createDeployment({ activeStage: null, status: "PENDING" }),
    isStarting: true,
    logs: [],
    nowMs: fixedNowMs,
    operationHint: "plan",
    requestedAtMs: fixedNowMs - 6_000
  });

  assert.equal(progress?.operation, "plan");
  assert.equal(progress?.percent, 7);
  assert.match(progress?.detail ?? "", /실행 요청/);
});

test("displayed progress catches up to a large stage jump one point at a time", () => {
  const samples: number[] = [];
  let displayedPercent = 16;

  for (let index = 0; index < 4; index += 1) {
    displayedPercent = advanceDisplayedDeploymentProgress(displayedPercent, 51);
    samples.push(displayedPercent);
  }

  assert.deepEqual(samples, [17, 18, 19, 20]);
  assert.equal(advanceDisplayedDeploymentProgress(51, 16), 51);
  assert.equal(advanceDisplayedDeploymentProgress(98, 100), 99);
});

test("Plan progress advances with the server stage but never claims completion", () => {
  const initProgress = getDeploymentProgress({
    deployment: createDeployment({ activeStage: "init", status: "RUNNING" }),
    isStarting: false,
    logs: [createLog("init", "Initializing provider plugins...", 25)],
    nowMs: fixedNowMs,
    operationHint: "plan"
  });
  const planProgress = getDeploymentProgress({
    deployment: createDeployment({ activeStage: "plan", status: "RUNNING" }),
    isStarting: false,
    logs: [
      createLog("init", "Terraform has been successfully initialized!", 80),
      createLog("plan", "Refreshing state...", 20)
    ],
    nowMs: fixedNowMs,
    operationHint: "plan"
  });

  assert.ok((initProgress?.percent ?? 0) >= 12);
  assert.ok((planProgress?.percent ?? 0) > (initProgress?.percent ?? 0));
  assert.ok((planProgress?.percent ?? 100) < 100);
});

test("Apply progress uses completed Terraform resources when a Plan summary exists", () => {
  const progress = getDeploymentProgress({
    deployment: createDeployment({
      activeStage: "apply",
      planSummary: {
        blocked: false,
        createCount: 2,
        deleteCount: 1,
        replaceCount: 0,
        updateCount: 1,
        warnings: []
      },
      status: "RUNNING"
    }),
    isStarting: false,
    logs: [
      createLog("apply", "aws_s3_bucket.site: Creation complete after 4s", 8),
      createLog("apply", "aws_cloudfront_distribution.site: Modifications complete after 9s", 3)
    ],
    nowMs: fixedNowMs,
    operationHint: "apply"
  });

  assert.equal(progress?.operation, "apply");
  assert.ok((progress?.percent ?? 0) >= 55);
  assert.match(progress?.detail ?? "", /2\/4개 완료/);
});

test("Terraform completion output waits at 98 percent for the server result", () => {
  const progress = getDeploymentProgress({
    deployment: createDeployment({ activeStage: "destroy", status: "RUNNING" }),
    isStarting: false,
    logs: [createLog("destroy", "Destroy complete! Resources: 2 destroyed.", 1)],
    nowMs: fixedNowMs,
    operationHint: "destroy"
  });

  assert.equal(progress?.percent, 98);
});

test("a reloaded running destroy Plan is inferred from persisted logs", () => {
  assert.equal(
    resolveDeploymentProgressOperation(
      createDeployment({ activeStage: "plan", currentPlanOperation: null, status: "RUNNING" }),
      [createLog("plan", "[duration] terraform plan -destroy completed in 1200ms", 2)],
      null
    ),
    "destroy-plan"
  );
});

function createDeployment(overrides: Partial<TestDeployment> = {}): TestDeployment {
  return {
    activeStage: "plan",
    currentPlanOperation: null,
    id: "deployment-1",
    planSummary: null,
    startedAt: "2026-07-17T02:59:00.000Z",
    status: "RUNNING",
    ...overrides
  };
}

function createLog(stage: TestLog["stage"], message: string, secondsAgo: number): TestLog {
  return {
    createdAt: new Date(fixedNowMs - secondsAgo * 1_000).toISOString(),
    message,
    stage
  };
}
