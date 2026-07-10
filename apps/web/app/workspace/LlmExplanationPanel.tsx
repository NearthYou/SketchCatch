import type { AiProvider, LlmExplanation, LlmExplanationFallbackReason } from "@sketchcatch/types";

type LlmExplanationPanelProps = {
  readonly explanation: LlmExplanation | undefined;
};

type LlmExplanationSection = {
  readonly id: string;
  readonly title: string;
  readonly items: readonly string[];
};

// LLM 설명이 없으면 기존 rule 결과 화면을 그대로 유지합니다.
export function LlmExplanationPanel({ explanation }: LlmExplanationPanelProps) {
  if (explanation === undefined) {
    return null;
  }

  return (
    <div className="llmExplanationBlock">
      <div className="llmExplanationHeader">
        <p className="metadataKicker">AI 설명</p>
        <span className={explanation.fallbackUsed ? "llmExplanationBadge llmExplanationBadgeFallback" : "llmExplanationBadge"}>
          {getLlmExplanationSourceLabel(explanation)}
        </span>
      </div>
      <div className="resultStack">
        <p className="resultTitle">{explanation.summary}</p>
        <div className="llmExplanationSections">
          {createLlmExplanationSections(explanation).map((section) => (
            <section aria-labelledby={`llm-explanation-${section.id}`} className="llmExplanationSection" key={section.id}>
              <h3 id={`llm-explanation-${section.id}`}>{section.title}</h3>
              <ul className="llmExplanationList">
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
export function createLlmExplanationSections(explanation: LlmExplanation): LlmExplanationSection[] {
  return [
    {
      id: "highlights",
      title: "핵심",
      items: explanation.highlights
    },
    {
      id: "next-actions",
      title: "다음 행동",
      items: explanation.nextActions
    }
  ].filter((section) => section.items.length > 0);
}

// fallbackReason을 화면에서 읽기 쉬운 짧은 상태 문구로 바꿉니다.
export function getLlmExplanationSourceLabel(explanation: LlmExplanation): string {
  if (!explanation.fallbackUsed) {
    return getProviderLabel(explanation.providerMetadata?.provider);
  }

  if (explanation.providerMetadata?.provider === "amazon_q") {
    return `Amazon Q 응답 · ${getFallbackReasonLabel(explanation.fallbackReason)}`;
  }

  return `기본 설명 · ${getFallbackReasonLabel(explanation.fallbackReason)}`;
}

function getProviderLabel(provider: AiProvider | undefined): string {
  switch (provider) {
    case "bedrock":
      return "Bedrock 설명";
    case "amazon_q":
      return "Amazon Q 설명";
    case "amazon_transcribe":
      return "Amazon Transcribe";
    case "openai":
      return "OpenAI legacy 설명";
    case "fallback":
    case undefined:
      return "AI 설명";
  }
}

function getFallbackReasonLabel(reason: LlmExplanationFallbackReason | undefined): string {
  switch (reason) {
    case "missing_api_key":
      return "API key 없음";
    case "provider_not_configured":
      return "provider 설정 없음";
    case "credit_not_confirmed":
      return "credit 확인 필요";
    case "daily_limit_exceeded":
      return "일일 호출 제한";
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

  return "fallback";
}
