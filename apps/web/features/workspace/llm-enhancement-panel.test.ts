import assert from "node:assert/strict";
import { test } from "node:test";
import type { LlmEnhancement } from "../../../../packages/types/src";
import {
  createLlmEnhancementItems,
  getLlmEnhancementSourceLabel
} from "../../app/workspace/LlmEnhancementPanel";

const fallbackEnhancement: LlmEnhancement = {
  target: "design_simulation",
  summary: "요청 흐름과 병목 후보를 쉬운 말로 정리했습니다.",
  highlights: ["ALB에서 EC2로 요청이 흐릅니다."],
  nextActions: ["단일 EC2 병목을 확인하세요."],
  fallbackUsed: true,
  fallbackReason: "missing_api_key"
};

test("createLlmEnhancementItems keeps highlights and next actions visible", () => {
  assert.deepEqual(createLlmEnhancementItems(fallbackEnhancement), [
    {
      id: "highlight-ALB에서 EC2로 요청이 흐릅니다.",
      label: "핵심",
      text: "ALB에서 EC2로 요청이 흐릅니다."
    },
    {
      id: "next-action-단일 EC2 병목을 확인하세요.",
      label: "다음 행동",
      text: "단일 EC2 병목을 확인하세요."
    }
  ]);
});

test("getLlmEnhancementSourceLabel shows fallback reason when fallback is used", () => {
  assert.equal(getLlmEnhancementSourceLabel(fallbackEnhancement), "기본 설명 · API key 없음");
});
