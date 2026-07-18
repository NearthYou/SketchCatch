import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureDraftClarification } from "@sketchcatch/types";
import {
  createArchitectureDraftClarificationMessage,
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
