import {
  CloudFrontClient,
  GetDistributionCommand,
  GetOriginAccessControlCommand,
  type CloudFrontClientConfig
} from "@aws-sdk/client-cloudfront";
import { DescribeServicesCommand, ECSClient, type ECSClientConfig } from "@aws-sdk/client-ecs";
import {
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
  type ElasticLoadBalancingV2ClientConfig
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  GetBucketLocationCommand,
  GetBucketPolicyCommand,
  GetPublicAccessBlockCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import {
  createAwsSdkStsGateway,
  type AwsTemporaryCredentials
} from "../aws-connections/aws-connection-test-service.js";
import type { VerifiedCloudFrontLiveObservationTopology } from "./live-observation-manifest-materializer.js";

type AwsCommandClient = {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
  destroy?(): void;
};

export type CloudFrontLiveObservationExpectedTopology = {
  readonly accountId: string;
  readonly region: string;
  readonly cloudFrontDistributionId: string;
  readonly cloudFrontDomainName: string;
  readonly frontendBucketName: string;
  readonly loadBalancerArn: string;
  readonly loadBalancerDnsName: string;
  readonly targetGroupArn: string;
  readonly clusterName: string;
  readonly serviceName: string;
};

export type CloudFrontLiveObservationConnection = {
  readonly roleArn: string | null;
  readonly externalId: string;
  readonly region: string;
};

export type CloudFrontLiveObservationTopologyVerifier = {
  verify(input: {
    readonly connection: CloudFrontLiveObservationConnection;
    readonly expected: CloudFrontLiveObservationExpectedTopology;
  }): Promise<VerifiedCloudFrontLiveObservationTopology>;
};

export type CloudFrontLiveObservationTopologyVerifierOptions = {
  readonly assumeRole?: ((input: {
    roleArn: string;
    externalId: string;
    region: string;
    roleSessionName: string;
    abortSignal: AbortSignal;
  }) => Promise<AwsTemporaryCredentials>) | undefined;
  readonly createCloudFrontClient?: ((configuration: CloudFrontClientConfig) => AwsCommandClient) | undefined;
  readonly createEcsClient?: ((configuration: ECSClientConfig) => AwsCommandClient) | undefined;
  readonly createElbClient?: ((configuration: ElasticLoadBalancingV2ClientConfig) => AwsCommandClient) | undefined;
  readonly createS3Client?: ((configuration: S3ClientConfig) => AwsCommandClient) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly requestTimeoutMs?: number | undefined;
};

export function createAwsCloudFrontLiveObservationTopologyVerifier(
  options: CloudFrontLiveObservationTopologyVerifierOptions = {}
): CloudFrontLiveObservationTopologyVerifier {
  const assumeRole = options.assumeRole ?? ((input) => createAwsSdkStsGateway().assumeRole(input));
  const createCloudFrontClient =
    options.createCloudFrontClient ??
    ((configuration) => new CloudFrontClient(configuration) as unknown as AwsCommandClient);
  const createEcsClient =
    options.createEcsClient ??
    ((configuration) => new ECSClient(configuration) as unknown as AwsCommandClient);
  const createElbClient =
    options.createElbClient ??
    ((configuration) =>
      new ElasticLoadBalancingV2Client(configuration) as unknown as AwsCommandClient);
  const createS3Client =
    options.createS3Client ??
    ((configuration) => new S3Client(configuration) as unknown as AwsCommandClient);
  const now = options.now ?? (() => new Date());
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;

  return {
    async verify({ connection, expected }) {
      if (
        !connection.roleArn ||
        !connection.externalId.trim() ||
        connection.region !== expected.region
      ) {
        throw new Error("CloudFront topology requires the verified AWS connection role");
      }
      const abortSignal = AbortSignal.timeout(requestTimeoutMs);
      const credentials = await assumeRole({
        roleArn: connection.roleArn,
        externalId: connection.externalId,
        region: connection.region,
        roleSessionName: `sketchcatch-live-topology-${randomUUID()}`,
        abortSignal
      });
      const configuration = { region: expected.region, credentials };
      const cloudFront = createCloudFrontClient(configuration);
      const ecs = createEcsClient(configuration);
      const elb = createElbClient(configuration);
      const s3 = createS3Client(configuration);

      try {
        const [distributionResult, publicAccessResult, bucketPolicyResult, bucketLocationResult, loadBalancersResult, targetGroupsResult, servicesResult] =
          await Promise.all([
            cloudFront.send(
              new GetDistributionCommand({ Id: expected.cloudFrontDistributionId }),
              { abortSignal }
            ),
            s3.send(
              new GetPublicAccessBlockCommand({ Bucket: expected.frontendBucketName }),
              { abortSignal }
            ),
            s3.send(
              new GetBucketPolicyCommand({ Bucket: expected.frontendBucketName }),
              { abortSignal }
            ),
            s3.send(
              new GetBucketLocationCommand({ Bucket: expected.frontendBucketName }),
              { abortSignal }
            ),
            elb.send(
              new DescribeLoadBalancersCommand({ LoadBalancerArns: [expected.loadBalancerArn] }),
              { abortSignal }
            ),
            elb.send(
              new DescribeTargetGroupsCommand({ TargetGroupArns: [expected.targetGroupArn] }),
              { abortSignal }
            ),
            ecs.send(
              new DescribeServicesCommand({
                cluster: expected.clusterName,
                services: [expected.serviceName]
              }),
              { abortSignal }
            )
          ]);

        const distribution = requireRecord(requireRecord(distributionResult)["Distribution"]);
        const distributionConfig = requireRecord(distribution["DistributionConfig"]);
        const distributionArn = `arn:${partitionForRegion(expected.region)}:cloudfront::${expected.accountId}:distribution/${expected.cloudFrontDistributionId}`;
        if (
          distribution["Id"] !== expected.cloudFrontDistributionId ||
          distribution["ARN"] !== distributionArn ||
          distribution["DomainName"] !== expected.cloudFrontDomainName ||
          distribution["Status"] !== "Deployed" ||
          distributionConfig["Enabled"] !== true
        ) {
          throw new Error("CloudFront distribution identity or deployment state does not match");
        }

        const origins = readItems(distributionConfig["Origins"]);
        const defaultBehavior = requireRecord(distributionConfig["DefaultCacheBehavior"]);
        const defaultOriginId = requireString(defaultBehavior["TargetOriginId"]);
        const defaultOrigin = origins.find((origin) => origin["Id"] === defaultOriginId);
        if (
          !defaultOrigin ||
          defaultBehavior["ViewerProtocolPolicy"] !== "redirect-to-https" ||
          !isExpectedS3RegionalDomain(
            defaultOrigin["DomainName"],
            expected.frontendBucketName,
            expected.region
          )
        ) {
          throw new Error("CloudFront default behavior is not the approved private S3 origin");
        }
        const originAccessControlId = requireString(defaultOrigin["OriginAccessControlId"]);
        const originAccessControlResult = await cloudFront.send(
          new GetOriginAccessControlCommand({ Id: originAccessControlId }),
          { abortSignal }
        );
        const originAccessControl = requireRecord(
          requireRecord(originAccessControlResult)["OriginAccessControl"]
        );
        const originAccessControlConfig = requireRecord(
          originAccessControl["OriginAccessControlConfig"]
        );
        if (
          originAccessControl["Id"] !== originAccessControlId ||
          originAccessControlConfig["OriginAccessControlOriginType"] !== "s3" ||
          originAccessControlConfig["SigningBehavior"] !== "always" ||
          originAccessControlConfig["SigningProtocol"] !== "sigv4"
        ) {
          throw new Error("CloudFront S3 origin access control is not enforced");
        }

        const cacheBehaviors = readItems(distributionConfig["CacheBehaviors"]);
        const apiBehavior = requireBehavior(cacheBehaviors, "/api/*");
        const healthBehavior = requireBehavior(cacheBehaviors, "/health");
        const apiOriginId = requireString(apiBehavior["TargetOriginId"]);
        if (
          healthBehavior["TargetOriginId"] !== apiOriginId ||
          apiOriginId === defaultOriginId ||
          apiBehavior["ViewerProtocolPolicy"] !== "redirect-to-https" ||
          healthBehavior["ViewerProtocolPolicy"] !== "redirect-to-https"
        ) {
          throw new Error("CloudFront API and health behaviors must use one approved ALB origin");
        }
        const apiOrigin = origins.find((origin) => origin["Id"] === apiOriginId);
        const customOriginConfig = requireRecord(apiOrigin?.["CustomOriginConfig"]);
        if (
          !apiOrigin ||
          apiOrigin["DomainName"] !== expected.loadBalancerDnsName ||
          customOriginConfig["OriginProtocolPolicy"] !== "http-only"
        ) {
          throw new Error("CloudFront API origin does not match the approved ALB");
        }

        assertBucketSecurity({
          bucketLocationResult,
          bucketPolicyResult,
          distributionArn,
          expected,
          publicAccessResult
        });
        assertAlbEcsTopology({
          expected,
          loadBalancersResult,
          servicesResult,
          targetGroupsResult
        });

        return {
          ...expected,
          defaultOriginId,
          originAccessControlId,
          apiOriginId,
          apiPathPattern: "/api/*",
          healthPathPattern: "/health",
          frontendBucketPublicAccessBlocked: true,
          bucketPolicyAllowsCloudFrontRead: true,
          topologyVerifiedAt: now().toISOString()
        };
      } finally {
        cloudFront.destroy?.();
        ecs.destroy?.();
        elb.destroy?.();
        s3.destroy?.();
      }
    }
  };
}

function assertBucketSecurity(input: {
  bucketLocationResult: unknown;
  bucketPolicyResult: unknown;
  distributionArn: string;
  expected: CloudFrontLiveObservationExpectedTopology;
  publicAccessResult: unknown;
}): void {
  const publicAccess = requireRecord(
    requireRecord(input.publicAccessResult)["PublicAccessBlockConfiguration"]
  );
  if (
    publicAccess["BlockPublicAcls"] !== true ||
    publicAccess["IgnorePublicAcls"] !== true ||
    publicAccess["BlockPublicPolicy"] !== true ||
    publicAccess["RestrictPublicBuckets"] !== true
  ) {
    throw new Error("Frontend S3 bucket public access must be fully blocked");
  }
  const location = requireRecord(input.bucketLocationResult)["LocationConstraint"];
  if (location !== input.expected.region) {
    throw new Error("Frontend S3 bucket region does not match the deployment");
  }
  const policyText = requireString(requireRecord(input.bucketPolicyResult)["Policy"]);
  let policy: Record<string, unknown>;
  try {
    policy = requireRecord(JSON.parse(policyText) as unknown);
  } catch {
    throw new Error("Frontend S3 bucket policy is invalid");
  }
  const statements = asArray(policy["Statement"]).map(requireRecord);
  const expectedObjectArn = `arn:${partitionForRegion(input.expected.region)}:s3:::${input.expected.frontendBucketName}/*`;
  const allowsDistributionRead = statements.some((statement) => {
    const principal = requireOptionalRecord(statement["Principal"]);
    const conditions = requireOptionalRecord(statement["Condition"]);
    const stringEquals = requireOptionalRecord(conditions?.["StringEquals"]);
    return (
      statement["Effect"] === "Allow" &&
      principal?.["Service"] === "cloudfront.amazonaws.com" &&
      includesString(statement["Action"], "s3:GetObject") &&
      includesString(statement["Resource"], expectedObjectArn) &&
      stringEquals?.["AWS:SourceArn"] === input.distributionArn
    );
  });
  if (!allowsDistributionRead) {
    throw new Error("Frontend S3 bucket policy is not restricted to the approved distribution");
  }
}

function assertAlbEcsTopology(input: {
  expected: CloudFrontLiveObservationExpectedTopology;
  loadBalancersResult: unknown;
  servicesResult: unknown;
  targetGroupsResult: unknown;
}): void {
  const loadBalancer = asArray(requireRecord(input.loadBalancersResult)["LoadBalancers"])
    .map(requireRecord)
    .find((candidate) => candidate["LoadBalancerArn"] === input.expected.loadBalancerArn);
  const state = requireOptionalRecord(loadBalancer?.["State"]);
  if (
    !loadBalancer ||
    loadBalancer["DNSName"] !== input.expected.loadBalancerDnsName ||
    loadBalancer["Scheme"] !== "internet-facing" ||
    state?.["Code"] !== "active"
  ) {
    throw new Error("Approved public ALB is not active");
  }
  const targetGroup = asArray(requireRecord(input.targetGroupsResult)["TargetGroups"])
    .map(requireRecord)
    .find((candidate) => candidate["TargetGroupArn"] === input.expected.targetGroupArn);
  if (
    !targetGroup ||
    targetGroup["TargetType"] !== "ip" ||
    !includesString(targetGroup["LoadBalancerArns"], input.expected.loadBalancerArn)
  ) {
    throw new Error("Target Group does not belong to the approved ALB");
  }
  const service = asArray(requireRecord(input.servicesResult)["services"])
    .map(requireRecord)
    .find((candidate) => candidate["serviceName"] === input.expected.serviceName);
  const serviceLoadBalancers = asArray(service?.["loadBalancers"]).map(requireRecord);
  if (
    !service ||
    service["status"] !== "ACTIVE" ||
    !serviceLoadBalancers.some(
      (candidate) => candidate["targetGroupArn"] === input.expected.targetGroupArn
    )
  ) {
    throw new Error("ECS service does not use the approved Target Group");
  }
}

function requireBehavior(items: Record<string, unknown>[], pathPattern: string) {
  const behavior = items.find((candidate) => candidate["PathPattern"] === pathPattern);
  if (!behavior) throw new Error(`CloudFront ${pathPattern} behavior is missing`);
  return behavior;
}

function isExpectedS3RegionalDomain(value: unknown, bucketName: string, region: string): boolean {
  if (typeof value !== "string") return false;
  const suffix = region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com";
  return value === `${bucketName}.s3.${region}.${suffix}` ||
    value === `${bucketName}.s3-${region}.${suffix}`;
}

function readItems(value: unknown): Record<string, unknown>[] {
  return asArray(requireRecord(value)["Items"]).map(requireRecord);
}

function includesString(value: unknown, expected: string): boolean {
  return typeof value === "string"
    ? value === expected
    : Array.isArray(value) && value.some((candidate) => candidate === expected);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AWS CloudFront topology response is incomplete");
  }
  return value as Record<string, unknown>;
}

function requireOptionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AWS CloudFront topology response is incomplete");
  }
  return value;
}

function partitionForRegion(region: string): "aws" | "aws-cn" | "aws-us-gov" {
  if (region.startsWith("cn-")) return "aws-cn";
  if (region.startsWith("us-gov-")) return "aws-us-gov";
  return "aws";
}
