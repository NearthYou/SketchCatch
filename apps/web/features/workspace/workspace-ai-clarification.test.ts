import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerArchitectureClarification,
  createArchitectureClarificationQuestionMessage,
  createArchitectureClarificationSession,
  createArchitectureClarificationSummaryMessage,
  createClarifiedDraftRequest,
  getCurrentArchitectureClarificationQuestion,
  isArchitectureClarificationProceedCommand,
  needsArchitectureClarification
} from "./workspace-ai-clarification";

test("generic website prompts start a beginner-friendly clarification flow", () => {
  assert.equal(needsArchitectureClarification("웹사이트 하나 배포하고 싶어"), true);
  assert.equal(needsArchitectureClarification("웹사이트 하나 배포하고 싶어", "backend_with_db"), false);
  assert.equal(needsArchitectureClarification("웹사이트 하나 배포하고 싶어", "api_server"), false);
  assert.equal(needsArchitectureClarification("소개용 랜딩 웹사이트를 배포하고 싶어"), false);
  assert.equal(needsArchitectureClarification("파일 업로드 페이지가 필요해"), false);

  const session = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const question = getCurrentArchitectureClarificationQuestion(session);

  assert.ok(question);
  assert.match(question.question, /어떤 웹사이트/);
  assert.equal(question.options.length, 3);
  assert.ok(question.options.some((option) => option.recommended));

  const message = createArchitectureClarificationQuestionMessage(question);

  assert.match(message.content, /추천/);
  assert.equal(message.suggestions.length, 3);
  assert.doesNotMatch(message.content, /S3|CloudFront|EC2|버킷|보안 그룹/);
});

test("clarification answers produce an implementation list before draft generation", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(started, "문의/예약/신청을 받는 사이트");
  const actionAnswered = answerArchitectureClarification(purposeAnswered, "게시글/회원 정보를 저장해야 해요");
  const completed = answerArchitectureClarification(actionAnswered, "로그인/개인정보 보호 우선");

  assert.equal(completed.awaitingConfirmation, true);
  assert.equal(isArchitectureClarificationProceedCommand("그대로 진행"), true);
  assert.equal(isArchitectureClarificationProceedCommand("아니 다시 물어봐"), false);

  const summary = createArchitectureClarificationSummaryMessage(completed);

  assert.match(summary.content, /구현 리스트/);
  assert.match(summary.content, /웹 요청을 받는 실행 공간/);
  assert.match(summary.content, /데이터를 보관하는 공간/);
  assert.match(summary.content, /접근 기록과 기본 알림/);
  assert.doesNotMatch(summary.content, /S3|CloudFront|EC2|RDS|IAM|KMS|버킷/);
  assert.deepEqual(summary.suggestions, ["그대로 진행", "수정할래"]);
});

test("confirmed clarification maps beginner answers to deterministic draft request options", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(started, "소개/랜딩 페이지");
  const actionAnswered = answerArchitectureClarification(purposeAnswered, "파일이나 이미지를 올려야 해요");
  const completed = answerArchitectureClarification(actionAnswered, "처음엔 저렴하게 시작");
  const draftRequest = createClarifiedDraftRequest(completed);

  assert.equal(draftRequest.scenarioHint, "server_storage");
  assert.equal(draftRequest.budgetLevel, "low");
  assert.equal(draftRequest.trafficLevel, "small");
  assert.equal(draftRequest.securityPriority, "basic");
  assert.match(draftRequest.prompt, /파일 업로드/);
  assert.match(draftRequest.prompt, /웹사이트/);
});
