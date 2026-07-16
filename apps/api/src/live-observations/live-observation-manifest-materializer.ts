import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestV2
} from "@sketchcatch/types";
import { parseDeploymentLiveObservationManifestV2 } from "./live-observation-manifest.js";
import type { DeploymentLiveObservationManifestRepository } from "./live-observation-manifest-repository.js";

type DeploymentEvidence = {
  readonly id: string;
  readonly status: string;
  readonly awsConnectionId: string | null;
  readonly approvedTerraformArtifactHash: string | null;
  readonly approvedAwsAccountId: string | null;
  readonly approvedAwsRegion: string | null;
};

type ConnectionEvidence = {
  readonly id: string;
  readonly accountId: string | null;
  readonly region: string;
  readonly status: string;
  readonly lastVerifiedAt: string | Date | null;
};

export type VerifiedCloudFrontLiveObservationTopology = {
  readonly cloudFrontDistributionId: string;
  readonly cloudFrontDomainName: string;
  readonly frontendBucketName: string;
  readonly loadBalancerArn: string;
  readonly loadBalancerDnsName: string;
  readonly targetGroupArn: string;
  readonly clusterName: string;
  readonly serviceName: string;
  readonly defaultOriginId: string;
  readonly originAccessControlId: string;
  readonly apiOriginId: string;
  readonly apiPathPattern: "/api/*";
  readonly healthPathPattern: "/health";
  readonly frontendBucketPublicAccessBlocked: true;
  readonly bucketPolicyAllowsCloudFrontRead: true;
  readonly topologyVerifiedAt: string;
};

type ManifestMaterializationInput = {
  readonly audienceBaseUrl: string;
  readonly deployment: DeploymentEvidence;
  readonly connection: ConnectionEvidence | null;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly topology?: VerifiedCloudFrontLiveObservationTopology | undefined;
};

export async function materializeDeploymentLiveObservationManifest(
  input: ManifestMaterializationInput,
  repository: DeploymentLiveObservationManifestRepository
): Promise<DeploymentLiveObservationManifestRecord> {
  let manifest: DeploymentLiveObservationManifestV2;
  try {
    manifest = createDeploymentLiveObservationManifest(input);
  } catch {
    return repository.saveInvalid({
      deploymentId: input.deployment.id,
      reason: "manifest materialization failed"
    });
  }
  return repository.saveValid(manifest);
}

export function createDeploymentLiveObservationManifest(
  input: ManifestMaterializationInput
): DeploymentLiveObservationManifestV2 {
  const { deployment, connection, outputs } = input;
  const accountId = connection?.accountId;
  const artifactHash = deployment.approvedTerraformArtifactHash;
  if (
    !isLiveObservationEligibleDeploymentStatus(deployment.status) ||
    !connection ||
    connection.status !== "verified" ||
    deployment.awsConnectionId !== connection.id ||
    typeof accountId !== "string" ||
    !/^[0-9]{12}$/.test(accountId) ||
    deployment.approvedAwsAccountId !== accountId ||
    !connection.lastVerifiedAt ||
    deployment.approvedAwsRegion !== connection.region ||
    typeof artifactHash !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(artifactHash)
  ) {
    throw new Error("Unverified deployment evidence");
  }

  const verifiedAt = toIsoDateTime(connection.lastVerifiedAt);
  const audienceBaseUrl = input.audienceBaseUrl;
  if (input.topology) {
    return createCloudFrontDeploymentManifest({
      audienceBaseUrl,
      connection,
      deployment,
      outputs,
      topology: input.topology,
      verifiedAt
    });
  }
  const trafficUrl = readString(outputs, "traffic_url");
  const trafficHostname = readString(outputs, "traffic_hostname");
  const loadBalancerDnsName = readString(outputs, "load_balancer_dns_name");
  const loadBalancerArn = readAwsArn(outputs, "load_balancer_arn", "alb_arn_suffix", {
    accountId,
    region: connection.region
  });
  const targetGroupArn = readAwsArn(
    outputs,
    "target_group_arn",
    "target_group_arn_suffix",
    {
      accountId,
      region: connection.region
    }
  );
  if (readPositiveNumber(outputs, "scale_out_threshold") !== 60) {
    throw new Error("Unsupported pressure target");
  }

  return parseDeploymentLiveObservationManifestV2({
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId: deployment.id,
      terraformArtifactSha256: artifactHash,
      awsConnectionId: connection.id,
      region: connection.region,
      verifiedAt
    },
    endpoints: {
      audienceBaseUrl,
      trafficUrl
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: 60,
      windowSeconds: 60
    },
    adapter: {
      kind: "aws-live-observation",
      version: 2,
      payload: {
        trafficHostname,
        loadBalancerDnsName,
        loadBalancerArn,
        targetGroupArn,
        logGroupNames: readLogGroupNames(outputs),
        capacityTarget: readCapacityTarget(outputs)
      }
    }
  });
}

function createCloudFrontDeploymentManifest(input: {
  readonly audienceBaseUrl: string;
  readonly connection: ConnectionEvidence;
  readonly deployment: DeploymentEvidence;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly topology: VerifiedCloudFrontLiveObservationTopology;
  readonly verifiedAt: string;
}): DeploymentLiveObservationManifestV2 {
  const { outputs, topology } = input;
  const cloudFrontDistributionId = readString(outputs, "cloudfront_distribution_id");
  const cloudFrontDomainName = readString(outputs, "cloudfront_domain_name");
  const frontendBucketName = readString(outputs, "static_bucket_name");
  const loadBalancerArn = readFirstString(outputs, ["alb_arn", "load_balancer_arn"]);
  const loadBalancerDnsName = readFirstString(outputs, [
    "alb_dns_name",
    "load_balancer_dns_name"
  ]);
  const targetGroupArn = readString(outputs, "target_group_arn");
  const clusterName = readString(outputs, "ecs_cluster_name");
  const serviceName = readString(outputs, "ecs_service_name");
  const outputUrl = new URL(readString(outputs, "cloudfront_url"));
  if (
    outputUrl.protocol !== "https:" ||
    outputUrl.hostname !== cloudFrontDomainName ||
    outputUrl.username !== "" ||
    outputUrl.password !== "" ||
    outputUrl.port !== "" ||
    outputUrl.pathname !== "/" ||
    outputUrl.search !== "" ||
    outputUrl.hash !== ""
  ) {
    throw new Error("CloudFront topology output URL is invalid");
  }
  const expected = {
    cloudFrontDistributionId,
    cloudFrontDomainName,
    frontendBucketName,
    loadBalancerArn,
    loadBalancerDnsName,
    targetGroupArn,
    clusterName,
    serviceName
  };
  for (const [name, value] of Object.entries(expected)) {
    if (topology[name as keyof typeof expected] !== value) {
      throw new Error(`CloudFront topology does not match ${name}`);
    }
  }
  if (
    !topology.defaultOriginId.trim() ||
    !topology.apiOriginId.trim() ||
    topology.defaultOriginId === topology.apiOriginId ||
    !topology.originAccessControlId.trim() ||
    topology.apiPathPattern !== "/api/*" ||
    topology.healthPathPattern !== "/health" ||
    topology.frontendBucketPublicAccessBlocked !== true ||
    topology.bucketPolicyAllowsCloudFrontRead !== true
  ) {
    throw new Error("CloudFront topology evidence is incomplete");
  }

  return parseDeploymentLiveObservationManifestV2({
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId: input.deployment.id,
      terraformArtifactSha256: input.deployment.approvedTerraformArtifactHash,
      awsConnectionId: input.connection.id,
      region: input.connection.region,
      verifiedAt: input.verifiedAt
    },
    endpoints: {
      audienceBaseUrl: input.audienceBaseUrl,
      trafficUrl: new URL("/api/traffic", outputUrl).toString()
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: requirePressureTarget(outputs),
      windowSeconds: 60
    },
    adapter: {
      kind: "aws-live-observation",
      version: 3,
      payload: {
        cloudFrontDistributionId,
        cloudFrontDomainName,
        frontendBucketName,
        defaultOriginId: topology.defaultOriginId,
        originAccessControlId: topology.originAccessControlId,
        apiOriginId: topology.apiOriginId,
        apiPathPattern: topology.apiPathPattern,
        healthPathPattern: topology.healthPathPattern,
        frontendBucketPublicAccessBlocked: true,
        bucketPolicyAllowsCloudFrontRead: true,
        topologyVerifiedAt: toIsoDateTime(topology.topologyVerifiedAt),
        frontendState:
          input.deployment.status === "SUCCESS" ? "current" : "may_be_previous",
        loadBalancerDnsName,
        loadBalancerArn,
        targetGroupArn,
        logGroupNames: readLogGroupNames(outputs),
        capacityTarget: {
          kind: "ecs_fargate",
          clusterName,
          serviceName,
          maxCapacity: readPositiveNumber(outputs, "max_capacity")
        }
      }
    }
  });
}

export function assertDeploymentLiveObservationManifestReusable(input: {
  readonly audienceBaseUrl: string;
  readonly deployment: DeploymentEvidence;
  readonly connection: ConnectionEvidence | null;
  readonly record: DeploymentLiveObservationManifestRecord;
}): void {
  const { connection, deployment, record } = input;
  const manifest = record.manifest
    ? parseDeploymentLiveObservationManifestV2(record.manifest)
    : null;
  const accountId = connection?.accountId;
  if (
    record.status !== "valid" ||
    !manifest ||
    (manifest.adapter.version !== 2 && manifest.adapter.version !== 3) ||
    normalizeBaseUrl(manifest.endpoints.audienceBaseUrl) !==
      normalizeBaseUrl(input.audienceBaseUrl) ||
    record.deploymentId !== deployment.id ||
    manifest.provenance.deploymentId !== deployment.id ||
    !isLiveObservationEligibleDeploymentStatus(deployment.status) ||
    manifest.provenance.terraformArtifactSha256 !==
      deployment.approvedTerraformArtifactHash ||
    deployment.awsConnectionId !== connection?.id ||
    manifest.provenance.awsConnectionId !== connection?.id ||
    connection?.status !== "verified" ||
    !connection.lastVerifiedAt ||
    !accountId ||
    deployment.approvedAwsAccountId !== accountId ||
    deployment.approvedAwsRegion !== connection.region ||
    manifest.provenance.region !== connection.region
  ) {
    throw new Error("Immutable manifest evidence does not match deployment approval");
  }
  for (const arn of [
    manifest.adapter.payload.loadBalancerArn,
    manifest.adapter.payload.targetGroupArn
  ]) {
    const identity = /^arn:(aws|aws-cn|aws-us-gov):elasticloadbalancing:([^:]+):([0-9]{12}):/.exec(
      arn
    );
    if (identity?.[2] !== connection.region || identity[3] !== accountId) {
      throw new Error("Immutable manifest AWS identity does not match deployment approval");
    }
  }
}

function isLiveObservationEligibleDeploymentStatus(status: string): boolean {
  return status === "SUCCESS" || status === "PARTIALLY_FAILED" || status === "PARTIALLY_CANCELED";
}

function requirePressureTarget(outputs: Readonly<Record<string, unknown>>): 60 {
  if (readPositiveNumber(outputs, "scale_out_threshold") !== 60) {
    throw new Error("Unsupported pressure target");
  }
  return 60;
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).toString().replace(/\/$/, "");
}

function readCapacityTarget(outputs: Readonly<Record<string, unknown>>) {
  const autoScalingGroupName = readOptionalString(outputs, "asg_name");
  const clusterName = readOptionalString(outputs, "ecs_cluster_name");
  const serviceName = readOptionalString(outputs, "ecs_service_name");
  const maxCapacity = readOptionalPositiveNumber(outputs, "max_capacity");
  const hasEcsEvidence = clusterName !== null || serviceName !== null || maxCapacity !== null;

  if (autoScalingGroupName && hasEcsEvidence) {
    throw new Error("Ambiguous capacity target evidence");
  }

  if (hasEcsEvidence) {
    if (!clusterName || !serviceName || maxCapacity === null) {
      throw new Error("Incomplete ECS target evidence");
    }
    return {
      kind: "ecs_fargate" as const,
      clusterName,
      serviceName,
      maxCapacity
    };
  }

  return {
    kind: "asg" as const,
    autoScalingGroupName: autoScalingGroupName ?? readString(outputs, "asg_name")
  };
}

function readAwsArn(
  outputs: Readonly<Record<string, unknown>>,
  arnName: string,
  suffixName: string,
  identity: { accountId: string; region: string }
): string {
  const arn = readOptionalString(outputs, arnName);
  const partition = partitionForRegion(identity.region);
  if (arn) {
    const parsed = /^arn:(aws|aws-cn|aws-us-gov):elasticloadbalancing:([^:]+):([0-9]{12}):/.exec(
      arn
    );
    if (
      parsed?.[1] !== partition ||
      parsed[2] !== identity.region ||
      parsed[3] !== identity.accountId
    ) {
      throw new Error("AWS ARN identity does not match verified connection");
    }
    return arn;
  }

  const suffix = readString(outputs, suffixName);
  const resource = arnName === "load_balancer_arn" ? `loadbalancer/${suffix}` : suffix;
  return `arn:${partition}:elasticloadbalancing:${identity.region}:${identity.accountId}:${resource}`;
}

function partitionForRegion(region: string): "aws" | "aws-cn" | "aws-us-gov" {
  if (region.startsWith("cn-")) return "aws-cn";
  if (region.startsWith("us-gov-")) return "aws-us-gov";
  return "aws";
}

function readString(outputs: Readonly<Record<string, unknown>>, name: string): string {
  const value = readOptionalString(outputs, name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function readFirstString(
  outputs: Readonly<Record<string, unknown>>,
  names: readonly string[]
): string {
  for (const name of names) {
    const value = readOptionalString(outputs, name);
    if (value) return value;
  }
  throw new Error(`Missing ${names.join(" or ")}`);
}

function readOptionalString(
  outputs: Readonly<Record<string, unknown>>,
  name: string
): string | null {
  const value = outputs[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPositiveNumber(outputs: Readonly<Record<string, unknown>>, name: string): number {
  const value = readOptionalPositiveNumber(outputs, name);
  if (value === null) throw new Error(`Missing ${name}`);
  return value;
}

function readOptionalPositiveNumber(
  outputs: Readonly<Record<string, unknown>>,
  name: string
): number | null {
  const raw = outputs[name];
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readLogGroupNames(outputs: Readonly<Record<string, unknown>>): string[] {
  const single = readOptionalString(outputs, "log_group_name");
  const multiple = outputs.log_group_names;
  if (
    multiple !== undefined &&
    multiple !== null &&
    (!Array.isArray(multiple) || multiple.some((value) => typeof value !== "string"))
  ) {
    throw new Error("Invalid log_group_names");
  }
  const names = [single, ...((multiple as string[] | undefined) ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const unique = [...new Set(names)];
  if (unique.length > 10 || unique.some((value) => !/^[A-Za-z0-9_./#-]{1,512}$/.test(value))) {
    throw new Error("Invalid log group evidence");
  }
  return unique;
}

function toIsoDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid verification time");
  return date.toISOString();
}
