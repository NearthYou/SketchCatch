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
  assert.equal(needsArchitectureClarification("소개용 랜딩 웹사이트를 배포하고 싶어"), false);
  assert.equal(needsArchitectureClarification("파일 업로드 페이지가 필요해"), false);
  assert.equal(needsArchitectureClarification("웹사이트를 S3와 CloudFront로 배포하고 싶어"), false);

  const session = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const question = getCurrentArchitectureClarificationQuestion(session);

  assert.ok(question);
  assert.match(question.question, /어떤 웹사이트/);
  assert.deepEqual(
    question.options.map((option) => option.label),
    ["소개/랜딩 페이지", "문의만 받는 사이트", "예약/신청을 관리하는 서비스"]
  );
  assert.ok(question.options.some((option) => option.recommended));

  const message = createArchitectureClarificationQuestionMessage(question);

  assert.match(message.content, /추천/);
  assert.equal(message.suggestions.length, 3);
  assert.doesNotMatch(message.content, /로그인\/마이페이지가 있는 서비스/);
  assert.doesNotMatch(message.content, /S3|CloudFront|EC2|버킷|보안 그룹/);
});

test("clarification asks login and my page as a separate visitor feature", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(started, "예약/신청을 관리하는 서비스");
  const question = getCurrentArchitectureClarificationQuestion(purposeAnswered);

  assert.ok(question);
  assert.match(question.question, /방문자/);
  assert.deepEqual(
    question.options.map((option) => option.label),
    ["글/이미지 보기만 하면 돼요", "파일이나 이미지를 올려야 해요", "로그인/마이페이지가 필요해요"]
  );
});

test("clarification answers produce an implementation list before draft generation", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(started, "예약/신청을 관리하는 서비스");
  const actionAnswered = answerArchitectureClarification(purposeAnswered, "로그인/마이페이지가 필요해요");
  const completed = answerArchitectureClarification(actionAnswered, "로그인/개인정보 보호 우선");

  assert.equal(completed.awaitingConfirmation, true);
  assert.equal(isArchitectureClarificationProceedCommand("그대로 진행"), true);
  assert.equal(isArchitectureClarificationProceedCommand("아니 다시 물어봐"), false);

  const summary = createArchitectureClarificationSummaryMessage(completed);

  assert.match(summary.content, /구현 리스트/);
  assert.match(summary.content, /웹 요청을 받는 실행 공간/);
  assert.match(summary.content, /사용자 로그인과 마이페이지/);
  assert.match(summary.content, /데이터를 보관하는 공간/);
  assert.match(summary.content, /접근 기록과 기본 알림/);
  assert.doesNotMatch(summary.content, /S3|CloudFront|EC2|RDS|IAM|KMS|버킷/);
  assert.deepEqual(summary.suggestions, ["그대로 진행", "수정할래"]);
});

test("confirmed clarification maps beginner answers to a natural-language-only draft request", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(started, "소개/랜딩 페이지");
  const actionAnswered = answerArchitectureClarification(purposeAnswered, "파일이나 이미지를 올려야 해요");
  const completed = answerArchitectureClarification(actionAnswered, "처음엔 저렴하게 시작");
  const draftRequest = createClarifiedDraftRequest(completed);

  assert.deepEqual(Object.keys(draftRequest), ["prompt"]);
  assert.match(draftRequest.prompt, /파일 업로드/);
  assert.match(draftRequest.prompt, /웹사이트/);
  assert.match(draftRequest.prompt, /처음엔 저렴하게 시작/);
});

test("booking and application services include account context without duplicating the first choice", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(started, "예약/신청을 관리하는 서비스");
  const actionAnswered = answerArchitectureClarification(purposeAnswered, "로그인/마이페이지가 필요해요");
  const completed = answerArchitectureClarification(actionAnswered, "처음엔 저렴하게 시작");
  const draftRequest = createClarifiedDraftRequest(completed);

  assert.match(draftRequest.prompt, /예약\/신청/);
  assert.match(draftRequest.prompt, /로그인\/마이페이지/);
  assert.match(draftRequest.prompt, /사용자별/);
});
