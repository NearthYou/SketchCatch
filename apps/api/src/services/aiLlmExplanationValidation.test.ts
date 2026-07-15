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

test("Terraform 기준별 리뷰는 조치 문장을 글자 수 중간에서 자르지 않는다", () => {
  const fallback: LlmExplanation = {
    target: "terraform_preview_explanation",
    summary: "fallback",
    highlights: ["fallback"],
    nextActions: ["retry"],
    fallbackUsed: true,
    fallbackReason: "invalid_response"
  };
  const longHighlight =
    "[확인 필요] 보안 | 판단: 외부 접근 범위가 넓어 의도하지 않은 요청이 서비스에 도달할 수 있습니다. | 확인: EC2 보안 그룹의 인바운드 규칙에서 허용 IP 범위와 포트를 확인하고 필요한 대상만 접근하도록 제한하세요.";
  const parsed = parseLlmExplanationText(
    JSON.stringify({
      target: "terraform_preview_explanation",
      summary: "Amazon Q 검토 완료",
      highlights: [longHighlight],
      nextActions: ["보안 그룹을 확인하세요."],
      fallbackUsed: false,
      codeSuggestion: null,
      wellArchitectedConclusion: "구성을 검토했습니다."
    }),
    fallback
  );

  assert.equal(parsed.highlights[0], longHighlight);
});
