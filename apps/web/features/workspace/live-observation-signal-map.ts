import type { LiveObservationInstanceMarker } from "./live-observation";
import {
  getLiveObservationMobilePulsePath,
  getLiveObservationPulsePath,
  type LiveObservationMobileSignalLane,
  type LiveObservationSignalLane,
  type LiveObservationStaticRail
} from "./live-observation-signal-geometry";

export const LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS = 1_520;
export const LIVE_OBSERVATION_SIGNAL_STAGGER_MS = 110;
export const LIVE_OBSERVATION_SIGNAL_ARRIVAL_DURATION_MS = 240;

export function getLiveObservationSignalMapLabel(overflowCount?: number): string {
  return overflowCount && overflowCount > 0
    ? `실시간 트래픽 신호 흐름, 추가 요청 ${overflowCount}건`
    : "실시간 트래픽 신호 흐름";
}

export type LiveObservationSignalRouteVariant = "desktop" | "mobile";

export type LiveObservationSignalRouteSelection = Readonly<{
  lane: LiveObservationSignalLane | LiveObservationMobileSignalLane;
  path: string;
  requestIndex: number;
  targetIndex: number;
}>;

export type LiveObservationSignalArrivalFeedback = Readonly<{
  delayMs: number;
  durationMs: number;
  lane: LiveObservationSignalRouteSelection["lane"];
  path: string;
  targetIndex: number;
}>;

export function getLiveObservationSignalMapSlots(
  instances: readonly LiveObservationInstanceMarker[]
): LiveObservationInstanceMarker[] {
  const inServiceInstances = instances.filter((instance) => instance.state === "in-service");
  const otherInstances = instances.filter((instance) => instance.state !== "in-service");

  return [...inServiceInstances, ...otherInstances].slice(0, 2);
}

export function getLiveObservationSignalPulseIndexes(
  requestTargetIndexes: readonly number[],
  instances: readonly LiveObservationInstanceMarker[]
): number[] {
  return requestTargetIndexes.filter(
    (targetIndex) => instances[targetIndex]?.state === "in-service"
  );
}

export function getLiveObservationSignalRouteSelections({
  instanceSlotCount,
  requestTargetIndexes,
  variant,
  visibleParticleCount
}: {
  readonly instanceSlotCount: number;
  readonly requestTargetIndexes: readonly number[];
  readonly variant: LiveObservationSignalRouteVariant;
  readonly visibleParticleCount: number;
}): LiveObservationSignalRouteSelection[] {
  return requestTargetIndexes
    .slice(0, Math.max(0, visibleParticleCount))
    .flatMap<LiveObservationSignalRouteSelection>((targetIndex, requestIndex) => {
      if (variant === "desktop") {
        return (["upper", "lower"] as const).flatMap((lane) => {
          const path = getLiveObservationPulsePath({
            lane,
            slotCount: instanceSlotCount,
            targetIndex
          });
          return path ? [{ lane, path, requestIndex, targetIndex }] : [];
        });
      }

      return (["left", "right"] as const).flatMap((lane) => {
        const path = getLiveObservationMobilePulsePath({
          lane,
          slotCount: instanceSlotCount,
          targetIndex
        });
        return path ? [{ lane, path, requestIndex, targetIndex }] : [];
      });
    });
}

export function getLiveObservationSignalArrivalFeedback({
  rails,
  routeSelections
}: {
  readonly rails: readonly LiveObservationStaticRail[];
  readonly routeSelections: readonly LiveObservationSignalRouteSelection[];
}): LiveObservationSignalArrivalFeedback[] {
  return routeSelections.flatMap((selection) => {
    const targetRail = rails.find(
      (rail) =>
        rail.kind === "perimeter" &&
        rail.lane === selection.lane &&
        rail.nodeId === `ec2-${selection.targetIndex}`
    );

    return targetRail
      ? [{
          delayMs:
            LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS +
            selection.requestIndex * LIVE_OBSERVATION_SIGNAL_STAGGER_MS,
          durationMs: LIVE_OBSERVATION_SIGNAL_ARRIVAL_DURATION_MS,
          lane: selection.lane,
          path: targetRail.d,
          targetIndex: selection.targetIndex
        }]
      : [];
  });
}

export function getLiveObservationReducedRouteSelections(
  routeSelections: readonly LiveObservationSignalRouteSelection[]
): LiveObservationSignalRouteSelection[] {
  const seen = new Set<string>();

  return routeSelections.filter((selection) => {
    const key = `${selection.lane}:${selection.targetIndex}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function getLiveObservationSignalBurstLifetimeMs(
  visibleParticleCount: number
): number {
  const particleCount = Math.max(0, Math.floor(visibleParticleCount));
  if (particleCount === 0) {
    return 0;
  }

  return (
    LIVE_OBSERVATION_SIGNAL_PULSE_DURATION_MS +
    (particleCount - 1) * LIVE_OBSERVATION_SIGNAL_STAGGER_MS +
    LIVE_OBSERVATION_SIGNAL_ARRIVAL_DURATION_MS
  );
}
