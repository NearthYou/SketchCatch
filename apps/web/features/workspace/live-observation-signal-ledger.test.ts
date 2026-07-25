import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationV2Snapshot } from "@sketchcatch/types";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";
import {
  EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER,
  reconcileLiveObservationSignalLedger
} from "./live-observation-signal-ledger";

test("같은 관측 세션에서 최신 스냅샷에 없어진 문제도 관측 기록으로 유지한다", () => {
  const first = reconcileLiveObservationSignalLedger(
    EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER,
    snapshot("session-a"),
    [signal("request-failure", "요청 실패가 확인됐어요", "2.5%")]
  );
  const retained = reconcileLiveObservationSignalLedger(first, snapshot("session-a"), []);

  assert.deepEqual(
    retained.signals.map(({ id, currentValue }) => [id, currentValue]),
    [["request-failure", "2.5%"]]
  );
});

test("같은 문제의 최신 근거를 갱신하되 카드 순서는 흔들지 않는다", () => {
  const first = reconcileLiveObservationSignalLedger(
    EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER,
    snapshot("session-a"),
    [
      signal("request-failure", "요청 실패가 확인됐어요", "2.5%"),
      signal("capacity-health-gap", "정상 응답 서버가 부족해요", "1 / 2")
    ]
  );
  const updated = reconcileLiveObservationSignalLedger(first, snapshot("session-a"), [
    signal("capacity-health-gap", "정상 응답 서버가 부족해요", "1 / 3"),
    signal("request-failure", "요청 실패가 확인됐어요", "4.2%")
  ]);

  assert.deepEqual(
    updated.signals.map(({ id, currentValue }) => [id, currentValue]),
    [
      ["request-failure", "4.2%"],
      ["capacity-health-gap", "1 / 3"]
    ]
  );
});

test("새 관측 세션이 시작되면 이전 문제 기록을 비운다", () => {
  const first = reconcileLiveObservationSignalLedger(
    EMPTY_LIVE_OBSERVATION_SIGNAL_LEDGER,
    snapshot("session-a"),
    [signal("request-failure", "요청 실패가 확인됐어요", "2.5%")]
  );
  const reset = reconcileLiveObservationSignalLedger(first, snapshot("session-b"), [
    signal("capacity-health-gap", "정상 응답 서버가 부족해요", "1 / 2")
  ]);

  assert.deepEqual(
    reset.signals.map(({ id }) => id),
    ["capacity-health-gap"]
  );
});

function signal(id: string, title: string, currentValue: string): LiveObservationSignal {
  return {
    currentValue,
    evidence: [],
    history: [],
    id,
    importance: title,
    possibleCauses: [],
    timeline: [],
    status: "warning",
    title,
    unknowns: [],
    userImpact: "사용자 영향을 확인하고 있어요."
  };
}

function snapshot(observationId: string): LiveObservationV2Snapshot {
  const observedAt = "2026-07-24T00:00:00.000Z";
  return {
    latestObservation: null,
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
