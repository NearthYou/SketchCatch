import type { LiveObservationV2Snapshot } from "@sketchcatch/types";
import { groupLiveObservationLogs } from "./live-observation-log-groups";

export type LiveObservationSignalHistoryMetric =
  | "availability"
  | "errorRate"
  | "healthyCapacity"
  | "requestCount";

export type LiveObservationSessionHistorySample = {
  readonly logFingerprintIds: readonly string[];
  readonly observedAt: string;
  readonly sessionId: string;
  readonly values: Readonly<Partial<Record<LiveObservationSignalHistoryMetric, number>>>;
};

export const LIVE_OBSERVATION_HISTORY_MAX_SAMPLES = 120;
export const LIVE_OBSERVATION_HISTORY_WINDOW_MS = 15 * 60 * 1000;

/** Appends one provider observation to in-memory session history without restoring it after a remount. */
export function appendLiveObservationSessionHistory(
  history: readonly LiveObservationSessionHistorySample[],
  snapshot: LiveObservationV2Snapshot | null,
  nowMs = Date.now()
): readonly LiveObservationSessionHistorySample[] {
  if (!snapshot || snapshot.status !== "active") return [];

  const sample = createLiveObservationSessionHistorySample(snapshot);
  if (!sample) return history;

  const currentSessionHistory = history.filter((entry) => entry.sessionId === sample.sessionId);
  const alreadyRecorded = currentSessionHistory.some(
    (entry) => entry.observedAt === sample.observedAt
  );
  const nextHistory = alreadyRecorded ? currentSessionHistory : [...currentSessionHistory, sample];
  const minimumObservedAt = nowMs - LIVE_OBSERVATION_HISTORY_WINDOW_MS;

  return nextHistory
    .filter((entry) => {
      const observedAt = Date.parse(entry.observedAt);
      return Number.isFinite(observedAt) && observedAt >= minimumObservedAt;
    })
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
    .slice(-LIVE_OBSERVATION_HISTORY_MAX_SAMPLES);
}

/** Extracts only finite provider values so a missing metric can never become a misleading zero in a line chart. */
export function createLiveObservationSessionHistorySample(
  snapshot: LiveObservationV2Snapshot
): LiveObservationSessionHistorySample | null {
  const providerSnapshot = snapshot.latestObservation?.payload;
  const observedAt = providerSnapshot?.observedAt;
  if (!providerSnapshot || providerSnapshot.state !== "available" || !observedAt) return null;

  const values: Partial<Record<LiveObservationSignalHistoryMetric, number>> = {};
  addFiniteHistoryValue(values, "availability", providerSnapshot.availability);
  addFiniteHistoryValue(values, "errorRate", providerSnapshot.errorRate);
  addFiniteHistoryValue(values, "healthyCapacity", providerSnapshot.capacity.healthy);
  addFiniteHistoryValue(values, "requestCount", providerSnapshot.requests);

  return {
    logFingerprintIds: groupLiveObservationLogs(providerSnapshot.logs)
      .map((group) => group.id)
      .sort((left, right) => left.localeCompare(right, "en")),
    observedAt,
    sessionId: snapshot.observationId,
    values
  };
}

/** Writes a metric only when the provider supplied an actual finite number. */
function addFiniteHistoryValue(
  values: Partial<Record<LiveObservationSignalHistoryMetric, number>>,
  key: LiveObservationSignalHistoryMetric,
  value: number | null
): void {
  if (value !== null && Number.isFinite(value)) values[key] = value;
}
