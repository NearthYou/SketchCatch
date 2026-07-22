import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import { isIP } from "node:net";
import { z } from "zod";

const awsPartitionPattern = "(?:aws|aws-cn|aws-us-gov)";
const awsRegionPattern = "[a-z]{2}(?:-[a-z0-9]+)+-[0-9]";
const resourceSuffixPattern = "[0-9a-f]{12}";

const cloudFrontDistributionIdPattern = /^E[A-Z0-9]{8,31}$/;
const cloudFrontDomainNamePattern = /^[a-z0-9-]{8,64}\.cloudfront\.net$/;
const s3BucketNamePattern = /^(?!xn--)(?!.*\.\.)(?!.*-$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const cloudFrontOriginAccessControlIdPattern = /^[A-Z0-9]{8,32}$/;
const loadBalancerArnPattern = new RegExp(
  `^arn:(${awsPartitionPattern}):elasticloadbalancing:(${awsRegionPattern}):([0-9]{12}):loadbalancer/app/sc-lo-alb-(${resourceSuffixPattern})/[0-9a-f]{16}$`
);
const targetGroupArnPattern = new RegExp(
  `^arn:(${awsPartitionPattern}):elasticloadbalancing:(${awsRegionPattern}):([0-9]{12}):targetgroup/sc-lo-api-(${resourceSuffixPattern})/[0-9a-f]{16}$`
);
const generalLoadBalancerArnPattern = new RegExp(
  `^arn:(${awsPartitionPattern}):elasticloadbalancing:(${awsRegionPattern}):([0-9]{12}):loadbalancer/app/([A-Za-z0-9-]{1,32})/[0-9a-f]{16}$`
);
const generalTargetGroupArnPattern = new RegExp(
  `^arn:(${awsPartitionPattern}):elasticloadbalancing:(${awsRegionPattern}):([0-9]{12}):targetgroup/([A-Za-z0-9-]{1,32})/[0-9a-f]{16}$`
);
const autoScalingGroupNamePattern = new RegExp(`^sc-lo-asg-${resourceSuffixPattern}$`);
const generalAutoScalingGroupNamePattern = /^[A-Za-z0-9_.:/=+@-]{1,255}$/;
const ecsNamePattern = /^[A-Za-z0-9_-]{1,255}$/;
const canonicalAwsConnectionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const nonBlankStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Value must not be empty"
});

const httpsEndpointSchema = z.string().superRefine((value, context) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Endpoint must be an absolute HTTPS URL"
    });
    return;
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "Endpoint must be an absolute credential-free HTTPS URL without query or fragment"
    });
  }
});

const awsLiveObservationAdapterPayloadV1Schema = z
  .object({
    cloudFrontDistributionId: z.string().regex(cloudFrontDistributionIdPattern),
    loadBalancerArn: z.string().regex(loadBalancerArnPattern),
    targetGroupArn: z.string().regex(targetGroupArnPattern),
    autoScalingGroupName: z.string().regex(autoScalingGroupNamePattern)
  })
  .strict();

const awsLiveObservationAdapterPayloadV2Schema = z
  .object({
    trafficHostname: z.string().min(1).max(253),
    loadBalancerDnsName: z.string().min(1).max(253),
    loadBalancerArn: z.string().regex(generalLoadBalancerArnPattern),
    targetGroupArn: z.string().regex(generalTargetGroupArnPattern),
    logGroupNames: z
      .array(z.string().regex(/^[A-Za-z0-9_./#-]{1,512}$/))
      .max(10)
      .optional(),
    capacityTarget: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("asg"),
          autoScalingGroupName: z.string().regex(generalAutoScalingGroupNamePattern)
        })
        .strict(),
      z
        .object({
          kind: z.literal("ecs_fargate"),
          clusterName: z.string().regex(ecsNamePattern),
          serviceName: z.string().regex(ecsNamePattern),
          maxCapacity: z.number().int().positive()
        })
        .strict()
    ])
  })
  .strict();

const awsLiveObservationAdapterPayloadV3Schema = z
  .object({
    cloudFrontDistributionId: z.string().regex(cloudFrontDistributionIdPattern),
    cloudFrontDomainName: z.string().regex(cloudFrontDomainNamePattern),
    frontendBucketName: z.string().regex(s3BucketNamePattern),
    defaultOriginId: nonBlankStringSchema,
    originAccessControlId: z.string().regex(cloudFrontOriginAccessControlIdPattern),
    apiOriginId: nonBlankStringSchema,
    apiPathPattern: z.literal("/api/*"),
    healthPathPattern: z.literal("/health"),
    frontendBucketPublicAccessBlocked: z.literal(true),
    bucketPolicyAllowsCloudFrontRead: z.literal(true),
    topologyVerifiedAt: z.iso.datetime({ offset: true }),
    frontendState: z.enum(["current", "may_be_previous"]),
    loadBalancerDnsName: z.string().min(1).max(253),
    loadBalancerArn: z.string().regex(generalLoadBalancerArnPattern),
    targetGroupArn: z.string().regex(generalTargetGroupArnPattern),
    logGroupNames: z
      .array(z.string().regex(/^[A-Za-z0-9_./#-]{1,512}$/))
      .max(10)
      .optional(),
    capacityTarget: z
      .object({
        kind: z.literal("ecs_fargate"),
        clusterName: z.string().regex(ecsNamePattern),
        serviceName: z.string().regex(ecsNamePattern),
        maxCapacity: z.number().int().positive()
      })
      .strict()
  })
  .strict();

const awsLiveObservationAdapterPayloadV4Schema = awsLiveObservationAdapterPayloadV3Schema
  .omit({ capacityTarget: true })
  .extend({
    capacityTarget: z
      .object({
        kind: z.literal("ecs_fargate"),
        clusterName: z.string().regex(ecsNamePattern),
        serviceName: z.string().regex(ecsNamePattern),
        scaling: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("fixed") }).strict(),
          z
            .object({
              mode: z.literal("service_auto_scaling"),
              minCapacity: z.number().int().nonnegative(),
              maxCapacity: z.number().int().positive(),
              metric: nonBlankStringSchema.nullable(),
              targetValue: z.number().positive().nullable()
            })
            .strict()
        ])
      })
      .strict()
  })
  .strict();

const awsLiveObservationAdapterSchema = z.discriminatedUnion("version", [
  z
    .object({
      kind: z.literal("aws-live-observation"),
      version: z.literal(1),
      payload: awsLiveObservationAdapterPayloadV1Schema
    })
    .strict(),
  z
    .object({
      kind: z.literal("aws-live-observation"),
      version: z.literal(2),
      payload: awsLiveObservationAdapterPayloadV2Schema
    })
    .strict(),
  z
    .object({
      kind: z.literal("aws-live-observation"),
      version: z.literal(3),
      payload: awsLiveObservationAdapterPayloadV3Schema
    })
    .strict(),
  z
    .object({
      kind: z.literal("aws-live-observation"),
      version: z.literal(4),
      payload: awsLiveObservationAdapterPayloadV4Schema
    })
    .strict()
]);

export const deploymentLiveObservationManifestV2Schema: z.ZodType<DeploymentLiveObservationManifestV2> =
  z
    .object({
      schemaVersion: z.literal(2),
      provider: z.literal("aws"),
      provenance: z
        .object({
          deploymentId: z.uuid(),
          terraformArtifactSha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
          awsConnectionId: z.string().regex(canonicalAwsConnectionIdPattern),
          region: nonBlankStringSchema,
          verifiedAt: z.iso.datetime({ offset: true })
        })
        .strict(),
      endpoints: z
        .object({
          audienceBaseUrl: httpsEndpointSchema,
          audienceApplicationUrl: httpsEndpointSchema.optional(),
          trafficUrl: httpsEndpointSchema
        })
        .strict(),
      pressure: z
        .object({
          metric: z.literal("requests_per_target_per_minute"),
          target: z.literal(60),
          windowSeconds: z.literal(60)
        })
        .strict(),
      adapter: awsLiveObservationAdapterSchema
    })
    .strict()
    .superRefine((manifest, context) => {
      const isLegacyAdapter = manifest.adapter.version === 1;
      const resourceSuffix = deriveResourceSuffix(manifest.provenance.deploymentId);
      const loadBalancerIdentity = parseElasticLoadBalancingArnIdentity(
        manifest.adapter.payload.loadBalancerArn,
        isLegacyAdapter ? loadBalancerArnPattern : generalLoadBalancerArnPattern
      );
      const targetGroupIdentity = parseElasticLoadBalancingArnIdentity(
        manifest.adapter.payload.targetGroupArn,
        isLegacyAdapter ? targetGroupArnPattern : generalTargetGroupArnPattern
      );

      if (!loadBalancerIdentity || !targetGroupIdentity) {
        return;
      }

      if (isLegacyAdapter && loadBalancerIdentity.resourceSuffix !== resourceSuffix) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "loadBalancerArn"],
          message: "Load balancer name must be derived from the deployment ID"
        });
      }

      if (isLegacyAdapter && targetGroupIdentity.resourceSuffix !== resourceSuffix) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "targetGroupArn"],
          message: "Target group name must be derived from the deployment ID"
        });
      }

      if (
        manifest.adapter.version === 1 &&
        manifest.adapter.payload.autoScalingGroupName !== `sc-lo-asg-${resourceSuffix}`
      ) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "autoScalingGroupName"],
          message: "Auto Scaling group name must be derived from the deployment ID"
        });
      }

      if (loadBalancerIdentity.partition !== targetGroupIdentity.partition) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "targetGroupArn"],
          message: "Target group and load balancer partitions must match"
        });
      }

      if (loadBalancerIdentity.accountId !== targetGroupIdentity.accountId) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "targetGroupArn"],
          message: "Target group and load balancer AWS accounts must match"
        });
      }

      if (loadBalancerIdentity.region !== manifest.provenance.region) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "loadBalancerArn"],
          message: "Load balancer region must match manifest provenance"
        });
      }

      if (targetGroupIdentity.region !== manifest.provenance.region) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "targetGroupArn"],
          message: "Target group region must match manifest provenance"
        });
      }

      if (
        loadBalancerIdentity.partition !==
        partitionForRegion(manifest.provenance.region)
      ) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "loadBalancerArn"],
          message: "Load balancer partition must match manifest region"
        });
      }

      if (manifest.adapter.version === 2) {
        const trafficUrl = new URL(manifest.endpoints.trafficUrl);
        const trafficHostname = manifest.adapter.payload.trafficHostname;
        const dnsName = manifest.adapter.payload.loadBalancerDnsName;
        if (
          !isPublicAlbDnsName({
            dnsName,
            loadBalancerName: loadBalancerIdentity.resourceSuffix,
            partition: loadBalancerIdentity.partition,
            region: loadBalancerIdentity.region
          })
        ) {
          context.addIssue({
            code: "custom",
            path: ["adapter", "payload", "loadBalancerDnsName"],
            message: "Load balancer DNS name must identify the public ALB"
          });
        }
        if (!isPublicCustomHostname(trafficHostname)) {
          context.addIssue({
            code: "custom",
            path: ["adapter", "payload", "trafficHostname"],
            message: "Traffic hostname must be a public custom DNS name"
          });
        }
        if (trafficUrl.hostname !== trafficHostname || trafficUrl.port !== "") {
          context.addIssue({
            code: "custom",
            path: ["endpoints", "trafficUrl"],
            message: "Traffic URL must use the verified custom hostname on HTTPS 443"
          });
        }
      }

      if (manifest.adapter.version === 3 || manifest.adapter.version === 4) {
        const trafficUrl = new URL(manifest.endpoints.trafficUrl);
        const payload = manifest.adapter.payload;
        if (
          trafficUrl.hostname !== payload.cloudFrontDomainName ||
          trafficUrl.port !== "" ||
          trafficUrl.pathname !== "/api/traffic"
        ) {
          context.addIssue({
            code: "custom",
            path: ["endpoints", "trafficUrl"],
            message: "Traffic URL must use the verified CloudFront /api/traffic route"
          });
        }
        if (payload.defaultOriginId === payload.apiOriginId) {
          context.addIssue({
            code: "custom",
            path: ["adapter", "payload", "apiOriginId"],
            message: "CloudFront frontend and API origins must be distinct"
          });
        }
        if (
          !isPublicAlbDnsName({
            dnsName: payload.loadBalancerDnsName,
            loadBalancerName: loadBalancerIdentity.resourceSuffix,
            partition: loadBalancerIdentity.partition,
            region: loadBalancerIdentity.region
          })
        ) {
          context.addIssue({
            code: "custom",
            path: ["adapter", "payload", "loadBalancerDnsName"],
            message: "Load balancer DNS name must identify the approved public ALB"
          });
        }
      }
    });

export function parseDeploymentLiveObservationManifestV2(
  value: unknown
): DeploymentLiveObservationManifestV2 {
  return deploymentLiveObservationManifestV2Schema.parse(value);
}

export function requireLiveObservationTrafficTarget(
  value: unknown
): string {
  return requireLiveObservationTrafficTargetEvidence(value).trafficUrl;
}

export function requireLiveObservationTrafficTargetEvidence(value: unknown): {
  readonly trafficUrl: string;
  readonly trafficHostname: string;
  readonly loadBalancerDnsName: string;
  readonly routingKind: "alb_custom_domain" | "cloudfront";
} {
  const manifest = parseDeploymentLiveObservationManifestV2(value);
  if (manifest.adapter.version === 2) {
    return {
      trafficUrl: manifest.endpoints.trafficUrl,
      trafficHostname: manifest.adapter.payload.trafficHostname,
      loadBalancerDnsName: manifest.adapter.payload.loadBalancerDnsName,
      routingKind: "alb_custom_domain"
    };
  }
  if (manifest.adapter.version === 3 || manifest.adapter.version === 4) {
    return {
      trafficUrl: manifest.endpoints.trafficUrl,
      trafficHostname: manifest.adapter.payload.cloudFrontDomainName,
      loadBalancerDnsName: manifest.adapter.payload.loadBalancerDnsName,
      routingKind: "cloudfront"
    };
  }
  throw new Error("Live Observation traffic target requires adapter v2, v3, or v4 evidence");
}

type ElasticLoadBalancingArnIdentity = {
  partition: string;
  region: string;
  accountId: string;
  resourceSuffix: string;
};

function deriveResourceSuffix(deploymentId: string): string {
  return deploymentId.replaceAll("-", "").slice(0, 12).toLowerCase();
}

function parseElasticLoadBalancingArnIdentity(
  value: string,
  pattern: RegExp
): ElasticLoadBalancingArnIdentity | null {
  const match = pattern.exec(value);
  const partition = match?.[1];
  const region = match?.[2];
  const accountId = match?.[3];
  const resourceSuffix = match?.[4];

  if (!partition || !region || !accountId || !resourceSuffix) {
    return null;
  }

  return {
    partition,
    region,
    accountId,
    resourceSuffix
  };
}

function partitionForRegion(region: string): string {
  if (region.startsWith("cn-")) return "aws-cn";
  if (region.startsWith("us-gov-")) return "aws-us-gov";
  return "aws";
}

function isPublicAlbDnsName(input: {
  dnsName: string;
  loadBalancerName: string;
  partition: string;
  region: string;
}): boolean {
  if (input.dnsName !== input.dnsName.toLowerCase()) return false;
  const suffix =
    input.partition === "aws-cn"
      ? `${input.region}.elb.amazonaws.com.cn`
      : `${input.region}.elb.amazonaws.com`;
  const expectedPrefix = `${input.loadBalancerName}-`;
  const labelSuffix = `.${suffix}`;
  if (!input.dnsName.endsWith(labelSuffix)) return false;
  const label = input.dnsName.slice(0, -labelSuffix.length);
  if (label.startsWith("internal-") || !label.startsWith(expectedPrefix)) return false;
  return /^[0-9]{1,16}$/.test(label.slice(expectedPrefix.length));
}

function isPublicCustomHostname(hostname: string): boolean {
  if (
    hostname !== hostname.toLowerCase() ||
    hostname.endsWith(".") ||
    isIP(hostname) !== 0 ||
    hostname.endsWith(".amazonaws.com") ||
    hostname.endsWith(".amazonaws.com.cn")
  ) {
    return false;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  if (
    labels.some(
      (label) =>
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ||
        label === "localhost" ||
        label === "metadata" ||
        label === "instance-data" ||
        label === "internal" ||
        label.startsWith("internal-")
    )
  ) {
    return false;
  }
  return !["local", "localhost", "internal", "invalid", "test"].includes(
    labels.at(-1) ?? ""
  );
}
