import type { LiveObservationV2Snapshot } from "@sketchcatch/types";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";

export type LiveObservationSignalLedger = Readonly<{
  observationId: string | null;
  signals: readonly LiveObservationSignal[];
}>;

export const EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER: LiveObservationSignalLedger = {
  observationId: null,
  signals: []
};

const MAX_RETAINED_SIGNALS = 3;

/** Keeps the first three observed problems stable for one session while refreshing matching evidence. */
export function reconcileLiveObservationSignalLedger(
  ledger: LiveObservationSignalLedger,
  snapshot: LiveObservationV2Snapshot | null,
  currentSignals: readonly LiveObservationSignal[]
): LiveObservationSignalLedger {
  if (!snapshot) return EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER;

  if (ledger.observationId !== snapshot.observationId) {
    return {
      observationId: snapshot.observationId,
      signals: currentSignals.slice(0, MAX_RETAINED_SIGNALS)
    };
  }

  const currentById = new Map(currentSignals.map((signal) => [signal.id, signal]));
  const retainedIds = new Set(ledger.signals.map((signal) => signal.id));
  const signals = [
    ...ledger.signals.map((signal) => currentById.get(signal.id) ?? signal),
    ...currentSignals.filter((signal) => !retainedIds.has(signal.id))
  ].slice(0, MAX_RETAINED_SIGNALS);

  if (
    signals.length === ledger.signals.length &&
    signals.every((signal, index) => signal === ledger.signals[index])
  ) {
    return ledger;
  }

  return { observationId: snapshot.observationId, signals };
}
