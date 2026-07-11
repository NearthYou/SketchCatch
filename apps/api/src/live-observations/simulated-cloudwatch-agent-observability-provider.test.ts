import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSimulatedCloudWatchAgentObservabilityProvider,
  recordSimulatedCloudWatchAgentTraffic,
  resetSimulatedCloudWatchAgentTraffic
} from "./simulated-cloudwatch-agent-observability-provider.js";

test("simulated CloudWatch Agent provider turns traffic into scaling snapshots", async () => {
  const nowMs = Date.parse("2026-07-11T12:00:00.000Z");
  const provider = createSimulatedCloudWatchAgentObservabilityProvider({
    now: () => nowMs
  });

  resetSimulatedCloudWatchAgentTraffic();
  const idle = await provider.observe(createTarget());

  assert.equal(idle.cloudWatch.state, "delayed");
  assert.equal(idle.capacity.desiredCapacity, 1);
  assert.equal(idle.capacity.inServiceInstanceCount, 1);
  assert.equal(idle.capacity.latestActivity, null);

  for (let index = 0; index < 10; index += 1) {
    recordSimulatedCloudWatchAgentTraffic(nowMs - index * 100);
  }

  const scaling = await provider.observe(createTarget());

  assert.equal(scaling.cloudWatch.state, "available");
  assert.equal(scaling.capacity.desiredCapacity, 2);
  assert.equal(scaling.capacity.inServiceInstanceCount, 1);
  assert.equal(scaling.capacity.instances[1]?.lifecycleState, "Pending");
  assert.equal(scaling.capacity.latestActivity?.statusCode, "InProgress");

  for (let index = 10; index < 18; index += 1) {
    recordSimulatedCloudWatchAgentTraffic(nowMs - index * 100);
  }

  const scaled = await provider.observe(createTarget());

  assert.equal(scaled.capacity.desiredCapacity, 2);
  assert.equal(scaled.capacity.inServiceInstanceCount, 2);
  assert.equal(scaled.capacity.instances[1]?.lifecycleState, "InService");
  assert.equal(scaled.capacity.latestActivity?.statusCode, "Successful");
});

function createTarget() {
  return {
    albArnSuffix: "app/demo/123",
    asgName: "demo-asg",
    awsConnectionId: "connection-id",
    externalId: "external-id",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/Demo",
    targetGroupArnSuffix: "targetgroup/demo/456"
  };
}
