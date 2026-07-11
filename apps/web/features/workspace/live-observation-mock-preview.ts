import type { LiveObservationSnapshot } from "@sketchcatch/types";
import {
  getLiveObservationRequestBurst,
  getLiveObservationRequestTargetIndexes,
  type LiveObservationRequestBurst
} from "./live-observation";

export type MockRequestFlowBurst = LiveObservationRequestBurst & {
  readonly sequence: number;
};

export type MockRequestFlowState = {
  readonly burst: MockRequestFlowBurst | null;
  readonly snapshot: LiveObservationSnapshot | null;
  readonly sequence: number;
  readonly visible: boolean;
};

export function createInitialMockRequestFlowState(): MockRequestFlowState {
  return {
    burst: null,
    snapshot: null,
    sequence: 0,
    visible: false
  };
}

export function replayMockRequestFlow(
  state: MockRequestFlowState
): MockRequestFlowState {
  const burst = getLiveObservationRequestBurst(100, 108, true);
  if (!burst) {
    return state;
  }

  const sequence = state.sequence + 1;
  return {
    burst: {
      ...burst,
      sequence
    },
    snapshot: createMockLiveObservationSnapshot(sequence),
    sequence,
    visible: true
  };
}

export function getMockRequestFlowTargetIndexes(
  burst: MockRequestFlowBurst | null
): number[] {
  return burst
    ? getLiveObservationRequestTargetIndexes(
        burst.visibleParticleCount,
        2,
        burst.sequence
      )
    : [];
}

export function clearMockRequestFlowBurst(
  state: MockRequestFlowState,
  scheduledSequence: number
): MockRequestFlowState {
  if (state.burst?.sequence !== scheduledSequence) {
    return state;
  }

  return {
    ...state,
    burst: null
  };
}

function createMockLiveObservationSnapshot(sequence: number): LiveObservationSnapshot {
  const phase = Math.max(0, (sequence - 1) % 6);
  const now = new Date(Date.now()).toISOString();
  const acceptedEventCount = 100 + sequence * 8;
  const pressureByPhase = [
    { level: "normal", percent: 34, rpm: 38 },
    { level: "warning", percent: 63, rpm: 72 },
    { level: "high", percent: 82, rpm: 98 },
    { level: "critical", percent: 96, rpm: 128 },
    { level: "warning", percent: 58, rpm: 76 },
    { level: "normal", percent: 31, rpm: 35 }
  ] as const;
  const pressure = pressureByPhase[phase] ?? pressureByPhase[0];
  const scaleOutStarted = phase >= 2;
  const scaleOutComplete = phase >= 4;
  const instances = scaleOutComplete
    ? [
        { healthStatus: "Healthy", instanceId: "i-prototype-a", lifecycleState: "InService" },
        { healthStatus: "Healthy", instanceId: "i-prototype-b", lifecycleState: "InService" }
      ]
    : scaleOutStarted
      ? [
          { healthStatus: "Healthy", instanceId: "i-prototype-a", lifecycleState: "InService" },
          { healthStatus: "Initializing", instanceId: "i-prototype-b", lifecycleState: "Pending" }
        ]
      : [
          { healthStatus: "Healthy", instanceId: "i-prototype-a", lifecycleState: "InService" }
        ];

  return {
    capacity: {
      currentInstanceCount: instances.length,
      desiredCapacity: scaleOutStarted ? 2 : 1,
      errorCode: null,
      inServiceInstanceCount: scaleOutComplete ? 2 : 1,
      instances,
      latestActivity: scaleOutStarted
        ? {
            description: scaleOutComplete
              ? "Prototype scale-out completed"
              : "Prototype scale-out launching an extra EC2 instance",
            endedAt: scaleOutComplete ? now : null,
            startedAt: now,
            statusCode: scaleOutComplete ? "Successful" : "InProgress"
          }
        : null,
      maxCapacity: 2,
      observedAt: now,
      state: "available"
    },
    cloudWatch: {
      delayedBySeconds: phase <= 1 ? 45 : 12,
      errorCode: null,
      observedAt: now,
      periodSeconds: 60,
      requestCountPerTarget: Math.round(pressure.rpm / Math.max(1, scaleOutComplete ? 2 : 1)),
      state: phase <= 1 ? "delayed" : "available"
    },
    live: {
      acceptedEventCount,
      observedAt: now,
      pressureLevel: pressure.level,
      pressurePercent: pressure.percent,
      projectedRequestsPerMinute: pressure.rpm,
      rollingRequestsPerSecond: pressure.rpm / 60
    },
    observationId: "prototype-simulation",
    status: "active"
  };
}
