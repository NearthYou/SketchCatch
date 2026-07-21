import type {
  LiveObservationProviderSnapshot,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";

export const LIVE_OBSERVATION_SIGNAL_DASHBOARD_FIXTURE_NAMES = [
  "empty",
  "normal",
  "failure",
  "capacity",
  "repeated-log",
  "new-error",
  "three-signals",
  "no-requests",
  "delayed",
  "unavailable"
] as const;

export type LiveObservationSignalDashboardFixtureName =
  (typeof LIVE_OBSERVATION_SIGNAL_DASHBOARD_FIXTURE_NAMES)[number];

/** Supplies explicit development-only snapshot states for browser QA without adding a fake API response to product flows. */
export function getLiveObservationSignalDashboardFixture(
  name: string | undefined
): LiveObservationV2Snapshot | null {
  if (name === "empty") return null;
  if (name === "normal") return createFixtureSnapshot({});
  if (name === "failure") {
    return createFixtureSnapshot({
      availability: 95.8,
      errorRate: 4.2,
      logs: [
        runtimeLog("2026-07-21T01:00:00.000Z", "database connection failed requestId=request-one"),
        runtimeLog("2026-07-21T01:01:00.000Z", "database connection failed requestId=request-two")
      ]
    });
  }
  if (name === "capacity") {
    return createFixtureSnapshot({ capacity: { desired: 3, healthy: 1, max: 4, running: 3 } });
  }
  if (name === "repeated-log") {
    return createFixtureSnapshot({
      logs: [
        runtimeLog("2026-07-21T01:00:00.000Z", "database connection failed requestId=request-one"),
        runtimeLog("2026-07-21T01:01:00.000Z", "database connection failed requestId=request-two")
      ]
    });
  }
  if (name === "new-error") {
    return createFixtureSnapshot({
      logs: [
        runtimeLog("2026-07-21T01:00:00.000Z", "database connection failed requestId=request-one")
      ]
    });
  }
  if (name === "three-signals") {
    return createFixtureSnapshot({
      capacity: { desired: 3, healthy: 1, max: 4, running: 3 },
      errorRate: 4.2,
      logs: [
        runtimeLog("2026-07-21T01:00:00.000Z", "database connection failed requestId=request-one"),
        runtimeLog("2026-07-21T01:01:00.000Z", "database connection failed requestId=request-two")
      ]
    });
  }
  if (name === "no-requests") {
    return createFixtureSnapshot({
      availability: 100,
      errorRate: 0,
      requests: 0
    });
  }
  if (name === "delayed") {
    return createFixtureSnapshot({
      observedAt: "2026-07-21T00:45:00.000Z",
      state: "delayed"
    });
  }
  if (name === "unavailable") {
    return createFixtureSnapshot({
      availability: null,
      capacity: { desired: null, healthy: null, max: null, running: null },
      errorRate: null,
      observedAt: null,
      p95LatencyMs: null,
      requests: null,
      state: "unavailable"
    });
  }
  return null;
}

/** Builds a complete provider-neutral snapshot for development presentation states, not an AWS or HTTP mock. */
function createFixtureSnapshot(
  overrides: Partial<LiveObservationProviderSnapshot>
): LiveObservationV2Snapshot {
  const observedAt = overrides.observedAt ?? "2026-07-21T01:00:00.000Z";
  const payload: LiveObservationProviderSnapshot = {
    availability: 100,
    capacity: { desired: 2, healthy: 2, max: 4, running: 2 },
    errorRate: 0,
    logs: [],
    observedAt,
    p95LatencyMs: 120,
    requests: 12,
    state: "available",
    ...overrides
  };
  return {
    latestObservation: { observedAt: observedAt ?? "2026-07-21T01:00:00.000Z", payload },
    live: {
      acceptedEventCount: 3,
      observedAt: "2026-07-21T01:01:00.000Z",
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 12,
      rollingRequestsPerSecond: 0.2
    },
    observationId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    terminalAt: null
  };
}

/** Keeps fixture log input shaped exactly like the masked runtime log contract the dashboard receives. */
function runtimeLog(
  timestamp: string,
  message: string
): LiveObservationProviderSnapshot["logs"][number] {
  return { message, timestamp };
}
