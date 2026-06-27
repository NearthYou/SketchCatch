import type { LlmEnhancement, LlmEnhancementFallbackReason } from "@sketchcatch/types";

type LlmEnhancementPanelProps = {
  readonly enhancement: LlmEnhancement | undefined;
};

type LlmEnhancementSection = {
  readonly id: string;
  readonly title: string;
  readonly items: readonly string[];
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
      <div className="resultStack">
        <p className="resultTitle">{enhancement.summary}</p>
        <div className="llmEnhancementSections">
          {createLlmEnhancementSections(enhancement).map((section) => (
            <section aria-labelledby={`llm-enhancement-${section.id}`} className="llmEnhancementSection" key={section.id}>
              <h3 id={`llm-enhancement-${section.id}`}>{section.title}</h3>
              <ul className="llmEnhancementList">
                {section.items.map((item, index) => (
                  <li key={`${section.id}-${index}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// AI 설명 전용 섹션으로 묶어 같은 제목이 항목마다 반복되지 않게 합니다.
export function createLlmEnhancementSections(enhancement: LlmEnhancement): LlmEnhancementSection[] {
  return [
    {
      id: "highlights",
      title: "핵심",
      items: enhancement.highlights
    },
    {
      id: "next-actions",
      title: "다음 행동",
      items: enhancement.nextActions
    }
  ].filter((section) => section.items.length > 0);
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
