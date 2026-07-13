import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestV2
} from "@sketchcatch/types";
import type { DeploymentLiveObservationManifestRepository } from "./live-observation-manifest-repository.js";
import {
  createDeploymentLiveObservationManifest,
  materializeDeploymentLiveObservationManifest
} from "./live-observation-manifest-materializer.js";

const DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const CONNECTION_ID = "abcdef12-3456-4789-8abc-def012345678";

test("materializer persists a verified ASG manifest without credential evidence", async () => {
  const repository = new FakeManifestRepository();

  const record = await materializeDeploymentLiveObservationManifest(
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment(),
      connection: createConnection(),
      outputs: createOutputs({ asg_name: "customer-platform-asg" })
    },
    repository
  );

  assert.equal(record.status, "valid");
  assert.equal(repository.valid?.adapter.version, 2);
  assert.deepEqual(repository.valid?.adapter.payload, {
    loadBalancerArn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer-platform/50dc6c495c0c9188",
    targetGroupArn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/customer-api/6d0ecf831eec9f09",
    capacityTarget: {
      kind: "asg",
      autoScalingGroupName: "customer-platform-asg"
    }
  });
  assert.equal(JSON.stringify(repository.valid).includes("roleArn"), false);
  assert.equal(JSON.stringify(repository.valid).includes("externalId"), false);
});

test("materializer persists a verified ECS Fargate manifest from ARN suffix outputs", async () => {
  const repository = new FakeManifestRepository();
  const outputs = createOutputs({
    load_balancer_arn: undefined,
    target_group_arn: undefined,
    alb_arn_suffix: "app/customer-platform/50dc6c495c0c9188",
    target_group_arn_suffix: "targetgroup/customer-api/6d0ecf831eec9f09",
    ecs_cluster_name: "customer-platform",
    ecs_service_name: "api",
    max_capacity: 4
  });

  assert.doesNotThrow(() =>
    createDeploymentLiveObservationManifest({
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment(),
      connection: createConnection(),
      outputs
    })
  );

  const record = await materializeDeploymentLiveObservationManifest(
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment(),
      connection: createConnection(),
      outputs
    },
    repository
  );

  assert.equal(record.status, "valid");
  assert.deepEqual(
    repository.valid?.adapter.version === 2
      ? repository.valid.adapter.payload.capacityTarget
      : null,
    {
      kind: "ecs_fargate",
      clusterName: "customer-platform",
      serviceName: "api",
      maxCapacity: 4
    }
  );
});

test("materializer fails closed and stores a generic invalid row for unverified evidence", async () => {
  for (const input of [
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment({ status: "FAILED" }),
      connection: createConnection(),
      outputs: createOutputs({ asg_name: "customer-platform-asg" })
    },
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment(),
      connection: createConnection({ status: "pending" }),
      outputs: createOutputs({ asg_name: "customer-platform-asg" })
    },
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment({ approvedTerraformArtifactHash: null }),
      connection: createConnection(),
      outputs: createOutputs({ asg_name: "customer-platform-asg" })
    },
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: createDeployment(),
      connection: createConnection(),
      outputs: createOutputs({ traffic_url: "http://api.example.com/traffic" })
    }
  ]) {
    const repository = new FakeManifestRepository();
    const record = await materializeDeploymentLiveObservationManifest(input, repository);

    assert.equal(record.status, "manifest_invalid");
    assert.equal(repository.valid, null);
    assert.deepEqual(repository.invalid, {
      deploymentId: DEPLOYMENT_ID,
      reason: "manifest materialization failed"
    });
  }
});

function createDeployment(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPLOYMENT_ID,
    status: "SUCCESS" as const,
    awsConnectionId: CONNECTION_ID,
    approvedTerraformArtifactHash: "0123456789abcdef".repeat(4),
    approvedAwsRegion: "ap-northeast-2",
    ...overrides
  };
}

function createConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    accountId: "123456789012",
    region: "ap-northeast-2",
    status: "verified" as const,
    lastVerifiedAt: "2026-07-11T00:00:00.000Z",
    ...overrides
  };
}

function createOutputs(overrides: Record<string, unknown> = {}) {
  return {
    static_site_url: "https://audience.example.com",
    traffic_url: "https://api.example.com/traffic",
    load_balancer_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer-platform/50dc6c495c0c9188",
    target_group_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/customer-api/6d0ecf831eec9f09",
    scale_out_threshold: 60,
    ...overrides
  };
}

class FakeManifestRepository implements DeploymentLiveObservationManifestRepository {
  valid: DeploymentLiveObservationManifestV2 | null = null;
  invalid: { deploymentId: string; reason: string } | null = null;

  async findByDeploymentId() {
    return null;
  }

  async saveValid(manifest: DeploymentLiveObservationManifestV2) {
    this.valid = manifest;
    return createRecord("valid", manifest, null);
  }

  async saveInvalid(input: { deploymentId: string; reason: string }) {
    this.invalid = input;
    return createRecord("manifest_invalid", null, "Live Observation manifest verification failed.");
  }
}

function createRecord(
  status: "valid" | "manifest_invalid",
  manifest: DeploymentLiveObservationManifestV2 | null,
  invalidReason: string | null
): DeploymentLiveObservationManifestRecord {
  return {
    deploymentId: DEPLOYMENT_ID,
    schemaVersion: 2,
    status,
    manifest,
    invalidReason,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}
