import assert from "node:assert/strict";
import test from "node:test";

import { getLiveObservationSignalDashboardFixture } from "./live-observation-signal-dashboard-fixtures.js";

test("개발용 브라우저 fixture는 0·1·2·3개 신호와 지연·미확인 상태를 명시적으로 제공한다", () => {
  assert.equal(
    getLiveObservationSignalDashboardFixture("normal")?.latestObservation?.payload.state,
    "available"
  );
  assert.equal(
    getLiveObservationSignalDashboardFixture("failure")?.latestObservation?.payload.errorRate,
    4.2
  );
  assert.equal(
    getLiveObservationSignalDashboardFixture("new-error")?.latestObservation?.payload.logs.length,
    1
  );
  assert.equal(
    getLiveObservationSignalDashboardFixture("three-signals")?.latestObservation?.payload.logs
      .length,
    2
  );
  assert.equal(
    getLiveObservationSignalDashboardFixture("no-requests")?.latestObservation?.payload.requests,
    0
  );
  assert.equal(
    getLiveObservationSignalDashboardFixture("delayed")?.latestObservation?.payload.state,
    "delayed"
  );
  assert.equal(
    getLiveObservationSignalDashboardFixture("unavailable")?.latestObservation?.payload.state,
    "unavailable"
  );
  assert.equal(getLiveObservationSignalDashboardFixture("unknown"), null);
});
