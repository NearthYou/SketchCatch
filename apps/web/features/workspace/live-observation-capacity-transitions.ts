import type { LiveObservationCapacityUnit } from "./live-observation-diagram.js";

export const LIVE_OBSERVATION_CAPACITY_EXIT_MS = 620;

export type LiveObservationPresentedCapacityUnit = LiveObservationCapacityUnit & {
  readonly transition: "stable" | "exiting";
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
  const exiting = current
    .filter((unit) => unit.transition === "stable" && !nextIds.has(unit.node.id))
    .map((unit) => ({ ...unit, transition: "exiting" as const }));

  return [...settleLiveObservationCapacityUnits(next), ...exiting];
}
