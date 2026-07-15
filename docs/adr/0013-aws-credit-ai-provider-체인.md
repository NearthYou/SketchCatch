# AWS credit AI provider 체인 사용

오류 분석과 에이전트 리뷰는 `AI_BILLING_MODE=aws_credit_only`에서 Amazon Q, Bedrock, deterministic rule fallback 순서로 실행한다. Amazon Q가 완전한 응답을 반환하지 못하면 실패 사유와 관계없이 Bedrock을 시도하고, 두 AWS provider 모두 완전한 응답을 만들지 못할 때만 rule fallback을 사용한다. 사용자에게는 일반 분석 결과를 보여주되 기술 상세에 비밀값이나 원문 provider 오류 없이 시도 순서와 안전한 실패 사유를 제공한다.
