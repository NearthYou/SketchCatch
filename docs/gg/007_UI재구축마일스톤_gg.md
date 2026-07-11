# SketchCatch UI 재구축 마일스톤

> **구현 작업자 필수:** 이 문서를 먼저 끝까지 읽고, `Milestone 0`부터 순서대로 진행한다. 마일스톤 하나를 끝낼 때마다 검증하고 커밋한다.

## 0. 이 문서의 한 줄 목적

기존 기능 연결은 살리고, 사용자가 SketchCatch의 전체 흐름을 자연스럽게 따라갈 수 있도록 화면을 처음부터 다시 만드는 계획이다.

이 문서는 화면 시안이 아니다. Sol 구현 작업자가 이 문서만 읽어도 아래 내용을 알 수 있는 실행 기준이다.

- 어떤 화면을 어떤 순서로 만들지
- 기존 코드 중 무엇을 다시 연결할지
- 어떤 데이터와 API를 절대 깨뜨리면 안 되는지
- 각 화면이 언제 완성된 것으로 볼지
- 다음 마일스톤으로 넘어가기 전에 무엇을 확인할지

이 문서를 만들 때 기준으로 삼은 문서는 다음과 같다.

- `DESIGN.md`
- `apps/web/AGENTS.md`
- `docs/gg/003_기획서.md`
- 화면 구성 handoff에서 정한 App Shell, Board, Inspector, 운영 패널 구조
- 현재 `apps/web/app` route와 `apps/web/features` 구조

문서끼리 내용이 다르면 아래 순서로 판단한다.

1. shared type과 canonical 문서
2. `DESIGN.md`
3. `apps/web/AGENTS.md`
4. `docs/gg/003_기획서.md`
5. 이 문서

충돌을 발견하면 임의로 한쪽을 지우거나 바꾸지 않는다. 충돌 내용을 먼저 보고하고, 안전하게 분리 가능한 화면까지만 작업한다.

---

## 1. 전체 UI 재구축 목표

이번 작업은 기존 UI를 조금씩 꾸미는 작업이 아니다.

기존 화면 표현은 새로 만들되, 이미 동작하는 기능과 데이터 흐름은 다시 사용한다.

### 새로 만드는 것

- Root와 로그인 진입 흐름
- Dashboard App Shell
- 새 프로젝트 시작 화면
- Workspace 화면 구조
- Architecture Board 주변 도구 배치
- AI 시작 화면
- Reverse Engineering 화면
- Resource Inspector와 Terraform Preview
- Safety / Cost Check 화면
- Direct Deployment와 Git/CI/CD 화면
- Deployment History와 Cleanup 확인 화면
- Template Gallery와 Template 시작 흐름

### 반드시 살리는 것

- 인증, 프로젝트 생성/조회/삭제 API
- `ArchitectureJson`
- `DiagramJson`
- `InfrastructureGraph`
- Architecture Board의 node/edge 편집 기능
- 프로젝트 draft 불러오기와 저장
- Diagram과 Terraform 변환 흐름
- Terraform Preview, diagnostics, 역동기화
- AI Architecture Draft와 사용자 적용 흐름
- Pre-Deployment Check의 finding과 checklist
- AWS Role 연결과 검증
- Reverse Engineering scan과 imported draft
- Deployment 생성, init, plan, 승인, apply, destroy, log, output, history
- GitHub 연결, Source Repository, Git/CI/CD handoff
- Cost Analysis 데이터

### 절대 하면 안 되는 것

- 화면을 새로 만든다는 이유로 API 계약을 임의로 바꾸기
- `ArchitectureJson`과 `DiagramJson`을 하나의 타입처럼 섞기
- 프론트엔드에서 AWS SDK나 Terraform CLI 실행하기
- AI, Reverse Engineering, Template 결과를 사용자 동작 없이 보드에 적용하기
- Repository Analysis가 Template Selection을 건너뛰고 바로 Architecture Draft를 만들게 하기
- 승인하지 않은 Plan을 Apply하기
- High Security Risk를 단순 안내로만 보여주고 배포를 허용하기
- 실제 API가 있는데 임시 mock 결과로 화면을 완성했다고 판단하기
- 구현되지 않은 기능을 성공한 것처럼 보이게 만들기

---

## 2. 제품 흐름

새 UI는 아래 흐름을 끊김 없이 연결해야 한다.

```text
로그인 / 회원가입
→ Dashboard
→ 새 프로젝트 시작
→ 빈 보드 / AI / Reverse Engineering / Template / GitHub Repo
→ Architecture Draft 확인
→ Architecture Board
→ Terraform Preview
→ Safety / Cost Check
→ Direct Deployment 또는 Git/CI/CD
→ Deployment History
→ Cleanup
```

시작 방식마다 Board에 도착하는 과정은 다르다.

| 시작 방식 | Board에 도착하기 전 확인할 것 |
| --- | --- |
| 빈 보드 | 프로젝트 이름을 확인하고 빈 `DiagramJson`으로 시작 |
| AI | 요구사항과 AI Architecture Draft를 확인한 뒤 적용 |
| Reverse Engineering | Reverse Engineering scan 결과와 imported draft를 확인한 뒤 적용 |
| Template | Template 미리보기를 확인하고 선택 |
| GitHub Repo | Repository Analysis evidence로 Template을 고르고, AI가 보완한 Architecture Draft를 확인한 뒤 적용 |

`Architecture Draft 확인`이 필요 없는 빈 보드는 바로 Board로 갈 수 있다. 나머지 방식은 결과를 먼저 보여주고, 사용자가 명확한 적용 버튼을 눌러야 Board 상태가 바뀐다.

### 사용자가 반드시 확인해야 하는 지점

- 음성 입력을 썼다면 전사된 문장
- AI가 만든 Architecture Draft
- Reverse Engineering이 복원한 imported draft
- Template으로 시작할 때 선택한 구조
- GitHub Repo를 보고 만든 추천 구조
- Repository Analysis가 찾은 evidence와 그 evidence로 고른 Template
- Architecture Suggestion이 바꾸려는 Resource와 parameter
- Medium/Low finding을 알고 진행한다는 승인
- Plan의 account, region, 변경 수, 비용과 보안 요약
- Apply 대상인 Terraform artifact와 `tfplan`
- Cleanup 전에 destroy plan

---

## 3. 데이터 흐름을 지키는 기준

처음에는 아래 네 가지가 다 비슷해 보일 수 있다. 하지만 역할이 다르므로 새 UI에서도 구분해야 한다.

| 데이터 | 쉬운 뜻 | UI에서 쓰이는 곳 |
| --- | --- | --- |
| `ArchitectureJson` | 저장된 인프라 구조의 기준 데이터 | 프로젝트 불러오기, AI/Reverse 결과, snapshot |
| `DiagramJson` | Board에서 편집 중인 node, edge, 위치, parameter | Architecture Board, 자동 저장, Terraform 생성 |
| `InfrastructureGraph` | Board와 Terraform 사이에서 구조를 한 번 정리한 데이터 | Terraform generator 내부 경계 |
| `TerraformArtifact` | 배포에 사용할 Terraform 파일 기록 | Terraform Preview, Plan, Approval, Apply |

화면에서 지켜야 할 흐름은 다음과 같다.

```text
Architecture Draft
→ 사용자가 적용
→ DiagramJson
→ InfrastructureGraph
→ Terraform IaC Preview
→ TerraformArtifact
→ Plan
→ 사용자 승인
→ Apply
```

Board node와 Terraform Resource는 가능한 한 같은 Resource identity를 공유해야 한다. 그래야 Terraform 오류, finding, 배포 결과를 해당 Board node에 다시 연결할 수 있다.

GitHub Repo에서 시작할 때는 아래 경계를 지킨다.

```text
Source Repository
→ Repository Analysis
→ Repository evidence
→ Template Selection
→ 선택한 Template과 evidence
→ AI Architecture Recommendation
→ Architecture Draft
→ 사용자 적용
→ Architecture Board
```

Repository Analysis는 파일과 metadata에서 evidence를 찾는 역할만 한다. 부족한 요구사항을 보완하고 Architecture Draft를 제안하는 역할은 AI Architecture Recommendation이 맡는다.

AWS-first 구현이어도 `Resource`, `InfrastructureGraph`, Reverse Engineering 결과의 공통 계약은 provider-neutral로 유지한다. AWS 전용 값은 Provider Adapter와 Resource별 parameter 경계 안에 둔다.

### 주요 shared contract

- `RequirementInput`
- `AiArchitectureDraftResult`
- `ArchitectureJson`
- `DiagramJson`
- `InfrastructureGraph`
- `CheckFinding`
- `ArchitectureSuggestion`
- `TerraformDiagnostic`
- `TerraformArtifact`
- `Deployment`
- `DeploymentPlanArtifact`
- `GitCicdHandoff`
- `ReverseEngineeringScan`

정확한 필드는 아래 파일을 따른다.

- `packages/types/src/index.ts`
- `docs/data-models.md`

---

## 4. 디자인 원칙

레퍼런스 제품은 화면 구조를 배우기 위한 자료다. 최종 색, 글꼴, 간격, 모서리, 버튼 모양은 `DESIGN.md`가 최우선 기준이다.

### 반드시 지킬 시각 규칙

| 항목 | 기준 |
| --- | --- |
| 기본 canvas | 흰색 `#ffffff` |
| 기본 글자 | `#171717`에 가까운 검정 |
| Primary CTA | 검정 `#000000` 배경, 흰 글자 |
| 본문 안 link | 파랑 `#0d74ce` |
| 기본 글꼴 | Pretendard |
| 경계선 | 얇은 hairline border |
| 간격 | 4px 단위 |
| CTA 모서리 | 8px |
| Card 모서리 | 12px |
| Code block | `#171717` 배경, 12px 모서리 |
| Input 최소 높이 | 44px |
| Button 최소 높이 | 40px |

### 화면 구성 규칙

- 운영 화면은 조용하고 빠르게 훑을 수 있어야 한다.
- Page section을 전부 떠 있는 Card로 만들지 않는다.
- Card 안에 Card를 넣지 않는다.
- Architecture Board는 장식 Card 안에 넣지 않고 작업 공간으로 크게 보여준다.
- 오른쪽 패널 제목은 작고 단단하게 보여준다. Hero 크기 글자를 쓰지 않는다.
- 익숙한 동작은 Lucide icon을 사용하고, 낯선 icon에는 tooltip을 단다.
- Loading, empty, error, warning, blocked, success 상태를 따로 만든다.
- 중요한 경고는 색만으로 구분하지 않고 icon과 문장을 함께 쓴다.
- 긴 한국어와 영문 Resource ID가 영역 밖으로 삐져나오지 않아야 한다.
- 화면 크기가 바뀌어도 toolbar, Board control, status badge가 서로 겹치지 않아야 한다.
- Hero용 sky gradient는 정말 필요한 Root 화면 한 곳에서만 제한적으로 쓴다.

### 제품 UI 규칙

- Root는 긴 마케팅 Landing이 아니라 실제 작업으로 들어가는 짧은 입구여야 한다.
- 비용, 보안, 삭제 위험은 배포 버튼보다 먼저 보인다.
- 초보자 설명은 선택한 Resource나 finding 바로 옆에서 짧게 보여준다.
- 실제 기능이 없는 버튼은 만들지 않는다.
- mock 또는 fallback을 쓴다면 사용자와 QA가 알 수 있게 표시한다.

---

## 5. 레퍼런스 활용 방식

### Cloudscape Design System

- URL: https://cloudscape.design/
- Components: https://github.com/cloudscape-design/components
- Board Components: https://github.com/cloudscape-design/board-components
- Examples: https://github.com/aws-samples/cloudscape-examples
- 활용: App Shell, 운영 콘솔 정보 밀도, split panel, table, status indicator, alert, Dashboard 구조
- 가져오지 않을 것: Cloudscape의 시각 스타일 전체를 그대로 복사하는 것

### React Flow

- URL: https://reactflow.dev/
- Examples: https://github.com/xyflow/react-flow-example-apps
- 활용: Architecture Board, custom node, edge, pan/zoom, selection, minimap, viewport
- 기준: 기존 `@xyflow/react` Board 기능을 버리지 않고 새 Shell 안에 다시 연결

### shadcn/ui와 shadcn-admin

- shadcn/ui: https://ui.shadcn.com/
- shadcn-admin: https://github.com/satnaing/shadcn-admin
- 활용: SaaS형 form, modal, sidebar, empty state, command-like start flow
- 기준: 필요한 구조만 참고하고 새 UI framework를 무조건 추가하지 않음

### Tremor

- URL: https://tremor.so/
- Dashboard template: https://github.com/tremorlabs/template-dashboard-oss
- 활용: Cost Risk, Safety score, Deployment status, Resource count, build duration 같은 metric card
- 기준: 숫자에 의미와 기준 시점을 같이 표시

### Brainboard

- URL: https://app.brainboard.co/
- 활용: cloud architecture Board와 Terraform Preview가 한 작업 흐름으로 이어지는 방식

### Figma

- URL: https://www.figma.com/
- 활용: 중앙 canvas, 선택 도구, 오른쪽 properties panel, 고정된 작업 도구 배치

### Miro

- URL: https://miro.com/ko/
- 활용: 큰 Board에서 흐름과 frame을 이해하기 쉽게 보여주는 방식

### Lucidscale

- URL: https://lucid.co/lucidscale
- 활용: 기존 cloud state를 읽어 구조 후보와 관계를 보여주는 Reverse Engineering 방식

### CloudMaker

- URL: https://cloudmaker.ai/
- 활용: validation, warning, blocked state, AI suggestion을 작업 맥락에 붙이는 방식

---

## 6. 현재 코드 연결 지도

UI 작업 전에 아래 연결부를 먼저 확인한다. 파일이 오래돼 보인다는 이유로 삭제하지 않는다.

### 현재 route

| route | 현재 역할 | 재구축 방향 |
| --- | --- | --- |
| `/` | 임시 placeholder | 짧은 Root 진입 화면 |
| `/login` | 로그인 | 새 인증 화면에 실제 form 재연결 |
| `/signup` | 회원가입 | 새 인증 화면에 실제 form 재연결 |
| `/password-reset` | 비밀번호 재설정 | 인증 화면 계열로 통일 |
| `/dashboard` | 임시 placeholder | App Shell과 작업 요약 |
| `/dashboard/projects` | 임시 placeholder | 실제 프로젝트 목록 client 연결 |
| `/dashboard/projects/[projectId]` | 임시 placeholder | 프로젝트 요약과 최근 상태 |
| `/dashboard/costs` | 임시 placeholder | Cost Analysis client 연결 |
| `/dashboard/templates` | 임시 placeholder | 공용 Template Gallery 연결 |
| `/dashboard/settings` | 설정 연결부 | AWS Role, GitHub 연결 화면 재구축 |
| `/workspace/new` | 프로젝트 시작 기능 | 다섯 가지 시작 방식으로 재구축 |
| `/workspace/ai` | AI 시작 기능 | 요구사항, draft preview, 적용 흐름 재구축 |
| `/workspace/reverse` | Reverse 시작 기능 | scan, imported draft, 적용 흐름 재구축 |
| `/workspace` | 실제 Board와 저장 연결 | 핵심 Workspace Shell 재구축 |
| `/integrations/github/callback` | GitHub callback | 연결 결과와 복귀 흐름 유지 |

### 반드시 재사용 여부를 먼저 확인할 파일

- `apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx`
- `apps/web/features/workspace/WorkspaceDraftManager.tsx`
- `apps/web/features/workspace/api.ts`
- `apps/web/features/diagram-editor/DiagramEditor.tsx`
- `apps/web/features/workspace/TerraformCodePanel.tsx`
- `apps/web/features/workspace/TerraformIssuesPanel.tsx`
- `apps/web/features/workspace/DeploymentPanel.tsx`
- `apps/web/features/workspace/WorkspaceAiPanel.tsx`
- `apps/web/features/workspace/ReverseEngineeringPanel.tsx`
- `apps/web/features/resource-settings/template-library.ts`
- `apps/web/app/projects/projects-client.tsx`
- `apps/web/app/costs/costs-client.tsx`
- `apps/web/app/templates/templates-client.tsx`
- `apps/web/app/settings/settings-integrations-client.tsx`
- `apps/web/app/projects/[projectId]/settings/project-github-settings-client.tsx`

위 파일을 그대로 화면에 붙이라는 뜻은 아니다. 안에 들어 있는 API 연결, 상태 처리, 사용자 승인, 저장 동작을 먼저 찾아서 새 component에 재사용하거나 안전하게 분리하라는 뜻이다.

---

## Milestone 0. 현재 구조 분석

### 목표

UI를 바꾸기 전에 현재 route, 기능, shared contract, 저장 흐름을 한 장의 연결 지도로 정리한다.

### 작업 범위

- `apps/web/app`의 모든 route 분류
- `apps/web/features`의 재사용 가능 기능 분류
- placeholder, 실제 기능, 오래된 UI를 구분
- `ArchitectureJson → DiagramJson → TerraformArtifact → Deployment` 흐름 추적
- 인증, AWS Role, GitHub, Cost, Reverse API 연결 위치 확인
- 삭제 후보 UI와 보존 대상 logic 목록 작성
- 새 UI가 필요한 상태 목록 작성

### 참고할 기존 기능 또는 route

- 이 문서의 `현재 코드 연결 지도`
- `apps/web/features/workspace/api.ts`
- `packages/types/src/index.ts`
- `docs/data-models.md`
- `docs/gg/003_기획서.md`

### 적용할 레퍼런스

- Cloudscape의 App Shell과 운영 화면 정보 구조
- 화면 구성 handoff의 왼쪽 navigation, 중앙 Board, 오른쪽 Inspector, 하단 운영 영역

### DESIGN.md에서 지켜야 할 규칙

- 아직 UI를 구현하지 않는다.
- 현재 token과 전역 style 중 재사용할 것과 제거할 것을 구분한다.
- 새 디자인 token을 임의로 추가하지 않는다.

### 완료 조건

- [ ] route별 현재 상태와 목표 상태가 정리됨
- [ ] 보존할 API, type, hook, service 목록이 정리됨
- [ ] 제거 또는 교체할 UI-only component 목록이 정리됨
- [ ] 다섯 가지 프로젝트 시작 방식의 실제 연결 가능 여부를 확인함
- [ ] Direct Deployment와 Git/CI/CD의 실제 API 연결 여부를 확인함
- [ ] 구현되지 않은 기능은 `미구현`으로 표시함

### 검증 방법

- `rg --files apps/web/app apps/web/features`
- `rg`로 각 shared type의 생산자와 소비자 확인
- 현재 route를 직접 열어 placeholder와 실제 기능 구분
- 분석 중 product code 변경이 없는지 `git status --short` 확인

### 커밋 기준

- 구조 분석 문서만 따로 커밋한다.
- 추천 메시지: `docs: map current ui contracts`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- 어떤 UI를 지워도 되는지 근거가 있는가?
- 새 화면이 호출할 실제 API 또는 명확한 미구현 표시가 있는가?
- 저장과 배포 logic을 UI component로 옮기지 않았는가?

---

## Milestone 1. Landing / Root route

### 목표

사용자가 서비스에 들어와 로그인 또는 회원가입을 거쳐 Dashboard로 이동할 수 있는 짧고 명확한 진입 화면을 만든다.

### 작업 범위

- `/` Root 화면 재구축
- 로그인 상태에 따른 Dashboard 이동
- `/login`, `/signup`, password reset 화면의 공통 인증 layout
- 로그인 실패, 입력 오류, loading 상태
- 로그인 뒤 원래 가려던 route로 돌아가는 흐름
- 장시간 읽는 마케팅 Landing이 아닌 실제 작업 입구 구성

### 참고할 기존 기능 또는 route

- `apps/web/app/page.tsx`
- `apps/web/app/login`
- `apps/web/app/signup`
- `apps/web/app/password-reset`
- 기존 auth session과 form logic

### 적용할 레퍼런스

- shadcn/ui form과 error state
- Cloudscape의 간결한 service entry

### DESIGN.md에서 지켜야 할 규칙

- 흰 canvas와 검정 Primary CTA 사용
- Pretendard 사용
- Input 최소 44px, Button 최소 40px
- CTA 모서리 8px
- Hero gradient를 쓰더라도 Root 한 곳에서만 제한적으로 사용
- 첫 화면에서 프로젝트 작업으로 가는 다음 행동이 바로 보여야 함

### 완료 조건

- [ ] 비로그인 사용자가 로그인과 회원가입을 찾을 수 있음
- [ ] 로그인 성공 시 Dashboard로 이동함
- [ ] 로그인 실패 이유가 form 가까이에 표시됨
- [ ] 이미 로그인한 사용자는 불필요한 로그인 화면을 거치지 않음
- [ ] password reset 흐름이 끊기지 않음
- [ ] 임시 `RoutePlaceholder`가 Root와 인증 흐름에 남아 있지 않음

### 검증 방법

- 비로그인 상태에서 `/`, `/login`, `/signup` 확인
- 잘못된 입력과 서버 오류 확인
- 로그인 후 새로고침과 뒤로 가기 확인
- keyboard만으로 form 이동과 제출 확인
- 375px, 768px, 1280px 화면 확인

### 커밋 기준

- Root와 auth shell을 나눠도 된다.
- 추천 메시지: `ui: connect landing surface`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- 실제 인증 API를 쓰고 있는가?
- 로그인하지 않은 사용자가 보호 route에 바로 들어갈 수 없는가?
- Root가 마케팅 section 모음으로 커지지 않았는가?

---

## Milestone 2. Dashboard Shell

### 목표

사용자가 프로젝트, 최근 배포, 비용 위험, 연결 상태를 빠르게 보고 다음 작업으로 이동할 수 있는 운영형 Dashboard를 만든다.

### 작업 범위

- 공통 Dashboard App Shell
- desktop sidebar와 mobile navigation
- 프로젝트 목록과 최근 작업
- 최근 Deployment 상태
- Cost Risk 요약
- AWS Role과 GitHub 연결 상태 바로가기
- 프로젝트 없음, loading, error 상태
- Dashboard의 projects, costs, templates, settings route 연결

### 참고할 기존 기능 또는 route

- `/dashboard`
- `/dashboard/projects`
- `/dashboard/projects/[projectId]`
- `/dashboard/costs`
- `/dashboard/templates`
- `/dashboard/settings`
- `apps/web/app/projects/projects-client.tsx`
- `apps/web/app/costs/costs-client.tsx`
- `apps/web/app/settings/settings-integrations-client.tsx`

### 적용할 레퍼런스

- Cloudscape App Shell, table, status indicator, alert
- shadcn-admin sidebar, empty state
- Tremor metric card

### DESIGN.md에서 지켜야 할 규칙

- 운영 도구답게 조밀하지만 복잡하지 않게 구성
- Dashboard section 전체를 떠 있는 Card로 만들지 않음
- metric card는 꼭 필요한 수치만 표시
- Primary CTA는 `새 프로젝트` 하나를 가장 강하게 표시

### 완료 조건

- [ ] 사용자가 새 프로젝트 시작 버튼을 바로 찾을 수 있음
- [ ] 프로젝트 목록이 실제 API 결과를 표시함
- [ ] 프로젝트를 열면 해당 프로젝트 상세 또는 Workspace로 이동함
- [ ] 최근 Deployment 상태가 성공, 실패, 진행 중으로 구분됨
- [ ] Cost Risk와 AWS/GitHub 연결 상태가 실제 데이터 또는 명확한 empty state를 표시함
- [ ] 좁은 화면에서 sidebar가 본문을 가리지 않음

### 검증 방법

- 프로젝트 0개, 1개, 여러 개 상태 확인
- 긴 프로젝트 이름과 실패 메시지 확인
- sidebar keyboard focus와 mobile open/close 확인
- Dashboard에서 새 프로젝트, 설정, 비용 화면 이동 확인
- 실제 API 실패 시 error state 확인

### 커밋 기준

- App Shell과 각 route 연결을 화면 단위로 나눠 커밋할 수 있다.
- 추천 메시지: `ui: rebuild dashboard shell`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- 연결되지 않은 metric을 가짜 숫자로 채우지 않았는가?
- 기존 Projects, Costs, Settings client의 기능을 빠뜨리지 않았는가?
- Dashboard에서 `/workspace/new`로 자연스럽게 이동하는가?

---

## Milestone 3. 새 프로젝트 시작 화면

### 목표

사용자가 프로젝트 이름을 정하고, 자신에게 맞는 다섯 가지 시작 방식 중 하나를 쉽게 고르게 한다.

### 작업 범위

- `/workspace/new` 재구축
- 프로젝트 이름 입력
- 빈 보드 시작
- AI 시작
- Reverse Engineering 시작
- Template 시작
- GitHub Repo 시작
- 각 방식의 필요 조건과 다음 화면 안내
- 시작 방식별 loading, error, 취소, 복귀 처리

### 시작 방식별 동작

| 방식 | 눌렀을 때 일어나는 일 |
| --- | --- |
| 빈 보드 | 프로젝트 생성 후 빈 Board로 이동 |
| AI | 프로젝트 이름과 입력 초안을 보존하고 `/workspace/ai`로 이동 |
| Reverse Engineering | 검증된 AWS Role을 확인하고 `/workspace/reverse`로 이동 |
| Template | 같은 화면에서 공용 Template Gallery를 열고 선택 후 프로젝트 생성 |
| GitHub Repo | GitHub 연결을 시작하고 callback 뒤 Repository Analysis와 Template Selection으로 복귀 |

### 참고할 기존 기능 또는 route

- `apps/web/app/workspace/new/workspace-start-client.tsx`
- `apps/web/app/workspace/new/workspace-start-options.ts`
- `createProject`
- `listAwsConnections`
- GitHub install/callback API
- Source Repository와 Repository Analysis 연결부
- `apps/web/features/resource-settings/template-library.ts`

### 적용할 레퍼런스

- shadcn/ui의 선택형 form과 modal
- command-like flow
- Cloudscape의 prerequisite alert

### DESIGN.md에서 지켜야 할 규칙

- 다섯 선택지를 과장된 marketing Card로 만들지 않음
- 각 선택지는 제목, 한 줄 설명, 필요한 조건만 표시
- 검정 Primary CTA는 현재 선택을 진행하는 동작에만 사용
- `빈 보드`는 가장 작은 보조 동작으로 보여줄 수 있으나 접근 가능해야 함

### 완료 조건

- [ ] 다섯 시작 방식이 모두 보임
- [ ] 프로젝트 이름이 없으면 시작할 수 없고 이유가 표시됨
- [ ] 시작 방식마다 올바른 route 또는 callback으로 이동함
- [ ] Reverse는 AWS Role이 없을 때 환경설정으로 안내함
- [ ] Template과 GitHub Repo가 AI나 빈 보드로 위장되지 않음
- [ ] GitHub Repo가 `Repository Analysis → Template Selection → AI Architecture Recommendation` 순서를 지킴
- [ ] 중복 클릭으로 프로젝트가 여러 개 만들어지지 않음
- [ ] 뒤로 왔을 때 입력한 프로젝트 이름을 가능한 범위에서 복원함

### 검증 방법

- 다섯 버튼을 각각 처음부터 끝까지 실행
- AWS Role 있음/없음 상태 확인
- GitHub 연결 성공/취소/실패 callback 확인
- 느린 네트워크에서 중복 제출 확인
- mobile에서 선택지와 설명이 잘리지 않는지 확인

### 커밋 기준

- 공통 start shell과 외부 연결 흐름을 나눠 커밋할 수 있다.
- 추천 메시지: `ui: rebuild project start flow`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- 각 시작 방식이 최종적으로 어떤 `DiagramJson`을 만들지 설명할 수 있는가?
- 사용자가 확인하지 않은 draft가 프로젝트 상태를 바꾸지 않는가?
- Template과 GitHub Repo를 위한 새 API를 근거 없이 만들지 않았는가?

---

## Milestone 4. Workspace / Architecture Board Shell

### 목표

SketchCatch의 핵심 작업 공간을 새 App Shell 안에 다시 연결하고, Architecture Board를 화면의 중심으로 만든다.

### 작업 범위

- `/workspace` 새 layout
- 상단 project bar와 저장 상태
- 왼쪽 Resource palette
- 중앙 React Flow Board
- 오른쪽 Inspector 자리
- 하단 또는 접이식 운영 console 자리
- Board pan, zoom, selection, drag, connection
- Resource container와 관계 표시
- 프로젝트 draft load/save/autosave
- loading, empty, save conflict, error 상태

### 참고할 기존 기능 또는 route

- `ProjectWorkspaceDraftManager`
- `WorkspaceDraftManager`
- `DiagramEditor`
- `DefaultDiagramPalette`
- `ParameterInputPanel`
- project draft repository와 sync helper
- `DiagramJson`

### 적용할 레퍼런스

- React Flow의 node, edge, viewport, minimap
- Brainboard의 Architecture와 Terraform 연결
- Figma의 canvas와 properties panel
- Miro의 큰 Board 탐색
- Cloudscape split panel

### DESIGN.md에서 지켜야 할 규칙

- Board는 full workspace 영역으로 보여주고 Card 안에 가두지 않음
- toolbar와 control 크기를 고정해 상태가 바뀌어도 흔들리지 않게 함
- 흰 canvas와 얇은 경계 사용
- Resource label과 ID가 겹치지 않게 함
- 왼쪽과 오른쪽 panel은 작은 화면에서 접을 수 있어야 함

### 완료 조건

- [ ] 기존 프로젝트의 `DiagramJson`이 Board에 정상 표시됨
- [ ] Resource 추가, 이동, 연결, 삭제가 동작함
- [ ] 선택한 Resource가 Inspector 대상과 일치함
- [ ] autosave와 수동 save 상태가 명확함
- [ ] 새로고침 후 저장한 Board가 복원됨
- [ ] Terraform 생성에 넘기는 `DiagramJson`이 기존 계약을 유지함
- [ ] VPC, Subnet 같은 container와 자식 Resource가 보임
- [ ] pan/zoom과 Resource drag가 서로 충돌하지 않음

### 검증 방법

- 빈 Board, 작은 Board, 큰 Board fixture 확인
- node 1개와 node 여러 개 이동/연결/삭제 확인
- 저장 중 이탈과 새로고침 확인
- keyboard selection과 focus 확인
- desktop/mobile/tablet screenshot 비교
- canvas가 실제 pixel을 렌더링하는지 확인

### 커밋 기준

- Shell, Board 연결, 저장 연결을 분리해서 커밋한다.
- 추천 메시지: `ui: wire workspace board shell`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- 새 UI가 기존 `DiagramJson` 필드를 버리지 않았는가?
- Board가 API를 직접 우회해 저장하지 않는가?
- 화면이 좁아져도 Board control과 panel이 겹치지 않는가?

---

## Milestone 5. AI 시작 화면

### 목표

사용자가 요구사항을 입력하고 AI Architecture Draft를 이해한 뒤, 원하는 결과만 Board에 적용하게 한다.

### 작업 범위

- `/workspace/ai` 재구축
- 텍스트 요구사항 입력
- 용도, 예산, 트래픽, 보안 우선순위 입력
- 음성 입력과 전사 결과 확인 자리
- Amazon Transcribe 전사와 사용자 수정/확정
- GitHub Repo에서 고른 Template과 Repository evidence 출처 표시
- Architecture Draft preview
- 가정, 설명, trade-off, guardrail warning
- Bedrock AI Layer와 Amazon Q Assistance의 추천/설명 경계
- fallback 또는 LLM 사용 상태
- Draft 수정 요청
- `Board에 적용`과 취소

### 참고할 기존 기능 또는 route

- `WorkspaceAiStartClient`
- `WorkspaceAiPanel`
- `WorkspaceAiChatDock`
- `createAiArchitectureDraft`
- `createAiArchitecturePatchPreview`
- AI draft adapter와 guardrail helper
- `RequirementInput`
- `AiArchitectureDraftResult`
- Repository Analysis와 Template Selection 결과 계약

### 적용할 레퍼런스

- CloudMaker의 AI suggestion과 validation
- Figma의 preview와 apply 흐름
- shadcn/ui form, tabs, disclosure

### DESIGN.md에서 지켜야 할 규칙

- 채팅 UI만 크게 만들고 결과를 숨기지 않음
- 입력과 결과 preview가 같은 화면에서 구분되어야 함
- 긴 AI 설명은 접을 수 있게 하고 핵심 변경은 먼저 표시
- 적용 버튼은 검정 Primary CTA
- warning은 severity와 이유를 함께 표시

### 완료 조건

- [ ] 텍스트 입력으로 실제 draft API를 호출함
- [ ] 음성은 전사 문장을 사용자가 확인하기 전 draft를 만들지 않음
- [ ] Repository Analysis가 직접 draft를 만들지 않고 Template Selection을 거침
- [ ] Bedrock과 Amazon Q가 Board 또는 Deployment를 자동 변경하지 않음
- [ ] draft Resource와 관계를 preview로 확인할 수 있음
- [ ] 가정, 설명, warning, fallback 이유가 표시됨
- [ ] 사용자가 적용하기 전 프로젝트 Board가 바뀌지 않음
- [ ] 적용 후 같은 Resource identity로 Board가 열림
- [ ] AI 실패 시 다시 시도하거나 deterministic fallback을 이해할 수 있음

### 검증 방법

- 대표 요구사항, 모호한 문장, 지원 밖 요구사항 확인
- LLM 사용 가능/불가능 상태 확인
- draft 생성 중 취소와 재시도 확인
- 적용 전후 `DiagramJson` 비교
- keyboard로 입력부터 적용까지 진행

### 커밋 기준

- 입력, preview, 적용 연결을 화면 단위로 나눌 수 있다.
- 추천 메시지: `ui: rebuild ai architecture start`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- Architecture Draft를 확정된 Practice Architecture처럼 표현하지 않았는가?
- fallback을 실제 LLM 결과로 오해하게 만들지 않았는가?
- 사용자가 무엇이 Board에 들어갈지 알 수 있는가?

---

## Milestone 6. Reverse Engineering 화면

### 목표

사용자가 검증된 AWS Role로 기존 cloud state를 읽고, 복원된 구조를 확인한 뒤 새 프로젝트 Board에 적용하게 한다.

### 작업 범위

- `/workspace/reverse` 재구축
- 검증된 AWS Role 선택과 연결 상태
- 기본 전체 scan과 고급 filter
- scan 진행률과 취소
- Resource Explorer 사용 가능 여부
- 읽은 Resource, 못 읽은 service, 권한 부족 표시
- 서비스 구조 grouping 결과
- imported draft preview
- Resource parameter와 관계 확인
- 부분 실패, import suggestion, scan history를 접이식 상세로 제공
- 프로젝트 만들기와 취소

### 참고할 기존 기능 또는 route

- `ReverseWorkspaceClient`
- `ReverseEngineeringPanel`
- Reverse scan criteria, history, result, findings, parameter, import suggestion panel
- Reverse Engineering hooks와 helper
- `createReverseEngineeringPreviewScan`
- `createReverseEngineeringScan`
- `ReverseEngineeringScan`

### 적용할 레퍼런스

- Lucidscale의 existing cloud visualization
- React Flow의 graph preview
- Cloudscape progress, alert, expandable section
- CloudMaker의 warning과 partial result

### DESIGN.md에서 지켜야 할 규칙

- scan action은 하나의 명확한 Primary CTA로 시작
- 고급 filter는 기본 화면에서 접어 둠
- 결과 preview를 중앙에 크게 표시
- 부분 실패와 import suggestion은 필요할 때 펼쳐 봄
- UNKNOWN Resource도 사라지지 않고 구분되어 보임

### 완료 조건

- [ ] 검증된 AWS Role이 없으면 설정 이동 안내가 보임
- [ ] scan 시작, 진행, 완료, 실패, 취소 상태가 구분됨
- [ ] 발견한 Resource와 못 읽은 범위가 모두 표시됨
- [ ] 구조가 확실하면 하나의 추천 draft를 먼저 보여줌
- [ ] grouping이 애매할 때만 후보를 보여주고 차이를 설명함
- [ ] 사용자가 선택하기 전 프로젝트 Board가 만들어지지 않음
- [ ] 적용한 imported draft가 Workspace에서 열림
- [ ] import suggestion이 자동으로 Terraform state를 바꾸지 않음
- [ ] AWS 전용 scan 구현이 공통 `InfrastructureGraph` 계약을 AWS-only로 바꾸지 않음

### 검증 방법

- AWS Role 있음/없음/만료/권한 부족 상태 확인
- Resource 0개, 1개 서비스, 여러 서비스 상태 확인
- 부분 실패와 UNKNOWN Resource 확인
- scan 취소와 재시도 확인
- imported draft 적용 전후 비교
- 실제 AWS 호출이 어려운 환경에서는 fixture임을 명확히 표시하고 별도 실제 E2E 수행

### 커밋 기준

- scan form, result preview, apply flow를 분리할 수 있다.
- 추천 메시지: `ui: rebuild reverse engineering flow`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- Resource 목록을 Architecture라고 부르고 있지 않은가?
- 관계와 grouping의 불확실성을 숨기지 않았는가?
- AWS credential 원문이 UI, log, storage에 남지 않는가?

---

## Milestone 7. Workspace Right Panel / Deploy Console

### 목표

Board에서 선택한 Resource를 수정하고, Terraform, Safety, Cost, Plan, Apply, Git/CI/CD, History, Cleanup을 한 작업 흐름으로 연결한다.

### 작업 범위

- Resource Inspector
- Resource parameter validation
- Terraform Preview와 code diagnostics
- Terraform에서 Board로 돌아오는 변경 제안
- Safety / Cost Check
- finding과 Architecture Suggestion
- High Risk blocked state
- Medium/Low acknowledgement
- Direct Deployment 단계 화면
- Git/CI/CD handoff 화면
- Deployment log, output, Resource, history
- destroy plan과 Cleanup 승인
- Runtime Cache 상태와 RDS/S3 최종 기록의 구분

### 화면 단계

```text
Board 저장
→ Terraform Preview
→ Safety / Cost Check
→ 배포 경로 선택
   ├─ Direct: Init → Plan → 승인 → Apply → History → Cleanup
   └─ Git/CI/CD: Repository → PR → Pipeline → History
```

### 참고할 기존 기능 또는 route

- `WorkspaceRightPanel`
- `ResourceWorkspacePanel`
- `TerraformCodePanel`
- `TerraformIssuesPanel`
- `DeploymentPanel`
- `ParameterInputPanel`
- pre-deployment diagnostics와 finding helper
- deployment action helper
- `apps/web/features/workspace/api.ts`의 Terraform, Check, Deployment, Git handoff API

### 적용할 레퍼런스

- Figma의 properties panel
- Brainboard의 Terraform 연결
- Cloudscape split panel, status, log table, alert
- CloudMaker의 Safety validation
- Tremor의 Cost Risk와 Deployment metric

### DESIGN.md에서 지켜야 할 규칙

- 오른쪽 panel 안에 Card를 계속 중첩하지 않음
- 단계와 상태를 text, icon, border로 명확히 구분
- IaC Preview의 Terraform source는 어두운 code block 사용
- 위험한 Apply와 Cleanup은 일반 저장 버튼과 시각적으로 구분
- 비용과 보안 경고가 Apply CTA보다 먼저 보임

### 완료 조건

- [ ] 선택한 Resource parameter를 보고 수정할 수 있음
- [ ] validation error가 해당 field와 Board node에 연결됨
- [ ] Terraform Preview와 diagnostics가 실제 API 결과를 표시함
- [ ] 해석 불가능한 Terraform은 Board를 자동 변경하지 않음
- [ ] High Risk가 있으면 Apply가 차단됨
- [ ] Medium/Low finding은 명시 승인 기록 후 진행 가능함
- [ ] Plan summary에 create/update/delete/replace 수가 보임
- [ ] 승인 시 account, region, artifact hash, plan 기준을 확인함
- [ ] 승인한 Plan만 Apply됨
- [ ] Git/CI/CD에서는 PR URL과 pipeline status가 보임
- [ ] Deployment History에서 log, output, Resource, cleanup 상태를 확인함
- [ ] destroy도 plan과 별도 승인을 거침
- [ ] Redis Runtime Cache가 사용자 Board Resource처럼 표시되지 않음
- [ ] Cost Analysis가 Architecture, IaC Preview, Plan, History 단계에서 연결됨

### 검증 방법

- 정상 Terraform과 diagnostic이 있는 Terraform 확인
- High, Medium, Low finding 각각 확인
- Direct Deployment happy path와 실패 path 확인
- 승인 후 artifact가 바뀐 경우 Apply 차단 확인
- GitHub 연결 성공/실패, pipeline 진행/실패 확인
- log streaming 재연결과 긴 log 확인
- destroy plan, 취소, 승인, cleanup 확인
- secret과 sensitive output masking 확인

### 커밋 기준

- 이 마일스톤은 반드시 작은 화면 단위로 나눈다.
- 권장 분리: Inspector / Terraform / Safety-Cost / Direct Deploy / Git-CI-CD / History-Cleanup
- 추천 메시지: `ui: polish deployment panel`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- 프론트엔드가 Terraform 또는 AWS 작업을 직접 실행하지 않는가?
- 승인 전에 변경 가능한 값과 승인 후 고정되는 값이 구분되는가?
- 사용자가 현재 어느 단계에 있는지 한눈에 알 수 있는가?

---

## Milestone 8. Template Gallery / Template Start

### 목표

사용자가 검증된 기본 Architecture를 찾아 미리보고, 새 프로젝트 또는 현재 Board의 시작점으로 사용할 수 있게 한다.

### 작업 범위

- `/dashboard/templates` 공용 Template Gallery
- `/workspace/new` 안의 Template 선택 modal 또는 panel
- 검색, filter, 정렬, tag
- Template 상세 미리보기
- 포함 Resource와 관계 요약
- Repository evidence를 이용한 Template Selection
- Template으로 새 프로젝트 시작
- 현재 Board에서 Template 적용
- 덮어쓰기 직전 기존 Board backup
- 적용 후 Workspace 이동

### 참고할 기존 기능 또는 route

- `apps/web/app/templates/templates-client.tsx`
- `apps/web/features/resource-settings/template-library.ts`
- `listBoardTemplates`
- `applyTemplateToDiagramWithBackup`
- `/dashboard/templates`
- `/workspace/new`

### 적용할 레퍼런스

- shadcn/ui Gallery, filter, dialog
- Brainboard Architecture preview
- Cloudscape collection과 empty state

### DESIGN.md에서 지켜야 할 규칙

- Template를 마케팅 상품 Card처럼 과장하지 않음
- 실제 Architecture가 보이는 preview를 우선 표시
- tag는 색 장식보다 검색과 구분에 집중
- 선택한 Template의 Primary CTA만 검정으로 표시

### 완료 조건

- [ ] Dashboard와 새 프로젝트 화면이 같은 Template source를 사용함
- [ ] 직접 고르는 Template과 Repository Analysis가 고른 Template이 같은 계약을 사용함
- [ ] 검색, filter, 정렬, tag가 동작함
- [ ] Template의 Resource와 관계를 적용 전에 볼 수 있음
- [ ] `이 Template으로 시작` 동작이 사용자 수락 지점이 됨
- [ ] 현재 Board에 적용할 때 자동 backup이 남음
- [ ] 적용 뒤 `DiagramJson`이 정상 저장되고 Terraform Preview가 생성 가능함
- [ ] Template Marketplace나 공유 기능을 구현한 것처럼 보이지 않음

### 검증 방법

- Template 0개, 1개, 여러 개 상태 확인
- 검색 결과 없음과 filter 조합 확인
- 새 프로젝트 시작과 기존 Board 적용을 각각 확인
- backup 생성과 복원 가능 데이터 확인
- 적용한 Template의 container, node, edge 확인

### 커밋 기준

- Gallery, start integration, Board apply를 나눠 커밋할 수 있다.
- 추천 메시지: `ui: connect template gallery`

### 다음 마일스톤으로 넘어가기 전 확인할 것

- Template 데이터가 화면마다 복사되어 있지 않은가?
- Template 적용이 사용자 모르게 기존 Board를 덮어쓰지 않는가?
- Marketplace, 공유, 결제 같은 문서 밖 기능을 추가하지 않았는가?

---

## Milestone 9. E2E Visual QA

### 목표

새 UI가 보기만 좋은 것이 아니라 실제 제품 흐름을 끝까지 수행하고, 다양한 화면 크기와 상태에서도 깨지지 않는지 확인한다.

### 작업 범위

- Representative Use Journey E2E
- 다섯 가지 프로젝트 시작 방식 E2E
- 실제 API 연결 확인
- loading, empty, error, warning, blocked, success 상태 확인
- desktop, tablet, mobile 시각 검수
- keyboard와 focus 검수
- Board canvas와 panel 겹침 검수
- console error와 network failure 검수
- 문서와 구현 결과 재대조

### 반드시 통과할 대표 흐름

```text
로그인
→ 새 프로젝트
→ AI 요구사항 입력
→ Draft 확인 및 적용
→ Board 수정 및 저장
→ Terraform Preview
→ Safety / Cost Check
→ High Risk 수정 또는 Medium/Low 승인
→ Plan
→ 승인
→ Apply 또는 Git/CI/CD handoff
→ History 확인
→ Cleanup plan과 승인
```

추가로 아래 흐름을 각각 확인한다.

- 빈 보드 → Resource 추가 → 저장 → Terraform Preview
- Reverse Engineering → scan → imported draft 확인 → Board 적용
- Template → 미리보기 → 프로젝트 생성 → Board 적용
- GitHub Repo → Repository Analysis → Template Selection → AI Architecture Recommendation → draft → Board 적용
- Deployment 실패 → 오류 설명 → 재시도

### 참고할 기존 기능 또는 route

- 모든 새 route
- `apps/web/AGENTS.md`의 verification 명령
- 각 feature의 기존 test
- `docs/gg/003_기획서.md`의 Representative Use Journey와 검증 전략

### 적용할 레퍼런스

- Cloudscape의 상태 명확성
- Figma와 React Flow의 canvas 조작성
- Lucidscale의 Reverse 결과 가독성
- CloudMaker의 blocked/warning 표현
- Tremor의 metric 가독성

### DESIGN.md에서 지켜야 할 규칙

- 375px, 768px, 1280px 이상에서 text와 control이 겹치지 않음
- Hero 크기 글자가 운영 panel에 들어가지 않음
- Card 중첩과 과한 장식을 제거
- 색상만으로 상태를 구분하지 않음
- 긴 ID, IaC Preview source, log가 layout을 밀어내지 않음

### 완료 조건

- [ ] 대표 흐름이 실제 API로 끝까지 이어짐
- [ ] 다섯 가지 시작 방식의 성공과 실패 상태를 확인함
- [ ] Board가 비어 있거나 깨져 보이지 않음
- [ ] node, edge, container가 viewport 밖으로 잘리지 않음
- [ ] cost, safety, deploy 상태가 서로 모순되지 않음
- [ ] High Risk 상태에서 Apply가 실제로 막힘
- [ ] 승인한 Plan과 Apply 대상이 일치함
- [ ] secret이나 sensitive output이 화면과 log에 노출되지 않음
- [ ] browser console에 새 오류가 없음
- [ ] lint, typecheck, build가 통과함
- [ ] 문서 요구사항을 다시 읽고 빠진 항목을 수정함

### 검증 방법

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web build
```

- 관련 test 실행
- Chrome 또는 in-app browser에서 실제 클릭 E2E
- desktop, tablet, mobile screenshot 저장
- React Flow canvas pixel이 실제로 그려졌는지 확인
- network를 느리게 하거나 API를 실패시켜 error state 확인
- 한 번의 QA로 끝내지 않고 `검증 → 수정 → 재검증` 반복

### 커밋 기준

- 기능 수정과 시각 polish를 섞지 않고 가능한 한 분리한다.
- 추천 메시지: `ui: complete e2e visual qa`

### 다음 마일스톤으로 넘어가기 전 확인할 것

이 마일스톤이 마지막이다. 다음 작업으로 넘기기 전에 아래를 모두 남긴다.

- 최종 route 목록
- 재사용한 기존 기능 목록
- 아직 미구현인 기능 목록
- 실제 E2E 결과
- viewport별 screenshot
- lint, typecheck, build 결과
- 알려진 제한과 후속 작업

---

## 7. 커밋 정책

- 마일스톤 하나가 끝날 때마다 커밋한다.
- 큰 마일스톤은 route 또는 화면 단위로 쪼개서 커밋한다.
- 한 커밋에는 한 가지 설명 가능한 변화만 넣는다.
- 사용자 또는 다른 작업자가 만든 변경을 함께 넣지 않는다.
- 커밋 전 가능한 범위에서 lint, typecheck, build를 실행한다.
- 검증하지 못한 항목은 커밋 본문에 솔직하게 적는다.
- 첫 줄은 짧게 쓰고, 빈 줄 아래에 무엇을 왜 바꿨는지 쉬운 한국어로 설명한다.

권장 메시지:

```text
ui: connect landing surface
ui: rebuild dashboard shell
ui: wire workspace board shell
ui: polish deployment panel
docs: add ui rebuild milestones
```

큰 마일스톤을 나누는 예시:

```text
ui: connect resource inspector
ui: connect terraform preview
ui: show safety and cost gates
ui: connect direct deployment flow
ui: connect git cicd handoff
ui: connect deployment history cleanup
```

---

## 8. 구현 작업자 지침

이 문서는 구현 작업자가 반드시 먼저 읽어야 한다.

1. `Milestone 0`부터 순서대로 진행한다.
2. 현재 마일스톤의 완료 조건과 검증을 통과하기 전 다음으로 넘어가지 않는다.
3. 문서에 없는 화면이나 기능을 임의로 추가하지 않는다.
4. 기존 API, type, hook, service를 먼저 찾고 재사용 가능성을 확인한다.
5. 기능을 찾지 못했다고 새 mock API를 먼저 만들지 않는다.
6. 제품 문서와 코드가 충돌하면 충돌 내용을 보고한다.
7. 충돌하지 않는 부분만 안전하게 처리할 수 있다면 partial 처리하고, 남은 항목을 분명히 적는다.
8. AI, Reverse Engineering, Template, GitHub Repo 결과는 사용자의 명확한 수락 전에 Board를 바꾸지 않는다.
9. Direct Deployment와 Git/CI/CD는 서로 다른 경로로 유지한다.
10. 프론트엔드는 AWS SDK, Terraform CLI, 실제 apply/destroy를 직접 실행하지 않는다.
11. UI 작업 뒤에는 실제 클릭 E2E와 시각 검수를 함께 한다.
12. 마지막에는 이 문서를 다시 읽고 `반영됨 / 부분 반영 / 미반영`으로 자체 점검한다.

구현 중 판단이 애매하면 예쁘게 보이는 쪽보다 아래 순서를 우선한다.

```text
사용자 안전
→ 데이터 계약
→ 실제 기능 연결
→ 이해하기 쉬운 흐름
→ 시각 polish
```

이 순서는 디자인을 대충 하라는 뜻이 아니다. 기능과 안전이 맞는 상태에서 `DESIGN.md` 기준으로 끝까지 다듬으라는 뜻이다.
