# LLM 보강 구현 계획

이 문서는 `004_마일스톤.md`의 Milestone 6 결정을 실제 구현 순서로 바꾼 계획이다.

## 구현 원칙

- OpenAI 호출은 프론트가 아니라 API 서버에서만 한다.
- OpenAI 호출은 `fetch` 직접 호출이 아니라 공식 SDK를 사용한다.
- rule 기반 분석은 계속 핵심 판단을 담당한다.
- LLM은 rule 결과를 쉬운 설명, 요약, 다음 행동으로 보강한다.
- LLM 실패는 API 실패로 보지 않고 fallback으로 처리한다.
- 실제 OpenAI API는 테스트에서 호출하지 않는다.
- Architecture Board Resource 자동 수정은 하지 않는다.

## Milestone 6-1. 공통 타입과 의존성 준비

목표:

- 모든 AI API가 같은 `llmEnhancement` 응답 구조를 쓸 수 있게 한다.
- OpenAI SDK를 API 서버 runtime dependency로 추가한다.
- 모델명과 API key는 환경변수로 관리한다.

수정 후보:

- `packages/types/src/index.ts`
- `apps/api/package.json`
- `apps/api/src/routes/ai.ts`
- `apps/api/src/routes/ai.test.ts`

구현 내용:

- `LlmEnhancementTarget` 타입 추가
- `LlmEnhancement` 타입 추가
- `fallbackReason` enum 추가
- `OPENAI_API_KEY` 없을 때 provider 호출 생략
- `OPENAI_MODEL` 없을 때 코드 기본 모델 사용

완료 기준:

- 모든 AI 응답이 `llmEnhancement`를 담을 수 있다.
- API key가 없어도 기존 rule 결과와 fallback 설명이 반환된다.
- OpenAI SDK가 API 서버 dependency에 추가된다.

검증:

- 타입 체크
- API route 테스트에서 `missing_api_key` fallback 확인

## Milestone 6-2. summary payload와 fallback builder 추가

목표:

- OpenAI에 원본 전체를 보내지 않는다.
- target별로 필요한 최소 정보만 summary payload로 만든다.
- LLM 실패 또는 일부 필드 이상 시 서버가 기본 설명을 만든다.

수정 후보:

- `apps/api/src/services/aiLlmEnhancement.ts`
- `apps/api/src/services/aiLlmEnhancementFallbacks.ts`
- `apps/api/src/services/aiLlmEnhancementPayloads.ts`
- `apps/api/src/services/aiTerraformErrorExplanation.ts`
- `apps/api/src/services/aiPreDeploymentAnalysis.ts`
- `apps/api/src/services/aiDesignSimulation.ts`
- Architecture Draft 관련 service 파일

구현 내용:

- `Design Simulation` summary payload builder
- `Pre-Deployment Check` summary payload builder
- Terraform 오류 설명 summary payload builder
- `Architecture Draft` summary payload builder
- target별 fallback builder
- Terraform `rawMessage` masking/sanitize

완료 기준:

- fallback builder는 기존 rule 결과만 근거로 기본 문구를 만든다.
- fallback builder는 원본 사용자 요청을 다시 보지 않는다.
- fallback builder는 target 이름만 보고 고정 문구를 만들지 않는다.
- Terraform 오류 원문은 masking/sanitize 후 OpenAI payload에 들어간다.

검증:

- summary payload 단위 테스트
- fallback builder 단위 테스트
- Terraform masking 테스트

## Milestone 6-3. OpenAI 호출 계층 추가

목표:

- OpenAI SDK 기반 호출 계층을 만든다.
- timeout, 에러 분류, safe logging, no retry 기준을 한곳에 모은다.
- OpenAI 응답은 structured output 흐름을 우선 사용한다.

수정 후보:

- `apps/api/src/services/openAiClient.ts`
- `apps/api/src/services/aiLlmEnhancement.ts`
- `apps/api/src/routes/ai.test.ts`

구현 내용:

- `createOpenAiEnhancement` 추가
- target별 prompt builder 연결
- OpenAI timeout 10초
- OpenAI 실패 시 재시도 없이 fallback
- safe `fallbackReason` 변환
- safe server log 추가
- 원본 provider 에러, 원본 payload, API key 로그 금지

완료 기준:

- OpenAI 성공 시 검증된 `llmEnhancement`가 반환된다.
- timeout, rate limit, auth error, invalid request, provider error가 safe enum으로 변환된다.
- OpenAI 실패 로그는 `target`, `fallbackReason`, 짧은 safe message만 남긴다.
- OpenAI 실패 시 재시도하지 않는다.

검증:

- fake OpenAI client 성공 테스트
- fake OpenAI client timeout 테스트
- fake OpenAI client provider error 테스트
- raw provider message 미노출 테스트

## Milestone 6-4. 응답 검증과 부분 fallback 연결

목표:

- LLM 응답을 그대로 믿지 않는다.
- JSON envelope가 깨졌으면 전체 fallback으로 처리한다.
- 일부 필드만 이상하면 정상 필드는 살리고 이상한 필드만 rule 기본값으로 대체한다.

수정 후보:

- `apps/api/src/services/aiLlmEnhancementValidation.ts`
- `apps/api/src/services/aiLlmEnhancementFallbacks.ts`
- `apps/api/src/routes/ai.test.ts`

구현 내용:

- 공통 `llmEnhancement` schema 검증
- `summary` 1~300자 검증
- `highlights` 최대 5개, 각 120자 이하 검증
- `nextActions` 최대 5개, 각 120자 이하 검증
- 빈 문자열 제거
- 배포 가능 보장, 비용 없음 보장, 보안 안전 보장 문장 차단
- 일부 필드 fallback 시 `fallbackUsed: true`
- 일부 필드 fallback 시 `fallbackReason: "invalid_response"`

완료 기준:

- JSON 파싱 실패 또는 envelope 이상은 전체 fallback이다.
- `summary`, `highlights`, `nextActions` 중 일부만 이상하면 해당 필드만 fallback이다.
- 언어가 영어 또는 한영 혼합이어도 언어만으로 fallback하지 않는다.

검증:

- invalid JSON fallback 테스트
- target mismatch fallback 테스트
- 일부 필드 invalid response 테스트
- 금지 문장 필드 fallback 테스트

## Milestone 6-5. AI API route에 LLM 보강 연결

목표:

- rule 분석이 끝난 뒤 같은 API 요청 안에서 LLM 보강을 실행한다.
- 최종 응답은 rule 결과와 `llmEnhancement`를 함께 반환한다.
- 프론트가 rule API와 LLM API를 따로 호출하지 않게 한다.

수정 후보:

- `apps/api/src/routes/ai.ts`
- `apps/api/src/routes/ai.test.ts`
- 각 AI service 파일

연결 대상:

- `Design Simulation`
- `Pre-Deployment Check`
- Terraform 오류 설명
- `Architecture Draft`

완료 기준:

- 각 route가 rule 결과와 `llmEnhancement`를 함께 반환한다.
- LLM 실패는 HTTP 성공 응답과 `fallbackUsed: true`로 표현된다.
- rule 분석 자체 실패만 API 실패로 처리된다.

검증:

- 각 AI API route마다 LLM 성공 테스트
- 각 AI API route마다 fallback 테스트
- 각 AI API route마다 invalid response 테스트

## Milestone 6-6. 프론트 표시 연결

목표:

- `/workspace/ai`와 실제 `/workspace` 화면에 `AI 설명`을 표시한다.
- 결과 항목 근처에 작게 보여준다.
- LLM 전용 loading state는 만들지 않는다.

수정 후보:

- `apps/web/app/workspace/AiWorkspaceClient.tsx`
- `apps/web/app/workspace/PreDeploymentAnalysisPanel.tsx`
- `apps/web/app/workspace` 아래 관련 panel 파일

구현 내용:

- 관련 결과 항목 근처에 `AI 설명` 영역 추가
- `summary`, `highlights`, `nextActions` 표시
- `fallbackUsed: true`이면 작은 `기본 설명 사용` 표시
- 기존 API 실행 버튼 loading 재사용
- Resource 자동 수정 UI 추가 금지

완료 기준:

- `/workspace/ai`에서 LLM 보강 설명을 볼 수 있다.
- 실제 `/workspace`에서도 관련 결과 근처에 `AI 설명`이 보인다.
- LLM 전용 loading state가 없다.
- 프론트가 빈 값을 임시 문구로 채우지 않는다.

검증:

- `/workspace/ai` 수동 확인
- `/workspace` 수동 확인
- API key 없음 상태에서 `기본 설명 사용` 표시 확인

## Milestone 6-7. 최종 검증

목표:

- LLM이 붙어도 기존 rule 기반 흐름이 깨지지 않는지 확인한다.
- API key가 없어도 시연 가능한 상태를 유지한다.

검증 순서:

1. `apps/api` 테스트 실행
2. API typecheck 실행
3. Web typecheck 실행
4. `/workspace/ai`에서 네 가지 AI 기능 수동 확인
5. `/workspace`에서 `AI 설명` 표시 확인
6. API key 없음 fallback 확인
7. fake client 테스트가 실제 OpenAI를 호출하지 않는지 확인

## 이번 계획에서 하지 않는 것

- Architecture Draft 생성 흐름 전체를 LLM으로 교체
- 기존 rule 기반 분석 제거
- LLM 응답을 검증 없이 사용
- OpenAI 실패 재시도
- 프론트에서 OpenAI 직접 호출
- rule API와 LLM API 분리 호출
- LLM 전용 loading state
- Architecture Board Resource 자동 수정
- 원본 OpenAI 에러 메시지 응답 또는 로그 노출
- 원본 사용자 요청 전체를 OpenAI payload나 fallback builder에 다시 사용
