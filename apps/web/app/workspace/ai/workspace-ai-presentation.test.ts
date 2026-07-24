import assert from "node:assert/strict";
import test from "node:test";
import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  DiagramJson
} from "@sketchcatch/types";
import {
  createWorkspaceAiOrbitReactionKey,
  getComposerEnterAction,
  getRetryRequestLabel,
  getWorkspaceAiErrorMessage,
  getWorkspaceAiOrbitPresentation,
  getWorkspaceAiStageTransition,
  isSuggestionDisabled,
  resolveWorkspaceAiMobileView,
  resolveFinalArchitectureDiagram,
  shouldShowMobilePreviewTrigger,
  shouldAutoFollowTranscript,
  shouldReleaseForcedTranscriptFollow
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
    getWorkspaceAiStageTransition({
      currentPhase: "orbit",
      hasFinalPreview: false,
      prefersReducedMotion: false
    }),
    { delayMs: 0, phase: "orbit" }
  );
  assert.deepEqual(
    getWorkspaceAiStageTransition({
      currentPhase: "orbit",
      hasFinalPreview: true,
      prefersReducedMotion: false
    }),
    { delayMs: 440, phase: "orbit-exiting" }
  );
  assert.deepEqual(
    getWorkspaceAiStageTransition({
      currentPhase: "orbit",
      hasFinalPreview: true,
      prefersReducedMotion: true
    }),
    { delayMs: 0, phase: "preview" }
  );
  assert.deepEqual(
    getWorkspaceAiStageTransition({
      currentPhase: "preview",
      hasFinalPreview: true,
      prefersReducedMotion: false
    }),
    { delayMs: 0, phase: "preview" }
  );
});

test("대화가 쌓이면 바깥 궤도부터 줄고 final 전환에서는 한 점으로 수렴한다", () => {
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 0, stagePhase: "orbit" }),
    { convergenceLevel: 0, phase: "exploring", visibleRingCount: 3 }
  );
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 1, stagePhase: "orbit" }),
    { convergenceLevel: 0, phase: "exploring", visibleRingCount: 3 }
  );
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 4, stagePhase: "orbit" }),
    { convergenceLevel: 1, phase: "exploring", visibleRingCount: 2 }
  );
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 8, stagePhase: "orbit" }),
    { convergenceLevel: 1, phase: "exploring", visibleRingCount: 2 }
  );
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 9, stagePhase: "orbit" }),
    { convergenceLevel: 2, phase: "exploring", visibleRingCount: 1 }
  );
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 4, stagePhase: "orbit-exiting" }),
    { convergenceLevel: 3, phase: "converging", visibleRingCount: 0 }
  );
  assert.deepEqual(
    getWorkspaceAiOrbitPresentation({ answerCount: 4, stagePhase: "preview" }),
    { convergenceLevel: 3, phase: "hidden", visibleRingCount: 0 }
  );
});

test("Orbit 반응 키는 대화 메시지가 아니라 장면 전환에만 반응한다", () => {
  const conversation = createWorkspaceAiOrbitReactionKey({
    stagePhase: "orbit"
  });
  const repeatedConversation = createWorkspaceAiOrbitReactionKey({
    stagePhase: "orbit"
  });
  const exiting = createWorkspaceAiOrbitReactionKey({
    stagePhase: "orbit-exiting"
  });

  assert.equal(repeatedConversation, conversation);
  assert.notEqual(exiting, conversation);
});

test("모바일은 초안이 준비돼도 대화를 유지하고 사용자가 열었을 때만 미리보기를 보여준다", () => {
  assert.equal(
    resolveWorkspaceAiMobileView({ hasFinalPreview: false, previewRequested: true }),
    "conversation"
  );
  assert.equal(
    resolveWorkspaceAiMobileView({ hasFinalPreview: true, previewRequested: false }),
    "conversation"
  );
  assert.equal(
    resolveWorkspaceAiMobileView({ hasFinalPreview: true, previewRequested: true }),
    "preview"
  );
  assert.equal(
    shouldShowMobilePreviewTrigger({ hasFinalPreview: true, mobileView: "conversation" }),
    true
  );
  assert.equal(
    shouldShowMobilePreviewTrigger({ hasFinalPreview: true, mobileView: "preview" }),
    false
  );
});

test("Workspace AI 오류는 내부 API 진단 없이 짧은 사용자 문구만 보여준다", () => {
  assert.equal(
    getWorkspaceAiErrorMessage("draft"),
    "AI 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요."
  );
  assert.equal(
    getWorkspaceAiErrorMessage("apply"),
    "보드에 적용하지 못했어요. 잠시 후 다시 시도해 주세요."
  );
  assert.doesNotMatch(
    Object.values({
      load: getWorkspaceAiErrorMessage("load"),
      draft: getWorkspaceAiErrorMessage("draft"),
      patch: getWorkspaceAiErrorMessage("patch"),
      apply: getWorkspaceAiErrorMessage("apply")
    }).join(" "),
    /\/api\/|HTTP|request|요청 ID|개발자 진단|payload|provider|timeout|quota/i
  );
});

test("transcript auto-follow는 사용자가 이미 하단을 읽고 있을 때만 허용한다", () => {
  assert.equal(
    shouldAutoFollowTranscript({
      clientHeight: 300,
      scrollHeight: 820,
      scrollTop: 500,
      source: "scroll"
    }),
    true
  );
  assert.equal(
    shouldAutoFollowTranscript({
      clientHeight: 300,
      scrollHeight: 820,
      scrollTop: 280,
      source: "scroll"
    }),
    false
  );
});

test("assistant option 선택은 현재 스크롤 위치와 무관하게 새 응답을 따라간다", () => {
  assert.equal(
    shouldAutoFollowTranscript({ source: "assistant-option-selection" }),
    true
  );
});

test("option 응답을 따라가는 중에도 사용자가 과거 대화로 올리면 강제 follow를 해제한다", () => {
  assert.equal(
    shouldReleaseForcedTranscriptFollow({
      clientHeight: 300,
      scrollHeight: 820,
      scrollTop: 500
    }),
    false
  );
  assert.equal(
    shouldReleaseForcedTranscriptFollow({
      clientHeight: 300,
      scrollHeight: 820,
      scrollTop: 200
    }),
    true
  );
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
