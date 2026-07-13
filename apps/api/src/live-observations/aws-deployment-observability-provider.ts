import { randomUUID } from "node:crypto";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  DescribeScalingActivitiesCommand
} from "@aws-sdk/client-auto-scaling";
import {
  CloudWatchClient,
  GetMetricDataCommand
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeServicesCommand,
  ECSClient
} from "@aws-sdk/client-ecs";
import {
  createAwsSdkStsGateway,
  type AwsTemporaryCredentials
} from "../aws-connections/aws-connection-test-service.js";
import type {
  DeploymentObservation,
  DeploymentObservabilityProvider,
  DeploymentObservabilityTarget
} from "./deployment-observability-provider.js";

const CLOUDWATCH_PERIOD_SECONDS = 60;
const CLOUDWATCH_LOOKBACK_MS = 5 * 60 * 1_000;

export type CloudWatchObservabilityClient = {
  getMetricData(input: {
    readonly namespace: "AWS/ApplicationELB";
    readonly metricName: "RequestCountPerTarget";
    readonly loadBalancerArnSuffix: string;
    readonly targetGroupArnSuffix: string;
    readonly periodSeconds: 60;
    readonly stat: "Sum";
    readonly startTime: Date;
    readonly endTime: Date;
  }): Promise<{
    readonly metricDataResults?: ReadonlyArray<{
      readonly timestamps?: readonly Date[] | undefined;
      readonly values?: readonly number[] | undefined;
    }> | undefined;
  }>;
};

export type AutoScalingObservabilityClient = {
  describeAutoScalingGroup(asgName: string): Promise<{
    readonly autoScalingGroups?: ReadonlyArray<{
      readonly autoScalingGroupName?: string | undefined;
      readonly desiredCapacity?: number | undefined;
      readonly maxSize?: number | undefined;
      readonly instances?: ReadonlyArray<{
        readonly instanceId?: string | undefined;
        readonly lifecycleState?: string | undefined;
        readonly healthStatus?: string | undefined;
      }> | undefined;
    }> | undefined;
  }>;
  describeScalingActivities(asgName: string): Promise<{
    readonly activities?: ReadonlyArray<{
      readonly statusCode?: string | undefined;
      readonly description?: string | undefined;
      readonly startTime?: Date | undefined;
      readonly endTime?: Date | null | undefined;
    }> | undefined;
  }>;
};

export type EcsObservabilityClient = {
  describeService(clusterName: string, serviceName: string): Promise<{
    readonly service?: {
      readonly desiredCount?: number | undefined;
      readonly runningCount?: number | undefined;
      readonly pendingCount?: number | undefined;
      readonly events?: ReadonlyArray<{
        readonly createdAt?: Date | undefined;
        readonly message?: string | undefined;
      }> | undefined;
    } | undefined;
  }>;
};

export type AwsDeploymentObservabilityProviderOptions = {
  readonly prepareCredentials?: (
    target: DeploymentObservabilityTarget
  ) => Promise<AwsTemporaryCredentials>;
  readonly cloudWatchClientFactory?: (input: {
    readonly region: string;
    readonly credentials: AwsTemporaryCredentials;
  }) => CloudWatchObservabilityClient;
  readonly autoScalingClientFactory?: (input: {
    readonly region: string;
    readonly credentials: AwsTemporaryCredentials;
  }) => AutoScalingObservabilityClient;
  readonly ecsClientFactory?: (input: {
    readonly region: string;
    readonly credentials: AwsTemporaryCredentials;
  }) => EcsObservabilityClient;
  readonly now?: (() => number) | undefined;
};

export function createAwsDeploymentObservabilityProvider(
  options: AwsDeploymentObservabilityProviderOptions = {}
): DeploymentObservabilityProvider {
  const prepareCredentials = options.prepareCredentials ?? prepareDefaultCredentials;
  const cloudWatchClientFactory =
    options.cloudWatchClientFactory ?? createDefaultCloudWatchClient;
  const autoScalingClientFactory =
    options.autoScalingClientFactory ?? createDefaultAutoScalingClient;
  const ecsClientFactory = options.ecsClientFactory ?? createDefaultEcsClient;
  const now = options.now ?? Date.now;

  return {
    async observe(target): Promise<DeploymentObservation> {
      let credentials: AwsTemporaryCredentials;

      try {
        credentials = await prepareCredentials(target);
      } catch {
        return {
          cloudWatch: createUnavailableCloudWatch("AWS_CREDENTIALS_UNAVAILABLE"),
          capacity: createUnavailableCapacity("AWS_CREDENTIALS_UNAVAILABLE")
        };
      }

      const clientInput = {
        region: target.region,
        credentials
      };
      const cloudWatchClient = cloudWatchClientFactory(clientInput);
      const currentTimeMs = now();
      const capacityPromise = target.capacityTarget.kind === "ecs_service"
        ? observeEcsService(
            ecsClientFactory(clientInput),
            target.capacityTarget.clusterName,
            target.capacityTarget.serviceName,
            target.capacityTarget.maxCapacity,
            currentTimeMs
          )
        : observeAutoScaling(
            autoScalingClientFactory(clientInput),
            target.capacityTarget.asgName,
            currentTimeMs
          );
      const [cloudWatch, capacity] = await Promise.all([
        observeCloudWatch(cloudWatchClient, target, currentTimeMs),
        capacityPromise
      ]);

      return { cloudWatch, capacity };
    }
  };
}

async function observeEcsService(
  client: EcsObservabilityClient,
  clusterName: string,
  serviceName: string,
  maxCapacity: number,
  currentTimeMs: number
): Promise<DeploymentObservation["capacity"]> {
  try {
    const result = await client.describeService(clusterName, serviceName);
    const service = result.service;

    if (!service) {
      return createUnavailableCapacity("ECS_SERVICE_NOT_FOUND");
    }

    const runningCount = Math.max(0, service.runningCount ?? 0);
    const pendingCount = Math.max(0, service.pendingCount ?? 0);
    const instances = [
      ...Array.from({ length: runningCount }, (_, index) => ({
        healthStatus: "Healthy",
        instanceId: `task/${serviceName}/${index + 1}`,
        lifecycleState: "RUNNING"
      })),
      ...Array.from({ length: pendingCount }, (_, index) => ({
        healthStatus: "Pending",
        instanceId: `task/${serviceName}/pending-${index + 1}`,
        lifecycleState: "PROVISIONING"
      }))
    ];
    const latestEvent = [...(service.events ?? [])]
      .filter(
        (event): event is typeof event & { createdAt: Date } =>
          event.createdAt instanceof Date && Number.isFinite(event.createdAt.getTime())
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

    return {
      state: "available",
      desiredCapacity: service.desiredCount ?? null,
      currentInstanceCount: runningCount + pendingCount,
      inServiceInstanceCount: runningCount,
      maxCapacity,
      instances,
      latestActivity: latestEvent
        ? {
            statusCode: pendingCount > 0 ? "InProgress" : "Successful",
            description: latestEvent.message ?? "ECS Service activity",
            startedAt: latestEvent.createdAt.toISOString(),
            endedAt: null
          }
        : null,
      observedAt: new Date(currentTimeMs).toISOString(),
      errorCode: null
    };
  } catch {
    return createUnavailableCapacity("ECS_SERVICE_UNAVAILABLE");
  }
}

async function observeCloudWatch(
  client: CloudWatchObservabilityClient,
  target: DeploymentObservabilityTarget,
  currentTimeMs: number
): Promise<DeploymentObservation["cloudWatch"]> {
  try {
    const result = await client.getMetricData({
      namespace: "AWS/ApplicationELB",
      metricName: "RequestCountPerTarget",
      loadBalancerArnSuffix: target.albArnSuffix,
      targetGroupArnSuffix: target.targetGroupArnSuffix,
      periodSeconds: CLOUDWATCH_PERIOD_SECONDS,
      stat: "Sum",
      startTime: new Date(currentTimeMs - CLOUDWATCH_LOOKBACK_MS),
      endTime: new Date(currentTimeMs)
    });
    const latestPoint = selectLatestCompletedMetricPoint(
      result.metricDataResults?.[0],
      currentTimeMs
    );

    if (!latestPoint) {
      return createUnavailableCloudWatch("CLOUDWATCH_DATAPOINT_MISSING");
    }

    const delayedBySeconds = Math.max(
      0,
      Math.floor((currentTimeMs - latestPoint.timestamp.getTime()) / 1_000)
    );

    return {
      state: delayedBySeconds > CLOUDWATCH_PERIOD_SECONDS ? "delayed" : "available",
      requestCountPerTarget: latestPoint.value,
      periodSeconds: CLOUDWATCH_PERIOD_SECONDS,
      observedAt: latestPoint.timestamp.toISOString(),
      delayedBySeconds,
      errorCode: null
    };
  } catch {
    return createUnavailableCloudWatch("CLOUDWATCH_UNAVAILABLE");
  }
}

async function observeAutoScaling(
  client: AutoScalingObservabilityClient,
  asgName: string,
  currentTimeMs: number
): Promise<DeploymentObservation["capacity"]> {
  try {
    const [groupResult, activityResult] = await Promise.all([
      client.describeAutoScalingGroup(asgName),
      client.describeScalingActivities(asgName)
    ]);
    const group = groupResult.autoScalingGroups?.find(
      (candidate) => candidate.autoScalingGroupName === asgName
    );

    if (!group) {
      return createUnavailableCapacity("ASG_NOT_FOUND");
    }

    const instances = (group.instances ?? [])
      .filter(
        (instance): instance is {
          instanceId: string;
          lifecycleState?: string;
          healthStatus?: string;
        } => typeof instance.instanceId === "string" && instance.instanceId.length > 0
      )
      .map((instance) => ({
        instanceId: instance.instanceId,
        lifecycleState: instance.lifecycleState ?? "Unknown",
        healthStatus: instance.healthStatus ?? "Unknown"
      }));
    const latestActivity = selectLatestActivity(activityResult.activities);

    return {
      state: "available",
      desiredCapacity: group.desiredCapacity ?? null,
      currentInstanceCount: instances.length,
      inServiceInstanceCount: instances.filter(
        (instance) => instance.lifecycleState === "InService"
      ).length,
      maxCapacity: group.maxSize ?? null,
      instances,
      latestActivity,
      observedAt: new Date(currentTimeMs).toISOString(),
      errorCode: null
    };
  } catch {
    return createUnavailableCapacity("ASG_UNAVAILABLE");
  }
}

function selectLatestCompletedMetricPoint(
  metricResult:
    | {
        readonly timestamps?: readonly Date[] | undefined;
        readonly values?: readonly number[] | undefined;
      }
    | undefined,
  currentTimeMs: number
): { readonly timestamp: Date; readonly value: number } | null {
  const timestamps = metricResult?.timestamps ?? [];
  const values = metricResult?.values ?? [];
  const points = timestamps
    .map((timestamp, index) => ({ timestamp, value: values[index] }))
    .filter(
      (point): point is { timestamp: Date; value: number } =>
        point.timestamp instanceof Date &&
        Number.isFinite(point.timestamp.getTime()) &&
        typeof point.value === "number" &&
        Number.isFinite(point.value) &&
        point.timestamp.getTime() + CLOUDWATCH_PERIOD_SECONDS * 1_000 <= currentTimeMs
    )
    .sort(
      (left, right) => right.timestamp.getTime() - left.timestamp.getTime()
    );

  return points[0] ?? null;
}

function selectLatestActivity(
  activities:
    | ReadonlyArray<{
        readonly statusCode?: string | undefined;
        readonly description?: string | undefined;
        readonly startTime?: Date | undefined;
        readonly endTime?: Date | null | undefined;
      }>
    | undefined
): DeploymentObservation["capacity"]["latestActivity"] {
  const latest = [...(activities ?? [])]
    .filter(
      (activity): activity is typeof activity & { startTime: Date } =>
        activity.startTime instanceof Date && Number.isFinite(activity.startTime.getTime())
    )
    .sort(
      (left, right) => right.startTime.getTime() - left.startTime.getTime()
    )[0];

  if (!latest) {
    return null;
  }

  return {
    statusCode: latest.statusCode ?? "Unknown",
    description: latest.description ?? "Auto Scaling activity",
    startedAt: latest.startTime.toISOString(),
    endedAt: latest.endTime?.toISOString() ?? null
  };
}

function createUnavailableCloudWatch(
  errorCode: string
): DeploymentObservation["cloudWatch"] {
  return {
    state: "unavailable",
    requestCountPerTarget: null,
    periodSeconds: CLOUDWATCH_PERIOD_SECONDS,
    observedAt: null,
    delayedBySeconds: null,
    errorCode
  };
}

function createUnavailableCapacity(
  errorCode: string
): DeploymentObservation["capacity"] {
  return {
    state: "unavailable",
    desiredCapacity: null,
    currentInstanceCount: null,
    inServiceInstanceCount: null,
    maxCapacity: null,
    instances: [],
    latestActivity: null,
    observedAt: null,
    errorCode
  };
}

async function prepareDefaultCredentials(
  target: DeploymentObservabilityTarget
): Promise<AwsTemporaryCredentials> {
  return createAwsSdkStsGateway().assumeRole({
    roleArn: target.roleArn,
    externalId: target.externalId,
    region: target.region,
    roleSessionName: `sketchcatch-live-observation-${randomUUID()}`
  });
}

function createDefaultCloudWatchClient(input: {
  readonly region: string;
  readonly credentials: AwsTemporaryCredentials;
}): CloudWatchObservabilityClient {
  const client = new CloudWatchClient(input);

  return {
    async getMetricData(metricInput) {
      const result = await client.send(
        new GetMetricDataCommand({
          StartTime: metricInput.startTime,
          EndTime: metricInput.endTime,
          ScanBy: "TimestampDescending",
          MetricDataQueries: [
            {
              Id: "request_count_per_target",
              ReturnData: true,
              MetricStat: {
                Metric: {
                  Namespace: metricInput.namespace,
                  MetricName: metricInput.metricName,
                  Dimensions: [
                    {
                      Name: "LoadBalancer",
                      Value: metricInput.loadBalancerArnSuffix
                    },
                    {
                      Name: "TargetGroup",
                      Value: metricInput.targetGroupArnSuffix
                    }
                  ]
                },
                Period: metricInput.periodSeconds,
                Stat: metricInput.stat
              }
            }
          ]
        })
      );

      return {
        metricDataResults: result.MetricDataResults?.map((metricResult) => ({
          timestamps: metricResult.Timestamps,
          values: metricResult.Values
        }))
      };
    }
  };
}

function createDefaultAutoScalingClient(input: {
  readonly region: string;
  readonly credentials: AwsTemporaryCredentials;
}): AutoScalingObservabilityClient {
  const client = new AutoScalingClient(input);

  return {
    async describeAutoScalingGroup(asgName) {
      const result = await client.send(
        new DescribeAutoScalingGroupsCommand({
          AutoScalingGroupNames: [asgName]
        })
      );

      return {
        autoScalingGroups: result.AutoScalingGroups?.map((group) => ({
          autoScalingGroupName: group.AutoScalingGroupName,
          desiredCapacity: group.DesiredCapacity,
          maxSize: group.MaxSize,
          instances: group.Instances?.map((instance) => ({
            instanceId: instance.InstanceId,
            lifecycleState: instance.LifecycleState,
            healthStatus: instance.HealthStatus
          }))
        }))
      };
    },

    async describeScalingActivities(asgName) {
      const result = await client.send(
        new DescribeScalingActivitiesCommand({
          AutoScalingGroupName: asgName,
          MaxRecords: 10
        })
      );

      return {
        activities: result.Activities?.map((activity) => ({
          statusCode: activity.StatusCode,
          description: activity.Description,
          startTime: activity.StartTime,
          endTime: activity.EndTime
        }))
      };
    }
  };
}

function createDefaultEcsClient(input: {
  readonly region: string;
  readonly credentials: AwsTemporaryCredentials;
}): EcsObservabilityClient {
  const client = new ECSClient(input);

  return {
    async describeService(clusterName, serviceName) {
      const result = await client.send(
        new DescribeServicesCommand({
          cluster: clusterName,
          services: [serviceName]
        })
      );
      const service = result.services?.[0];

      return {
        service: service
          ? {
              desiredCount: service.desiredCount,
              runningCount: service.runningCount,
              pendingCount: service.pendingCount,
              events: service.events?.map((event) => ({
                createdAt: event.createdAt,
                message: event.message
              }))
            }
          : undefined
      };
    }
  };
}
