import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAwsDeploymentObservabilityProvider,
  type AutoScalingObservabilityClient,
  type CloudWatchObservabilityClient,
  type EcsObservabilityClient
} from "./aws-deployment-observability-provider.js";
import type { DeploymentObservabilityTarget } from "./deployment-observability-provider.js";

const nowMs = Date.parse("2026-07-10T09:05:30.000Z");

test("AWS observability adapter uses the newest completed metric point and actual ASG state", async () => {
  const cloudWatchInputs: unknown[] = [];
  const autoScalingGroupNames: string[] = [];
  const cloudWatchClient: CloudWatchObservabilityClient = {
    async getMetricData(input) {
      cloudWatchInputs.push(input);
      return {
        metricDataResults: [
          {
            timestamps: [
              new Date("2026-07-10T09:05:00.000Z"),
              new Date("2026-07-10T09:04:00.000Z")
            ],
            values: [99, 12]
          }
        ]
      };
    }
  };
  const autoScalingClient: AutoScalingObservabilityClient = {
    async describeAutoScalingGroup(asgName) {
      autoScalingGroupNames.push(asgName);
      return {
        autoScalingGroups: [
          {
            autoScalingGroupName: asgName,
            desiredCapacity: 2,
            maxSize: 2,
            instances: [
              {
                healthStatus: "Healthy",
                instanceId: "i-inservice",
                lifecycleState: "InService"
              },
              {
                healthStatus: "Healthy",
                instanceId: "i-launching",
                lifecycleState: "Pending"
              }
            ]
          }
        ]
      };
    },
    async describeScalingActivities(asgName) {
      autoScalingGroupNames.push(asgName);
      return {
        activities: [
          {
            description: "Launching a new EC2 instance",
            endTime: null,
            startTime: new Date("2026-07-10T09:05:10.000Z"),
            statusCode: "InProgress"
          }
        ]
      };
    }
  };
  const provider = createAwsDeploymentObservabilityProvider({
    autoScalingClientFactory: () => autoScalingClient,
    cloudWatchClientFactory: () => cloudWatchClient,
    now: () => nowMs,
    prepareCredentials: async () => ({
      accessKeyId: "temporary-access-key",
      secretAccessKey: "temporary-secret-key",
      sessionToken: "temporary-session-token"
    })
  });

  const result = await provider.observe(createTarget());

  assert.equal(cloudWatchInputs.length, 1);
  assert.deepEqual(autoScalingGroupNames, ["demo-asg", "demo-asg"]);
  assert.deepEqual(result.cloudWatch, {
    delayedBySeconds: 90,
    errorCode: null,
    observedAt: "2026-07-10T09:04:00.000Z",
    periodSeconds: 60,
    requestCountPerTarget: 12,
    state: "delayed"
  });
  assert.deepEqual(result.capacity, {
    currentInstanceCount: 2,
    desiredCapacity: 2,
    errorCode: null,
    inServiceInstanceCount: 1,
    instances: [
      {
        healthStatus: "Healthy",
        instanceId: "i-inservice",
        lifecycleState: "InService"
      },
      {
        healthStatus: "Healthy",
        instanceId: "i-launching",
        lifecycleState: "Pending"
      }
    ],
    latestActivity: {
      description: "Launching a new EC2 instance",
      endedAt: null,
      startedAt: "2026-07-10T09:05:10.000Z",
      statusCode: "InProgress"
    },
    maxCapacity: 2,
    observedAt: "2026-07-10T09:05:30.000Z",
    state: "available"
  });
});

test("AWS observability adapter returns unavailable cards without sample values", async () => {
  const provider = createAwsDeploymentObservabilityProvider({
    autoScalingClientFactory: () => ({
      async describeAutoScalingGroup() {
        return { autoScalingGroups: [] };
      },
      async describeScalingActivities() {
        return { activities: [] };
      }
    }),
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        throw new Error("CloudWatch unavailable");
      }
    }),
    now: () => nowMs,
    prepareCredentials: async () => ({
      accessKeyId: "temporary-access-key",
      secretAccessKey: "temporary-secret-key",
      sessionToken: "temporary-session-token"
    })
  });

  const result = await provider.observe(createTarget());

  assert.deepEqual(result.cloudWatch, {
    delayedBySeconds: null,
    errorCode: "CLOUDWATCH_UNAVAILABLE",
    observedAt: null,
    periodSeconds: 60,
    requestCountPerTarget: null,
    state: "unavailable"
  });
  assert.deepEqual(result.capacity, {
    currentInstanceCount: null,
    desiredCapacity: null,
    errorCode: "ASG_NOT_FOUND",
    inServiceInstanceCount: null,
    instances: [],
    latestActivity: null,
    maxCapacity: null,
    observedAt: null,
    state: "unavailable"
  });
});

test("AWS observability adapter reads ECS Fargate service task capacity", async () => {
  const ecsInputs: Array<{ clusterName: string; serviceName: string }> = [];
  const ecsClient: EcsObservabilityClient = {
    async describeService(clusterName, serviceName) {
      ecsInputs.push({ clusterName, serviceName });
      return {
        service: {
          desiredCount: 2,
          events: [
            {
              createdAt: new Date("2026-07-10T09:05:10.000Z"),
              message: "service reached a steady state"
            }
          ],
          pendingCount: 1,
          runningCount: 1
        }
      };
    }
  };
  const provider = createAwsDeploymentObservabilityProvider({
    autoScalingClientFactory: () => ({
      async describeAutoScalingGroup() { return { autoScalingGroups: [] }; },
      async describeScalingActivities() { return { activities: [] }; }
    }),
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        return {
          metricDataResults: [{
            timestamps: [new Date("2026-07-10T09:04:00.000Z")],
            values: [80]
          }]
        };
      }
    }),
    ecsClientFactory: () => ecsClient,
    now: () => nowMs,
    prepareCredentials: async () => ({
      accessKeyId: "temporary-access-key",
      secretAccessKey: "temporary-secret-key",
      sessionToken: "temporary-session-token"
    })
  });

  const result = await provider.observe(createEcsTarget());

  assert.deepEqual(ecsInputs, [{ clusterName: "demo-cluster", serviceName: "demo-service" }]);
  assert.deepEqual(result.capacity, {
    currentInstanceCount: 2,
    desiredCapacity: 2,
    errorCode: null,
    inServiceInstanceCount: 1,
    instances: [
      { healthStatus: "Healthy", instanceId: "task/demo-service/1", lifecycleState: "RUNNING" },
      { healthStatus: "Pending", instanceId: "task/demo-service/pending-1", lifecycleState: "PROVISIONING" }
    ],
    latestActivity: {
      description: "service reached a steady state",
      endedAt: null,
      startedAt: "2026-07-10T09:05:10.000Z",
      statusCode: "InProgress"
    },
    maxCapacity: 2,
    observedAt: "2026-07-10T09:05:30.000Z",
    state: "available"
  });
});

function createTarget(): DeploymentObservabilityTarget {
  return {
    albArnSuffix: "app/demo/123",
    awsConnectionId: "connection-1",
    capacityTarget: { kind: "asg", asgName: "demo-asg" },
    externalId: "external-id",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo",
    targetGroupArnSuffix: "targetgroup/demo/456"
  };
}

function createEcsTarget(): DeploymentObservabilityTarget {
  return {
    albArnSuffix: "app/demo/123",
    awsConnectionId: "connection-1",
    capacityTarget: {
      clusterName: "demo-cluster",
      kind: "ecs_service",
      maxCapacity: 2,
      serviceName: "demo-service"
    },
    externalId: "external-id",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo",
    targetGroupArnSuffix: "targetgroup/demo/456"
  };
}
