# AI Provider 실행 흐름 정리

이 문서는 `SketchCatch AI Provider 실행`을 처음 보는 사람이 코드 흐름을 따라갈 수 있게 정리한 문서다.

목표는 세 가지다.

1. 사용자가 AI 기능을 실행했을 때 어떤 함수와 provider가 순서대로 호출되는지 알 수 있게 한다.
2. Bedrock, Amazon Q Business, Amazon Transcribe가 각각 어떤 역할을 맡는지 설명한다.
3. AI가 Architecture Board, Git, Deployment 상태를 직접 바꾸지 못하게 막는 비용, 보안, 승인 경계를 분명히 한다.

## 1. AI Provider 흐름은 무엇인가

SketchCatch의 AI 기능은 설계를 직접 바꾸는 자동 조작 기능이 아니다.

AI는 사용자의 요구사항과 deterministic rule 결과를 쉽게 설명하거나, 오류 원인을 보강하거나, 음성을 텍스트로 전사하는 역할을 한다.

최종 Architecture Draft의 리소스 조합은 deterministic planner와 rule engine이 결정한다.

```text
Requirement Prompt
-> deterministic planner/rule engine
-> Architecture Draft 또는 분석 결과 생성
-> Bedrock/Amazon Q가 설명 보강
-> 사용자가 결과 확인
-> 사용자 승인 후에만 Board/Git/Deployment 상태 변경
```

AI provider는 크게 네 종류로 나뉜다.

| provider | 역할 |
| --- | --- |
| `bedrock` | 기본 LLM provider다. Requirement Prompt, Architecture Draft, Design Simulation, Pre-Deployment Check, Terraform Preview, Architecture Patch Preview 설명을 보강한다. |
| `amazon_q` | Terraform Error Explanation과 AWS/IAM/region/quota/운영 문제 설명을 보강한다. 설계 생성용으로 쓰지 않는다. |
| `amazon_transcribe` | Voice Requirement Input을 텍스트로 전사한다. 전사 결과는 사용자 확인 전까지 Requirement Prompt가 아니다. |
| `fallback` | AWS AI 호출이 막히거나 실패했을 때 rule 기반 설명을 반환한다. |

`openai` provider는 legacy/fallback 경로로 남아 있다. 기본 provider는 Bedrock이다.

## 2. 전체 구조

AI 실행 흐름은 4개 층으로 나뉜다.

| 층 | 위치 | 책임 |
| --- | --- | --- |
| Frontend | [apps/web](../../../apps/web) | 버튼, 입력값, API 호출, provider badge 표시 |
| API route | [apps/api/src/routes/ai.ts](../../../apps/api/src/routes/ai.ts) | 요청 검증, deterministic service 호출, provider-backed explanation 연결 |
| Backend AI service | [apps/api/src/services](../../../apps/api/src/services) | draft, check, simulation, preview, fallback, provider routing |
| AWS AI SDK | `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-qbusiness`, `@aws-sdk/client-transcribe` | Bedrock Runtime Converse, Q Business ChatSync, Transcribe job 호출 |

중요한 경계가 있다.

프론트엔드는 AWS SDK를 직접 호출하지 않는다.

AWS AI 호출은 모두 backend에서만 실행된다.

## 3. 사용자가 보는 흐름

사이트에서 바로 볼 수 있는 AI 기능은 [workspace AI 화면](../../../apps/web/app/workspace/ai/page.tsx)에 모여 있다.

```text
http://localhost:3000/workspace/ai
```

사용자 흐름:

```text
Requirement Prompt 입력
-> Architecture Draft 생성
-> Draft 결과와 Bedrock 설명 확인
-> Pre-Deployment Check 실행
-> Design Simulation 실행
-> Terraform Preview 실행
-> Terraform Error Explanation 실행
```

각 결과에 `llmExplanation`이 붙으면 화면의 LLM 설명 패널이 provider badge를 보여준다.

| 화면 기능 | API | 주 provider |
| --- | --- | --- |
| Architecture Draft 설명 | `POST /api/ai/architecture-draft` | Bedrock |
| GitHub Architecture Draft 설명 | `POST /api/ai/github-architecture-draft` | Bedrock |
| Pre-Deployment Check 설명 | `POST /api/ai/pre-deployment-check` | Bedrock |
| Design Simulation 설명 | `POST /api/ai/design-simulation` | Bedrock |
| Terraform Preview 설명 | `POST /api/ai/terraform-preview-explanation` | Bedrock |
| Terraform Error Explanation | `POST /api/ai/terraform-error-explanation` | Amazon Q 우선, Bedrock fallback |

Voice Requirement Input과 Architecture Patch Preview는 API 계약이 준비되어 있지만, 현재 별도 전용 UI 버튼은 아직 없다.

## 4. 프론트엔드 흐름

관련 파일:

- [apps/web/app/workspace/AiWorkspaceClient.tsx](../../../apps/web/app/workspace/AiWorkspaceClient.tsx)
- [apps/web/app/workspace/LlmExplanationPanel.tsx](../../../apps/web/app/workspace/LlmExplanationPanel.tsx)
- [apps/web/features/workspace/api.ts](../../../apps/web/features/workspace/api.ts)
- [apps/web/features/workspace/WorkspaceAiPanelPieces.tsx](../../../apps/web/features/workspace/WorkspaceAiPanelPieces.tsx)

### 4.1 `AiWorkspaceClient`

[AiWorkspaceClient.tsx](../../../apps/web/app/workspace/AiWorkspaceClient.tsx)는 데모/확인용 AI workspace 화면이다.

중요한 상태값은 아래다.

| 상태값 | 뜻 |
| --- | --- |
| `prompt` | Requirement Prompt 입력값 |
| `draft` | Architecture Draft API 응답 |
| `analysis` | Pre-Deployment Check API 응답 |
| `designSimulation` | Design Simulation API 응답 |
| `terraformPreview` | Terraform Preview API 응답 |
| `terraformErrorExplanation` | Terraform Error Explanation API 응답 |
| `status` | 요청 중, 오류 상태 |
| `errorMessage` | API 실패 메시지 |

이 화면은 AWS SDK를 호출하지 않는다. 항상 API 서버로 HTTP 요청만 보낸다.

### 4.2 Architecture Draft 버튼

함수:

```ts
runPromptDraft
```

호출 흐름:

```text
runPromptDraft
-> postJson("/ai/architecture-draft", body)
-> API route
-> deterministic Architecture Draft 생성
-> Bedrock 설명 보강
-> draft state 저장
```

프론트가 보내는 값:

| 값 | 의미 |
| --- | --- |
| `prompt` | 사용자의 자연어 Requirement Prompt |
| `scenarioHint` | 사용자가 고른 시나리오 힌트 |
| `budgetLevel` | 예산 조건 |
| `trafficLevel` | 트래픽 조건 |
| `securityPriority` | 보안 우선순위 |

중요한 점:

Architecture Draft의 리소스 조합은 Bedrock이 직접 고르지 않는다. backend의 deterministic planner가 만든 결과를 Bedrock이 설명한다.

### 4.3 Pre-Deployment Check 버튼

함수:

```ts
runPreDeploymentCheck
```

호출 흐름:

```text
runPreDeploymentCheck
-> postJson("/ai/pre-deployment-check", { architectureJson })
-> analyzePreDeployment
-> Bedrock 설명 보강
-> analysis state 저장
```

이 단계도 Board를 바꾸지 않는다. 현재 ArchitectureJson을 읽고 비용, 보안, 설정 위험을 분석한다.

### 4.4 Design Simulation 버튼

함수:

```ts
runDesignSimulation
```

호출 흐름:

```text
runDesignSimulation
-> requestDesignSimulation
-> POST /api/ai/design-simulation
-> simulateDesign
-> Bedrock 설명 보강
-> designSimulation state 저장
```

Design Simulation은 실제 부하 테스트가 아니다. 구조 기반 추정 결과를 만들고 Bedrock이 설명한다.

### 4.5 Terraform Preview 버튼

함수:

```ts
runTerraformPreview
```

호출 흐름:

```text
runTerraformPreview
-> POST /api/ai/terraform-preview-explanation
-> explainTerraformPreview
-> Bedrock 설명 보강
-> terraformPreview state 저장
```

Terraform Preview는 실제 Terraform CLI를 실행하지 않는다. 입력된 Terraform 코드 텍스트를 분석해 리소스와 위험을 설명한다.

### 4.6 Terraform Error Explanation 버튼

함수:

```ts
runTerraformErrorExplanation
```

호출 흐름:

```text
runTerraformErrorExplanation
-> requestTerraformErrorExplanation
-> POST /api/ai/terraform-error-explanation
-> sanitizeTerraformErrorForAi
-> explainTerraformError
-> Amazon Q 우선 설명
-> 실패 시 Bedrock 또는 fallback 설명
```

Terraform 오류는 raw 전체를 그대로 외부 AI에 보내지 않는다. backend에서 stage, sanitized message, relatedResourceId 중심으로 줄여서 보낸다.

## 5. 프론트 provider badge

파일:

- [apps/web/app/workspace/LlmExplanationPanel.tsx](../../../apps/web/app/workspace/LlmExplanationPanel.tsx)
- [apps/web/features/workspace/WorkspaceAiPanelPieces.tsx](../../../apps/web/features/workspace/WorkspaceAiPanelPieces.tsx)

화면은 `llmExplanation.providerMetadata.provider`를 보고 label을 만든다.

| provider | 화면 의미 |
| --- | --- |
| `bedrock` | Bedrock 설명 |
| `amazon_q` | Amazon Q 설명 |
| `amazon_transcribe` | Amazon Transcribe |
| `openai` | OpenAI legacy 설명 |
| `fallback` | 기본 설명 |

`fallbackUsed === true`면 사용자는 provider 실패나 credit guard 때문에 rule 기반 설명을 보고 있다는 뜻이다.

## 6. API route 흐름

파일: [apps/api/src/routes/ai.ts](../../../apps/api/src/routes/ai.ts)

route의 책임은 세 가지다.

1. 요청 body를 Zod schema로 검증한다.
2. deterministic service를 먼저 실행한다.
3. 그 결과를 provider-backed LLM explanation에 넘긴다.

### 6.1 공통 provider 생성

route 등록 시 아래 함수를 만든다.

```ts
const createLlmExplanation =
  options.createLlmExplanation ?? createConfiguredAiExplanation();
```

`createConfiguredAiExplanation`은 환경변수를 읽어 Bedrock, Amazon Q Business provider와 credit policy, rate limit을 구성한다.

### 6.2 Architecture Draft route

Route:

```http
POST /api/ai/architecture-draft
```

호출 순서:

```text
architectureDraftBodySchema.parse
-> createArchitectureDraft
-> addArchitectureDraftLlmExplanation
-> createLlmExplanation({ target: "architecture_draft", result, requirementPromptText })
```

중요한 점:

`createArchitectureDraft`가 먼저 deterministic draft를 만든다.

Bedrock에는 `requirementPromptText`와 draft 요약이 함께 전달된다. Bedrock은 draft를 바꾸는 게 아니라 설명을 만든다.

### 6.3 Pre-Deployment Check route

Route:

```http
POST /api/ai/pre-deployment-check
```

호출 순서:

```text
preDeploymentCheckBodySchema.parse
-> analyzePreDeployment
-> createLlmExplanation({ target: "pre_deployment_check", result })
```

Pre-Deployment Check의 finding, checklist, suggestion 결과가 먼저 만들어지고 Bedrock이 설명을 보강한다.

### 6.4 Design Simulation route

Route:

```http
POST /api/ai/design-simulation
```

호출 순서:

```text
designSimulationBodySchema.parse
-> simulateDesign
-> createLlmExplanation({ target: "design_simulation", result })
```

### 6.5 Terraform Preview route

Route:

```http
POST /api/ai/terraform-preview-explanation
```

호출 순서:

```text
terraformPreviewExplanationBodySchema.parse
-> explainTerraformPreview
-> createLlmExplanation({ target: "terraform_preview_explanation", result })
```

### 6.6 Terraform Error route

Route:

```http
POST /api/ai/terraform-error-explanation
```

호출 순서:

```text
terraformErrorExplanationBodySchema.parse
-> sanitizeTerraformErrorForAi
-> explainTerraformError
-> createLlmExplanation({ target: "terraform_error_explanation", result })
```

이 route만 Amazon Q Business를 우선 사용한다.

### 6.7 Architecture Patch Preview route

Route:

```http
POST /api/ai/architecture-patch-preview
```

호출 순서:

```text
architecturePatchPreviewBodySchema.parse
-> createArchitecturePatchPreview
-> createLlmExplanation({ target: "architecture_patch_preview", result: preview })
-> preview 반환
```

반환값에는 항상 아래 경계가 있다.

```ts
requiresUserAcceptance: true
userAcceptedChange: null
```

즉 자연어 수정 요청이 들어와도 Board는 바로 바뀌지 않는다. diff preview만 만들어진다.

### 6.8 Voice Requirement route

Routes:

```http
POST /api/ai/voice-requirement/transcribe
GET /api/ai/voice-requirement/transcribe/:jobName
POST /api/ai/voice-requirement/confirm
```

흐름:

```text
VoiceRequirementInput
-> Amazon Transcribe job 시작
-> Transcribe job 상태 조회
-> transcriptText 반환
-> 사용자가 확인/수정/확정
-> RequirementPrompt 생성
```

사용자 확인 전에는 Requirement Prompt가 생성되지 않는다.

## 7. Deterministic Architecture Draft

파일:

- [apps/api/src/services/aiArchitectureDrafts.ts](../../../apps/api/src/services/aiArchitectureDrafts.ts)
- [apps/api/src/services/aiArchitectureScenarioResolution.ts](../../../apps/api/src/services/aiArchitectureScenarioResolution.ts)
- [apps/api/src/services/aiArchitectureDraftTemplates.ts](../../../apps/api/src/services/aiArchitectureDraftTemplates.ts)
- [apps/api/src/services/aiArchitectureOperatingConditions.ts](../../../apps/api/src/services/aiArchitectureOperatingConditions.ts)

핵심 함수:

```ts
createArchitectureDraft
```

호출 순서:

```text
normalizeArchitectureDraftRequest
-> resolveScenario
-> createDraftByScenario
-> applyOperatingConditionConfig
-> applyGuardrailMetadata
```

의미:

1. 문자열 또는 구조화 요청을 같은 `CreateArchitectureDraftRequest`로 맞춘다.
2. prompt와 선택값으로 scenario를 결정한다.
3. scenario별 고정 template에서 ArchitectureJson을 만든다.
4. budget, traffic, security 옵션을 config에 반영한다.
5. metadata, assumption, guardrail warning을 붙인다.

같은 Requirement Prompt와 같은 옵션이면 같은 Architecture Draft가 나온다.

Bedrock은 이 결과 뒤에 붙는 설명만 만든다.

## 8. LLM provider abstraction

파일: [apps/api/src/services/aiLlmExplanation.ts](../../../apps/api/src/services/aiLlmExplanation.ts)

핵심 타입:

```ts
type AiTextProvider = {
  provider: "bedrock" | "amazon_q" | "openai";
  service: "bedrock_runtime" | "amazon_q_business" | "openai_responses";
  model?: string;
  generate: (request) => Promise<AiTextProviderResponse>;
};
```

핵심 함수:

| 함수 | 의미 |
| --- | --- |
| `createConfiguredAiExplanation` | 환경변수 기반 provider와 guard를 구성한다. |
| `createAiProviderBackedLlmExplanation` | target에 따라 provider 우선순위를 정하고 fallback을 처리한다. |
| `createBedrockTextProvider` | Bedrock Runtime Converse API client를 만든다. |
| `createAmazonQBusinessTextProviderFromEnv` | Amazon Q Business provider를 환경변수에서 만든다. |
| `tryProvider` | credit guard, cache, rate limit, provider 호출, metadata 생성을 처리한다. |
| `createFallbackExplanationWithMetadata` | provider 실패 시 rule fallback 설명에 metadata를 붙인다. |

### 8.1 provider 선택 순서

Terraform Error Explanation:

```text
Amazon Q Business
-> 실패하거나 fallback이면 Bedrock
-> 실패하면 fallback
```

그 외 설명:

```text
Bedrock
-> 실패하면 OpenAI legacy provider
-> 실패하면 fallback
```

현재 기본 configured flow에는 Bedrock과 Amazon Q가 들어간다. OpenAI는 legacy/fallback provider로만 남아 있다.

### 8.2 Bedrock 호출

파일: [apps/api/src/services/aiLlmExplanation.ts](../../../apps/api/src/services/aiLlmExplanation.ts)

사용 SDK:

```ts
BedrockRuntimeClient
ConverseCommand
```

호출 의미:

```text
modelId = BEDROCK_MODEL_ID
system = createSystemInstructions()
messages[0].content = provider prompt
inferenceConfig.maxTokens = 700
inferenceConfig.temperature = 0.2
```

Bedrock 응답의 text를 JSON으로 parse하고 `LlmExplanation` schema에 맞는지 검증한다.

### 8.3 Amazon Q Business 호출

파일: [apps/api/src/services/aiLlmExplanation.ts](../../../apps/api/src/services/aiLlmExplanation.ts)

사용 SDK:

```ts
QBusinessClient
ChatSyncCommand
```

호출 조건:

| 조건 | 의미 |
| --- | --- |
| `AMAZON_Q_ENABLED=true` | Q provider 활성화 |
| `AMAZON_Q_REGION` 있음 | Q Business application이 있는 리전이다. 없으면 `AWS_REGION`을 사용한다. |
| `AMAZON_Q_APPLICATION_ID` 있음 | Q Business application id |
| `AMAZON_Q_USER_ID` 있음 | ChatSync user id |
| `AMAZON_Q_CREDIT_CONFIRMED=true` | credit guard 통과 |

Q는 자연어 설계 생성용으로 쓰지 않는다.

Terraform Error Explanation과 AWS 운영 오류 설명 보강에 우선 사용한다.

### 8.4 OpenAI legacy provider

파일: [apps/api/src/services/aiLlmExplanation.ts](../../../apps/api/src/services/aiLlmExplanation.ts)

기존 OpenAI helper는 삭제하지 않고 legacy 경로로 남겨 두었다.

기본 configured flow는 Bedrock을 우선 사용한다. OpenAI API key가 없거나 configured flow에 openAiProvider가 없으면 fallback으로 내려간다.

## 9. LLM payload와 검증

파일:

- [apps/api/src/services/aiLlmExplanationPayloads.ts](../../../apps/api/src/services/aiLlmExplanationPayloads.ts)
- [apps/api/src/services/aiLlmExplanationValidation.ts](../../../apps/api/src/services/aiLlmExplanationValidation.ts)

외부 AI로 보내는 payload는 전체 원문 상태가 아니다. target별로 필요한 summary만 만든다.

| target | payload 요약 |
| --- | --- |
| `architecture_draft` | requirement prompt, title, selected scenario, node types, edge count, assumptions, guardrail warnings |
| `design_simulation` | request flow, bottleneck, failure scenario, cost pressure, recommendation |
| `pre_deployment_check` | finding, checklist, suggestion 제목과 설명 |
| `terraform_error_explanation` | stage, category, severity, summary, likely cause, next actions, related resource |
| `terraform_preview_explanation` | detected resource, finding, checklist |
| `architecture_patch_preview` | requested action, resource type, target resource, changes, user acceptance 필요 여부 |

LLM 응답은 아래 shape로 제한된다.

```json
{
  "target": "architecture_draft",
  "summary": "짧은 요약",
  "highlights": ["핵심"],
  "nextActions": ["다음 행동"],
  "fallbackUsed": false
}
```

검증 규칙:

| 규칙 | 이유 |
| --- | --- |
| target이 요청 target과 다르면 fallback | 잘못된 응답 방지 |
| summary가 너무 길거나 비어 있으면 fallback | UI 품질 유지 |
| 보장 문구가 있으면 fallback | 배포 가능, 비용 없음, 보안 안전 보장 금지 |
| list item이 너무 길거나 비어 있으면 제거 | UI 품질 유지 |

## 10. Secret masking과 Terraform error sanitizing

파일: [apps/api/src/services/aiProviderSafety.ts](../../../apps/api/src/services/aiProviderSafety.ts)

핵심 함수:

| 함수 | 의미 |
| --- | --- |
| `maskSecretsForAi` | provider로 보내기 전에 object/string 내부 secret을 마스킹한다. |
| `sanitizeTerraformErrorForAi` | Terraform error를 stage, sanitizedMessage, relatedResourceId로 줄인다. |
| `createNormalizedAiCacheKey` | provider, model, route target, sanitized payload 기반 cache key를 만든다. |
| `estimateAiUsage` | input/output character와 token estimate를 계산한다. |

마스킹 대상 예:

```text
AWS access key
AWS account id
AWS ARN
private key
database URL
password
token
secret
api key
authorization
cookie
```

중요한 점:

`.env`, AWS credentials, private key, raw access token, DB password, raw secret은 외부 AI로 보내면 안 된다.

## 11. 비용 guard와 호출 제한

AWS AI provider는 credit 확인 flag가 없으면 실제 호출하지 않는다.

환경변수:

| env | 의미 |
| --- | --- |
| `AI_BILLING_MODE` | `aws_credit_only`일 때만 AWS credit guard 통과 가능 |
| `BEDROCK_CREDIT_CONFIRMED` | Bedrock 실제 호출 허용 |
| `AMAZON_Q_CREDIT_CONFIRMED` | Amazon Q 실제 호출 허용 |
| `TRANSCRIBE_CREDIT_CONFIRMED` | Transcribe 실제 호출 허용 |
| `AI_DAILY_CALL_LIMIT` | provider별 일일 호출 상한 |
| `AI_RATE_LIMIT_PER_MINUTE` | provider별 분당 호출 상한 |

credit guard:

```text
AI_BILLING_MODE !== "aws_credit_only"
-> AWS provider 호출 차단

BEDROCK_CREDIT_CONFIRMED !== "true"
-> Bedrock 호출 차단

AMAZON_Q_CREDIT_CONFIRMED !== "true"
-> Amazon Q 호출 차단

TRANSCRIBE_CREDIT_CONFIRMED !== "true"
-> Transcribe 호출 차단
```

차단되면 provider 호출 없이 fallback metadata가 붙은 rule 기반 설명을 반환한다.

## 12. Cache와 provider metadata

모든 provider 결과에는 `AiProviderMetadata`가 붙는다.

타입 위치: [packages/types/src/index.ts](../../../packages/types/src/index.ts)

```ts
type AiProviderMetadata = {
  provider: AiProvider;
  service: AiProviderService;
  model?: string;
  routeTarget: string;
  cacheHit: boolean;
  cacheKey: string;
  estimatedUsage: AiEstimatedUsage;
  billingMode: AiBillingMode;
  generatedAt: IsoDateTimeString;
};
```

metadata 의미:

| 필드 | 뜻 |
| --- | --- |
| `provider` | `bedrock`, `amazon_q`, `amazon_transcribe`, `openai`, `fallback` |
| `service` | 실제 서비스 또는 fallback 종류 |
| `model` | Bedrock model id 또는 Q application id |
| `routeTarget` | 어떤 AI target의 호출인지 |
| `cacheHit` | normalized input cache hit 여부 |
| `cacheKey` | sanitized payload 기반 hash |
| `estimatedUsage` | 대략적인 input/output 사용량 |
| `billingMode` | billing guard mode |
| `generatedAt` | metadata 생성 시각 |

cache key는 secret masking 이후 payload로 만든다.

## 13. Amazon Transcribe 흐름

파일: [apps/api/src/services/aiTranscribe.ts](../../../apps/api/src/services/aiTranscribe.ts)

사용 SDK:

```ts
TranscribeClient
StartTranscriptionJobCommand
GetTranscriptionJobCommand
```

### 13.1 전사 시작

Route:

```http
POST /api/ai/voice-requirement/transcribe
```

입력:

```ts
type VoiceRequirementInput = {
  mediaUri: string;
  mediaFormat: "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm";
  languageCode?: string;
};
```

흐름:

```text
credit guard 확인
-> mediaUri가 s3:// 인지 확인
-> TRANSCRIBE_MEDIA_BUCKET이 있으면 해당 bucket인지 확인
-> StartTranscriptionJobCommand
-> status = "transcribing" 반환
```

### 13.2 전사 결과 조회

Route:

```http
GET /api/ai/voice-requirement/transcribe/:jobName
```

흐름:

```text
GetTranscriptionJobCommand
-> FAILED면 failed confirmation 반환
-> COMPLETED 전이면 transcribing 반환
-> COMPLETED면 transcript JSON fetch
-> transcriptText 추출
-> status = "awaiting_user_confirmation"
```

### 13.3 사용자 확정

Route:

```http
POST /api/ai/voice-requirement/confirm
```

입력:

```ts
{
  transcriptText: string;
  confirmedText: string;
  confirmedByUserId?: string;
}
```

흐름:

```text
confirmedText trim
-> TranscribeConfirmation status = "confirmed"
-> RequirementPrompt 생성
```

중요한 점:

전사 결과가 있어도 사용자가 확인하기 전에는 Requirement Prompt가 아니다.

## 14. Architecture Patch Preview 흐름

파일: [apps/api/src/services/aiArchitecturePatchPreview.ts](../../../apps/api/src/services/aiArchitecturePatchPreview.ts)

Route:

```http
POST /api/ai/architecture-patch-preview
```

입력:

```ts
{
  architectureJson: ArchitectureJson;
  instruction: string;
}
```

호출 흐름:

```text
resolvePatchIntent
-> createPatchChanges
-> applyPreviewChanges
-> createLlmExplanation({ target: "architecture_patch_preview" })
-> ArchitecturePatchPreview 반환
```

`ArchitecturePatchPreview`의 핵심:

```ts
{
  baseArchitectureJson,
  proposedArchitectureJson,
  changes,
  requiresUserAcceptance: true,
  userAcceptedChange: null
}
```

즉 자연어 수정 요청은 바로 Board에 반영되지 않는다.

`proposedArchitectureJson`은 preview일 뿐이다. 실제 Board 반영은 사용자가 적용 버튼을 누르고 `UserAcceptedChange`가 생긴 뒤에 해야 한다.

## 15. Shared type 계약

파일: [packages/types/src/index.ts](../../../packages/types/src/index.ts)

이번 AI provider 흐름에서 중요한 타입:

| 타입 | 의미 |
| --- | --- |
| `RequirementInput` | 텍스트 또는 voice에서 들어온 원 요구사항 |
| `RequirementPrompt` | 사용자가 확인한 설계 생성용 요구사항 |
| `VoiceRequirementInput` | Transcribe에 보낼 음성 media 정보 |
| `TranscribeConfirmation` | 전사 상태와 사용자 확인 상태 |
| `ArchitecturePatchIntent` | 자연어 수정 요청을 해석한 의도 |
| `ArchitecturePatchPreview` | Board 변경 전 diff preview |
| `UserAcceptedChange` | 사용자가 상태 변경을 승인했다는 기록 |
| `AiProviderMetadata` | provider 호출 metadata |
| `LlmExplanation` | 화면에 표시할 설명 계약 |

이 계약은 [docs/data-models.md](../../data-models.md)에도 정리되어 있다.

## 16. 환경변수

예시 위치: [.env.example](../../../.env.example)

AWS AI provider 관련 env:

```env
AI_BILLING_MODE=aws_credit_only
AI_DAILY_CALL_LIMIT=50
AI_RATE_LIMIT_PER_MINUTE=10

BEDROCK_CREDIT_CONFIRMED=false
BEDROCK_MODEL_ID=anthropic.claude-3-5-haiku-20241022-v1:0

AMAZON_Q_ENABLED=false
AMAZON_Q_CREDIT_CONFIRMED=false
AMAZON_Q_REGION=
AMAZON_Q_APPLICATION_ID=
AMAZON_Q_USER_ID=

TRANSCRIBE_CREDIT_CONFIRMED=false
TRANSCRIBE_LANGUAGE_CODE=ko-KR
TRANSCRIBE_MEDIA_BUCKET=
```

실제 secret, account id, private key, DB password, token은 문서나 코드에 넣지 않는다.

## 17. 실패 흐름

| 실패 위치 | 결과 |
| --- | --- |
| Bedrock credit 미확인 | `fallbackUsed = true`, `fallbackReason = "credit_not_confirmed"` |
| Bedrock 호출 실패 | rule fallback 설명 반환 |
| Amazon Q credit 미확인 | Q 호출 없이 Bedrock 또는 fallback으로 이동 |
| Amazon Q 호출 실패 | Bedrock fallback 또는 rule fallback |
| Transcribe credit 미확인 | `TranscribeConfirmation.status = "failed"` |
| Transcribe job 실패 | `status = "failed"`, Requirement Prompt 생성 안 함 |
| Architecture Patch 해석 실패 | manual review preview 반환, Board 변경 없음 |
| LLM 응답 JSON invalid | rule fallback 설명 반환 |
| daily limit 초과 | `fallbackReason = "daily_limit_exceeded"` |
| minute rate limit 초과 | `fallbackReason = "rate_limited"` |

실패해도 AI가 Board, Git, Deployment 상태를 직접 바꾸지 않는다.

## 18. 현재 구현 범위와 남은 범위

구현된 범위:

- Bedrock Runtime Converse API provider
- Amazon Q Business ChatSync API provider
- Amazon Transcribe job start/get/confirm flow
- provider abstraction과 fallback metadata
- credit confirmed guard
- provider별 cache key
- provider별 daily/rate limit
- secret masking
- Terraform error sanitizing
- Architecture Patch Preview 계약
- Voice Requirement confirmation 계약
- provider badge 표시
- OpenAI legacy provider 유지

남은 범위:

- Voice Requirement Input 전용 UI
- Architecture Patch Preview 전용 UI와 적용 버튼
- `UserAcceptedChange` 저장 위치와 audit log 연결
- provider metadata RDS 저장 정책 확정
- 운영용 호출량 metric/dashboard
- Amazon Q를 Terraform Error 외 AWS 운영 설명에 더 넓게 연결할지 결정
- Transcribe transcript file 접근 방식을 S3 presigned URL 또는 backend S3 getObject로 정리

## 19. 사이트에서 확인하는 방법

로컬 실행:

```bash
pnpm dev
```

기본 URL:

```text
Web: http://localhost:3000
API: http://127.0.0.1:4000
AI 화면: http://localhost:3000/workspace/ai
```

### 19.1 Bedrock 확인

1. `AI_BILLING_MODE=aws_credit_only`를 설정한다.
2. `BEDROCK_CREDIT_CONFIRMED=true`를 설정한다.
3. `BEDROCK_MODEL_ID`를 설정한다.
4. `/workspace/ai`에서 Architecture Draft, Pre-Deployment Check, Design Simulation, Terraform Preview를 실행한다.
5. LLM 설명 badge가 Bedrock으로 표시되는지 확인한다.

credit flag를 끄면 fallback badge가 표시되어야 한다.

### 19.2 Amazon Q 확인

1. `AMAZON_Q_ENABLED=true`를 설정한다.
2. `AMAZON_Q_CREDIT_CONFIRMED=true`를 설정한다.
3. Q Business application이 `AWS_REGION`과 다른 리전에 있으면 `AMAZON_Q_REGION`을 설정한다.
4. `AMAZON_Q_APPLICATION_ID`, `AMAZON_Q_USER_ID`를 설정한다.
5. `/workspace/ai`에서 Terraform Error Explanation을 실행한다.
6. LLM 설명 badge가 Amazon Q로 표시되는지 확인한다.

Q 설정이 없거나 실패하면 Bedrock 또는 fallback으로 내려간다.

### 19.3 Transcribe 확인

현재 UI 버튼은 없다. API로 확인한다.

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:4000/api/ai/voice-requirement/transcribe `
  -ContentType "application/json" `
  -Body '{"mediaUri":"s3://YOUR_BUCKET/audio.wav","mediaFormat":"wav","languageCode":"ko-KR"}'
```

job 조회:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:4000/api/ai/voice-requirement/transcribe/JOB_NAME
```

확정:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:4000/api/ai/voice-requirement/confirm `
  -ContentType "application/json" `
  -Body '{"transcriptText":"원문 전사 결과","confirmedText":"사용자가 확정한 요구사항"}'
```

확정 응답에 `requirementPrompt.confirmedByUser = true`가 있어야 한다.

## 20. 코드를 읽는 순서

처음 읽을 때는 아래 순서가 덜 헷갈린다.

1. [apps/web/app/workspace/AiWorkspaceClient.tsx](../../../apps/web/app/workspace/AiWorkspaceClient.tsx)
   - `runPromptDraft`
   - `runPreDeploymentCheck`
   - `runDesignSimulation`
   - `runTerraformPreview`
   - `runTerraformErrorExplanation`

2. [apps/api/src/routes/ai.ts](../../../apps/api/src/routes/ai.ts)
   - `registerAiRoutes`
   - `POST /ai/architecture-draft`
   - `POST /ai/terraform-error-explanation`
   - `POST /ai/architecture-patch-preview`
   - voice requirement routes

3. [apps/api/src/services/aiArchitectureDrafts.ts](../../../apps/api/src/services/aiArchitectureDrafts.ts)
   - `createArchitectureDraft`
   - deterministic draft 생성 흐름

4. [apps/api/src/services/aiLlmExplanation.ts](../../../apps/api/src/services/aiLlmExplanation.ts)
   - `createConfiguredAiExplanation`
   - `createAiProviderBackedLlmExplanation`
   - `tryProvider`
   - `createBedrockTextProvider`
   - `createAmazonQBusinessTextProviderFromEnv`

5. [apps/api/src/services/aiLlmExplanationPayloads.ts](../../../apps/api/src/services/aiLlmExplanationPayloads.ts)
   - target별 provider payload 요약

6. [apps/api/src/services/aiProviderSafety.ts](../../../apps/api/src/services/aiProviderSafety.ts)
   - secret masking
   - Terraform error sanitizing
   - cache key
   - usage estimate

7. [apps/api/src/services/aiTranscribe.ts](../../../apps/api/src/services/aiTranscribe.ts)
   - `start`
   - `getConfirmation`
   - `confirmTranscript`

8. [apps/api/src/services/aiArchitecturePatchPreview.ts](../../../apps/api/src/services/aiArchitecturePatchPreview.ts)
   - `createArchitecturePatchPreview`
   - user acceptance boundary

9. [packages/types/src/index.ts](../../../packages/types/src/index.ts)
   - AI provider metadata
   - voice requirement contract
   - patch preview contract
   - user accepted change contract

## 21. 진짜 핵심 요약

```text
사용자 입력
-> API route
-> deterministic service가 결과 생성
-> secret masking과 summary payload 생성
-> target에 맞는 provider 선택
   - Terraform error는 Amazon Q 우선
   - 나머지는 Bedrock 우선
   - Voice는 Transcribe
-> credit guard, cache, rate limit 확인
-> AWS AI 실제 호출 또는 fallback
-> provider metadata 포함 응답
-> 화면은 provider badge와 설명 표시
-> Board/Git/Deployment 상태 변경은 사용자 승인 후에만 가능
```

AI는 판단을 보강하고 설명한다.

최종 리소스 조합과 상태 변경은 rule engine, backend safety gate, User-Accepted Change가 결정한다.
