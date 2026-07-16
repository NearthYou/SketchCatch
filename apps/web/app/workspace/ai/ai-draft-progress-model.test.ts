import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson
} from "@sketchcatch/types";
import {
  acceptProgressSnapshot,
  computeDraftProgressDifference,
  createDraftProgressHistory,
  createProgressDiagram,
  excludeProgressCandidate,
  preserveDraftProgressProjection,
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
