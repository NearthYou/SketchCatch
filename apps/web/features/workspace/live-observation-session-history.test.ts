import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationV2Snapshot } from "@sketchcatch/types";

import { appendLiveObservationSessionHistory } from "./live-observation-session-history.js";

test("다른 관측 세션이 시작되면 이전 세션 이력을 버린다", () => {
  const first = appendLiveObservationSessionHistory(
    [],
    snapshot("session-a", "2026-07-21T01:00:00.000Z"),
    Date.UTC(2026, 6, 21, 1, 0, 0)
  );
  const next = appendLiveObservationSessionHistory(
    first,
    snapshot("session-b", "2026-07-21T01:01:00.000Z"),
    Date.UTC(2026, 6, 21, 1, 1, 0)
  );

  assert.equal(next.length, 1);
  assert.equal(next[0]?.sessionId, "session-b");
});

test("같은 관측 시각은 한 번만 저장하고 누락값을 0으로 넣지 않는다", () => {
  const withValues = appendLiveObservationSessionHistory(
    [],
    snapshot("session-a", "2026-07-21T01:00:00.000Z"),
    Date.UTC(2026, 6, 21, 1, 0, 0)
  );
  const repeated = appendLiveObservationSessionHistory(
    withValues,
    snapshot("session-a", "2026-07-21T01:00:00.000Z"),
    Date.UTC(2026, 6, 21, 1, 0, 0)
  );
  const missing = appendLiveObservationSessionHistory(
    repeated,
    snapshot("session-a", "2026-07-21T01:01:00.000Z", { errorRate: null, healthy: null }),
    Date.UTC(2026, 6, 21, 1, 1, 0)
  );

  assert.equal(repeated.length, 1);
  assert.equal(missing.length, 2);
  assert.equal("errorRate" in (missing[1]?.values ?? {}), false);
  assert.equal("healthyCapacity" in (missing[1]?.values ?? {}), false);
});

test("현재 세션의 최근 15분과 최대 120개 관측값만 유지한다", () => {
  let history = [] as ReturnType<typeof appendLiveObservationSessionHistory>;

  for (let index = 0; index < 121; index += 1) {
    history = appendLiveObservationSessionHistory(
      history,
      snapshot("session-a", new Date(Date.UTC(2026, 6, 21, 1, 0, index)).toISOString()),
      Date.UTC(2026, 6, 21, 1, 0, index)
    );
  }

  assert.equal(history.length, 120);

  const pruned = appendLiveObservationSessionHistory(
    history,
    snapshot("session-a", "2026-07-21T01:20:00.000Z"),
    Date.UTC(2026, 6, 21, 1, 20, 0)
  );

  assert.equal(pruned.length, 1);
  assert.equal(pruned[0]?.observedAt, "2026-07-21T01:20:00.000Z");
});

test("새 오류 판단에 쓰는 이력은 정규화된 fingerprint만 남긴다", () => {
  const snapshotWithLog: LiveObservationV2Snapshot = {
    ...snapshot("session-a", "2026-07-21T01:00:00.000Z"),
    latestObservation: {
      observedAt: "2026-07-21T01:00:00.000Z",
      payload: {
        ...snapshot("session-a", "2026-07-21T01:00:00.000Z").latestObservation!.payload,
        logs: [
          {
            message: "database connection failed requestId=request-123",
            timestamp: "2026-07-21T01:00:00.000Z"
          }
        ]
      }
    }
  };

  const history = appendLiveObservationSessionHistory(
    [],
    snapshotWithLog,
    Date.UTC(2026, 6, 21, 1, 0, 0)
  );

  assert.match(history[0]?.logFingerprintIds[0] ?? "", /^error:[a-f0-9]{8}$/);
  assert.equal(history[0]?.logFingerprintIds.join(" ").includes("request-123"), false);
});

function snapshot(
  observationId: string,
  observedAt: string,
  overrides: { readonly errorRate?: number | null; readonly healthy?: number | null } = {}
): LiveObservationV2Snapshot {
  const errorRate = "errorRate" in overrides ? (overrides.errorRate ?? null) : 0;
  const healthy = "healthy" in overrides ? (overrides.healthy ?? null) : 2;

  return {
    latestObservation: {
      observedAt,
      payload: {
        availability: 100,
        capacity: { desired: 2, healthy, max: 3, running: 2 },
        errorRate,
        logs: [],
        observedAt,
        p95LatencyMs: 120,
        requests: 10,
        state: "available"
      }
    },
    live: {
      acceptedEventCount: 1,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 10,
      rollingRequestsPerSecond: 1
    },
    observationId,
    status: "active",
    terminalAt: null
  };
}
