# Blueprint 리디자인 적용 스펙

## 개요

`redesign/blueprint`의 Direction F 디자인을 SketchCatch 웹 앱 전체에 적용한다. 이번 작업은 기능, API, shared type, DB, Terraform 실행, Deployment 안전 계약을 바꾸지 않는 UI 리디자인이다. Architecture Board와 Deployment Safety Gate를 가장 높은 완성도로 다듬고, Marketing, Auth, Dashboard까지 같은 Blueprint 토큰과 화면 언어로 맞춘다.

## 제품 방향

SketchCatch는 `Terraform-first, multi-cloud-ready IaC operations service`로 설명한다. MVP가 AWS-first인 점은 AWS 연결, AWS 아이콘, Direct Deployment Path에서 드러내되, 랜딩, metadata, Auth 설명문, 상위 UI 문구는 AWS-only처럼 읽히지 않게 정리한다.

## 범위

- `/`, `/login`, `/signup`, `/password-reset`, `/mypage`, `/projects`, `/workspace/new`, `/workspace`의 주요 UI를 Blueprint 톤으로 맞춘다.
- `apps/web`의 기존 기능 구조를 유지한다.
- `packages/types`, `apps/api`, DB schema, Deployment 실행 로직은 변경하지 않는다.
- 실제 AWS apply, destroy, Git/CI/CD handoff, Terraform cloud mutation은 실행하거나 새로 열지 않는다.

## 폰트와 토큰

- `SpoqaHanSansNeo_all.zip`에서 subset `woff2`만 추출해 `apps/web/public/fonts/spoqa/`에 커밋한다.
- `Space Grotesk`와 `JetBrains Mono`도 필요한 `woff2` weight만 다운로드해 `apps/web/public/fonts/`에 커밋한다.
- 런타임 Google Fonts fetch나 새 폰트 npm 의존성은 추가하지 않는다.
- `--bp-body`, `--bp-head`, `--bp-kr`, `--bp-mono`를 전역 토큰으로 정의한다.
- `--bp-body`, `--bp-kr`는 Spoqa Han Sans Neo를 우선한다.
- `--bp-head`는 Space Grotesk를 우선하고, 한글은 Spoqa Han Sans Neo로 자연스럽게 fallback한다.
- `--bp-mono`는 JetBrains Mono를 우선하고 `ui-monospace`, `SFMono-Regular`, `Consolas`를 fallback으로 둔다.
- 전역 줄바꿈은 `word-break: keep-all`, `overflow-wrap: break-word`, 제목 `text-wrap: balance`를 기본으로 한다.

## 공통 UI 언어

- 화면 배경은 밝은 도면형 Blueprint page와 grid surface를 기본으로 한다.
- 패널은 8px 이하 radius, 선명한 border, corner bracket, titleblock, mono label을 사용한다.
- 주요 액션 버튼은 Blueprint blue, 위험/차단 액션은 brick red 계열을 사용한다.
- 위험도는 HIGH, MED, LOW badge로 구분한다.
- decorative gradient orb, dark floating object, 과한 카드 중첩은 제거한다.

## Architecture Board

- 현재 정보 구조를 유지한다.
- `ParameterInputPanel`, IaC Preview, Diagnostics, AI, Deployment 패널을 하나의 탭 구조로 통합하지 않는다.
- 리소스 팔레트, React Flow 캔버스, toolbar, resize handle, selection, connection handle을 Blueprint 토큰으로 재스킨한다.
- 새 일반 리소스 노드 기본 크기는 `124x96`으로 변경한다.
- VPC, Subnet, Security Group 같은 영역 컨테이너 노드는 현재 큰 영역 크기를 유지한다.
- 기존 저장 다이어그램의 node size는 마이그레이션하지 않는다.
- 기존 노드는 저장된 크기 안에서 Blueprint 타일처럼 보이도록 CSS를 조정한다.
- 노드에는 icon, label, resource type 중심 정보만 표시하고 파라미터 값은 노드에 노출하지 않는다.

## Deployment Safety Gate

- `getDeploymentActionState`의 Apply, Destroy 활성 조건은 변경하지 않는다.
- `isBlocked`, `blockedBy`, `blockedReason`, `planSummary.warnings`, Pre-Deployment Check findings를 이용해 gate UI를 강화한다.
- High risk 또는 blocked 상태는 2px red gate panel, lock affordance, disabled action copy로 표시한다.
- `missing_approval`, `risk_analysis`, `cost_analysis` 차단 사유를 사용자가 구분할 수 있게 보여준다.
- Plan summary, warning, estimated cost, preflight summary는 compact Blueprint panel로 보여준다.
- 실제 Deployment 실행, 승인, 취소, 로그 스트리밍 로직은 유지한다.

## Marketing

- `/`는 밝은 Blueprint 랜딩으로 재구성한다.
- 첫 화면은 SketchCatch 브랜드와 실제 서비스 여정이 보이게 구성한다.
- 여정은 `Requirement Input -> Architecture Board -> IaC Preview -> Safety Gate -> Deployment History` 순서로 표현한다.
- Safety Gate 데모는 제품의 핵심 신호로 강하게 배치한다.
- AWS-first 예시는 사용할 수 있지만 제품 설명은 multi-cloud-ready IaC 운영 서비스로 유지한다.

## Auth

- `/login`, `/signup`, `/password-reset` 라우트는 유지한다.
- OAuth, 중복 확인, 약관 확인, password reset flow는 변경하지 않는다.
- 좌측 form panel과 우측 Blueprint aside를 공통 패턴으로 적용한다.
- 입력, 소셜 버튼, submit 버튼, error/success message를 Blueprint 토큰으로 맞춘다.

## Dashboard

- 새 API나 shared type을 추가하지 않는다.
- 현재 화면이 가진 project, deployment, delete preview, recent deployment data만 사용한다.
- Project card thumbnail은 Blueprint mini schematic으로 바꾼다.
- 실제 상태를 알 수 있으면 `BLOCKED`, `OK`, `DEPLOYED` 등으로 표시한다.
- 상태를 알 수 없으면 `DRAFT` 또는 `READY` 같은 비파괴 UI 상태로 표시한다.

## 검증 기준

- `pnpm harness:check`가 구현 전후 통과한다.
- web lint/typecheck가 통과한다.
- 전체 `pnpm lint`, `pnpm typecheck`, `pnpm build`가 통과한다.
- dev server에서 `/`, `/login`, `/signup`, `/mypage`, `/workspace/new`를 브라우저 스모크한다.
- desktop/mobile에서 텍스트 겹침, 부자연스러운 단어/문장 줄바꿈, 빈 캔버스, 노드 렌더, Deployment Panel 상태 표시를 확인한다.
- 실제 AWS apply/destroy는 검증하지 않는다.

## 완료 조건

- 주요 화면이 같은 Blueprint 토큰과 시각 언어로 일관된다.
- Architecture Board와 Safety Gate가 제품 핵심 화면처럼 가장 높은 완성도를 가진다.
- 기존 API, 테스트 계약, Deployment 안전 조건이 유지된다.
- 폰트가 외부 네트워크 없이 self-host로 렌더링된다.
- 작업 결과와 검증 내용이 `agent-progress.md`에 기록된다.
