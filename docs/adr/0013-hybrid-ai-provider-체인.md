# Hybrid AI provider 체인 사용

오류 분석과 에이전트 리뷰는 `AI_BILLING_MODE=hybrid`에서 Amazon Q, Bedrock, OpenAI, deterministic rule fallback 순서로 실행한다. 어떤 provider든 `fallbackUsed: true`를 반환하면 다음 provider를 시도하고, 완전한 응답에서 중단한다. 이 결정은 AWS 크레딧 우선 사용과 OpenAI 비용 발생 가능성 사이의 trade-off를 명시하며, 사용자에게는 일반 분석 결과를 보여주되 기술 상세에 비밀값이나 원문 provider 오류 없이 시도 순서와 안전한 실패 사유를 제공한다.
