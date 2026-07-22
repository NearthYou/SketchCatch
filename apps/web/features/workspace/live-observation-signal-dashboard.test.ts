import assert from "node:assert/strict";
import test from "node:test";
import type {
  Deployment,
  LiveObservationProviderSnapshot,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";

import { createLiveObservationSignalDashboardModel } from "./live-observation-signal-dashboard.js";
import { groupLiveObservationLogs } from "./live-observation-log-groups.js";
import type { LiveObservationSessionHistorySample } from "./live-observation-session-history.js";

test("가장 영향이 큰 실제 신호부터 안정적인 순서로 세 개만 보여준다", () => {
  const snapshot = createSnapshot({
    capacity: { desired: 3, healthy: 1, max: 4, running: 3 },
    errorRate: 2.5,
    logs: [
      runtimeLog("2026-07-21T01:00:00.000Z", "database connection failed requestId=aaa"),
      runtimeLog("2026-07-21T01:01:00.000Z", "database connection failed requestId=bbb"),
      runtimeLog("2026-07-21T01:02:00.000Z", "warning retrying cache requestId=ccc"),
      runtimeLog("2026-07-21T01:03:00.000Z", "warning retrying queue requestId=ddd")
    ]
  });

  const first = createLiveObservationSignalDashboardModel({ snapshot });
  const second = createLiveObservationSignalDashboardModel({ snapshot });

  assert.deepEqual(
    first.signals.map((signal) => signal.id),
    ["request-failure", "capacity-health-gap", "repeated-error-log"]
  );
  assert.deepEqual(
    first.signals.map((signal) => signal.id),
    second.signals.map((signal) => signal.id)
  );
  assert.equal(first.signals.length, 3);
});

test("요청 실패에는 실제 가용성과 응답 시간을 쉬운 근거로 함께 보여준다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      availability: 97.5,
      errorRate: 2.5,
      p95LatencyMs: 3200
    })
  });
  const requestFailure = model.signals.find((signal) => signal.id === "request-failure");

  assert.ok(requestFailure);
  assert.deepEqual(
    requestFailure.evidence.map((evidence) => evidence.detail),
    [
      "최근 확인한 요청 중 2.5%가 실패했어요.",
      "최근 확인한 요청 중 97.5%가 응답했어요.",
      "느린 요청은 응답까지 3.2초 걸렸어요."
    ]
  );
  assert.ok(requestFailure.evidence.every((evidence) => evidence.kind === "actual"));
  assert.doesNotMatch(
    requestFailure.evidence.map((evidence) => evidence.detail).join(" "),
    /p95|availability|provider|snapshot|metric/iu
  );
});

test("오류율이 0이어도 실제 가용성이 낮으면 요청 문제로 보여준다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      availability: 98.5,
      errorRate: 0,
      p95LatencyMs: null
    })
  });
  const requestFailure = model.signals.find((signal) => signal.id === "request-failure");

  assert.ok(requestFailure);
  assert.deepEqual(
    requestFailure.evidence.map((evidence) => evidence.detail),
    ["최근 확인한 요청 중 98.5%가 응답했어요."]
  );
});

test("요청 문제가 없으면 첫 용량 문제에만 실제 응답 시간을 근거로 보여준다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      availability: 100,
      capacity: { desired: 4, healthy: 1, max: 4, running: 3 },
      errorRate: 0,
      p95LatencyMs: 1450
    })
  });

  assert.deepEqual(
    model.signals.map((signal) => signal.id),
    ["capacity-health-gap", "capacity-running-gap"]
  );
  assert.deepEqual(
    model.signals[0]?.evidence.map((evidence) => evidence.detail),
    [
      "실행 중인 서버 3개 중 1개가 정상 응답 중이에요.",
      "느린 요청은 응답까지 1.5초 걸렸어요."
    ]
  );
  assert.equal(
    model.signals[1]?.evidence.some((evidence) => evidence.detail.includes("응답 시간")),
    false
  );
  assert.equal(
    model.signals.some((signal) => signal.id.includes("latency")),
    false
  );
});

test("없는 가용성과 응답 시간은 문제 근거에 넣지 않는다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      availability: null,
      errorRate: 2.5,
      p95LatencyMs: null
    })
  });
  const requestFailure = model.signals.find((signal) => signal.id === "request-failure");

  assert.ok(requestFailure);
  assert.deepEqual(
    requestFailure.evidence.map((evidence) => evidence.detail),
    ["최근 확인한 요청 중 2.5%가 실패했어요."]
  );
});

test("확인할 신호가 부족하면 세 개를 억지로 채우지 않는다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      capacity: { desired: 2, healthy: 2, max: 4, running: 2 },
      errorRate: 0,
      logs: []
    })
  });

  assert.equal(model.status.status, "normal");
  assert.deepEqual(model.signals, []);
});

test("없는 관측값을 0이나 정상으로 바꾸지 않는다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      availability: null,
      capacity: { desired: null, healthy: null, max: null, running: null },
      errorRate: null,
      p95LatencyMs: null,
      requests: null
    })
  });

  assert.notEqual(model.status.status, "normal");
  assert.equal(model.signals.length, 0);
  assert.ok(model.status.dataNote?.includes("확인"));
});

test("확인한 요청이 없으면 0% 오류율과 100% 응답 가능 비율을 정상으로 해석하지 않는다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      availability: 100,
      capacity: { desired: 2, healthy: 2, max: 4, running: 2 },
      errorRate: 0,
      requests: 0
    })
  });

  assert.equal(model.status.status, "observed");
  assert.notEqual(model.status.status, "normal");
  assert.ok(model.status.unknowns.some((item) => item.text.includes("확인된 요청")));
});

test("지연된 관측값과 확인할 수 없는 관측값을 구분한다", () => {
  const delayed = createLiveObservationSignalDashboardModel({
    snapshot: withoutAcceptedEvents(createSnapshot({
      state: "delayed",
      observedAt: "2026-07-21T00:45:00.000Z"
    }))
  });
  const unavailable = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({ state: "unavailable" })
  });

  assert.equal(delayed.status.status, "checking");
  assert.equal(unavailable.status.status, "unknown");
  assert.notEqual(delayed.status.title, unavailable.status.title);
});

test("현재 상태 제목은 다섯 개의 쉬운 문구만 사용한다", () => {
  const models = [
    createLiveObservationSignalDashboardModel({ snapshot: null }),
    createLiveObservationSignalDashboardModel({ snapshot: createSnapshot({ errorRate: 0 }) }),
    createLiveObservationSignalDashboardModel({ snapshot: createSnapshot({ errorRate: 4 }) }),
    createLiveObservationSignalDashboardModel({ snapshot: createSnapshot({ state: "delayed" }) }),
    createLiveObservationSignalDashboardModel({ snapshot: createSnapshot({ state: "unavailable" }) })
  ];
  const allowedTitles = new Set([
    "현재 큰 문제는 없어요.",
    "주의해서 볼 문제가 있어요.",
    "일부 요청에 문제가 있어요.",
    "상태를 확인하고 있어요.",
    "지금은 상태를 확인할 수 없어요."
  ]);

  for (const model of models) assert.equal(allowedTitles.has(model.status.title), true);
});

test("AWS 상태가 아직 없어도 수락한 참여 요청을 중립 상태로 즉시 보여준다", () => {
  const observedAt = "2026-07-21T01:02:00.000Z";
  const snapshot = createSnapshot();
  snapshot.latestObservation = null;
  snapshot.live = {
    ...snapshot.live,
    acceptedEventCount: 2,
    observedAt
  };

  const model = createLiveObservationSignalDashboardModel({ snapshot });

  assert.equal(model.status.status, "observed");
  assert.equal(model.status.title, "상태를 확인하고 있어요.");
  assert.equal(model.status.lastObservedAt, observedAt);
  assert.match(model.status.dataNote ?? "", /참여 요청 2건/);
  assert.match(model.status.dataNote ?? "", /최신 상태는 아직 확인 중/);
  assert.doesNotMatch(`${model.status.title} ${model.status.userImpact}`, /정상|문제없/);
});

test("실제 AWS 상태 판정은 참여 요청 확인 상태보다 우선한다", () => {
  const critical = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({ errorRate: 12 })
  });
  const normal = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({ errorRate: 0 })
  });
  const unavailable = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({ state: "unavailable" })
  });

  assert.equal(critical.status.status, "critical");
  assert.equal(normal.status.status, "normal");
  assert.equal(unavailable.status.status, "unknown");
});

test("AWS 상태가 없을 때 요청 압력을 서비스 장애로 단정하지 않는다", () => {
  const highSnapshot = createSnapshot();
  highSnapshot.latestObservation = null;
  highSnapshot.live = { ...highSnapshot.live, pressureLevel: "high" };
  const criticalSnapshot = createSnapshot();
  criticalSnapshot.latestObservation = null;
  criticalSnapshot.live = { ...criticalSnapshot.live, pressureLevel: "critical" };

  assert.equal(
    createLiveObservationSignalDashboardModel({ snapshot: highSnapshot }).status.status,
    "observed"
  );
  assert.equal(
    createLiveObservationSignalDashboardModel({ snapshot: criticalSnapshot }).status.status,
    "observed"
  );
  assert.equal(
    createLiveObservationSignalDashboardModel({ snapshot: criticalSnapshot }).status.title,
    "주의해서 볼 문제가 있어요."
  );
});

test("AWS 상태가 정상이어도 실제 요청 급증을 주의 신호로 보여준다", () => {
  const snapshot = createSnapshot({ errorRate: 0 });
  snapshot.live = {
    ...snapshot.live,
    acceptedEventCount: 42,
    pressureLevel: "high",
    projectedRequestsPerMinute: 240
  };

  const model = createLiveObservationSignalDashboardModel({ snapshot });
  const requestSurge = model.signals.find((signal) => signal.id === "request-surge");

  assert.equal(model.status.status, "warning");
  assert.equal(model.status.title, "주의해서 볼 문제가 있어요.");
  assert.ok(requestSurge);
  assert.deepEqual(
    requestSurge.evidence.map((evidence) => evidence.detail),
    ["이번 관측에서 요청 42건을 확인했어요.", "현재 속도가 이어지면 1분에 약 240건이에요."]
  );
});

test("AWS 관측 불가 상태가 우선하되 확인된 참여 요청 수를 숨기지 않는다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({ state: "unavailable" })
  });

  assert.equal(model.status.status, "unknown");
  assert.match(model.status.dataNote ?? "", /참여 요청 2건/);
  assert.match(model.status.dataNote ?? "", /최신 상태를 받지 못/);
});

test("비교 기준이 없는 응답 시간은 문제 신호로 만들지 않는다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      capacity: { desired: 1, healthy: 1, max: 1, running: 1 },
      errorRate: 0,
      p95LatencyMs: 3200
    })
  });

  assert.equal(
    model.signals.some((signal) => signal.id.includes("latency")),
    false
  );
  assert.ok(model.status.unknowns.some((item) => item.text.includes("응답 시간")));
});

test("가능성으로 표시하는 원인에는 항상 근거를 연결한다", () => {
  const model = createLiveObservationSignalDashboardModel({
    snapshot: createSnapshot({
      logs: [
        runtimeLog("2026-07-21T01:00:00.000Z", "database connection failed requestId=aaa"),
        runtimeLog("2026-07-21T01:01:00.000Z", "database connection failed requestId=bbb")
      ]
    })
  });

  for (const signal of model.signals) {
    for (const cause of signal.possibleCauses) {
      assert.ok(cause.evidenceIds.length > 0);
      assert.ok(
        cause.evidenceIds.every((evidenceId) =>
          signal.evidence.some((item) => item.id === evidenceId)
        )
      );
    }
  }
});

test("단일 오류는 이전 관측과 비교할 수 있을 때만 새 오류로 표시한다", () => {
  const firstLog = runtimeLog(
    "2026-07-21T01:00:00.000Z",
    "database connection failed requestId=aaa"
  );
  const fingerprintId = groupLiveObservationLogs([firstLog])[0]?.id;
  assert.ok(fingerprintId);
  const snapshot = createSnapshot({
    logs: [firstLog]
  });
  const unseenHistory: readonly LiveObservationSessionHistorySample[] = [
    {
      logFingerprintIds: [],
      observedAt: "2026-07-21T00:59:00.000Z",
      sessionId: "observation-1",
      values: {}
    }
  ];
  const seenHistory: readonly LiveObservationSessionHistorySample[] = [
    {
      logFingerprintIds: [fingerprintId],
      observedAt: "2026-07-21T00:59:00.000Z",
      sessionId: "observation-1",
      values: {}
    }
  ];

  assert.equal(createLiveObservationSignalDashboardModel({ snapshot }).signals[0]?.id, "error-log");
  assert.equal(
    createLiveObservationSignalDashboardModel({ history: unseenHistory, snapshot }).signals[0]?.id,
    "new-error-log"
  );
  assert.equal(
    createLiveObservationSignalDashboardModel({ history: seenHistory, snapshot }).signals[0]?.id,
    "error-log"
  );
});

test("실제 배포 완료 시각과 신호 시각이 함께 있을 때만 접힌 사고 흐름을 만든다", () => {
  const snapshot = createSnapshot({ errorRate: 2.5 });
  const withoutDeployment = createLiveObservationSignalDashboardModel({ snapshot });
  const withDeployment = createLiveObservationSignalDashboardModel({
    deployment: { completedAt: "2026-07-21T00:55:00.000Z" } as Deployment,
    snapshot
  });

  assert.deepEqual(withoutDeployment.signals[0]?.timeline, []);
  assert.deepEqual(
    withDeployment.signals[0]?.timeline.map((event) => event.label),
    ["배포 완료", "문제 신호 확인"]
  );
});

function createSnapshot(
  overrides: Partial<LiveObservationProviderSnapshot> = {}
): LiveObservationV2Snapshot {
  const observedAt = overrides.observedAt ?? "2026-07-21T01:00:00.000Z";
  const payload: LiveObservationProviderSnapshot = {
    availability: 100,
    capacity: { desired: 1, healthy: 1, max: 2, running: 1 },
    errorRate: 0,
    logs: [],
    observedAt,
    p95LatencyMs: 120,
    requests: 12,
    state: "available",
    ...overrides
  };

  return {
    latestObservation: { observedAt, payload },
    live: {
      acceptedEventCount: 2,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 12,
      rollingRequestsPerSecond: 0.2
    },
    observationId: "observation-1",
    status: "active",
    terminalAt: null
  };
}

function runtimeLog(
  timestamp: string,
  message: string
): LiveObservationProviderSnapshot["logs"][number] {
  return { message, timestamp };
}

function withoutAcceptedEvents(snapshot: LiveObservationV2Snapshot): LiveObservationV2Snapshot {
  return {
    ...snapshot,
    live: {
      ...snapshot.live,
      acceptedEventCount: 0
    }
  };
}
