import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyEcsReleaseHealthSnapshot,
  type EcsReleaseHealthSnapshot
} from "./ecs-release-health-verifier.js";

const newRevision = "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:2";

test("new revision succeeds only when its own task IP is healthy in the Target Group", () => {
  const result = verifyEcsReleaseHealthSnapshot(createSnapshot(), newRevision);
  assert.deepEqual(result.taskArns, ["arn:task/new"]);
  assert.deepEqual(result.healthyTargetIds, ["10.0.1.10"]);
});

test("healthy targets from the previous revision cannot satisfy new revision health", () => {
  const snapshot = createSnapshot({
    targets: [{ id: "10.0.1.9", port: 3000, state: "healthy", reason: null }]
  });
  assert.throws(
    () => verifyEcsReleaseHealthSnapshot(snapshot, newRevision),
    /New ECS task is not a healthy Target Group target/u
  );
});

test("running old tasks cannot replace a missing new revision task", () => {
  const snapshot = createSnapshot({
    tasks: [
      {
        taskArn: "arn:task/old",
        taskDefinitionArn:
          "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:1",
        lastStatus: "RUNNING",
        healthStatus: "HEALTHY",
        privateIpv4Addresses: ["10.0.1.9"]
      }
    ],
    targets: [{ id: "10.0.1.9", port: 3000, state: "healthy", reason: null }]
  });
  assert.throws(
    () => verifyEcsReleaseHealthSnapshot(snapshot, newRevision),
    /new ECS revision does not have enough/u
  );
});

function createSnapshot(
  overrides: Partial<EcsReleaseHealthSnapshot> = {}
): EcsReleaseHealthSnapshot {
  return {
    serviceTaskDefinitionArn: newRevision,
    desiredCount: 1,
    runningCount: 1,
    pendingCount: 0,
    rolloutState: "COMPLETED",
    tasks: [
      {
        taskArn: "arn:task/new",
        taskDefinitionArn: newRevision,
        lastStatus: "RUNNING",
        healthStatus: "HEALTHY",
        privateIpv4Addresses: ["10.0.1.10"]
      }
    ],
    targets: [{ id: "10.0.1.10", port: 3000, state: "healthy", reason: null }],
    ...overrides
  };
}
