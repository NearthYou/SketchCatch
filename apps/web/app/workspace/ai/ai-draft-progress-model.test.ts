import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson
} from "@sketchcatch/types";
import {
  acceptProgressSnapshot,
  awaitDraftProgressInput,
  completeDraftProgress,
  computeDraftProgressDifference,
  createDraftProgressState,
  createDraftProgressHistory,
  createProgressDiagram,
  excludeProgressCandidate,
  interruptDraftProgress,
  getDraftProgressPlaceholder,
  preserveDraftProgressProjection,
  projectDraftProgressExclusions,
  receiveDraftProgressSnapshot,
  resolveDraftProgressMobilePane,
  startDraftProgressRequest,
  undoProgressCandidate
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
  stage: "querying_amazon_q",
  confirmedRequirements: ["정적 웹사이트"],
  pendingQuestions: [],
  provisionalArchitectureJson: architectureJson,
  excludableCandidateIds: ["candidate-cloudfront", "candidate-s3"]
};

const exclusion: ArchitectureDraftCandidateExclusion = {
  candidateId: "candidate-s3",
  resourceType: "S3",
  label: "Static Bucket"
};

test("진행 snapshot은 같은 요청에서 더 큰 sequence만 전체 교체한다", () => {
  const older = { ...snapshot, sequence: 1, confirmedRequirements: ["오래된 값"] };
  const newer = { ...snapshot, sequence: 3, confirmedRequirements: ["새 값"] };

  assert.equal(acceptProgressSnapshot(snapshot, older), snapshot);
  assert.equal(acceptProgressSnapshot(snapshot, { ...snapshot }), snapshot);
  assert.equal(acceptProgressSnapshot(snapshot, newer), newer);
  assert.equal(acceptProgressSnapshot(null, older), older);
});

test("후보 제외는 선택 node와 incident edge를 숨기고 원본 snapshot에서 되돌린다", () => {
  const excluded = excludeProgressCandidate(snapshot, exclusion);

  assert.deepEqual(
    excluded.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront"]
  );
  assert.deepEqual(excluded.provisionalArchitectureJson?.edges, []);
  assert.deepEqual(excluded.excludableCandidateIds, ["candidate-cloudfront"]);

  const restored = undoProgressCandidate(snapshot, []);
  assert.deepEqual(restored, snapshot);
  assert.notEqual(excluded, snapshot);
  assert.deepEqual(snapshot.provisionalArchitectureJson, architectureJson);
});

test("진행 history와 최종 차이는 type/label identity로 added/removed를 계산한다", () => {
  const changed: ArchitectureDraftProgressSnapshot = {
    ...snapshot,
    sequence: 3,
    provisionalArchitectureJson: {
      nodes: [
        architectureJson.nodes[0]!,
        {
          id: "candidate-lambda-new-id",
          type: "LAMBDA",
          label: "Thumbnail Worker",
          positionX: 280,
          positionY: 120,
          config: {}
        }
      ],
      edges: []
    },
    excludableCandidateIds: ["candidate-cloudfront", "candidate-lambda-new-id"]
  };
  const finalArchitecture: ArchitectureJson = {
    nodes: [
      { ...architectureJson.nodes[0]!, id: "final-cdn" },
      {
        id: "final-api",
        type: "API_GATEWAY_REST_API",
        label: "Public API",
        positionX: 280,
        positionY: 120,
        config: {}
      }
    ],
    edges: []
  };

  assert.deepEqual(createDraftProgressHistory(snapshot, changed), [
    { kind: "removed", candidateId: "candidate-s3", resourceType: "S3", label: "Static Bucket" },
    { kind: "added", candidateId: "candidate-lambda-new-id", resourceType: "LAMBDA", label: "Thumbnail Worker" }
  ]);
  assert.deepEqual(computeDraftProgressDifference(changed, finalArchitecture), {
    added: 1,
    removed: 1
  });
});

test("visible progress snapshot만 Diagram으로 변환한다", () => {
  const excluded = excludeProgressCandidate(snapshot, exclusion);
  const diagram = createProgressDiagram(excluded);

  assert.equal(diagram?.nodes.some(({ id }) => id === "candidate-s3"), false);
  assert.equal(diagram?.edges.length, 0);
});

test("첫 요청의 preparing snapshot은 graph 없이도 요구사항과 질문을 표시한다", () => {
  const preparing: ArchitectureDraftProgressSnapshot = {
    sequence: 1,
    stage: "preparing_requirements",
    confirmedRequirements: ["정적 웹사이트"],
    pendingQuestions: ["파일 업로드가 필요한가요?"],
    provisionalArchitectureJson: null,
    excludableCandidateIds: []
  };

  const visible = preserveDraftProgressProjection(null, preparing);

  assert.equal(visible, preparing);
  assert.deepEqual(visible.confirmedRequirements, ["정적 웹사이트"]);
  assert.deepEqual(visible.pendingQuestions, ["파일 업로드가 필요한가요?"]);
  assert.equal(visible.provisionalArchitectureJson, null);
});

test("후보 제외 continuation의 preparing snapshot은 현재 투영과 history를 유지한다", () => {
  const excluded = excludeProgressCandidate(snapshot, exclusion);
  const preparing: ArchitectureDraftProgressSnapshot = {
    sequence: 1,
    stage: "preparing_requirements",
    confirmedRequirements: ["정적 웹사이트", "S3 후보 제외"],
    pendingQuestions: ["대체 저장소가 필요한가요?"],
    provisionalArchitectureJson: null,
    excludableCandidateIds: []
  };

  const visible = preserveDraftProgressProjection(excluded, preparing);

  assert.equal(visible.stage, "preparing_requirements");
  assert.deepEqual(visible.confirmedRequirements, preparing.confirmedRequirements);
  assert.deepEqual(visible.pendingQuestions, preparing.pendingQuestions);
  assert.deepEqual(
    visible.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront"]
  );
  assert.deepEqual(visible.excludableCandidateIds, ["candidate-cloudfront"]);
  assert.deepEqual(createDraftProgressHistory(excluded, visible), []);

  const undoWhilePreparing = preserveDraftProgressProjection(
    visible,
    undoProgressCandidate(preparing, [])
  );
  assert.deepEqual(
    undoWhilePreparing.provisionalArchitectureJson?.nodes.map(({ id }) => id),
    ["candidate-cloudfront"]
  );
  assert.deepEqual(createDraftProgressHistory(visible, undoWhilePreparing), []);
});

test("retry와 follow-up continuation의 preparing snapshot은 last-good graph를 지우지 않는다", () => {
  const retryPreparing: ArchitectureDraftProgressSnapshot = {
    sequence: 1,
    stage: "preparing_requirements",
    confirmedRequirements: ["정적 웹사이트", "재시도"],
    pendingQuestions: [],
    provisionalArchitectureJson: null,
    excludableCandidateIds: []
  };
  const retried = preserveDraftProgressProjection(snapshot, retryPreparing);
  const followUpPreparing: ArchitectureDraftProgressSnapshot = {
    ...retryPreparing,
    confirmedRequirements: ["정적 웹사이트", "파일 업로드 허용"],
    pendingQuestions: ["업로드 용량 제한은 얼마인가요?"]
  };

  const followedUp = preserveDraftProgressProjection(retried, followUpPreparing);

  assert.equal(retried.provisionalArchitectureJson, architectureJson);
  assert.equal(followedUp.provisionalArchitectureJson, architectureJson);
  assert.deepEqual(followedUp.confirmedRequirements, followUpPreparing.confirmedRequirements);
  assert.deepEqual(followedUp.pendingQuestions, followUpPreparing.pendingQuestions);
  assert.deepEqual(createDraftProgressHistory(snapshot, retried), []);
  assert.deepEqual(createDraftProgressHistory(retried, followedUp), []);
});

test("continuation의 graph 없는 snapshot 뒤에도 보이는 후보를 제외하고 즉시 되돌린다", () => {
  let state = startDraftProgressRequest(createDraftProgressState());
  state = receiveDraftProgressSnapshot(state, snapshot, []);
  state = projectDraftProgressExclusions(state, [exclusion]);
  state = startDraftProgressRequest(state);
  state = receiveDraftProgressSnapshot(
    state,
    {
      sequence: 1,
      stage: "preparing_requirements",
      confirmedRequirements: ["정적 웹사이트", "S3 후보 제외"],
      pendingQuestions: [],
      provisionalArchitectureJson: null,
      excludableCandidateIds: []
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

test("취소와 오류 상태는 last-good preview를 유지하고 retry는 같은 화면에서 새 sequence를 시작한다", () => {
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
      sequence: 1,
      stage: "preparing_requirements",
      provisionalArchitectureJson: null,
      excludableCandidateIds: []
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

test("최종 Draft 전환은 차이를 계산한 뒤 progress state를 하나의 idle 상태로 비운다", () => {
  let state = startDraftProgressRequest(createDraftProgressState());
  state = receiveDraftProgressSnapshot(state, snapshot, []);
  const finalArchitecture: ArchitectureJson = {
    nodes: [
      { ...architectureJson.nodes[0]!, id: "final-cdn" },
      {
        id: "final-api",
        type: "API_GATEWAY_REST_API",
        label: "Public API",
        positionX: 280,
        positionY: 120,
        config: {}
      }
    ],
    edges: []
  };

  const completed = completeDraftProgress(state, finalArchitecture);

  assert.deepEqual(completed.difference, { added: 1, removed: 1 });
  assert.deepEqual(completed.state, createDraftProgressState());
});

test("모바일 자동 전환은 진행 snapshot을 보여주고 질문이 필요하면 대화로 돌아온다", () => {
  assert.equal(
    resolveDraftProgressMobilePane("conversation", "snapshot_received", false),
    "progress"
  );
  assert.equal(
    resolveDraftProgressMobilePane("progress", "awaiting_input", false),
    "conversation"
  );
  assert.equal(
    resolveDraftProgressMobilePane("progress", "awaiting_input", true),
    "progress"
  );

  const awaiting = awaitDraftProgressInput(
    receiveDraftProgressSnapshot(startDraftProgressRequest(createDraftProgressState()), snapshot, [])
  );
  assert.equal(awaiting.status, "awaiting_input");
  assert.equal(awaiting.visibleSnapshot?.sequence, snapshot.sequence);
});

test("graph 없는 progress placeholder는 streaming에서만 작업 중으로 표시한다", () => {
  assert.deepEqual(getDraftProgressPlaceholder("streaming"), {
    busy: true,
    message: "Resource 후보를 구조화하고 있습니다."
  });
  assert.deepEqual(getDraftProgressPlaceholder("awaiting_input"), {
    busy: false,
    message: "대화에서 추가 답변을 기다리고 있습니다."
  });
  assert.deepEqual(getDraftProgressPlaceholder("interrupted"), {
    busy: false,
    message: "업데이트가 중단됐습니다. 다시 시도할 수 있습니다."
  });
});
