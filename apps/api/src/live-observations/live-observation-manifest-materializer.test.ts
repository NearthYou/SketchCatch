import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import {
  assertDeploymentLiveObservationManifestReusable,
  createDeploymentLiveObservationManifest,
  materializeDeploymentLiveObservationManifest
} from "./live-observation-manifest-materializer.js";
import {
  LiveObservationManifestPersistenceConflictError,
  type DeploymentLiveObservationManifestRepository
} from "./live-observation-manifest-repository.js";
import {
  parseDeploymentLiveObservationManifestV2,
  requireLiveObservationTrafficTargetEvidence
} from "./live-observation-manifest.js";

const deploymentId = "123e4567-e89b-4d3a-a456-426614174000";
const connectionId = "223e4567-e89b-4d3a-a456-426614174000";
const terraformArtifactHash = "a".repeat(64);

const fixedEcsArchitecture: ArchitectureJson = {
  nodes: [
    {
      id: "ecs-service",
      type: "ECS_SERVICE",
      label: "Demo service",
      positionX: 0,
      positionY: 0,
      config: {}
    }
  ],
  edges: []
};

const serviceAutoScalingArchitecture: ArchitectureJson = {
  nodes: [
    fixedEcsArchitecture.nodes[0]!,
    {
      id: "ecs-scaling-target",
      type: "APPLICATION_AUTO_SCALING_TARGET",
      label: "Demo scaling target",
      positionX: 200,
      positionY: 0,
      config: { minCapacity: 1, maxCapacity: 4 }
    },
    {
      id: "ecs-scaling-policy",
      type: "APPLICATION_AUTO_SCALING_POLICY",
      label: "Demo request target tracking",
      positionX: 400,
      positionY: 0,
      config: {
        policyType: "TargetTrackingScaling",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 60,
          predefinedMetricSpecification: [{ predefinedMetricType: "ALBRequestCountPerTarget" }]
        }
      }
    }
  ],
  edges: [
    {
      id: "service-to-target",
      sourceId: "ecs-service",
      targetId: "ecs-scaling-target"
    },
    {
      id: "target-to-policy",
      sourceId: "ecs-scaling-target",
      targetId: "ecs-scaling-policy"
    }
  ]
};

const topology = {
  cloudFrontDistributionId: "E123456789ABC",
  cloudFrontDomainName: "d111111abcdef8.cloudfront.net",
  frontendBucketName: "audience-live-check-web-assets",
  loadBalancerArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
  loadBalancerDnsName: "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
  targetGroupArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/0123456789abcdef",
  clusterName: "audience-live-check-cluster",
  serviceName: "audience-live-check-service",
  apiOriginId: "api-alb",
  apiPathPattern: "/api/*" as const,
  bucketPolicyAllowsCloudFrontRead: true as const,
  defaultOriginId: "web-assets",
  frontendBucketPublicAccessBlocked: true as const,
  healthPathPattern: "/health" as const,
  originAccessControlId: "E123456789ABC",
  topologyVerifiedAt: "2026-07-16T03:00:00.000Z"
};

function createInput(status: "SUCCESS" | "PARTIALLY_FAILED" = "SUCCESS") {
  return {
    audienceBaseUrl: "https://sketchcatch.example",
    connection: {
      id: connectionId,
      accountId: "123456789012",
      region: "ap-northeast-2",
      status: "verified",
      lastVerifiedAt: "2026-07-16T02:00:00.000Z"
    },
    deployment: {
      id: deploymentId,
      status,
      awsConnectionId: connectionId,
      approvedTerraformArtifactHash: terraformArtifactHash,
      approvedAwsAccountId: "123456789012",
      approvedAwsRegion: "ap-northeast-2"
    },
    architecture: fixedEcsArchitecture,
    outputs: {
      cloudfront_distribution_id: "E123456789ABC",
      cloudfront_domain_name: "d111111abcdef8.cloudfront.net",
      cloudfront_url: "https://d111111abcdef8.cloudfront.net",
      static_bucket_name: "audience-live-check-web-assets",
      alb_arn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
      alb_dns_name: "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
      target_group_arn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/0123456789abcdef",
      ecs_cluster_name: "audience-live-check-cluster",
      ecs_service_name: "audience-live-check-service",
      log_group_names: ["/ecs/audience-live-check"],
      max_capacity: 4,
      scale_out_threshold: 60
    },
    topology
  };
}

test("materializes fixed Fargate without scaling-only Terraform outputs", () => {
  const input = createInput();
  const { max_capacity: _maxCapacity, scale_out_threshold: _threshold, ...outputs } = input.outputs;

  const manifest = createDeploymentLiveObservationManifest({ ...input, outputs });

  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.deepEqual(manifest.adapter.payload.capacityTarget, {
    kind: "ecs_fargate",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    scaling: { mode: "fixed" }
  });
  assert.equal(manifest.pressure.target, 60);
});

test("materializes Service Auto Scaling from the exact ECS target and policy chain", () => {
  const input = createInput();
  const manifest = createDeploymentLiveObservationManifest({
    ...input,
    architecture: serviceAutoScalingArchitecture
  });

  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.deepEqual(manifest.adapter.payload.capacityTarget.scaling, {
    mode: "service_auto_scaling",
    minCapacity: 1,
    maxCapacity: 4,
    metric: "ALBRequestCountPerTarget",
    targetValue: 60
  });
});

test("materializes Service Auto Scaling from unambiguous Terraform references when saved edges are missing", () => {
  const input = createInput();
  const architecture: ArchitectureJson = {
    nodes: serviceAutoScalingArchitecture.nodes.map((node) => {
      if (node.id === "ecs-service") {
        return {
          ...node,
          config: { ...node.config, terraformResourceName: "audience_service" }
        };
      }
      if (node.id === "ecs-scaling-target") {
        return {
          ...node,
          config: {
            ...node.config,
            terraformResourceName: "audience_service",
            resourceId:
              "service/${aws_ecs_cluster.audience.name}/${aws_ecs_service.audience_service.name}"
          }
        };
      }
      return {
        ...node,
        config: {
          ...node.config,
          resourceId: "${aws_appautoscaling_target.audience_service.resource_id}"
        }
      };
    }),
    edges: []
  };

  const manifest = createDeploymentLiveObservationManifest({
    ...input,
    architecture
  });

  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.deepEqual(manifest.adapter.payload.capacityTarget.scaling, {
    mode: "service_auto_scaling",
    minCapacity: 1,
    maxCapacity: 4,
    metric: "ALBRequestCountPerTarget",
    targetValue: 60
  });
});

test("materializes the single Terraform-style target tracking block stored by Template Architecture", () => {
  const input = createInput();
  const architecture: ArchitectureJson = {
    ...serviceAutoScalingArchitecture,
    nodes: serviceAutoScalingArchitecture.nodes.map((node) =>
      node.id === "ecs-scaling-policy"
        ? {
            ...node,
            config: {
              ...node.config,
              targetTrackingScalingPolicyConfiguration: [
                node.config["targetTrackingScalingPolicyConfiguration"]
              ]
            }
          }
        : node
    )
  };

  const manifest = createDeploymentLiveObservationManifest({ ...input, architecture });

  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.deepEqual(manifest.adapter.payload.capacityTarget.scaling, {
    mode: "service_auto_scaling",
    minCapacity: 1,
    maxCapacity: 4,
    metric: "ALBRequestCountPerTarget",
    targetValue: 60
  });
});

test("rejects empty or ambiguous Terraform-style target tracking blocks", () => {
  const input = createInput();
  const withBlocks = (blocks: readonly unknown[]): ArchitectureJson => ({
    ...serviceAutoScalingArchitecture,
    nodes: serviceAutoScalingArchitecture.nodes.map((node) =>
      node.id === "ecs-scaling-policy"
        ? {
            ...node,
            config: {
              ...node.config,
              targetTrackingScalingPolicyConfiguration: blocks
            }
          }
        : node
    )
  });
  const block = serviceAutoScalingArchitecture.nodes[2]!.config[
    "targetTrackingScalingPolicyConfiguration"
  ];

  assert.throws(() =>
    createDeploymentLiveObservationManifest({ ...input, architecture: withBlocks([]) })
  );
  assert.throws(() =>
    createDeploymentLiveObservationManifest({
      ...input,
      architecture: withBlocks([block, block])
    })
  );
});

test("materializes Service Auto Scaling with a zero minimum capacity", () => {
  const input = createInput();
  const architecture: ArchitectureJson = {
    ...serviceAutoScalingArchitecture,
    nodes: serviceAutoScalingArchitecture.nodes.map((node) =>
      node.id === "ecs-scaling-target"
        ? { ...node, config: { ...node.config, minCapacity: 0 } }
        : node
    )
  };

  const manifest = createDeploymentLiveObservationManifest({
    ...input,
    architecture,
    outputs: { ...input.outputs, min_capacity: 0 }
  });

  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.deepEqual(manifest.adapter.payload.capacityTarget.scaling, {
    mode: "service_auto_scaling",
    minCapacity: 0,
    maxCapacity: 4,
    metric: "ALBRequestCountPerTarget",
    targetValue: 60
  });
});

test("rejects Service Auto Scaling when max_capacity output is missing", () => {
  const input = createInput();
  const { max_capacity: _maxCapacity, ...outputs } = input.outputs;

  assert.throws(
    () =>
      createDeploymentLiveObservationManifest({
        ...input,
        architecture: serviceAutoScalingArchitecture,
        outputs
      }),
    /max_capacity/
  );
});

test("requires an optional scale-out output to match policy evidence without changing pressure", () => {
  const input = createInput();
  const architecture = createServiceAutoScalingArchitecture(60.5);
  const manifest = createDeploymentLiveObservationManifest({
    ...input,
    architecture,
    outputs: { ...input.outputs, scale_out_threshold: 60.5 }
  });

  assert.equal(manifest.pressure.target, 60);
  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.equal(manifest.adapter.payload.capacityTarget.scaling.mode, "service_auto_scaling");
  if (manifest.adapter.payload.capacityTarget.scaling.mode !== "service_auto_scaling") {
    assert.fail("Expected Service Auto Scaling evidence");
  }
  assert.equal(manifest.adapter.payload.capacityTarget.scaling.targetValue, 60.5);

  assert.throws(() =>
    createDeploymentLiveObservationManifest({
      ...input,
      architecture,
      outputs: { ...input.outputs, scale_out_threshold: 60.6 }
    })
  );
});

test("rejects partial or contradictory Service Auto Scaling evidence", () => {
  const input = createInput();
  const missingPolicyEdge: ArchitectureJson = {
    ...serviceAutoScalingArchitecture,
    edges: serviceAutoScalingArchitecture.edges.slice(0, 1)
  };

  assert.throws(() =>
    createDeploymentLiveObservationManifest({
      ...input,
      architecture: missingPolicyEdge
    })
  );
  assert.throws(() =>
    createDeploymentLiveObservationManifest({
      ...input,
      architecture: serviceAutoScalingArchitecture,
      outputs: { ...input.outputs, max_capacity: 5 }
    })
  );
});

test("rereads a persistence-conflict winner without masking database outages", async () => {
  const input = createInput();
  const manifest = createDeploymentLiveObservationManifest(input);
  const winner = {
    deploymentId,
    schemaVersion: 2 as const,
    status: "valid" as const,
    manifest,
    invalidReason: null,
    createdAt: "2026-07-16T03:00:00.000Z",
    updatedAt: "2026-07-16T03:00:00.000Z"
  };
  let winnerReads = 0;
  const conflictRepository: DeploymentLiveObservationManifestRepository = {
    async findByDeploymentId() {
      winnerReads += 1;
      return winner;
    },
    async saveValid() {
      throw new LiveObservationManifestPersistenceConflictError();
    },
    async saveInvalid() {
      throw new Error("unexpected invalid save");
    }
  };

  assert.equal(
    await materializeDeploymentLiveObservationManifest(input, conflictRepository),
    winner
  );
  assert.equal(winnerReads, 1);

  const outage = new Error("database unavailable");
  const outageRepository: DeploymentLiveObservationManifestRepository = {
    ...conflictRepository,
    async findByDeploymentId() {
      assert.fail("A database outage must not enter conflict reconciliation");
    },
    async saveValid() {
      throw outage;
    }
  };
  await assert.rejects(
    materializeDeploymentLiveObservationManifest(input, outageRepository),
    (error: unknown) => error === outage
  );
});

function createServiceAutoScalingArchitecture(targetValue: number): ArchitectureJson {
  return {
    ...serviceAutoScalingArchitecture,
    nodes: serviceAutoScalingArchitecture.nodes.map((node) =>
      node.id === "ecs-scaling-policy"
        ? {
            ...node,
            config: {
              ...node.config,
              targetTrackingScalingPolicyConfiguration: {
                targetValue,
                predefinedMetricSpecification: [
                  { predefinedMetricType: "ALBRequestCountPerTarget" }
                ]
              }
            }
          }
        : node
    )
  };
}

function createV4Manifest(
  scaling:
    | { mode: "fixed"; unexpected?: number }
    | {
        mode: "service_auto_scaling";
        minCapacity: number;
        maxCapacity: number;
        metric: string | null;
        targetValue: number | null;
      }
) {
  const manifest = createDeploymentLiveObservationManifest(createInput());
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4 fixture");

  return {
    ...manifest,
    adapter: {
      ...manifest.adapter,
      version: 4,
      payload: {
        ...manifest.adapter.payload,
        capacityTarget: {
          kind: "ecs_fargate",
          clusterName: "audience-live-check-cluster",
          serviceName: "audience-live-check-service",
          scaling
        }
      }
    }
  };
}

test("materializes a CloudFront public entry with one verified S3 and ALB topology", () => {
  const manifest = createDeploymentLiveObservationManifest(createInput());

  assert.equal(manifest.adapter.version, 4);
  assert.equal(manifest.endpoints.trafficUrl, "https://d111111abcdef8.cloudfront.net/api/traffic");
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.equal(manifest.adapter.payload.cloudFrontDistributionId, "E123456789ABC");
  assert.equal(manifest.adapter.payload.frontendBucketName, "audience-live-check-web-assets");
  assert.equal(manifest.adapter.payload.defaultOriginId, "web-assets");
  assert.equal(manifest.adapter.payload.apiOriginId, "api-alb");
  assert.equal(manifest.adapter.payload.apiPathPattern, "/api/*");
  assert.equal(manifest.adapter.payload.healthPathPattern, "/health");
  assert.equal(manifest.adapter.payload.frontendState, "current");
});

test("keeps CloudFront observation eligible with an explicit frontend warning after partial failure", () => {
  const input = createInput("PARTIALLY_FAILED");
  const manifest = createDeploymentLiveObservationManifest(input);

  assert.equal(manifest.adapter.version, 4);
  if (manifest.adapter.version !== 4) assert.fail("Expected CloudFront adapter v4");
  assert.equal(manifest.adapter.payload.frontendState, "may_be_previous");

  assert.doesNotThrow(() =>
    assertDeploymentLiveObservationManifestReusable({
      audienceBaseUrl: input.audienceBaseUrl,
      connection: input.connection,
      deployment: input.deployment,
      record: {
        deploymentId,
        schemaVersion: 2,
        status: "valid",
        manifest,
        invalidReason: null,
        createdAt: "2026-07-16T03:00:00.000Z",
        updatedAt: "2026-07-16T03:00:00.000Z"
      }
    })
  );
});

test("rejects topology evidence that does not match the Terraform CloudFront distribution", () => {
  const input = createInput();

  assert.throws(
    () =>
      createDeploymentLiveObservationManifest({
        ...input,
        topology: { ...input.topology, originAccessControlId: "" }
      }),
    /topology/i
  );
});

test("parses fixed and Service Auto Scaling adapter v4 manifests", () => {
  const fixed = parseDeploymentLiveObservationManifestV2(createV4Manifest({ mode: "fixed" }));
  const scaling = parseDeploymentLiveObservationManifestV2(
    createV4Manifest({
      mode: "service_auto_scaling",
      minCapacity: 1,
      maxCapacity: 4,
      metric: "ALBRequestCountPerTarget",
      targetValue: 60
    })
  );

  assert.equal(fixed.adapter.version, 4);
  assert.equal(scaling.adapter.version, 4);
  assert.deepEqual(requireLiveObservationTrafficTargetEvidence(fixed), {
    trafficUrl: "https://d111111abcdef8.cloudfront.net/api/traffic",
    trafficHostname: "d111111abcdef8.cloudfront.net",
    loadBalancerDnsName: "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
    routingKind: "cloudfront"
  });
});

test("rejects extra scaling keys in strict adapter v4 manifests", () => {
  assert.throws(() =>
    parseDeploymentLiveObservationManifestV2(createV4Manifest({ mode: "fixed", unexpected: 4 }))
  );
});
