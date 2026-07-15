import assert from "node:assert/strict";
import test from "node:test";
import type { LlmExplanation } from "@sketchcatch/types";
import { parseLlmExplanationText } from "./aiLlmExplanationValidation.js";

test("Amazon Q의 긴 Terraform 리뷰 결론을 유효한 응답으로 유지한다", () => {
  const fallback: LlmExplanation = {
    target: "terraform_preview_explanation",
    summary: "fallback",
    highlights: ["fallback"],
    nextActions: ["retry"],
    fallbackUsed: true,
    fallbackReason: "invalid_response"
  };
  const conclusion = "Terraform 근거를 바탕으로 장점과 위험을 함께 설명합니다. ".repeat(24).trim();
  const parsed = parseLlmExplanationText(
    JSON.stringify({
      target: "terraform_preview_explanation",
      summary: "Amazon Q 검토 완료",
      highlights: ["운영", "보안", "신뢰성", "성능", "비용", "지속 가능성"],
      nextActions: ["코드 설정을 보완하세요."],
      fallbackUsed: false,
      codeSuggestion: null,
      wellArchitectedConclusion: conclusion
    }),
    fallback
  );

  assert.equal(parsed.fallbackUsed, false);
  assert.equal(parsed.wellArchitectedConclusion, conclusion);
});
