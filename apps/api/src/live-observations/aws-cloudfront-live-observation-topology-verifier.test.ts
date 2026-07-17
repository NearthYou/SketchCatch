import assert from "node:assert/strict";
import { test } from "node:test";
import { createAwsCloudFrontLiveObservationTopologyVerifier } from "./aws-cloudfront-live-observation-topology-verifier.js";

const expected = {
  accountId: "123456789012",
  region: "ap-northeast-2",
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
  serviceName: "audience-live-check-service"
};

const connection = {
  roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo",
  externalId: "external-id",
  region: "ap-northeast-2"
};

test("verifies the CloudFront, private S3, public ALB, Target Group, and ECS topology", async () => {
  const verifier = createVerifier();

  const topology = await verifier.verify({ connection, expected });

  assert.equal(topology.defaultOriginId, "web-assets");
  assert.equal(topology.apiOriginId, "api-alb");
  assert.equal(topology.originAccessControlId, "E123456789OAC");
  assert.equal(topology.frontendBucketPublicAccessBlocked, true);
  assert.equal(topology.bucketPolicyAllowsCloudFrontRead, true);
  assert.equal(topology.topologyVerifiedAt, "2026-07-16T04:00:00.000Z");
});

test("rejects a distribution without the required CloudFront /health ALB behavior", async () => {
  const verifier = createVerifier({ omitHealthBehavior: true });

  await assert.rejects(
    () => verifier.verify({ connection, expected }),
    /\/health behavior is missing/i
  );
});

function createVerifier(options: { omitHealthBehavior?: boolean } = {}) {
  const distributionArn =
    "arn:aws:cloudfront::123456789012:distribution/E123456789ABC";
  const responses: Record<string, unknown> = {
    GetDistributionCommand: {
      Distribution: {
        Id: expected.cloudFrontDistributionId,
        ARN: distributionArn,
        DomainName: expected.cloudFrontDomainName,
        Status: "Deployed",
        DistributionConfig: {
          Enabled: true,
          Origins: {
            Items: [
              {
                Id: "web-assets",
                DomainName: `${expected.frontendBucketName}.s3.ap-northeast-2.amazonaws.com`,
                OriginAccessControlId: "E123456789OAC"
              },
              {
                Id: "api-alb",
                DomainName: expected.loadBalancerDnsName,
                CustomOriginConfig: { OriginProtocolPolicy: "http-only" }
              }
            ]
          },
          DefaultCacheBehavior: {
            TargetOriginId: "web-assets",
            ViewerProtocolPolicy: "redirect-to-https"
          },
          CacheBehaviors: {
            Items: [
              {
                PathPattern: "/api/*",
                TargetOriginId: "api-alb",
                ViewerProtocolPolicy: "redirect-to-https"
              },
              ...(!options.omitHealthBehavior
                ? [{
                    PathPattern: "/health",
                    TargetOriginId: "api-alb",
                    ViewerProtocolPolicy: "redirect-to-https"
                  }]
                : [])
            ]
          }
        }
      }
    },
    GetOriginAccessControlCommand: {
      OriginAccessControl: {
        Id: "E123456789OAC",
        OriginAccessControlConfig: {
          OriginAccessControlOriginType: "s3",
          SigningBehavior: "always",
          SigningProtocol: "sigv4"
        }
      }
    },
    GetPublicAccessBlockCommand: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      }
    },
    GetBucketLocationCommand: { LocationConstraint: "ap-northeast-2" },
    GetBucketPolicyCommand: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${expected.frontendBucketName}/*`,
          Condition: { StringEquals: { "AWS:SourceArn": distributionArn } }
        }]
      })
    },
    DescribeLoadBalancersCommand: {
      LoadBalancers: [{
        LoadBalancerArn: expected.loadBalancerArn,
        DNSName: expected.loadBalancerDnsName,
        Scheme: "internet-facing",
        State: { Code: "active" }
      }]
    },
    DescribeTargetGroupsCommand: {
      TargetGroups: [{
        TargetGroupArn: expected.targetGroupArn,
        TargetType: "ip",
        LoadBalancerArns: [expected.loadBalancerArn]
      }]
    },
    DescribeServicesCommand: {
      services: [{
        serviceName: expected.serviceName,
        status: "ACTIVE",
        loadBalancers: [{ targetGroupArn: expected.targetGroupArn }]
      }]
    }
  };
  const createClient = () => ({
    async send(command: unknown) {
      const name = (command as { constructor?: { name?: string } }).constructor?.name ?? "";
      const response = responses[name];
      if (!response) throw new Error(`Unexpected command ${name}`);
      return response;
    },
    destroy() {}
  });

  return createAwsCloudFrontLiveObservationTopologyVerifier({
    assumeRole: async () => ({
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
      sessionToken: "token"
    }),
    createCloudFrontClient: createClient,
    createEcsClient: createClient,
    createElbClient: createClient,
    createS3Client: createClient,
    now: () => new Date("2026-07-16T04:00:00.000Z")
  });
}
