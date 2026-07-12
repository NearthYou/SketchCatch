import type {
  DeploymentObservation,
  DeploymentObservabilityProvider,
  DeploymentObservabilityTarget
} from "./deployment-observability-provider.js";

const CLOUDWATCH_PERIOD_SECONDS = 60;
const RECENT_TRAFFIC_WINDOW_MS = 12_000;
const AGENT_DELAY_SECONDS = 8;
const MAX_TRAFFIC_EVENTS = 1_000;

const trafficEventTimesByObservationId = new Map<string, number[]>();
const trafficExpiryByObservationId = new Map<
  string,
  { readonly handle: unknown; readonly scheduler: SimulatedTrafficExpiryScheduler }
>();

export type SimulatedTrafficExpiryScheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

const simulatedTrafficExpiryScheduler: SimulatedTrafficExpiryScheduler = {
  clearTimeout(handle) {
    clearTimeout(handle as NodeJS.Timeout);
  },
  setTimeout(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    handle.unref();
    return handle;
  }
};

export function recordSimulatedCloudWatchAgentTraffic(
  observationId: string,
  observedAtMs = Date.now(),
  scheduler: SimulatedTrafficExpiryScheduler = simulatedTrafficExpiryScheduler
): void {
  const trafficEventTimesMs = trafficEventTimesByObservationId.get(observationId) ?? [];
  trafficEventTimesByObservationId.set(observationId, [...trafficEventTimesMs, observedAtMs].slice(
    -MAX_TRAFFIC_EVENTS
  ));

  const existingExpiry = trafficExpiryByObservationId.get(observationId);
  if (existingExpiry) {
    existingExpiry.scheduler.clearTimeout(existingExpiry.handle);
  }

  const handle = scheduler.setTimeout(() => {
    trafficEventTimesByObservationId.delete(observationId);
    trafficExpiryByObservationId.delete(observationId);
  }, RECENT_TRAFFIC_WINDOW_MS);
  trafficExpiryByObservationId.set(observationId, { handle, scheduler });
}

export function resetSimulatedCloudWatchAgentTraffic(observationId?: string): void {
  if (observationId) {
    const expiry = trafficExpiryByObservationId.get(observationId);
    if (expiry) {
      expiry.scheduler.clearTimeout(expiry.handle);
    }
    trafficEventTimesByObservationId.delete(observationId);
    trafficExpiryByObservationId.delete(observationId);
    return;
  }

  for (const expiry of trafficExpiryByObservationId.values()) {
    expiry.scheduler.clearTimeout(expiry.handle);
  }
  trafficEventTimesByObservationId.clear();
  trafficExpiryByObservationId.clear();
}

export function createSimulatedCloudWatchAgentObservabilityProvider(options: {
  readonly now?: (() => number) | undefined;
} = {}): DeploymentObservabilityProvider {
  const now = options.now ?? Date.now;

  return {
    async observe(target, observationId): Promise<DeploymentObservation> {
      const currentTimeMs = now();
      const trafficEventTimesMs = trafficEventTimesByObservationId.get(observationId) ?? [];
      const recentTrafficCount = trafficEventTimesMs.filter(
        (eventTimeMs) => currentTimeMs - eventTimeMs <= RECENT_TRAFFIC_WINDOW_MS
      ).length;
      const projectedMinuteCount = recentTrafficCount * (
        CLOUDWATCH_PERIOD_SECONDS /
        (RECENT_TRAFFIC_WINDOW_MS / 1_000)
      );
      const stage = getAgentSimulationStage(recentTrafficCount);
      const observedAt = new Date(
        Math.max(0, currentTimeMs - AGENT_DELAY_SECONDS * 1_000)
      ).toISOString();

      return {
        cloudWatch: {
          state: stage === "idle" ? "delayed" : "available",
          requestCountPerTarget: Math.round(projectedMinuteCount),
          periodSeconds: CLOUDWATCH_PERIOD_SECONDS,
          observedAt,
          delayedBySeconds: AGENT_DELAY_SECONDS,
          errorCode: null
        },
        capacity: createCapacityObservation(stage, currentTimeMs, target)
      };
    }
  };
}

type AgentSimulationStage = "idle" | "warming" | "scaling" | "scaled";

function getAgentSimulationStage(recentTrafficCount: number): AgentSimulationStage {
  if (recentTrafficCount >= 18) {
    return "scaled";
  }

  if (recentTrafficCount >= 10) {
    return "scaling";
  }

  if (recentTrafficCount >= 4) {
    return "warming";
  }

  return "idle";
}

function createCapacityObservation(
  stage: AgentSimulationStage,
  currentTimeMs: number,
  target: DeploymentObservabilityTarget
): DeploymentObservation["capacity"] {
  const observedAt = new Date(currentTimeMs).toISOString();
  const scaleActivityStartedAt = new Date(currentTimeMs - 6_000).toISOString();

  const isEcsService = target.capacityTarget.kind === "ecs_service";

  if (stage === "scaled") {
    return {
      state: "available",
      desiredCapacity: 2,
      currentInstanceCount: 2,
      inServiceInstanceCount: 2,
      maxCapacity: 2,
      instances: [
        createCapacityUnit(isEcsService, "a", true),
        createCapacityUnit(isEcsService, "b", true)
      ],
      latestActivity: {
        statusCode: "Successful",
        description: isEcsService
          ? "Simulated ALB metric crossed the scale-out threshold; ECS Service now has two healthy Fargate tasks."
          : "Simulated CloudWatch Agent metric crossed the scale-out threshold; ASG now has two healthy EC2 instances.",
        startedAt: scaleActivityStartedAt,
        endedAt: observedAt
      },
      observedAt,
      errorCode: null
    };
  }

  if (stage === "scaling") {
    return {
      state: "available",
      desiredCapacity: 2,
      currentInstanceCount: 2,
      inServiceInstanceCount: 1,
      maxCapacity: 2,
      instances: [
        createCapacityUnit(isEcsService, "a", true),
        createCapacityUnit(isEcsService, "b", false)
      ],
      latestActivity: {
        statusCode: "InProgress",
        description: isEcsService
          ? "Simulated ALB metric triggered ECS Service scale-out; a second Fargate task is provisioning."
          : "Simulated CloudWatch Agent metric triggered ASG scale-out; a second EC2 instance is launching.",
        startedAt: scaleActivityStartedAt,
        endedAt: null
      },
      observedAt,
      errorCode: null
    };
  }

  return {
    state: "available",
    desiredCapacity: 1,
    currentInstanceCount: 1,
    inServiceInstanceCount: 1,
    maxCapacity: 2,
    instances: [createCapacityUnit(isEcsService, "a", true)],
    latestActivity: stage === "warming"
      ? {
          statusCode: "Monitoring",
          description: isEcsService
            ? "Simulated ALB metric is reporting rising request pressure; ECS Service threshold is not crossed yet."
            : "Simulated CloudWatch Agent is reporting rising request pressure; ASG threshold is not crossed yet.",
          startedAt: observedAt,
          endedAt: null
        }
      : null,
    observedAt,
    errorCode: null
  };
}

function createInstance(instanceId: string, lifecycleState: string) {
  return {
    healthStatus: lifecycleState === "InService" ? "Healthy" : "Pending",
    instanceId,
    lifecycleState
  };
}

function createCapacityUnit(isEcsService: boolean, suffix: string, ready: boolean) {
  if (!isEcsService) {
    return createInstance(`i-agent-demo-${suffix}`, ready ? "InService" : "Pending");
  }

  return {
    healthStatus: ready ? "Healthy" : "Pending",
    instanceId: `task/demo-service/${suffix}`,
    lifecycleState: ready ? "RUNNING" : "PROVISIONING"
  };
}
