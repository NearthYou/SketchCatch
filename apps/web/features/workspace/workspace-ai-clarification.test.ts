import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerArchitectureClarification,
  createArchitectureClarificationQuestionMessage,
  createArchitectureClarificationSession,
  createArchitectureClarificationSummaryMessage,
  createClarifiedDraftRequest,
  getCurrentArchitectureClarificationQuestion,
  isCompleteArchitectureClarificationAnswer,
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
  const labels = question.options.map((option) => option.label);

  assert.equal(labels.length, 6);
  assert.deepEqual(labels, [
    "소개/랜딩 페이지",
    "블로그/콘텐츠 사이트",
    "문의/예약/신청을 받는 사이트",
    "로그인/마이페이지가 있는 서비스",
    "상품 판매/결제 서비스",
    "운영자 관리 화면"
  ]);
  assert.equal(question.selectionMode, "multiple");
  assert.ok(question.options.some((option) => option.recommended));

  const message = createArchitectureClarificationQuestionMessage(question);

  assert.match(message.content, /여러 개 선택 가능/);
  assert.equal(message.suggestions.length, 6);
  assert.equal(message.selectionMode, "multiple");
  assert.doesNotMatch(message.content, /S3|CloudFront|EC2|버킷|보안 그룹/);
});

test("simple login service prompts ask the missing generation checklist before drafting", () => {
  assert.equal(needsArchitectureClarification("간단하게 로그인 있는 서비스 만들어줘"), true);

  const session = createArchitectureClarificationSession("간단하게 로그인 있는 서비스 만들어줘");
  const question = getCurrentArchitectureClarificationQuestion(session);

  assert.ok(question);
  assert.equal(question.id, "operationPreference");
  assert.match(question.question, /운영|기준|처음/);
});

test("login service prompts with an operating preference can generate without clarification", () => {
  assert.equal(
    needsArchitectureClarification("로그인 있고 개인정보 보호가 중요한 서비스를 만들어줘"),
    false
  );
});

test("natural-language infrastructure prompts ask for missing operating context", () => {
  assert.equal(needsArchitectureClarification("API 서버를 만들어줘"), true);
  assert.equal(needsArchitectureClarification("EC2 서버와 S3 버킷을 쓰는 서비스 만들어줘"), true);
  assert.equal(needsArchitectureClarification("웹사이트를 S3와 CloudFront로 배포하고 싶어"), false);

  const session = createArchitectureClarificationSession("API 서버를 만들어줘");
  const question = getCurrentArchitectureClarificationQuestion(session);

  assert.ok(question);
  assert.equal(question.id, "operationPreference");
  assert.match(question.question, /운영|기준|처음/);
});

test("clarification keeps visitor actions separate from multi-select site purpose", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(
    started,
    "문의/예약/신청을 받는 사이트, 로그인/마이페이지가 있는 서비스"
  );
  const question = getCurrentArchitectureClarificationQuestion(purposeAnswered);

  assert.ok(question);
  assert.match(question.question, /방문자/);
  assert.equal(question.selectionMode, "multiple");
  assert.deepEqual(question.options.map((option) => option.label), [
    "글/이미지 보기만 하면 돼요",
    "검색하거나 목록을 필터링해야 해요",
    "파일이나 이미지를 올려야 해요",
    "게시글/회원 정보를 저장해야 해요",
    "주문/결제가 필요해요",
    "운영자가 신청/주문을 확인해야 해요"
  ]);
});

test("clarification records multiple selected options from one answer", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(
    started,
    "문의/예약/신청을 받는 사이트, 로그인/마이페이지가 있는 서비스"
  );

  assert.deepEqual(
    purposeAnswered.answers.map((answer) => answer.label),
    ["문의/예약/신청을 받는 사이트", "로그인/마이페이지가 있는 서비스"]
  );
  assert.equal(purposeAnswered.stepIndex, 1);
});

test("clarification treats a static intro website answer as a complete beginner answer", () => {
  assert.equal(needsArchitectureClarification("정적 소개 웹사이트로 정리해줘"), false);
  assert.equal(isCompleteArchitectureClarificationAnswer("정적 소개 웹사이트로 정리해줘"), true);
  assert.equal(isCompleteArchitectureClarificationAnswer("수정할래"), false);

  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const completed = answerArchitectureClarification(started, "정적 소개 웹사이트로 정리해줘");

  assert.equal(completed.awaitingConfirmation, true);
  assert.equal(getCurrentArchitectureClarificationQuestion(completed), null);

  const summary = createArchitectureClarificationSummaryMessage(completed);
  const draftRequest = createClarifiedDraftRequest(completed);

  assert.match(summary.content, /소개\/랜딩 페이지/);
  assert.match(summary.content, /글\/이미지 보기만 하면 돼요/);
  assert.match(summary.content, /처음엔 저렴하게 시작/);
  assert.match(draftRequest.prompt, /소개용 랜딩 정적 웹사이트/);
  assert.match(draftRequest.prompt, /처음엔 저렴하게 시작/);
});

test("clarification answers produce an implementation list before draft generation", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(
    started,
    "문의/예약/신청을 받는 사이트, 로그인/마이페이지가 있는 서비스"
  );
  const actionAnswered = answerArchitectureClarification(
    purposeAnswered,
    "파일이나 이미지를 올려야 해요, 게시글/회원 정보를 저장해야 해요"
  );
  const completed = answerArchitectureClarification(actionAnswered, "로그인/개인정보 보호 우선");

  assert.equal(completed.awaitingConfirmation, true);
  assert.equal(isArchitectureClarificationProceedCommand("그대로 진행"), true);
  assert.equal(isArchitectureClarificationProceedCommand("아니 다시 물어봐"), false);

  const summary = createArchitectureClarificationSummaryMessage(completed);

  assert.match(summary.content, /구현 리스트/);
  assert.match(summary.content, /문의\/예약\/신청을 받는 사이트, 로그인\/마이페이지가 있는 서비스/);
  assert.match(summary.content, /웹 요청을 받는 실행 공간/);
  assert.match(summary.content, /사용자 로그인과 마이페이지/);
  assert.match(summary.content, /파일과 이미지를 보관하는 공간/);
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
  const purposeAnswered = answerArchitectureClarification(
    started,
    "문의/예약/신청을 받는 사이트, 로그인/마이페이지가 있는 서비스"
  );
  const actionAnswered = answerArchitectureClarification(purposeAnswered, "게시글/회원 정보를 저장해야 해요");
  const completed = answerArchitectureClarification(actionAnswered, "처음엔 저렴하게 시작");
  const draftRequest = createClarifiedDraftRequest(completed);

  assert.match(draftRequest.prompt, /문의\/예약\/신청/);
  assert.match(draftRequest.prompt, /로그인\/마이페이지/);
  assert.match(draftRequest.prompt, /사용자별/);
});

test("commerce and admin choices add matching implementation context", () => {
  const started = createArchitectureClarificationSession("웹사이트 하나 배포하고 싶어");
  const purposeAnswered = answerArchitectureClarification(
    started,
    "상품 판매/결제 서비스, 운영자 관리 화면"
  );
  const actionAnswered = answerArchitectureClarification(
    purposeAnswered,
    "검색하거나 목록을 필터링해야 해요, 주문/결제가 필요해요, 운영자가 신청/주문을 확인해야 해요"
  );
  const completed = answerArchitectureClarification(actionAnswered, "운영자가 장애를 빨리 알아야 해요");
  const summary = createArchitectureClarificationSummaryMessage(completed);
  const draftRequest = createClarifiedDraftRequest(completed);

  assert.match(summary.content, /상품 판매\/결제 서비스, 운영자 관리 화면/);
  assert.match(summary.content, /검색과 목록 필터/);
  assert.match(summary.content, /결제와 주문 흐름/);
  assert.match(summary.content, /운영자가 확인하는 관리 화면/);
  assert.match(summary.content, /운영 상태를 확인하는 알림/);
  assert.match(draftRequest.prompt, /상품 판매/);
  assert.match(draftRequest.prompt, /주문\/결제/);
  assert.match(draftRequest.prompt, /운영자/);
});
