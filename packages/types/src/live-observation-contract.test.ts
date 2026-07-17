import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DeploymentLiveObservationArchitectureResponse,
  DeploymentLiveObservationAwsAdapterV4,
  DeploymentResourceObservationState
} from "./index.js";

const cloudFrontEvidence = {
  cloudFrontDistributionId: "E123456789ABC",
  cloudFrontDomainName: "d111111abcdef8.cloudfront.net",
  frontendBucketName: "audience-live-check-web-assets",
  defaultOriginId: "web-assets",
  originAccessControlId: "E123456789ABC",
  apiOriginId: "api-alb",
  apiPathPattern: "/api/*" as const,
  healthPathPattern: "/health" as const,
  frontendBucketPublicAccessBlocked: true as const,
  bucketPolicyAllowsCloudFrontRead: true as const,
  topologyVerifiedAt: "2026-07-16T03:00:00.000Z",
  frontendState: "current" as const,
  loadBalancerDnsName:
    "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
  loadBalancerArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
  targetGroupArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/0123456789abcdef",
  logGroupNames: ["/ecs/audience-live-check"]
};

const fixedAdapter = {
  kind: "aws-live-observation",
  version: 4,
  payload: {
    ...cloudFrontEvidence,
    capacityTarget: {
      kind: "ecs_fargate",
      clusterName: "demo-cluster",
      serviceName: "demo-service",
      scaling: { mode: "fixed" }
    }
  }
} satisfies DeploymentLiveObservationAwsAdapterV4;

const scalingAdapter = {
  ...fixedAdapter,
  payload: {
    ...fixedAdapter.payload,
    capacityTarget: {
      kind: "ecs_fargate",
      clusterName: "demo-cluster",
      serviceName: "demo-service",
      scaling: {
        mode: "service_auto_scaling",
        minCapacity: 1,
        maxCapacity: 4,
        metric: "ALBRequestCountPerTarget",
        targetValue: 60
      }
    }
  }
} satisfies DeploymentLiveObservationAwsAdapterV4;

const architectureResponse = {
  deploymentId: "123e4567-e89b-4d3a-a456-426614174000",
  architectureId: "323e4567-e89b-4d3a-a456-426614174000",
  terraformArtifactSha256: "a".repeat(64),
  architecture: { nodes: [], edges: [] }
} satisfies DeploymentLiveObservationArchitectureResponse;

const observationStates = [
  "observed",
  "delayed",
  "unavailable",
  "not_supported"
] satisfies DeploymentResourceObservationState[];

test("defines fixed and Service Auto Scaling live observation contracts", () => {
  assert.equal(fixedAdapter.payload.capacityTarget.scaling.mode, "fixed");
  assert.equal(
    scalingAdapter.payload.capacityTarget.scaling.mode,
    "service_auto_scaling"
  );
  assert.deepEqual(architectureResponse.architecture, { nodes: [], edges: [] });
  assert.equal(observationStates.length, 4);
});
