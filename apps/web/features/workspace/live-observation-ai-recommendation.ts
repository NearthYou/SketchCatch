import type {
  ArchitectureJson,
  CreateDesignSimulationRequest,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import { getLiveObservationEffectiveTraffic } from "./live-observation-capacity-projection";

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
  if (!snapshot) return null;
  const traffic = getLiveObservationEffectiveTraffic(architectureJson, snapshot);
  if (traffic.pressureLevel === "normal") return null;

  return {
    architectureJson,
    ...LIVE_OBSERVATION_DESIGN_ANALYSIS_DEFAULTS,
    liveObservation: {
      acceptedEventCount: snapshot.live.acceptedEventCount,
      pressureLevel: traffic.pressureLevel,
      pressurePercent: traffic.pressurePercent,
      projectedRequestsPerMinute: traffic.projectedRequestsPerMinute
    }
  };
}
