import assert from "node:assert/strict";
import test from "node:test";
import { shouldStartFreshDraftDuringPatchClarification } from "./workspace-ai-chat-routing";

test("수정 질문 중 명시적인 새 다이어그램 생성 요청은 신규 초안으로 전환한다", () => {
  assert.equal(shouldStartFreshDraftDuringPatchClarification("다이어그램 생성하고 싶어"), true);
  assert.equal(shouldStartFreshDraftDuringPatchClarification("새 웹사이트를 만들고 싶어"), true);
});

test("수정 질문의 리소스 답변은 기존 수정 흐름에 남긴다", () => {
  assert.equal(shouldStartFreshDraftDuringPatchClarification("서버 만들고 싶어"), false);
  assert.equal(shouldStartFreshDraftDuringPatchClarification("데이터 저장 공간"), false);
});

