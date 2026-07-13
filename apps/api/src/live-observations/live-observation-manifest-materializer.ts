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
  readonly approvedAwsRegion: string | null;
};

type ConnectionEvidence = {
  readonly id: string;
  readonly accountId: string | null;
  readonly region: string;
  readonly status: string;
  readonly lastVerifiedAt: string | Date | null;
};

export async function materializeDeploymentLiveObservationManifest(
  input: {
    readonly audienceBaseUrl: string;
    readonly deployment: DeploymentEvidence;
    readonly connection: ConnectionEvidence | null;
    readonly outputs: Readonly<Record<string, unknown>>;
  },
  repository: DeploymentLiveObservationManifestRepository
): Promise<DeploymentLiveObservationManifestRecord> {
  try {
    const manifest = createDeploymentLiveObservationManifest(input);
    return await repository.saveValid(manifest);
  } catch {
    return repository.saveInvalid({
      deploymentId: input.deployment.id,
      reason: "manifest materialization failed"
    });
  }
}

export function createDeploymentLiveObservationManifest(input: {
  readonly audienceBaseUrl: string;
  readonly deployment: DeploymentEvidence;
  readonly connection: ConnectionEvidence | null;
  readonly outputs: Readonly<Record<string, unknown>>;
}): DeploymentLiveObservationManifestV2 {
  const { deployment, connection, outputs } = input;
  const accountId = connection?.accountId;
  const artifactHash = deployment.approvedTerraformArtifactHash;
  if (
    deployment.status !== "SUCCESS" ||
    !connection ||
    connection.status !== "verified" ||
    deployment.awsConnectionId !== connection.id ||
    typeof accountId !== "string" ||
    !/^[0-9]{12}$/.test(accountId) ||
    !connection.lastVerifiedAt ||
    deployment.approvedAwsRegion !== connection.region ||
    typeof artifactHash !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(artifactHash)
  ) {
    throw new Error("Unverified deployment evidence");
  }

  const verifiedAt = toIsoDateTime(connection.lastVerifiedAt);
  const audienceBaseUrl = input.audienceBaseUrl;
  const trafficUrl = readTrafficUrl(outputs);
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
        loadBalancerArn,
        targetGroupArn,
        capacityTarget: readCapacityTarget(outputs)
      }
    }
  });
}

function readCapacityTarget(outputs: Readonly<Record<string, unknown>>) {
  const clusterName = readOptionalString(outputs, "ecs_cluster_name");
  const serviceName = readOptionalString(outputs, "ecs_service_name");
  const maxCapacity = readOptionalPositiveNumber(outputs, "max_capacity");
  const hasEcsEvidence = clusterName !== null || serviceName !== null || maxCapacity !== null;

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
    autoScalingGroupName: readString(outputs, "asg_name")
  };
}

function readTrafficUrl(outputs: Readonly<Record<string, unknown>>): string {
  const explicit = readOptionalString(outputs, "traffic_url");
  if (explicit) return explicit;

  const apiBaseUrl = new URL(readString(outputs, "api_base_url"));
  apiBaseUrl.pathname = `${apiBaseUrl.pathname.replace(/\/$/, "")}/traffic`;
  return apiBaseUrl.toString();
}

function readAwsArn(
  outputs: Readonly<Record<string, unknown>>,
  arnName: string,
  suffixName: string,
  identity: { accountId: string; region: string }
): string {
  const arn = readOptionalString(outputs, arnName);
  if (arn) return arn;

  const suffix = readString(outputs, suffixName);
  const partition = identity.region.startsWith("cn-")
    ? "aws-cn"
    : identity.region.startsWith("us-gov-")
      ? "aws-us-gov"
      : "aws";
  const resource = arnName === "load_balancer_arn" ? `loadbalancer/${suffix}` : suffix;
  return `arn:${partition}:elasticloadbalancing:${identity.region}:${identity.accountId}:${resource}`;
}

function readString(outputs: Readonly<Record<string, unknown>>, name: string): string {
  const value = readOptionalString(outputs, name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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

function toIsoDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid verification time");
  return date.toISOString();
}
