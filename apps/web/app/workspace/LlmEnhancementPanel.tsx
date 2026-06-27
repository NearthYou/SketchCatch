import type { LlmEnhancement, LlmEnhancementFallbackReason } from "@sketchcatch/types";
import { ResultList } from "./ResultList";

type LlmEnhancementPanelProps = {
  readonly enhancement: LlmEnhancement | undefined;
};

type LlmEnhancementItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

// LLM 보강 설명이 없으면 기존 rule 결과 화면을 그대로 유지합니다.
export function LlmEnhancementPanel({ enhancement }: LlmEnhancementPanelProps) {
  if (enhancement === undefined) {
    return null;
  }

  return (
    <div className="llmEnhancementBlock">
      <div className="llmEnhancementHeader">
        <p className="metadataKicker">AI 설명</p>
        <span className={enhancement.fallbackUsed ? "llmEnhancementBadge llmEnhancementBadgeFallback" : "llmEnhancementBadge"}>
          {getLlmEnhancementSourceLabel(enhancement)}
        </span>
      </div>
      <ResultList items={createLlmEnhancementItems(enhancement)} summary={enhancement.summary} />
    </div>
  );
}

// highlights와 nextActions를 같은 ResultList 모양으로 바꿔 모든 AI 패널에서 재사용합니다.
export function createLlmEnhancementItems(enhancement: LlmEnhancement): LlmEnhancementItem[] {
  return [
    ...enhancement.highlights.map((item) => ({
      id: `highlight-${item}`,
      label: "핵심",
      text: item
    })),
    ...enhancement.nextActions.map((item) => ({
      id: `next-action-${item}`,
      label: "다음 행동",
      text: item
    }))
  ];
}

// fallbackReason을 화면에서 읽기 쉬운 짧은 상태 문구로 바꿉니다.
export function getLlmEnhancementSourceLabel(enhancement: LlmEnhancement): string {
  if (!enhancement.fallbackUsed) {
    return "OpenAI 설명";
  }

  return `기본 설명 · ${getFallbackReasonLabel(enhancement.fallbackReason)}`;
}

function getFallbackReasonLabel(reason: LlmEnhancementFallbackReason | undefined): string {
  switch (reason) {
    case "missing_api_key":
      return "API key 없음";
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rate limit";
    case "invalid_request":
      return "요청 오류";
    case "auth_error":
      return "인증 오류";
    case "provider_error":
      return "provider 오류";
    case "invalid_response":
      return "응답 보정";
    case undefined:
      return "fallback";
  }
}
