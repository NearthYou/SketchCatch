import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson
} from "@sketchcatch/types";
import {
  acceptProgressSnapshot,
  applyProgressCandidateExclusions,
  awaitDraftProgressInput,
  completeDraftProgress,
  createDraftProgressState,
  interruptDraftProgress,
  projectDraftProgressExclusions,
  receiveDraftProgressSnapshot,
  startDraftProgressRequest
} from "./ai-draft-progress-model";

const architectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "candidate-cloudfront",
      type: "CLOUDFRONT",
      label: "CDN",
      positionX: 80,
      positionY: 120,
      config: {}
    },
    {
      id: "candidate-s3",
      type: "S3",
      label: "Static Bucket",
      positionX: 280,
      positionY: 120,
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

const snapshot: ArchitectureDraftProgressSnapshot = {
  sequence: 2,
  provisionalArchitectureJson: architectureJson,
  excludableCandidateIds: ["candidate-cloudfront", "candidate-s3"]
};

const exclusion: ArchitectureDraftCandidateExclusion = {
  candidateId: "candidate-s3",
  resourceType: "S3",
  label: "Static Bucket"
};

test("진행 snapshot은 같은 요청에서 더 큰 sequence만 전체 교체한다", () => {
  const older = { ...snapshot, sequence: 1 };
  const newer = { ...snapshot, sequence: 3 };

  assert.equal(acceptProgressSnapshot(snapshot, older), snapshot);
  assert.equal(acceptProgressSnapshot(snapshot, { ...snapshot }), snapshot);
  assert.equal(acceptProgressSnapshot(snapshot, newer), newer);
  assert.equal(acceptProgressSnapshot(null, older), older);
});

test("후보 제외는 승인된 node와 incident edge만 숨기고 원본 snapshot으로 되돌린다", () => {
  const excluded = applyProgressCandidateExclusions(snapshot, [exclusion]);

  assert.deepEqual(
    excluded.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront"]
  );
  assert.deepEqual(excluded.provisionalArchitectureJson?.edges, []);
  assert.deepEqual(excluded.excludableCandidateIds, ["candidate-cloudfront"]);
  assert.equal(applyProgressCandidateExclusions(snapshot, []), snapshot);
  assert.notEqual(excluded, snapshot);
  assert.deepEqual(snapshot.provisionalArchitectureJson, architectureJson);
});

test("continuation 중에도 보이는 후보를 제외하고 즉시 되돌린다", () => {
  let state = startDraftProgressRequest(createDraftProgressState());
  state = receiveDraftProgressSnapshot(state, snapshot, []);
  state = projectDraftProgressExclusions(state, [exclusion]);
  state = startDraftProgressRequest(state);
  state = receiveDraftProgressSnapshot(
    state,
    {
      ...snapshot,
      sequence: 1
    },
    [exclusion]
  );

  assert.deepEqual(
    state.serverSnapshot?.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront", "candidate-s3"]
  );
  assert.deepEqual(
    state.visibleSnapshot?.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront"]
  );

  const undone = projectDraftProgressExclusions(state, []);
  assert.deepEqual(
    undone.visibleSnapshot?.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront", "candidate-s3"]
  );
});

test("취소와 오류는 last-good projection을 유지하고 retry는 새 sequence를 받는다", () => {
  let state = startDraftProgressRequest(createDraftProgressState());
  state = receiveDraftProgressSnapshot(state, snapshot, []);

  const interrupted = interruptDraftProgress(state);
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.visibleSnapshot, state.visibleSnapshot);
  assert.equal(interrupted.serverSnapshot, state.serverSnapshot);

  const retried = startDraftProgressRequest(interrupted);
  assert.equal(retried.status, "streaming");
  assert.equal(retried.requestSnapshot, null);
  assert.equal(retried.visibleSnapshot, state.visibleSnapshot);

  const next = receiveDraftProgressSnapshot(
    retried,
    {
      ...snapshot,
      sequence: 1
    },
    []
  );
  assert.equal(next.requestSnapshot?.sequence, 1);
  assert.equal(next.visibleSnapshot?.provisionalArchitectureJson, architectureJson);
});

test("첫 snapshot 전 중단도 retry 가능한 상태로 남는다", () => {
  const interrupted = interruptDraftProgress(
    startDraftProgressRequest(createDraftProgressState())
  );

  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.visibleSnapshot, null);
  assert.equal(startDraftProgressRequest(interrupted).status, "streaming");
});

test("추가 입력 대기는 projection을 유지하고 final 전환은 lifecycle만 초기화한다", () => {
  const streaming = receiveDraftProgressSnapshot(
    startDraftProgressRequest(createDraftProgressState()),
    snapshot,
    []
  );
  const awaiting = awaitDraftProgressInput(streaming);

  assert.equal(awaiting.status, "awaiting_input");
  assert.equal(awaiting.visibleSnapshot?.sequence, snapshot.sequence);
  assert.deepEqual(completeDraftProgress(), createDraftProgressState());
  assert.deepEqual(Object.keys(createDraftProgressState()).sort(), [
    "requestSnapshot",
    "serverSnapshot",
    "status",
    "visibleSnapshot"
  ]);
});
