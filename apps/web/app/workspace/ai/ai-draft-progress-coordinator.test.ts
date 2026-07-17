import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson
} from "@sketchcatch/types";
import { AiDraftProgressCoordinator } from "./ai-draft-progress-coordinator";

const architectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "candidate-s3",
      type: "S3",
      label: "Static Website Bucket",
      positionX: 120,
      positionY: 160,
      config: {}
    },
    {
      id: "candidate-cloudfront",
      type: "CLOUDFRONT",
      label: "Public CDN",
      positionX: 360,
      positionY: 160,
      config: {}
    }
  ],
  edges: [
    {
      id: "edge-cdn-bucket",
      sourceId: "candidate-cloudfront",
      targetId: "candidate-s3",
      label: "origin"
    }
  ]
};

function createSnapshot(sequence: number): ArchitectureDraftProgressSnapshot {
  return {
    sequence,
    provisionalArchitectureJson: architectureJson,
    excludableCandidateIds: architectureJson.nodes.map(({ id }) => id)
  };
}

test("새 요청은 이전 요청을 abort하고 stale progress/result를 거부한다", () => {
  const coordinator = new AiDraftProgressCoordinator();
  const first = coordinator.begin({ prompt: "정적 웹사이트" });
  const second = coordinator.begin({ prompt: "정적 웹사이트와 CDN" });

  assert.equal(first.signal.aborted, true);
  assert.equal(coordinator.receive(first, createSnapshot(1)), null);
  assert.equal(coordinator.complete(first), false);
  assert.equal(coordinator.receive(second, createSnapshot(1))?.visibleSnapshot !== null, true);
  assert.equal(coordinator.complete(second), true);
});

test("첫 snapshot 전 취소해도 마지막 요청으로 같은 화면에서 재시도한다", () => {
  const coordinator = new AiDraftProgressCoordinator();
  const active = coordinator.begin({ prompt: "정적 웹사이트" });

  const interrupted = coordinator.cancel(true);

  assert.equal(active.signal.aborted, true);
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.visibleSnapshot, null);
  assert.deepEqual(coordinator.retryRequest(), { prompt: "정적 웹사이트" });

  const retry = coordinator.begin(coordinator.retryRequest()!);
  assert.equal(coordinator.state.status, "streaming");
  assert.equal(coordinator.receive(retry, createSnapshot(1))?.visibleSnapshot !== null, true);
});

test("서버가 허용한 후보 제외과 undo는 재시작 request payload와 투영을 같이 바꾼다", () => {
  const coordinator = new AiDraftProgressCoordinator();
  const active = coordinator.begin({ prompt: "정적 웹사이트" });
  coordinator.receive(active, createSnapshot(1));

  const excluded = coordinator.exclude("candidate-s3");

  assert.ok(excluded);
  assert.equal(active.signal.aborted, true);
  assert.deepEqual(excluded.exclusion, {
    candidateId: "candidate-s3",
    resourceType: "S3",
    label: "Static Website Bucket"
  });
  assert.deepEqual(excluded.request.candidateExclusions, [excluded.exclusion]);
  assert.deepEqual(
    excluded.state.visibleSnapshot?.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront"]
  );

  const restart = coordinator.begin(excluded.request);
  coordinator.receive(restart, createSnapshot(1));
  const undone = coordinator.undoLastExclusion();

  assert.ok(undone);
  assert.deepEqual(undone.request.candidateExclusions, []);
  assert.deepEqual(
    undone.state.visibleSnapshot?.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-s3", "candidate-cloudfront"]
  );
});

test("추가 답변 대기와 final 전환을 상태로 보장하고 compiler 실패 시 last-good을 유지한다", () => {
  const coordinator = new AiDraftProgressCoordinator();
  const active = coordinator.begin({ prompt: "정적 웹사이트" });
  coordinator.receive(active, createSnapshot(1));
  coordinator.complete(active);

  assert.equal(coordinator.awaitInput().status, "awaiting_input");

  assert.throws(() =>
    coordinator.finalize(() => {
      throw new Error("compiler failed");
    })
  );
  assert.equal(coordinator.state.status, "awaiting_input");
  assert.equal(coordinator.state.visibleSnapshot?.sequence, 1);

  const finalized = coordinator.finalize(() => ({ proposal: true }));
  assert.deepEqual(finalized.value, { proposal: true });
  assert.equal(finalized.state.status, "idle");
  assert.equal(finalized.state.visibleSnapshot, null);
  assert.equal(coordinator.state, finalized.state);
});

test("active stream의 compiler 실패는 요청을 먼저 닫지 않고 interrupted로 전환한다", () => {
  const coordinator = new AiDraftProgressCoordinator();
  const active = coordinator.begin({ prompt: "정적 웹사이트" });
  coordinator.receive(active, createSnapshot(1));

  assert.throws(() =>
    coordinator.finalize(() => {
      throw new Error("compiler failed");
    })
  );
  assert.equal(coordinator.isActive(active), true);
  assert.equal(coordinator.interrupt(active)?.status, "interrupted");
  assert.equal(coordinator.state.visibleSnapshot?.sequence, 1);
});
