import type {
  ArchitectureJson,
  CreateDesignSimulationRequest,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";

const LIVE_OBSERVATION_DESIGN_ANALYSIS_DEFAULTS = {
  budgetLevel: "normal",
  expectedUserCount: 1000,
  period: "month",
  region: "ap-northeast-2",
  trafficLevel: "normal"
} as const;

export function createLiveObservationDesignSimulationRequest(
  architectureJson: ArchitectureJson,
  snapshot: LiveObservationV2Snapshot | null
): CreateDesignSimulationRequest | null {
  if (!snapshot || snapshot.live.pressureLevel === "normal") return null;

  return {
    architectureJson,
    ...LIVE_OBSERVATION_DESIGN_ANALYSIS_DEFAULTS,
    liveObservation: {
      acceptedEventCount: snapshot.live.acceptedEventCount,
      pressureLevel: snapshot.live.pressureLevel,
      pressurePercent: snapshot.live.pressurePercent,
      projectedRequestsPerMinute: snapshot.live.projectedRequestsPerMinute
    }
  };
}
