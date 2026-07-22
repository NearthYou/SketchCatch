import assert from "node:assert/strict";
import test from "node:test";
import { parseAwsConnectionListQuery } from "./aws-connections.js";

test("AWS 연결 목록은 includeUnverified=true일 때만 미검증 연결을 포함한다", () => {
  assert.deepEqual(parseAwsConnectionListQuery({}), { includeUnverified: false });
  assert.deepEqual(parseAwsConnectionListQuery({ includeUnverified: "false" }), {
    includeUnverified: false
  });
  assert.deepEqual(parseAwsConnectionListQuery({ includeUnverified: "true" }), {
    includeUnverified: true
  });
});

test("AWS 연결 목록의 알 수 없는 includeUnverified 값은 거절한다", () => {
  assert.throws(() => parseAwsConnectionListQuery({ includeUnverified: "yes" }));
});
