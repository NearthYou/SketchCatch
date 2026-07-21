import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationProviderSnapshot } from "@sketchcatch/types";

import { groupLiveObservationLogs } from "./live-observation-log-groups.js";

test("변하는 request ID를 제외하고 같은 오류 로그를 하나로 묶는다", () => {
  const groups = groupLiveObservationLogs([
    log("2026-07-21T01:00:00.000Z", "database connection failed requestId=abc-123"),
    log("2026-07-21T01:01:00.000Z", "database connection failed requestId=def-456")
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kind, "error");
  assert.equal(groups[0]?.count, 2);
  assert.match(groups[0]?.normalizedMessage ?? "", /requestid=\[id\]/);
  assert.match(groups[0]?.id ?? "", /^error:[a-f0-9]{8}$/);
  assert.doesNotMatch(groups[0]?.id ?? "", /database|request|abc|def/);
  assert.equal(groups[0]?.representative.message, "database connection failed requestId=def-456");
});

test("오류, 경고, 복구 신호와 확인할 로그를 구분한다", () => {
  const groups = groupLiveObservationLogs([
    log("2026-07-21T01:00:00.000Z", "request failed"),
    log("2026-07-21T01:01:00.000Z", "warning retrying request"),
    log("2026-07-21T01:02:00.000Z", "service recovered"),
    log("2026-07-21T01:03:00.000Z", "worker started")
  ]);

  assert.deepEqual(
    groups.map((group) => group.kind),
    ["error", "warning", "recovery", "check"]
  );
});

test("로그가 없다고 정상으로 판단하지 않고 빈 그룹만 반환한다", () => {
  assert.deepEqual(groupLiveObservationLogs([]), []);
});

function log(timestamp: string, message: string): LiveObservationProviderSnapshot["logs"][number] {
  return { message, timestamp };
}
