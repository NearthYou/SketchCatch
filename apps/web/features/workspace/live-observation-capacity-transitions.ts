import type { LiveObservationCapacityUnit } from "./live-observation-diagram.js";

export const LIVE_OBSERVATION_CAPACITY_TRANSITION_MS = 1200;

export type LiveObservationPresentedCapacityUnit = LiveObservationCapacityUnit & {
  readonly transition: "stable" | "entering" | "exiting";
};

export function settleLiveObservationCapacityUnits(
  units: readonly LiveObservationCapacityUnit[]
): LiveObservationPresentedCapacityUnit[] {
  return units.map((unit) => ({ ...unit, transition: "stable" }));
}

export function reconcileLiveObservationCapacityUnits(
  current: readonly LiveObservationPresentedCapacityUnit[],
  next: readonly LiveObservationCapacityUnit[]
): LiveObservationPresentedCapacityUnit[] {
  const nextIds = new Set(next.map((unit) => unit.node.id));
  const currentIds = new Set(current.map((unit) => unit.node.id));
  const exiting = current
    .filter((unit) => !nextIds.has(unit.node.id))
    .map((unit) => ({ ...unit, transition: "exiting" as const }));
  const entering = next.map((unit) => {
    if (currentIds.has(unit.node.id) || unit.observationState !== "active") {
      return { ...unit, transition: "stable" as const };
    }

    return {
      ...unit,
      observationState: "launching" as const,
      transition: "entering" as const
    };
  });

  return [...entering, ...exiting];
}
