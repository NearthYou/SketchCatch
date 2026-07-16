import { randomUUID } from "node:crypto";
import type {
  DeploymentLiveObservationManifestV2,
  LiveObservationProviderSnapshot
} from "@sketchcatch/types";
import type {
  AwsLiveObservationSnapshotProvider,
  AwsLiveObservationSnapshotTarget
} from "./aws-live-observation-snapshot-provider.js";
import { parseLiveObservationProviderSnapshot } from "./live-observation-provider-snapshot.js";
import type { LiveObservationStore } from "./live-observation-store.js";
import { LiveObservationV2ServiceError } from "./live-observation-v2-service.js";

export type LiveObservationAwsConnectionEvidence = {
  id: string;
  accountId: string | null;
  roleArn: string | null;
  externalId: string;
  region: string;
  status: string;
};

export function createLiveObservationObserverService(options: {
  store: LiveObservationStore;
  provider: AwsLiveObservationSnapshotProvider;
  createObserverId?: () => string;
}) {
  const observerId = (options.createObserverId ?? randomUUID)();

  return Object.freeze({
    async refresh(input: {
      observationId: string;
      expectedDeploymentId: string;
      connection: LiveObservationAwsConnectionEvidence | null;
    }): Promise<void> {
      const read = await mapStoreOperation(() =>
        options.store.readSession({ observationId: input.observationId })
      );
      if (
        read.kind !== "active" ||
        read.session.deploymentId !== input.expectedDeploymentId
      ) return;

      const claim = await mapStoreOperation(() =>
        options.store.claimObserverLease({
          observationId: input.observationId,
          observerId
        })
      );
      if (claim.kind !== "claimed") return;

      const target = createProviderTarget(read.session.manifest, input.connection);
      let snapshot: LiveObservationProviderSnapshot;
      if (!target) {
        snapshot = unavailableSnapshot(claim.evaluatedAt);
      } else {
        try {
          snapshot = parseLiveObservationProviderSnapshot(
            await options.provider.observe(target, input.observationId)
          );
        } catch {
          snapshot = unavailableSnapshot(claim.evaluatedAt);
        }
      }

      await mapStoreOperation(() =>
        options.store.commitObservation({
          observationId: input.observationId,
          observerId,
          fencingToken: claim.lease.fencingToken,
          observation: {
            observedAt: claim.evaluatedAt,
            payload: snapshot
          }
        })
      );
    }
  });
}

async function mapStoreOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new LiveObservationV2ServiceError("LIVE_OBSERVATION_CACHE_UNAVAILABLE");
  }
}

export function createProviderTarget(
  manifest: DeploymentLiveObservationManifestV2,
  connection: LiveObservationAwsConnectionEvidence | null
): AwsLiveObservationSnapshotTarget | null {
  if ((manifest.adapter.version !== 2 && manifest.adapter.version !== 3) || !connection) {
    return null;
  }
  const loadBalancer = parseAlbArn(manifest.adapter.payload.loadBalancerArn);
  const targetGroup = parseTargetGroupArn(manifest.adapter.payload.targetGroupArn);
  const role = /^arn:(aws|aws-cn|aws-us-gov):iam::([0-9]{12}):role\/[\w+=,.@/-]+$/.exec(
    connection.roleArn ?? ""
  );
  const expectedPartition = partitionForRegion(connection.region);
  if (
    connection.status !== "verified" ||
    connection.id !== manifest.provenance.awsConnectionId ||
    connection.region !== manifest.provenance.region ||
    !connection.accountId ||
    !connection.externalId.trim() ||
    !loadBalancer ||
    !targetGroup ||
    !role ||
    loadBalancer.partition !== expectedPartition ||
    targetGroup.partition !== expectedPartition ||
    role[1] !== expectedPartition ||
    loadBalancer.region !== connection.region ||
    targetGroup.region !== connection.region ||
    loadBalancer.accountId !== connection.accountId ||
    targetGroup.accountId !== connection.accountId ||
    role[2] !== connection.accountId
  ) {
    return null;
  }

  const capacityTarget = manifest.adapter.payload.capacityTarget.kind === "asg"
    ? {
        kind: "asg" as const,
        autoScalingGroupName: manifest.adapter.payload.capacityTarget.autoScalingGroupName
      }
    : {
        kind: "ecs_fargate" as const,
        clusterName: manifest.adapter.payload.capacityTarget.clusterName,
        serviceName: manifest.adapter.payload.capacityTarget.serviceName,
        maxCapacity: manifest.adapter.payload.capacityTarget.maxCapacity
      };

  return {
    awsConnectionId: connection.id,
    roleArn: connection.roleArn!,
    externalId: connection.externalId,
    region: connection.region,
    loadBalancerArnSuffix: loadBalancer.suffix,
    targetGroupArn: manifest.adapter.payload.targetGroupArn,
    targetGroupArnSuffix: targetGroup.suffix,
    logGroupNames: [...(manifest.adapter.payload.logGroupNames ?? [])],
    capacityTarget
  };
}

function parseAlbArn(value: string) {
  const match = /^arn:(aws|aws-cn|aws-us-gov):elasticloadbalancing:([^:]+):([0-9]{12}):loadbalancer\/(app\/[A-Za-z0-9-]+\/[0-9a-f]{16})$/.exec(value);
  return match?.[1] && match[2] && match[3] && match[4]
    ? { partition: match[1], region: match[2], accountId: match[3], suffix: match[4] }
    : null;
}

function parseTargetGroupArn(value: string) {
  const match = /^arn:(aws|aws-cn|aws-us-gov):elasticloadbalancing:([^:]+):([0-9]{12}):(targetgroup\/[A-Za-z0-9-]+\/[0-9a-f]{16})$/.exec(value);
  return match?.[1] && match[2] && match[3] && match[4]
    ? { partition: match[1], region: match[2], accountId: match[3], suffix: match[4] }
    : null;
}

function partitionForRegion(region: string): "aws" | "aws-cn" | "aws-us-gov" {
  if (region.startsWith("cn-")) return "aws-cn";
  if (region.startsWith("us-gov-")) return "aws-us-gov";
  return "aws";
}

function unavailableSnapshot(observedAt: string): LiveObservationProviderSnapshot {
  return {
    requests: null,
    errorRate: null,
    p95LatencyMs: null,
    availability: null,
    capacity: { desired: null, running: null, healthy: null, max: null },
    logs: [],
    observedAt,
    state: "unavailable"
  };
}
