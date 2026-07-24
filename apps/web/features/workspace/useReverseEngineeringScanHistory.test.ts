import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringScan } from "@sketchcatch/types";
import {
  isReverseEngineeringScanResultStale,
  prependReverseEngineeringScanHistory,
  removeReverseEngineeringScanHistory
} from "./useReverseEngineeringScanHistory";

// 기록 동작을 비교할 고정 scan fixture를 만듭니다.
function createScan(id: string): ReverseEngineeringScan {
  return {
    id,
    projectId: "project-1",
    awsConnectionId: "connection-1",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"],
    status: "completed",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    startedAt: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:00.000Z",
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
}

test("완료된 scan은 중복 없이 기록 맨 앞에 남는다", () => {
  const first = createScan("scan-1");
  const second = createScan("scan-2");

  assert.deepEqual(prependReverseEngineeringScanHistory([first, second], first), [first, second]);
  assert.deepEqual(prependReverseEngineeringScanHistory([first], second), [second, first]);
});

test("삭제한 scan은 기록에서만 제거한다", () => {
  const first = createScan("scan-1");
  const second = createScan("scan-2");

  assert.deepEqual(removeReverseEngineeringScanHistory([first, second], first.id), [second]);
});

test("열어 둔 결과가 최신 기록과 다르면 stale로 표시한다", () => {
  const latest = createScan("scan-2");
  const opened = createScan("scan-1");

  assert.equal(isReverseEngineeringScanResultStale({ scan: opened }, [latest, opened]), true);
  assert.equal(isReverseEngineeringScanResultStale({ scan: latest }, [latest, opened]), false);
  assert.equal(isReverseEngineeringScanResultStale(null, [latest]), false);
});
