import { randomUUID } from "node:crypto";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand
} from "@aws-sdk/client-auto-scaling";
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { DescribeServicesCommand, ECSClient } from "@aws-sdk/client-ecs";
import {
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client
} from "@aws-sdk/client-elastic-load-balancing-v2";
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
const CACHE_MAX_ENTRIES = 1_000;
const REQUEST_TIMEOUT_MS = 5_000;

type ResponseMetricId =
  | "responses_2xx"
  | "responses_3xx"
  | "responses_4xx"
  | "responses_5xx";
type MetricId = ResponseMetricId | "latency";
type MetricResultStatusCode = "Complete" | "PartialData" | "InternalError" | "Forbidden";
type CloudWatchMetricDataResult = {
  id?: string | undefined;
  statusCode?: MetricResultStatusCode | undefined;
  timestamps?: readonly Date[] | undefined;
  values?: readonly number[] | undefined;
};

const RESPONSE_METRIC_IDS: readonly ResponseMetricId[] = [
  "responses_2xx",
  "responses_3xx",
  "responses_4xx",
  "responses_5xx"
];
const METRIC_IDS: readonly MetricId[] = [...RESPONSE_METRIC_IDS, "latency"];

export type AwsLiveObservationSnapshotTarget = {
  awsConnectionId: string;
  roleArn: string;
  externalId: string;
  region: string;
  loadBalancerArnSuffix: string;
  targetGroupArn: string;
  targetGroupArnSuffix: string;
  logGroupNames: string[];
  capacityTarget:
    | { kind: "asg"; autoScalingGroupName: string }
    | {
        kind: "ecs_fargate";
        clusterName: string;
        serviceName: string;
        maxCapacity: number | null;
      };
};

export type AwsLiveObservationSnapshotProvider = {
  observe(
    target: AwsLiveObservationSnapshotTarget,
    observationId: string
  ): Promise<LiveObservationProviderSnapshot>;
};

type CloudWatchClientPort = {
  getMetricData(input: {
    abortSignal: AbortSignal;
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
    metricDataResults?: ReadonlyArray<CloudWatchMetricDataResult> | undefined;
  }>;
};

type AutoScalingClientPort = {
  describeAutoScalingGroup(name: string, abortSignal: AbortSignal): Promise<{
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
  describeService(
    clusterName: string,
    serviceName: string,
    abortSignal: AbortSignal
  ): Promise<{
    service?: { desiredCount?: number | undefined; runningCount?: number | undefined } | undefined;
  }>;
};

type TargetHealthClientPort = {
  describeTargetHealth(targetGroupArn: string, abortSignal: AbortSignal): Promise<{
    targets?: ReadonlyArray<{
      id?: string | undefined;
      state?: string | undefined;
    }> | undefined;
  }>;
};

type LogsClientPort = {
  filterLogEvents(input: {
    abortSignal: AbortSignal;
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
    target: AwsLiveObservationSnapshotTarget,
    abortSignal: AbortSignal
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
  targetHealthClientFactory?: (input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }) => TargetHealthClientPort;
  logsClientFactory?: (input: {
    region: string;
    credentials: AwsTemporaryCredentials;
  }) => LogsClientPort;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  requestTimeoutMs?: number;
  deadlineScheduler?: {
    schedule(callback: () => void, delayMs: number): { cancel(): void };
  };
  now?: () => number;
};

export function createAwsLiveObservationSnapshotProvider(
  options: AwsLiveObservationSnapshotProviderOptions = {}
): AwsLiveObservationSnapshotProvider {
  const prepareCredentials = options.prepareCredentials ?? prepareDefaultCredentials;
  const cloudWatchClientFactory = options.cloudWatchClientFactory ?? createDefaultCloudWatchClient;
  const autoScalingClientFactory = options.autoScalingClientFactory ?? createDefaultAutoScalingClient;
  const ecsClientFactory = options.ecsClientFactory ?? createDefaultEcsClient;
  const targetHealthClientFactory =
    options.targetHealthClientFactory ?? createDefaultTargetHealthClient;
  const logsClientFactory = options.logsClientFactory ?? createDefaultLogsClient;
  const now = options.now ?? Date.now;
  const cacheTtlMs = positiveIntegerOption(options.cacheTtlMs, CACHE_TTL_MS);
  const cacheMaxEntries = positiveIntegerOption(
    options.cacheMaxEntries,
    CACHE_MAX_ENTRIES
  );
  const requestTimeoutMs = positiveIntegerOption(
    options.requestTimeoutMs,
    REQUEST_TIMEOUT_MS
  );
  const deadlineScheduler = options.deadlineScheduler ?? createDeadlineScheduler();

  const observeFresh = async (
    target: AwsLiveObservationSnapshotTarget,
    evaluatedAtMs: number,
    abortSignal: AbortSignal,
    lastKnownSnapshot: LiveObservationProviderSnapshot | null
  ): Promise<LiveObservationProviderSnapshot> => {
    let credentials: AwsTemporaryCredentials;
    try {
      credentials = await prepareCredentials(target, abortSignal);
    } catch {
      return emptySnapshot("unavailable", new Date(evaluatedAtMs).toISOString());
    }

    const clientInput = { region: target.region, credentials };
    const [metrics, capacity, logs] = await Promise.all([
      observeMetrics(
        cloudWatchClientFactory(clientInput),
        target,
        evaluatedAtMs,
        abortSignal
      ),
      observeCapacity(
        target,
        autoScalingClientFactory(clientInput),
        ecsClientFactory(clientInput),
        targetHealthClientFactory(clientInput),
        abortSignal
      ),
      observeLogs(
        logsClientFactory(clientInput),
        target.logGroupNames,
        evaluatedAtMs,
        abortSignal
      )
    ]);

    if (metrics.state === "delayed") {
      return delayedSnapshot(
        lastKnownSnapshot,
        metrics.observedAt ?? new Date(evaluatedAtMs).toISOString(),
        logs ?? []
      );
    }
    if (metrics.state !== "available" || !capacity || logs === null) {
      return emptySnapshot(
        "unavailable",
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
  type CacheEntry =
    | { state: "pending"; pending: Promise<LiveObservationProviderSnapshot> }
    | {
        state: "settled";
        snapshot: LiveObservationProviderSnapshot;
        settledAtMs: number;
        expiresAtMs: number;
      };
  const cache = new Map<string, CacheEntry>();

  return {
    async observe(target, observationId) {
      const evaluatedAtMs = now();
      const key = createCacheKey(observationId, target);
      let lastKnownSnapshot: LiveObservationProviderSnapshot | null = null;
      const cached = cache.get(key);
      if (cached) {
        if (cached.state === "pending") {
          return parseLiveObservationProviderSnapshot(await cached.pending);
        }
        if (cached.expiresAtMs > evaluatedAtMs) {
          return parseLiveObservationProviderSnapshot(cached.snapshot);
        }
        if (
          cached.snapshot.state === "available" ||
          (cached.snapshot.state === "delayed" && cached.snapshot.requests !== null)
        ) {
          lastKnownSnapshot = cached.snapshot;
        }
        cache.delete(key);
      }

      if (cache.size >= cacheMaxEntries) {
        const settled = [...cache.entries()]
          .filter(
            (entry): entry is [string, Extract<CacheEntry, { state: "settled" }>] =>
              entry[1].state === "settled"
          )
          .sort((left, right) => left[1].settledAtMs - right[1].settledAtMs)[0];
        if (!settled) {
          return emptySnapshot("unavailable", new Date(evaluatedAtMs).toISOString());
        }
        cache.delete(settled[0]);
      }

      const abortController = new AbortController();
      const deadline = deadlineScheduler.schedule(
        () => abortController.abort(),
        requestTimeoutMs
      );
      const pending = observeFresh(
        target,
        evaluatedAtMs,
        abortController.signal,
        lastKnownSnapshot
      )
        .catch(() => emptySnapshot("unavailable", new Date(evaluatedAtMs).toISOString()))
        .then((snapshot) => {
          const parsed = parseLiveObservationProviderSnapshot(snapshot);
          const settledAtMs = now();
          const current = cache.get(key);
          if (current?.state === "pending" && current.pending === pending) {
            cache.set(key, {
              state: "settled",
              snapshot: parsed,
              settledAtMs,
              expiresAtMs: settledAtMs + cacheTtlMs
            });
          }
          return parsed;
        })
        .finally(() => deadline.cancel());
      const pendingEntry: Extract<CacheEntry, { state: "pending" }> = {
        state: "pending",
        pending
      };
      cache.set(key, pendingEntry);
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
        target.capacityTarget.maxCapacity ?? "fixed"
      ].join(":");
  return [
    observationId,
    target.awsConnectionId,
    target.region,
    target.loadBalancerArnSuffix,
    target.targetGroupArn,
    target.targetGroupArnSuffix,
    capacity,
    ...target.logGroupNames
  ].join("|");
}

function positiveIntegerOption(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function createDeadlineScheduler(): NonNullable<
  AwsLiveObservationSnapshotProviderOptions["deadlineScheduler"]
> {
  return {
    schedule(callback, delayMs) {
      const timeout = setTimeout(callback, delayMs);
      timeout.unref();
      return { cancel: () => clearTimeout(timeout) };
    }
  };
}

async function observeMetrics(
  client: CloudWatchClientPort,
  target: AwsLiveObservationSnapshotTarget,
  evaluatedAtMs: number,
  abortSignal: AbortSignal
): Promise<
  | { state: "available"; requests: number; errors: number; latencySeconds: number; observedAt: string }
  | { state: "delayed" | "unavailable"; observedAt: string | null }
> {
  try {
    const response = await client.getMetricData({
      abortSignal,
      namespace: "AWS/ApplicationELB",
      loadBalancerArnSuffix: target.loadBalancerArnSuffix,
      targetGroupArnSuffix: target.targetGroupArnSuffix,
      periodSeconds: PERIOD_SECONDS,
      startTime: new Date(evaluatedAtMs - LOOKBACK_MS),
      endTime: new Date(evaluatedAtMs),
      metrics: [
        {
          id: "responses_2xx",
          metricName: "HTTPCode_Target_2XX_Count",
          stat: "Sum",
          scope: "target_group"
        },
        {
          id: "responses_3xx",
          metricName: "HTTPCode_Target_3XX_Count",
          stat: "Sum",
          scope: "target_group"
        },
        {
          id: "responses_4xx",
          metricName: "HTTPCode_Target_4XX_Count",
          stat: "Sum",
          scope: "target_group"
        },
        {
          id: "responses_5xx",
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
    const results = new Map<MetricId, CloudWatchMetricDataResult>();
    for (const id of METRIC_IDS) {
      const candidates = response.metricDataResults?.filter((result) => result.id === id) ?? [];
      if (candidates.length !== 1 || candidates[0]?.statusCode !== "Complete") {
        return { state: "unavailable", observedAt: null };
      }
      results.set(id, candidates[0]);
    }

    const latency = latestCompletedPoint(
      results.get("latency"),
      evaluatedAtMs
    );
    if (!latency) {
      return { state: "unavailable", observedAt: null };
    }

    const periodStartMs = latency.timestamp.getTime();
    const responsePoints = Object.fromEntries(
      RESPONSE_METRIC_IDS.map((id) => [
        id,
        completedPointAt(
          results.get(id),
          periodStartMs,
          evaluatedAtMs
        )
      ])
    ) as Record<ResponseMetricId, { timestamp: Date; value: number } | null>;
    if (!RESPONSE_METRIC_IDS.some((id) => responsePoints[id] !== null)) {
      return { state: "unavailable", observedAt: null };
    }

    const requests = RESPONSE_METRIC_IDS.reduce(
      (total, id) => total + (responsePoints[id]?.value ?? 0),
      0
    );
    const errors = responsePoints.responses_5xx?.value ?? 0;
    if (!Number.isFinite(requests) || errors > requests) {
      return { state: "unavailable", observedAt: null };
    }

    const observedAtMs = periodStartMs + PERIOD_SECONDS * 1_000;
    if (evaluatedAtMs - observedAtMs > PERIOD_SECONDS * 1_000) {
      return { state: "delayed", observedAt: new Date(observedAtMs).toISOString() };
    }
    return {
      state: "available",
      requests,
      errors,
      latencySeconds: latency.value,
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
  return completedPoints(result, evaluatedAtMs)
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0] ?? null;
}

function completedPoints(
  result: {
    timestamps?: readonly Date[] | undefined;
    values?: readonly number[] | undefined;
  } | undefined,
  evaluatedAtMs: number
): Array<{ timestamp: Date; value: number }> {
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
    );
}

function completedPointAt(
  result: {
    timestamps?: readonly Date[] | undefined;
    values?: readonly number[] | undefined;
  } | undefined,
  periodStartMs: number,
  evaluatedAtMs: number
): { timestamp: Date; value: number } | null {
  const points = completedPoints(result, evaluatedAtMs).filter(
    (point) => point.timestamp.getTime() === periodStartMs
  );
  return points.length === 1 ? points[0]! : null;
}

async function observeCapacity(
  target: AwsLiveObservationSnapshotTarget,
  autoScaling: AutoScalingClientPort,
  ecs: EcsClientPort,
  targetHealth: TargetHealthClientPort,
  abortSignal: AbortSignal
): Promise<LiveObservationProviderSnapshot["capacity"] | null> {
  try {
    const health = await targetHealth.describeTargetHealth(
      target.targetGroupArn,
      abortSignal
    );
    const healthyTargetIds = new Set(
      (health.targets ?? [])
        .filter(
          (candidate): candidate is typeof candidate & { id: string } =>
            candidate.state === "healthy" &&
            typeof candidate.id === "string" &&
            candidate.id.length > 0
        )
        .map((candidate) => candidate.id)
    );
    if (target.capacityTarget.kind === "ecs_fargate") {
      const response = await ecs.describeService(
        target.capacityTarget.clusterName,
        target.capacityTarget.serviceName,
        abortSignal
      );
      const desired = response.service?.desiredCount;
      const running = response.service?.runningCount;
      if (!isCount(desired) || !isCount(running)) return null;
      return {
        desired,
        running,
        healthy: Math.min(running, healthyTargetIds.size),
        max: target.capacityTarget.maxCapacity
      };
    }

    const asgName = target.capacityTarget.autoScalingGroupName;
    const response = await autoScaling.describeAutoScalingGroup(asgName, abortSignal);
    const group = response.autoScalingGroups?.find(
      (candidate) => candidate.autoScalingGroupName === asgName
    );
    if (!group || !isCount(group.desiredCapacity) || !isCount(group.maxSize)) return null;
    const runningInstanceIds = (group.instances ?? [])
      .filter(
        (instance): instance is typeof instance & { instanceId: string } =>
          instance.lifecycleState === "InService" && Boolean(instance.instanceId)
      )
      .map((instance) => instance.instanceId);
    const running = runningInstanceIds.length;
    const healthy = runningInstanceIds.filter((id) => healthyTargetIds.has(id)).length;
    return { desired: group.desiredCapacity, running, healthy, max: group.maxSize };
  } catch {
    return null;
  }
}

async function observeLogs(
  client: LogsClientPort,
  logGroupNames: readonly string[],
  evaluatedAtMs: number,
  abortSignal: AbortSignal
): Promise<LiveObservationProviderSnapshot["logs"] | null> {
  try {
    const results = await Promise.all(
      logGroupNames.map((logGroupName) =>
        client.filterLogEvents({
          abortSignal,
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

function delayedSnapshot(
  lastKnownSnapshot: LiveObservationProviderSnapshot | null,
  observedAt: string,
  logs: LiveObservationProviderSnapshot["logs"]
): LiveObservationProviderSnapshot {
  if (!lastKnownSnapshot || lastKnownSnapshot.requests === null) {
    return emptySnapshot("delayed", observedAt, logs);
  }
  return parseLiveObservationProviderSnapshot({
    requests: lastKnownSnapshot.requests,
    errorRate: lastKnownSnapshot.errorRate,
    p95LatencyMs: lastKnownSnapshot.p95LatencyMs,
    availability: lastKnownSnapshot.availability,
    capacity: { ...lastKnownSnapshot.capacity },
    logs,
    observedAt,
    state: "delayed"
  });
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
  target: AwsLiveObservationSnapshotTarget,
  abortSignal: AbortSignal
): Promise<AwsTemporaryCredentials> {
  return createAwsSdkStsGateway().assumeRole({
    roleArn: target.roleArn,
    externalId: target.externalId,
    region: target.region,
    roleSessionName: `sketchcatch-live-observation-${randomUUID()}`,
    abortSignal
  });
}

function createDefaultCloudWatchClient(input: {
  region: string;
  credentials: AwsTemporaryCredentials;
}): CloudWatchClientPort {
  const client = new CloudWatchClient(input);
  return {
    async getMetricData(metricInput) {
      const response = await client.send(
        new GetMetricDataCommand({
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
        }),
        { abortSignal: metricInput.abortSignal }
      );
      return {
        metricDataResults: response.MetricDataResults?.map((result) => ({
          id: result.Id,
          statusCode: result.StatusCode,
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
    async describeAutoScalingGroup(name, abortSignal) {
      const response = await client.send(
        new DescribeAutoScalingGroupsCommand({
          AutoScalingGroupNames: [name]
        }),
        { abortSignal }
      );
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
    async describeService(clusterName, serviceName, abortSignal) {
      const response = await client.send(
        new DescribeServicesCommand({
          cluster: clusterName,
          services: [serviceName]
        }),
        { abortSignal }
      );
      const service = response.services?.[0];
      return { service: service ? {
        desiredCount: service.desiredCount,
        runningCount: service.runningCount
      } : undefined };
    }
  };
}

function createDefaultTargetHealthClient(input: {
  region: string;
  credentials: AwsTemporaryCredentials;
}): TargetHealthClientPort {
  const client = new ElasticLoadBalancingV2Client(input);
  return {
    async describeTargetHealth(targetGroupArn, abortSignal) {
      const response = await client.send(
        new DescribeTargetHealthCommand({
          TargetGroupArn: targetGroupArn
        }),
        { abortSignal }
      );
      return {
        targets: response.TargetHealthDescriptions?.map((description) => ({
          id: description.Target?.Id,
          state: description.TargetHealth?.State
        }))
      };
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
      const response = await client.send(
        new FilterLogEventsCommand({
          logGroupName: logInput.logGroupName,
          startTime: logInput.startTime,
          endTime: logInput.endTime,
          limit: logInput.limit,
          interleaved: true
        }),
        { abortSignal: logInput.abortSignal }
      );
      return { events: response.events?.map((event) => ({
        timestamp: event.timestamp,
        message: event.message
      })) };
    }
  };
}
