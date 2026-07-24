import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import {
  getLiveObservationCapacityProjection,
  getLiveObservationEffectiveTraffic
} from "./live-observation-capacity-projection";

export type LiveObservationAiState = "idle" | "loading" | "ready" | "error";

export type LiveObservationTelemetryModel = Readonly<{
  acceptedEventCount: number;
  actualTaskCount: number | null;
  aiState: LiveObservationAiState;
  expectedTaskCount: number | null;
  pressureLevel: LiveObservationV2Snapshot["live"]["pressureLevel"];
  pressurePercent: number;
  projectedRequestsPerMinute: number;
  providerState: "available" | "delayed" | "unavailable" | "not_started";
  rollingRequestsPerSecond: number;
  sessionStatus: LiveObservationV2Snapshot["status"] | "not_started";
}>;

export function createLiveObservationTelemetryModel({
  aiState,
  architecture,
  snapshot
}: {
  readonly aiState: LiveObservationAiState;
  readonly architecture: ArchitectureJson | null;
  readonly snapshot: LiveObservationV2Snapshot | null;
}): LiveObservationTelemetryModel {
  const projection = architecture
    ? getLiveObservationCapacityProjection(architecture, snapshot)
    : null;
  const providerState = snapshot?.latestObservation?.payload.state ?? "not_started";
  const traffic = getLiveObservationEffectiveTraffic(architecture, snapshot);

  return {
    acceptedEventCount: snapshot?.live.acceptedEventCount ?? 0,
    actualTaskCount:
      projection?.actualCount ?? snapshot?.latestObservation?.payload.capacity.running ?? null,
    aiState,
    expectedTaskCount:
      projection?.predictedCount ?? snapshot?.latestObservation?.payload.capacity.desired ?? null,
    pressureLevel: traffic.pressureLevel,
    pressurePercent: traffic.pressurePercent,
    projectedRequestsPerMinute: traffic.projectedRequestsPerMinute,
    providerState,
    rollingRequestsPerSecond: snapshot?.live.rollingRequestsPerSecond ?? 0,
    sessionStatus: snapshot?.status ?? "not_started"
  };
}
