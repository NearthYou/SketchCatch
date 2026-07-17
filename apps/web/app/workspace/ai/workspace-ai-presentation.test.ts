import assert from "node:assert/strict";
import test from "node:test";
import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  ArchitectureDraftProgressSnapshot,
  DiagramJson
} from "@sketchcatch/types";
import {
  getComposerEnterAction,
  getProgressCandidateActions,
  getRetryRequestLabel,
  getWorkspaceAiStageTransition,
  isSuggestionDisabled,
  resolveFinalArchitectureDiagram,
  shouldAutoFollowTranscript
} from "./workspace-ai-presentation";
import { appendSelectedAssistantOption } from "./selected-option-model";

test("이미 선택한 single 질문과 loading 중 suggestion은 비활성화한다", () => {
  const selections = appendSelectedAssistantOption([], {
    label: "서버리스",
    questionMessageId: "question-1",
    selectedAt: "2026-07-17T01:00:00.000Z"
  }).selections;

  assert.equal(isSuggestionDisabled(selections, "question-1", "idle"), true);
  assert.equal(isSuggestionDisabled(selections, "question-2", "loading"), true);
  assert.equal(isSuggestionDisabled(selections, "question-2", "idle", true), true);
  assert.equal(isSuggestionDisabled(selections, "question-2", "idle"), false);
});

test("composer Enter는 IME와 Shift 줄바꿈을 침범하지 않는다", () => {
  assert.equal(
    getComposerEnterAction({ isComposing: false, key: "Enter", shiftKey: false }),
    "submit"
  );
  assert.equal(
    getComposerEnterAction({ isComposing: false, key: "Enter", shiftKey: true }),
    "newline"
  );
  assert.equal(
    getComposerEnterAction({ isComposing: true, key: "Enter", shiftKey: false }),
    "ignore"
  );
  assert.equal(getComposerEnterAction({ isComposing: false, key: "a", shiftKey: false }), "ignore");
});

test("오류와 사용자 취소는 각각 마지막 요청 retry action을 제공한다", () => {
  assert.equal(getRetryRequestLabel("error"), "마지막 요청 다시 시도");
  assert.equal(getRetryRequestLabel("cancelled"), "취소한 요청 다시 시도");
  assert.equal(getRetryRequestLabel("idle"), null);
  assert.equal(getRetryRequestLabel("loading"), null);
});

test("final 장면은 Orbit exit 뒤 Preview를 공개하고 reduced-motion은 즉시 전환한다", () => {
  assert.deepEqual(
    getWorkspaceAiStageTransition({ hasFinalPreview: false, prefersReducedMotion: false }),
    { delayMs: 0, phase: "orbit" }
  );
  assert.deepEqual(
    getWorkspaceAiStageTransition({ hasFinalPreview: true, prefersReducedMotion: false }),
    { delayMs: 440, phase: "orbit-exiting" }
  );
  assert.deepEqual(
    getWorkspaceAiStageTransition({ hasFinalPreview: true, prefersReducedMotion: true }),
    { delayMs: 0, phase: "preview" }
  );
});

test("transcript auto-follow는 사용자가 이미 하단을 읽고 있을 때만 허용한다", () => {
  assert.equal(
    shouldAutoFollowTranscript({ clientHeight: 300, scrollHeight: 820, scrollTop: 500 }),
    true
  );
  assert.equal(
    shouldAutoFollowTranscript({ clientHeight: 300, scrollHeight: 820, scrollTop: 280 }),
    false
  );
});

test("candidate action은 server snapshot의 실제 excludable ID와 label만 노출한다", () => {
  const snapshot = {
    excludableCandidateIds: ["candidate-rds", "stale-id"],
    provisionalArchitectureJson: {
      edges: [],
      nodes: [
        {
          id: "candidate-rds",
          label: "Orders database",
          type: "RDS",
          config: {},
          positionX: 0,
          positionY: 0
        },
        {
          id: "decorative-only",
          label: "Orbit Lambda",
          type: "LAMBDA",
          config: {},
          positionX: 0,
          positionY: 0
        }
      ]
    },
    sequence: 3
  } as ArchitectureDraftProgressSnapshot;

  assert.deepEqual(getProgressCandidateActions(snapshot), [
    { candidateId: "candidate-rds", label: "Orders database", resourceType: "RDS" }
  ]);
});

test("final Preview는 Draft의 임의 diagramJson이 아니라 Compiler proposal diagram만 사용한다", () => {
  const draftDiagram = { edges: [], nodes: [], viewport: { x: 1, y: 1, zoom: 1 } } as DiagramJson;
  const compilerDiagram = {
    edges: [],
    nodes: [],
    viewport: { x: 9, y: 9, zoom: 0.8 }
  } as DiagramJson;
  const draft = { diagramJson: draftDiagram } as AiArchitectureDraftResult;
  const proposal = { diagram: compilerDiagram } as ArchitectureBoardCompilationProposal;

  assert.equal(resolveFinalArchitectureDiagram(draft, null), null);
  assert.equal(resolveFinalArchitectureDiagram(null, proposal), null);
  assert.equal(resolveFinalArchitectureDiagram(draft, proposal), compilerDiagram);
  assert.notEqual(resolveFinalArchitectureDiagram(draft, proposal), draftDiagram);
});
