import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureDraftClarification } from "@sketchcatch/types";
import {
  createArchitectureDraftClarificationAnswerReceipt,
  createArchitectureDraftClarificationMessage,
  resolveAcceptedArchitectureDraftClarificationSelection,
  withArchitectureDraftClarificationAnswer
} from "./workspace-ai-draft-clarification";

const clarification: ArchitectureDraftClarification = {
  status: "needs_clarification",
  questionId: "website_type",
  question: "어떤 종류의 웹사이트인가요?",
  suggestions: ["정적 웹사이트", "동적 웹 애플리케이션"],
  providerMetadata: {
    provider: "amazon_q",
    service: "amazon_q_business",
    routeTarget: "architecture_draft",
    cacheHit: false,
    cacheKey: "test-cache-key",
    estimatedUsage: {
      inputCharacters: 10,
      inputTokensEstimate: 3
    },
    billingMode: "aws_credit_only",
    generatedAt: "2026-07-18T00:00:00.000Z"
  }
};

test("natural-language clarification answers are structured without appending the question to the prompt", () => {
  const request = withArchitectureDraftClarificationAnswer(
    {
      prompt: "웹사이트를 만들고 싶어요.",
      templateId: "three-tier-web-app"
    },
    clarification,
    "네이버 쇼핑몰 같은 사이트를 만들고 싶어"
  );

  assert.equal(request.prompt, "웹사이트를 만들고 싶어요.");
  assert.equal(request.templateId, "three-tier-web-app");
  assert.deepEqual(request.clarificationAnswers, [
    {
      questionId: "website_type",
      answer: "네이버 쇼핑몰 같은 사이트를 만들고 싶어"
    }
  ]);
});

test("retrying a rejected clarification replaces only that question answer", () => {
  const request = withArchitectureDraftClarificationAnswer(
    {
      prompt: "웹사이트를 만들고 싶어요.",
      clarificationAnswers: [{ questionId: "website_type", answer: "김치찌개" }]
    },
    clarification,
    "쇼핑몰을 만들고 싶어요"
  );

  assert.deepEqual(request.clarificationAnswers, [
    { questionId: "website_type", answer: "쇼핑몰을 만들고 싶어요" }
  ]);
});

test("rejected answers display the validation message before repeating the question", () => {
  assert.equal(
    createArchitectureDraftClarificationMessage({
      ...clarification,
      validationMessage: "답변을 이해하지 못했어요. 다시 답해주세요."
    }),
    "답변을 이해하지 못했어요. 다시 답해주세요.\n\n어떤 종류의 웹사이트인가요?"
  );
});

test("accepted free-form answers show the question-to-requirement mapping", () => {
  const receipt = createArchitectureDraftClarificationAnswerReceipt(
    {
      ...clarification,
      question: "What kind of website?",
      suggestions: ["Static website", "Dynamic web app"]
    },
    "A marketplace like Naver Shopping",
    {
      ...clarification,
      questionId: "traffic",
      question: "Expected traffic?"
    }
  );

  assert.equal(
    receipt,
    "\uC790\uC5F0\uC5B4 \uB2F5\uBCC0 \uBC18\uC601\nWhat kind of website? \u2192 A marketplace like Naver Shopping"
  );
});

test("selected answers are identified and rejected answers do not get an applied receipt", () => {
  const selectedReceipt = createArchitectureDraftClarificationAnswerReceipt(
    {
      ...clarification,
      question: "What kind of website?",
      suggestions: ["Static website", "Dynamic web app"]
    },
    "Dynamic web app",
    {
      architectureJson: { edges: [], nodes: [] },
      title: "Draft",
      metadata: {
        assumptions: [],
        confidence: "high",
        explanations: [],
        guardrailWarnings: [],
        source: "prompt"
      }
    }
  );
  const rejectedReceipt = createArchitectureDraftClarificationAnswerReceipt(
    clarification,
    "unrelated",
    { ...clarification, validationMessage: "Please answer again." }
  );

  assert.equal(selectedReceipt?.startsWith("\uC120\uD0DD \uB2F5\uBCC0 \uBC18\uC601\n"), true);
  assert.equal(rejectedReceipt, null);
});
test("accepted natural-language answers resolve to an existing option or a checked custom option", () => {
  const nextQuestion = { ...clarification, questionId: "traffic", question: "Expected traffic?" };
  const websiteClarification = {
    ...clarification,
    suggestions: ["정적 사이트 (블로그, 포트폴리오)", "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)", "SPA (React/Vue 등)", "API 서버 (모바일 앱 백엔드)"]
  };
  assert.deepEqual(
    resolveAcceptedArchitectureDraftClarificationSelection(
      websiteClarification, "네이버 쇼핑몰 같은 사이트를 만들고 싶어", nextQuestion
    ),
    { label: "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)", matchedSuggestion: true }
  );
  assert.deepEqual(
    resolveAcceptedArchitectureDraftClarificationSelection(
      { ...clarification, questionId: "budget", question: "월 예산 범위는?", suggestions: ["10만원 미만 (최소 비용)", "10-50만원 (적당한 성능)"] },
      "저렴하게 시작할래", nextQuestion
    ),
    { label: "저렴하게 시작할래", matchedSuggestion: false }
  );
  assert.equal(
    resolveAcceptedArchitectureDraftClarificationSelection(
      clarification, "김치찌개", { ...clarification, validationMessage: "다시 답해주세요." }
    ),
    null
  );
});
