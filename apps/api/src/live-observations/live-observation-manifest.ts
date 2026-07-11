import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import { z } from "zod";

const awsPartitionPattern = "(?:aws|aws-cn|aws-us-gov)";
const awsRegionPattern = "[a-z]{2}(?:-[a-z0-9]+)+-[0-9]";
const resourceSuffixPattern = "[0-9a-f]{12}";

const cloudFrontDistributionIdPattern = /^E[A-Z0-9]{13}$/;
const loadBalancerArnPattern = new RegExp(
  `^arn:(${awsPartitionPattern}):elasticloadbalancing:(${awsRegionPattern}):([0-9]{12}):loadbalancer/app/sc-lo-alb-(${resourceSuffixPattern})/[0-9a-f]{16}$`
);
const targetGroupArnPattern = new RegExp(
  `^arn:(${awsPartitionPattern}):elasticloadbalancing:(${awsRegionPattern}):([0-9]{12}):targetgroup/sc-lo-api-(${resourceSuffixPattern})/[0-9a-f]{16}$`
);
const autoScalingGroupNamePattern = new RegExp(`^sc-lo-asg-${resourceSuffixPattern}$`);
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
      adapter: z
        .object({
          kind: z.literal("aws-live-observation"),
          version: z.literal(1),
          payload: awsLiveObservationAdapterPayloadV1Schema
        })
        .strict()
    })
    .strict()
    .superRefine((manifest, context) => {
      const resourceSuffix = deriveResourceSuffix(manifest.provenance.deploymentId);
      const loadBalancerIdentity = parseElasticLoadBalancingArnIdentity(
        manifest.adapter.payload.loadBalancerArn,
        loadBalancerArnPattern
      );
      const targetGroupIdentity = parseElasticLoadBalancingArnIdentity(
        manifest.adapter.payload.targetGroupArn,
        targetGroupArnPattern
      );

      if (!loadBalancerIdentity || !targetGroupIdentity) {
        return;
      }

      if (loadBalancerIdentity.resourceSuffix !== resourceSuffix) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "loadBalancerArn"],
          message: "Load balancer name must be derived from the deployment ID"
        });
      }

      if (targetGroupIdentity.resourceSuffix !== resourceSuffix) {
        context.addIssue({
          code: "custom",
          path: ["adapter", "payload", "targetGroupArn"],
          message: "Target group name must be derived from the deployment ID"
        });
      }

      if (
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
    });

export function parseDeploymentLiveObservationManifestV2(
  value: unknown
): DeploymentLiveObservationManifestV2 {
  return deploymentLiveObservationManifestV2Schema.parse(value);
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
