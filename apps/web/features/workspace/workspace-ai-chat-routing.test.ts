import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWorkspaceAiChatPrompt,
  shouldStartFreshDraftDuringPatchClarification
} from "./workspace-ai-chat-routing";

test("authored realtime deployment diagram prompt routes to architecture generation", () => {
  assert.equal(
    classifyWorkspaceAiChatPrompt("데모용 실시간 배포 사이트의 다이어그램 만들어줘."),
    "architecture"
  );
});

test("기존 리소스 값을 줄여 달라는 자연어 요청을 다이어그램 수정으로 분류한다", () => {
  assert.equal(
    classifyWorkspaceAiChatPrompt("ecs_service_requests target value 50에서 5로 줄여줘"),
    "architecture"
  );
  assert.equal(
    classifyWorkspaceAiChatPrompt("오토스케일링 요청 기준을 5로 낮춰줘"),
    "architecture"
  );
});

test("수정 질문 중 명시적인 새 다이어그램 생성 요청은 신규 초안으로 전환한다", () => {
  assert.equal(shouldStartFreshDraftDuringPatchClarification("다이어그램 생성하고 싶어"), true);
  assert.equal(shouldStartFreshDraftDuringPatchClarification("새 웹사이트를 만들고 싶어"), true);
});

test("수정 질문의 리소스 답변은 기존 수정 흐름에 남긴다", () => {
  assert.equal(shouldStartFreshDraftDuringPatchClarification("서버 만들고 싶어"), false);
  assert.equal(shouldStartFreshDraftDuringPatchClarification("데이터 저장 공간"), false);
});
