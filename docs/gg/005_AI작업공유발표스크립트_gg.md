# AI 작업 공유 발표 스크립트

## 목적

이 스크립트는 gg AI 브랜치에서 무엇을 만들었는지 모르는 팀원에게 설명하기 위한 발표용 문서다.

장표 파일:

- `docs/gg/004_AI작업공유장표_gg.html`

발표 목표:

- gg AI 파트가 “무엇을 대신 구현했는지”가 아니라 “어떤 연결 지점을 만들었는지”를 설명한다.
- 팀원이 자기 파트에서 무엇을 맞추면 되는지 이해하게 한다.
- AI가 실제 배포 판단을 대신하지 않는다는 안전 원칙을 공유한다.

## 발표 전 준비

1. 브라우저에서 `docs/gg/004_AI작업공유장표_gg.html`을 연다.
2. 방향키로 장표 이동이 되는지 확인한다.
3. `발표자 노트` 버튼을 켜면 각 장표의 핵심 멘트가 나온다.
4. 발표 중에는 API 이름보다 “누가 무엇을 소비하는지”에 집중한다.

## 1장. 한 줄 요약

말할 내용:

이번 브랜치의 핵심은 “AI 기능이 실제로 눌러볼 수 있는 형태가 됐다”는 것이다.

자연어 요청, Source Repository URL, ArchitectureJson, Pre-Deployment Check, IaC Preview 설명이 하나의 흐름으로 연결됐다.

아직 “AI가 실제 AWS에 배포한다”는 뜻은 아니다. LLM provider가 없어도 deterministic fallback으로 동작하고, 팀원들이 API와 `/workspace` 화면에서 확인할 수 있게 만든 상태다.

강조할 점:

- API는 5개가 생겼다.
- 테스트는 10개가 있다.
- `/workspace`에서 직접 눌러볼 수 있다.

## 2장. 왜 만들었나

말할 내용:

처음에는 “AI가 알아서 Terraform도 만들고, 설명도 하고, 위험도 보고, 초안도 만들면 되지 않나?”처럼 보일 수 있다.

하지만 이 프로젝트는 초보자가 AWS를 배우는 서비스다. 그래서 AI가 검증되지 않은 Terraform 최종본을 만들거나, 배포 판단을 직접 하면 위험하다.

이번 브랜치의 원칙은 명확하다.

- 위험 판단의 근거는 rule engine이나 deterministic code가 먼저 만든다.
- AI는 그 결과를 초보자가 이해할 수 있는 말로 설명한다.
- 실제 배포나 Apply 판단은 AI가 하지 않는다.

이렇게 해야 비용 사고, 보안 사고, 팀원 간 계약 충돌을 줄일 수 있다.

## 3장. 전체 흐름

말할 내용:

전체 흐름은 네 단계로 보면 된다.

첫 번째는 입력이다. 사용자가 자연어로 “DB 포함 백엔드 서버를 만들고 싶다”고 말하거나, Source Repository URL을 넣는다.

두 번째는 Architecture Draft다. AI는 말을 직접 화면에 뿌리는 게 아니라, Architecture Board가 열 수 있는 `ArchitectureJson`을 만든다.

세 번째는 Pre-Deployment Check다. 이 `ArchitectureJson`을 기준으로 비용, 보안, 설정 누락을 확인한다.

네 번째는 설명이다. finding, checklist, Terraform 오류, IaC Preview를 초보자 언어로 바꿔준다.

중요한 점은 모든 흐름의 중심이 `ArchitectureJson`이라는 것이다.

## 4장. API 지도

말할 내용:

이번 브랜치에서 만든 API는 5개다.

`/api/ai/architecture-draft`는 자연어 prompt를 받아 Architecture Draft를 만든다.

`/api/ai/github-architecture-draft`는 Source Repository URL을 받아 초안을 만든다. 이때 전체 코드를 다 분석하지 않는다. MVP에서는 README, package metadata, Dockerfile, docker-compose file 정도만 본다.

`/api/ai/pre-deployment-check`는 ArchitectureJson을 받아 비용, 보안, 설정 finding과 checklist를 만든다.

`/api/ai/terraform-error-explanation`은 validate, plan, apply 오류 메시지를 쉬운 설명으로 바꾼다.

`/api/ai/terraform-preview-explanation`은 IaC Preview 또는 Terraform 코드가 어떤 Resource를 만드는지 설명한다.

여기서 중요한 것은 “AI API가 많다”가 아니라 “각 API가 팀원 파트와 만나는 위치가 다르다”는 것이다.

## 5장. 팀별 영향

말할 내용:

jh는 Architecture Board 담당이다. jh 쪽에서는 AI 결과를 전부 알 필요가 없다. `ArchitectureJson`만 보드에서 열 수 있으면 된다. finding은 `resourceId`로 노드와 연결된다.

sw는 Terraform 변환 담당이다. Terraform 생성의 원천은 AI 응답이 아니라 `ArchitectureJson`이어야 한다. AI는 Terraform 최종본을 마음대로 만드는 게 아니라, IaC Preview가 무엇을 만드는지 설명하는 보조 역할이다.

ck는 배포 실행 담당이다. Plan/Apply 오류 설명을 위해 AI에 넘길 payload는 최소화했다. `{ stage, rawMessage, relatedResourceId? }` 정도면 된다.

ys는 플랫폼 담당이다. 프로젝트 목록은 가볍게 유지하고, AI 요약은 프로젝트 상세나 작업 화면에서 보여주는 방향이다.

정리하면 팀원들은 전체 AI 구조를 몰라도 된다. 자기 파트가 주고받을 데이터 모양만 맞추면 된다.

## 6장. 데이터 계약

말할 내용:

이번 작업에서 공통 타입은 `packages/types`에 추가했다.

가장 중요한 타입은 네 개다.

`AiArchitectureDraftResult`는 초안 생성 결과다. 여기에는 `architectureJson`, `title`, `metadata`가 들어간다.

`AiPreDeploymentAnalysisResult`는 배포 전 점검 결과다. 여기에는 summary, 비용 추정, resource별 비용, findings, checklist가 들어간다.

`AiTerraformErrorExplanationResult`는 Terraform 오류 설명 결과다. stage, category, severity, likelyCause, nextActions가 핵심이다.

`AiTerraformPreviewExplanationResult`는 IaC Preview 설명 결과다. 어떤 Terraform Resource가 감지됐고, 어떤 위험이 있는지 보여준다.

팀원이 필드명을 새로 만들기 전에 이 타입을 먼저 봐야 한다.

## 7장. 검증 결과

말할 내용:

검증은 네 가지를 했다.

첫째, API 테스트를 돌렸다. 총 10개 테스트가 통과했다.

둘째, 전체 typecheck를 통과했다. shared type, API, web 소비 형태가 맞다는 뜻이다.

셋째, 전체 lint와 build를 통과했다.

넷째, 로컬에서 API `/health`와 web `/workspace`가 응답하는 것을 확인했다.

다만 브라우저 클릭 기반 시각 QA는 별도 브라우저 제어 도구가 없어서 완전하게 하지는 못했다. 대신 dev server와 HTTP 응답 기준으로 동작 surface는 확인했다.

## 8장. 직접 눌러보기

말할 내용:

이 장표의 미니 시뮬레이터는 실제 API 호출이 아니라 설명용이다.

실제 동작을 보고 싶으면 `/workspace` 화면에서 자연어 초안 생성, GitHub 초안 생성, 배포 전 점검, Terraform Preview 설명 버튼을 누르면 된다.

이 장표에서는 각 흐름이 어떤 결과 형태로 이어지는지만 빠르게 보여준다.

설명 중에 버튼을 눌러가며 “자연어는 ArchitectureJson으로”, “Source Repository는 제한된 evidence로”, “Pre-Deployment Check는 finding과 checklist로”, “IaC Preview는 resource 설명으로” 이어진다고 말하면 된다.

## 9장. 이제 팀원이 할 일

말할 내용:

이제 중요한 것은 “AI 기능이 있으니 끝”이 아니다. 팀원 파트와 연결해야 한다.

jh는 보드가 `ArchitectureJson`을 열 수 있는지 확인해야 한다.

sw는 Terraform 변환 결과를 AI 설명 API에 넘길 형태를 맞춰야 한다.

ck는 오류 설명 payload를 최소 형태로 넘겨야 한다.

ys는 프로젝트 상세나 대시보드에서 AI 요약을 보여줄 위치를 정해야 한다.

회의 중 체크박스를 하나씩 눌러가며 각 담당자에게 “이 부분만 맞춰주면 된다”고 설명하면 된다.

## 10장. 퀴즈와 마무리

말할 내용:

마지막으로 확인할 질문은 하나다.

AI가 Terraform 최종본을 마음대로 만들고 바로 Apply까지 하게 둬도 되는가?

정답은 안 된다.

우리 서비스에서 AI는 안전한 보조 계층이다. 결정론적 생성과 검증은 코드가 맡고, AI는 그 결과를 사람이 이해하기 쉽게 설명한다.

이 브랜치의 결과는 “AI가 다 하는 서비스”가 아니라 “팀원 기능과 연결 가능한 AI 보조 API와 화면”이다.

## 짧은 발표 버전

시간이 부족하면 아래만 말한다.

이번 브랜치에서 gg AI 파트는 다섯 가지 API와 `/workspace` 연결 화면을 만들었다.

핵심은 AI가 실제 배포 판단을 대신하지 않는다는 것이다. AI는 자연어와 Source Repository로 Architecture Draft를 제안하고, Pre-Deployment Check finding과 Terraform 오류를 초보자 언어로 설명한다.

공통 데이터 중심은 `ArchitectureJson`이다. jh는 보드에서 이 JSON을 열고, sw는 이 JSON을 Terraform 생성의 원천으로 쓰고, ck는 Plan/Apply 오류 payload를 넘기고, ys는 프로젝트 상세 화면에서 AI 요약을 보여주면 된다.

현재 fallback만으로도 동작하며, API 테스트 10개, 전체 typecheck, lint, build, test를 통과했다.

다음 단계는 이 AI 결과를 각 팀원 파트의 실제 화면과 데이터 흐름에 연결하는 것이다.
