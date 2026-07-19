import assert from "node:assert/strict";
import test from "node:test";
import type {
  BoardAutoOrganizeCandidateSet,
  DiagramJson,
  TerraformSyncFileInput
} from "@sketchcatch/types";

import {
  applyBoardAutoOrganizeCandidate,
  createBoardAutoOrganizePreviewSession,
  getBoardAutoOrganizeSelectedCandidate,
  getBoardAutoOrganizeViewportPolicy,
  getBoardAutoOrganizeVisibleDiagram,
  selectBoardAutoOrganizeCandidate,
  selectBoardAutoOrganizePreviewView
} from "./board-auto-organize-preview";

test("자동 정리 미리보기는 처음 한 번만 화면을 맞추고 전환에서는 같은 화면을 유지한다", () => {
  assert.deepEqual(getBoardAutoOrganizeViewportPolicy("open"), {
    applySourceViewport: true,
    autoFit: true
  });
  assert.deepEqual(getBoardAutoOrganizeViewportPolicy("switch"), {
    applySourceViewport: false,
    autoFit: false
  });
});

test("preview session keeps every safe candidate and the source draft revision", () => {
  const source = createDiagram();
  const candidateSet = createCandidateSet(source);
  const session = createBoardAutoOrganizePreviewSession(source, candidateSet, 7, {
    x: 33,
    y: 44,
    zoom: 0.7
  });

  assert.equal(session.sessionId, candidateSet.sessionId);
  assert.equal(session.sourceFingerprint, candidateSet.sourceFingerprint);
  assert.equal(session.sourceDraftRevision, 7);
  assert.equal(session.selectedCandidateId, candidateSet.candidates[0]!.id);
  assert.equal(session.activeView, "organized");
  assert.deepEqual(session.viewportBeforePreview, { x: 33, y: 44, zoom: 0.7 });
  assert.notEqual(session.originalDiagram, source);
  assert.notEqual(session.candidates, candidateSet.candidates);
});

test("switching candidates changes only local selection and never returns a diagram to apply", () => {
  const source = createDiagram();
  const candidateSet = createCandidateSet(source);
  const session = createBoardAutoOrganizePreviewSession(source, candidateSet, 7);
  const sourceSnapshot = structuredClone(source);
  const candidateSnapshot = structuredClone(candidateSet);

  const next = selectBoardAutoOrganizeCandidate(session, candidateSet.candidates[1]!.id);

  assert.equal(next.selectedCandidateId, candidateSet.candidates[1]!.id);
  assert.equal("pendingApply" in next, false);
  assert.equal("diagramToApply" in next, false);
  assert.deepEqual(source, sourceSnapshot);
  assert.deepEqual(candidateSet, candidateSnapshot);
  assert.deepEqual(getBoardAutoOrganizeVisibleDiagram(next), candidateSet.candidates[1]!.diagram);
});

test("original and arrangement view switching keeps the selected candidate", () => {
  const source = createDiagram();
  const candidateSet = createCandidateSet(source);
  const session = selectBoardAutoOrganizeCandidate(
    createBoardAutoOrganizePreviewSession(source, candidateSet, 7),
    candidateSet.candidates[1]!.id
  );

  const originalView = selectBoardAutoOrganizePreviewView(session, "original");
  const organizedView = selectBoardAutoOrganizePreviewView(originalView, "organized");

  assert.deepEqual(getBoardAutoOrganizeVisibleDiagram(originalView), source);
  assert.equal(organizedView.selectedCandidateId, candidateSet.candidates[1]!.id);
  assert.deepEqual(
    getBoardAutoOrganizeSelectedCandidate(organizedView)?.diagram,
    candidateSet.candidates[1]!.diagram
  );
});

test("stale source revision blocks apply without calling the server save", async () => {
  const source = createDiagram();
  const session = createBoardAutoOrganizePreviewSession(source, createCandidateSet(source), 7);
  let saveCalls = 0;

  const result = await applyBoardAutoOrganizeCandidate({
    currentDiagram: source,
    currentDraftRevision: 8,
    save: async () => {
      saveCalls += 1;
      return { revision: 9 };
    },
    session,
    terraformFiles: []
  });

  assert.equal(result.status, "stale");
  assert.equal("diagramToApply" in result, false);
  assert.equal(saveCalls, 0);
});

test("a source visual change blocks apply even when Resource meaning stays the same", async () => {
  const source = createDiagram();
  const session = createBoardAutoOrganizePreviewSession(source, createCandidateSet(source), 7);
  const changedCurrent = structuredClone(source);
  changedCurrent.nodes[0]!.position = { x: 99, y: 101 };
  let saveCalls = 0;

  const result = await applyBoardAutoOrganizeCandidate({
    currentDiagram: changedCurrent,
    currentDraftRevision: 7,
    save: async () => {
      saveCalls += 1;
      return { revision: 8 };
    },
    session,
    terraformFiles: []
  });

  assert.equal(result.status, "stale");
  assert.equal(saveCalls, 0);
});

test("apply exposes the selected diagram only after the exact server request succeeds", async () => {
  const source = createDiagram();
  const candidateSet = createCandidateSet(source);
  const session = selectBoardAutoOrganizeCandidate(
    createBoardAutoOrganizePreviewSession(source, candidateSet, 7),
    candidateSet.candidates[1]!.id
  );
  const terraformFiles: TerraformSyncFileInput[] = [
    { fileName: "main.tf", terraformCode: "" }
  ];
  let releaseSave: (() => void) | undefined;
  const observedRequests: unknown[] = [];
  const applyPromise = applyBoardAutoOrganizeCandidate({
    currentDiagram: source,
    currentDraftRevision: 7,
    save: async (request) => {
      observedRequests.push(request);
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      return { revision: 8 };
    },
    session,
    terraformFiles
  });
  let settled = false;
  void applyPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  releaseSave?.();
  const result = await applyPromise;

  assert.equal(result.status, "saved");
  assert.deepEqual(result.diagramToApply, candidateSet.candidates[1]!.diagram);
  assert.notEqual(result.diagramToApply, candidateSet.candidates[1]!.diagram);
  assert.deepEqual(Object.keys(observedRequests[0] as object).sort(), [
    "candidateDiagram",
    "candidateId",
    "expectedRevision",
    "sessionId",
    "sourceDiagram",
    "sourceFingerprint",
    "terraformFiles"
  ]);
  assert.equal(JSON.stringify(observedRequests[0]).includes("compiler"), false);
  assert.equal(JSON.stringify(observedRequests[0]).includes("quality"), false);
});

/** 미리보기 계약을 확인할 최소 source Diagram을 만듭니다. */
function createDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 168, height: 96 },
        label: "Web server",
        locked: false,
        zIndex: 1,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: "web",
          fileName: "main",
          values: { instanceType: "t3.micro" }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** 서로 다른 두 시각 정리안을 Task 6 public contract 모양으로 만듭니다. */
function createCandidateSet(source: DiagramJson): BoardAutoOrganizeCandidateSet {
  const first = structuredClone(source);
  first.nodes[0]!.position = { x: 240, y: 120 };
  const second = structuredClone(source);
  second.nodes[0]!.position = { x: 420, y: 180 };

  return {
    sessionId: "board-auto-session:1234abcd",
    sourceFingerprint: "1234abcd",
    candidates: [
      {
        id: "candidate-secret-alpha",
        diagram: first,
        visualDiff: {
          movedNodeIds: ["node-a"],
          resizedNodeIds: [],
          reroutedEdgeIds: [],
          addedFrameIds: [],
          changedFrameIds: [],
          removedFrameIds: []
        },
        explanations: [
          "Web server를 보기 편한 위치로 옮겼습니다.",
          "Resource, 설정, 연결 관계는 바뀌지 않았습니다."
        ],
        visualFingerprint: "visual-secret-alpha"
      },
      {
        id: "candidate-secret-beta",
        diagram: second,
        visualDiff: {
          movedNodeIds: ["node-a"],
          resizedNodeIds: [],
          reroutedEdgeIds: [],
          addedFrameIds: [],
          changedFrameIds: [],
          removedFrameIds: []
        },
        explanations: [
          "Web server의 흐름을 한눈에 볼 수 있게 정리했습니다.",
          "Resource, 설정, 연결 관계는 바뀌지 않았습니다."
        ],
        visualFingerprint: "visual-secret-beta"
      }
    ]
  };
}
