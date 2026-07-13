import { randomUUID } from "node:crypto";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand
} from "@aws-sdk/client-auto-scaling";
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { DescribeServicesCommand, ECSClient } from "@aws-sdk/client-ecs";
import type { LiveObservationProviderSnapshot } from "@sketchcatch/types";
import {
  createAwsSdkStsGateway,
  type AwsTemporaryCredentials
} from "../aws-connections/aws-connection-test-service.js";
import { maskDeploymentMessage } from "../deployments/log-masking.js";
import { parseLiveObservationProviderSnapshot } from "./live-observation-provider-snapshot.js";

const PERIOD_SECONDS = 60;
const LOOKBACK_MS = 5 * 60 * 1_000;
const MAX_LOG_ENTRIES = 50;
const CACHE_TTL_MS = 10_000;

type MetricId = "requests" | "errors" | "latency";

export type AwsLiveObservationSnapshotTarget = {
  awsConnectionId: string;
  roleArn: string;
  externalId: string;
  region: string;
  loadBalancerArnSuffix: string;
  targetGroupArnSuffix: string;
  logGroupNames: string[];
  capacityTarget:
    | { kind: "asg"; autoScalingGroupName: string }
    | { kind: "ecs_fargate"; clusterName: string; serviceName: string; maxCapacity: number };
};

export type AwsLiveObservationSnapshotProvider = {
  observe(
    target: AwsLiveObservationSnapshotTarget,
    observationId: string
  ): Promise<LiveObservationProviderSnapshot>;
};

type CloudWatchClientPort = {
  getMetricData(input: {
    namespace: "AWS/ApplicationELB";
    loadBalancerArnSuffix: string;
    targetGroupArnSuffix: string;
    periodSeconds: 60;
    startTime: Date;
    endTime: Date;
    metrics: Array<{
      id: MetricId;
      metricName: string;
      stat: "Sum" | "p95";
      scope: "load_balancer" | "target_group";
    }>;
  }): Promise<{
    metricDataResults?: ReadonlyArray<{
      id?: string | undefined;
      timestamps?: readonly Date[] | undefined;
      values?: readonly number[] | undefined;
    }> | undefined;
  }>;
};

type AutoScalingClientPort = {
  describeAutoScalingGroup(name: string): Promise<{
    autoScalingGroups?: ReadonlyArray<{
      autoScalingGroupName?: string | undefined;
      desiredCapacity?: number | undefined;
      maxSize?: number | undefined;
      instances?: ReadonlyArray<{
        instanceId?: string | undefined;
        lifecycleState?: string | undefined;
        healthStatus?: string | undefined;
      }> | undefined;
    }> | undefined;
  }>;
};

type EcsClientPort = {
  describeService(clusterName: string, serviceName: string): Promise<{
    service?: { desiredCount?: number | undefined; runningCount?: number | undefined } | undefined;
  }>;
};

type LogsClientPort = {
  filterLogEvents(input: {
    logGroupName: string;
    startTime: number;
    endTime: number;
    limit: 50;
  }): Promise<{
    events?: ReadonlyArray<{
      timestamp?: number | undefined;
      message?: string | undefined;
    }> | undefined;
  }>;
};

export type AwsLiveObservationSnapshotProviderOptions = {
  prepareCredentials?: (
    target: AwsLiveObservationSnapshotTarget
  ) => Promise<AwsTemporaryCredentials>;
  cloudWatchClientFactory?: (input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }) => CloudWatchClientPort;
  autoScalingClientFactory?: (input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }) => AutoScalingClientPort;
  ecsClientFactory?: (input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }) => EcsClientPort;
  logsClientFactory?: (input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }) => LogsClientPort;
  now?: () => number;
};

export function createAwsLiveObservationSnapshotProvider(
  options: AwsLiveObservationSnapshotProviderOptions = {}
): AwsLiveObservationSnapshotProvider {
  const prepareCredentials = options.prepareCredentials ?? prepareDefaultCredentials;
  const cloudWatchClientFactory = options.cloudWatchClientFactory ?? createDefaultCloudWatchClient;
  const autoScalingClientFactory = options.autoScalingClientFactory ?? createDefaultAutoScalingClient;
  const ecsClientFactory = options.ecsClientFactory ?? createDefaultEcsClient;
  const logsClientFactory = options.logsClientFactory ?? createDefaultLogsClient;
  const now = options.now ?? Date.now;

  const observeFresh = async (
    target: AwsLiveObservationSnapshotTarget,
    evaluatedAtMs: number
  ): Promise<LiveObservationProviderSnapshot> => {
    let credentials: AwsTemporaryCredentials;
    try {
      credentials = await prepareCredentials(target);
    } catch {
      return emptySnapshot("unavailable", new Date(evaluatedAtMs).toISOString());
    }

    const clientInput = { region: target.region, credentials };
    const [metrics, capacity, logs] = await Promise.all([
      observeMetrics(cloudWatchClientFactory(clientInput), target, evaluatedAtMs),
      observeCapacity(
        target,
        autoScalingClientFactory(clientInput),
        ecsClientFactory(clientInput)
      ),
      observeLogs(logsClientFactory(clientInput), target.logGroupNames, evaluatedAtMs)
    ]);

    if (metrics.state !== "available" || !capacity || logs === null) {
      const state = metrics.state === "delayed" ? "delayed" : "unavailable";
      return emptySnapshot(
        state,
        metrics.observedAt ?? new Date(evaluatedAtMs).toISOString(),
        logs ?? []
      );
    }

    const errorRate = metrics.requests === 0
      ? 0
      : roundPercent((metrics.errors / metrics.requests) * 100);
    return parseLiveObservationProviderSnapshot({
      requests: metrics.requests,
      errorRate,
      p95LatencyMs: Math.round(metrics.latencySeconds * 1_000 * 1_000) / 1_000,
      availability: roundPercent(100 - errorRate),
      capacity,
      logs,
      observedAt: metrics.observedAt,
      state: "available"
    });
  };
  const cache = new Map<
    string,
    { expiresAtMs: number; pending: Promise<LiveObservationProviderSnapshot> }
  >();

  return {
    async observe(target, observationId) {
      const evaluatedAtMs = now();
      for (const [key, entry] of cache) {
        if (entry.expiresAtMs <= evaluatedAtMs) cache.delete(key);
      }
      const key = createCacheKey(observationId, target);
      const cached = cache.get(key);
      if (cached) {
        return parseLiveObservationProviderSnapshot(await cached.pending);
      }
      const pending = observeFresh(target, evaluatedAtMs);
      cache.set(key, { expiresAtMs: evaluatedAtMs + CACHE_TTL_MS, pending });
      return parseLiveObservationProviderSnapshot(await pending);
    }
  };
}

function createCacheKey(
  observationId: string,
  target: AwsLiveObservationSnapshotTarget
): string {
  const capacity = target.capacityTarget.kind === "asg"
    ? `asg:${target.capacityTarget.autoScalingGroupName}`
    : [
        "ecs",
        target.capacityTarget.clusterName,
        target.capacityTarget.serviceName,
        target.capacityTarget.maxCapacity
      ].join(":");
  return [
    observationId,
    target.awsConnectionId,
    target.region,
    target.loadBalancerArnSuffix,
    target.targetGroupArnSuffix,
    capacity,
    ...target.logGroupNames
  ].join("|");
}

async function observeMetrics(
  client: CloudWatchClientPort,
  target: AwsLiveObservationSnapshotTarget,
  evaluatedAtMs: number
): Promise<
  | { state: "available"; requests: number; errors: number; latencySeconds: number; observedAt: string }
  | { state: "delayed" | "unavailable"; observedAt: string | null }
> {
  try {
    const response = await client.getMetricData({
      namespace: "AWS/ApplicationELB",
      loadBalancerArnSuffix: target.loadBalancerArnSuffix,
      targetGroupArnSuffix: target.targetGroupArnSuffix,
      periodSeconds: PERIOD_SECONDS,
      startTime: new Date(evaluatedAtMs - LOOKBACK_MS),
      endTime: new Date(evaluatedAtMs),
      metrics: [
        { id: "requests", metricName: "RequestCount", stat: "Sum", scope: "load_balancer" },
        {
          id: "errors",
          metricName: "HTTPCode_Target_5XX_Count",
          stat: "Sum",
          scope: "target_group"
        },
        {
          id: "latency",
          metricName: "TargetResponseTime",
          stat: "p95",
          scope: "target_group"
        }
      ]
    });
    const points = Object.fromEntries(
      (["requests", "errors", "latency"] as const).map((id) => [
        id,
        latestCompletedPoint(response.metricDataResults?.find((result) => result.id === id), evaluatedAtMs)
      ])
    ) as Record<MetricId, { timestamp: Date; value: number } | null>;
    if (!points.requests || !points.errors || !points.latency) {
      return { state: "unavailable", observedAt: null };
    }
    const observedAtMs = Math.min(
      points.requests.timestamp.getTime(),
      points.errors.timestamp.getTime(),
      points.latency.timestamp.getTime()
    );
    if (evaluatedAtMs - observedAtMs > PERIOD_SECONDS * 1_000) {
      return { state: "delayed", observedAt: new Date(observedAtMs).toISOString() };
    }
    return {
      state: "available",
      requests: points.requests.value,
      errors: points.errors.value,
      latencySeconds: points.latency.value,
      observedAt: new Date(observedAtMs).toISOString()
    };
  } catch {
    return { state: "unavailable", observedAt: null };
  }
}

function latestCompletedPoint(
  result: {
    timestamps?: readonly Date[] | undefined;
    values?: readonly number[] | undefined;
  } | undefined,
  evaluatedAtMs: number
): { timestamp: Date; value: number } | null {
  return (result?.timestamps ?? [])
    .map((timestamp, index) => ({ timestamp, value: result?.values?.[index] }))
    .filter(
      (point): point is { timestamp: Date; value: number } =>
        point.timestamp instanceof Date &&
        Number.isFinite(point.timestamp.getTime()) &&
        typeof point.value === "number" &&
        Number.isFinite(point.value) &&
        point.value >= 0 &&
        point.timestamp.getTime() + PERIOD_SECONDS * 1_000 <= evaluatedAtMs
    )
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0] ?? null;
}

async function observeCapacity(
  target: AwsLiveObservationSnapshotTarget,
  autoScaling: AutoScalingClientPort,
  ecs: EcsClientPort
): Promise<LiveObservationProviderSnapshot["capacity"] | null> {
  try {
    if (target.capacityTarget.kind === "ecs_fargate") {
      const response = await ecs.describeService(
        target.capacityTarget.clusterName,
        target.capacityTarget.serviceName
      );
      const desired = response.service?.desiredCount;
      const running = response.service?.runningCount;
      if (!isCount(desired) || !isCount(running)) return null;
      return { desired, running, healthy: running, max: target.capacityTarget.maxCapacity };
    }

    const asgName = target.capacityTarget.autoScalingGroupName;
    const response = await autoScaling.describeAutoScalingGroup(asgName);
    const group = response.autoScalingGroups?.find(
      (candidate) => candidate.autoScalingGroupName === asgName
    );
    if (!group || !isCount(group.desiredCapacity) || !isCount(group.maxSize)) return null;
    const instances = group.instances ?? [];
    const running = instances.filter((instance) => Boolean(instance.instanceId)).length;
    const healthy = instances.filter(
      (instance) => instance.lifecycleState === "InService" && instance.healthStatus === "Healthy"
    ).length;
    return { desired: group.desiredCapacity, running, healthy, max: group.maxSize };
  } catch {
    return null;
  }
}

async function observeLogs(
  client: LogsClientPort,
  logGroupNames: readonly string[],
  evaluatedAtMs: number
): Promise<LiveObservationProviderSnapshot["logs"] | null> {
  try {
    const results = await Promise.all(
      logGroupNames.map((logGroupName) =>
        client.filterLogEvents({
          logGroupName,
          startTime: evaluatedAtMs - LOOKBACK_MS,
          endTime: evaluatedAtMs,
          limit: MAX_LOG_ENTRIES
        })
      )
    );
    return results
      .flatMap((result) => result.events ?? [])
      .filter(
        (event): event is { timestamp: number; message: string } =>
          Number.isSafeInteger(event.timestamp) &&
          (event.timestamp as number) <= evaluatedAtMs &&
          (event.timestamp as number) >= evaluatedAtMs - LOOKBACK_MS &&
          typeof event.message === "string" &&
          event.message.length > 0
      )
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, MAX_LOG_ENTRIES)
      .map((event) => ({
        timestamp: new Date(event.timestamp).toISOString(),
        message: maskDeploymentMessage(event.message).slice(0, 4_096)
      }));
  } catch {
    return null;
  }
}

function emptySnapshot(
  state: "delayed" | "unavailable",
  observedAt: string,
  logs: LiveObservationProviderSnapshot["logs"] = []
): LiveObservationProviderSnapshot {
  return parseLiveObservationProviderSnapshot({
    requests: null,
    errorRate: null,
    p95LatencyMs: null,
    availability: null,
    capacity: { desired: null, running: null, healthy: null, max: null },
    logs,
    observedAt,
    state
  });
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function roundPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 1_000) / 1_000;
}

async function prepareDefaultCredentials(
  target: AwsLiveObservationSnapshotTarget
): Promise<AwsTemporaryCredentials> {
  return createAwsSdkStsGateway().assumeRole({
    roleArn: target.roleArn,
    externalId: target.externalId,
    region: target.region,
    roleSessionName: `sketchcatch-live-observation-${randomUUID()}`
  });
}

function createDefaultCloudWatchClient(input: {
  region: string;
  credentials: AwsTemporaryCredentials;
}): CloudWatchClientPort {
  const client = new CloudWatchClient(input);
  return {
    async getMetricData(metricInput) {
      const response = await client.send(new GetMetricDataCommand({
        StartTime: metricInput.startTime,
        EndTime: metricInput.endTime,
        ScanBy: "TimestampDescending",
        MetricDataQueries: metricInput.metrics.map((metric) => ({
          Id: metric.id,
          ReturnData: true,
          MetricStat: {
            Metric: {
              Namespace: metricInput.namespace,
              MetricName: metric.metricName,
              Dimensions: [
                { Name: "LoadBalancer", Value: metricInput.loadBalancerArnSuffix },
                ...(metric.scope === "target_group"
                  ? [{ Name: "TargetGroup", Value: metricInput.targetGroupArnSuffix }]
                  : [])
              ]
            },
            Period: metricInput.periodSeconds,
            Stat: metric.stat
          }
        }))
      }));
      return {
        metricDataResults: response.MetricDataResults?.map((result) => ({
          id: result.Id,
          timestamps: result.Timestamps,
          values: result.Values
        }))
      };
    }
  };
}

function createDefaultAutoScalingClient(input: {
  region: string;
  credentials: AwsTemporaryCredentials;
}): AutoScalingClientPort {
  const client = new AutoScalingClient(input);
  return {
    async describeAutoScalingGroup(name) {
      const response = await client.send(new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [name]
      }));
      return { autoScalingGroups: response.AutoScalingGroups?.map((group) => ({
        autoScalingGroupName: group.AutoScalingGroupName,
        desiredCapacity: group.DesiredCapacity,
        maxSize: group.MaxSize,
        instances: group.Instances?.map((instance) => ({
          instanceId: instance.InstanceId,
          lifecycleState: instance.LifecycleState,
          healthStatus: instance.HealthStatus
        }))
      })) };
    }
  };
}

function createDefaultEcsClient(input: {
  region: string;
  credentials: AwsTemporaryCredentials;
}): EcsClientPort {
  const client = new ECSClient(input);
  return {
    async describeService(clusterName, serviceName) {
      const response = await client.send(new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName]
      }));
      const service = response.services?.[0];
      return { service: service ? {
        desiredCount: service.desiredCount,
        runningCount: service.runningCount
      } : undefined };
    }
  };
}

function createDefaultLogsClient(input: {
  region: string;
  credentials: AwsTemporaryCredentials;
}): LogsClientPort {
  const client = new CloudWatchLogsClient(input);
  return {
    async filterLogEvents(logInput) {
      const response = await client.send(new FilterLogEventsCommand({
        logGroupName: logInput.logGroupName,
        startTime: logInput.startTime,
        endTime: logInput.endTime,
        limit: logInput.limit,
        interleaved: true
      }));
      return { events: response.events?.map((event) => ({
        timestamp: event.timestamp,
        message: event.message
      })) };
    }
  };
}
