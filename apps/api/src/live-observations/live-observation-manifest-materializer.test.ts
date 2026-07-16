import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDeploymentLiveObservationManifestReusable,
  createDeploymentLiveObservationManifest
} from "./live-observation-manifest-materializer.js";

const deploymentId = "123e4567-e89b-4d3a-a456-426614174000";
const connectionId = "223e4567-e89b-4d3a-a456-426614174000";
const terraformArtifactHash = "a".repeat(64);

const topology = {
  cloudFrontDistributionId: "E123456789ABC",
  cloudFrontDomainName: "d111111abcdef8.cloudfront.net",
  frontendBucketName: "audience-live-check-web-assets",
  loadBalancerArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
  loadBalancerDnsName:
    "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
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
    outputs: {
      cloudfront_distribution_id: "E123456789ABC",
      cloudfront_domain_name: "d111111abcdef8.cloudfront.net",
      cloudfront_url: "https://d111111abcdef8.cloudfront.net",
      static_bucket_name: "audience-live-check-web-assets",
      alb_arn:
        "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
      alb_dns_name:
        "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
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

test("materializes a CloudFront public entry with one verified S3 and ALB topology", () => {
  const manifest = createDeploymentLiveObservationManifest(createInput());

  assert.equal(manifest.adapter.version, 3);
  assert.equal(manifest.endpoints.trafficUrl, "https://d111111abcdef8.cloudfront.net/api/traffic");
  if (manifest.adapter.version !== 3) assert.fail("Expected CloudFront adapter v3");
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

  assert.equal(manifest.adapter.version, 3);
  if (manifest.adapter.version !== 3) assert.fail("Expected CloudFront adapter v3");
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
