# SketchCatch UI 재구축 마일스톤

## 0. 이 문서의 한 줄 목적

기존 기능 로직은 살리고, 화면은 `DESIGN.md` 기준으로 처음부터 다시 만드는 실행 순서다.

이 문서는 구현자가 그대로 따라가는 작업 기준이다. 레퍼런스 이름만 적지 않고, 실제로 읽은 코드 위치와 확인한 수치를 각 화면에 붙였다.

## 1. 가장 중요한 원칙

### 살려야 하는 것

- API 호출 함수와 인증 처리
- shared type과 Zod schema
- `ArchitectureJson`, `DiagramJson`, Architecture Board 저장과 불러오기
- Terraform Preview, 검증, 동기화 제안
- Safety / Cost Check
- Plan, Apply, Deployment History, Cleanup
- Reverse Engineering, Template, GitHub Repository 연결 로직

### 새로 만드는 것

- route 안의 화면 구조
- App Shell, navigation, panel, modal, table, card
- loading, empty, error, warning, blocked, success 화면
- 모바일과 작은 노트북 화면

### 하면 안 되는 것

- 기존 UI를 조금 고쳐서 재사용하지 않는다.
- 화면 때문에 API 응답이나 `ArchitectureJson`을 임의로 바꾸지 않는다.
- 레퍼런스의 색과 모양을 그대로 복사하지 않는다.
- 공개 편집기에 들어가지 못한 제품의 수치를 추측하지 않는다.
- 설명용 card를 계속 쌓지 않는다. 사용자가 지금 해야 할 행동을 먼저 보여준다.

## 2. 최종 제품 흐름

```text
로그인 / 회원가입
→ Dashboard
→ 새 프로젝트 시작
→ 빈 Board / AI / Reverse Engineering / Template / GitHub Repository
→ Architecture Board
→ Terraform Preview
→ Safety / Cost Check
→ Direct Deployment 또는 Git/CI/CD
→ Deployment History / Cleanup
```

## 3. `DESIGN.md`가 최종 기준이다

레퍼런스는 화면 구조를 배우는 자료다. 최종 시각 언어는 항상 `DESIGN.md`를 따른다.

- 기본 글꼴: Pretendard
- 화면 바깥 배경: 흰색 또는 `#fafafa`
- 24px 격자: Architecture Board 안에서만 사용
- primary CTA: 검정, 높이 40px, radius 8px
- input: 높이 44px, radius 8px
- 일반 card: radius 12px, 1px hairline border
- 가장 바깥 제품 frame: radius 16px
- dark surface: Terraform code, log, Check 결과처럼 집중이 필요한 곳만 사용
- blue: 본문 안의 link에만 사용하고 CTA에는 사용하지 않음
- 상단 navigation: 64px
- 일반 본문: 16px, 기술 정보: 13px
- CTA를 pill 모양으로 만들지 않음

## 4. 조사한 레퍼런스와 고정 버전

clone 위치는 모두 `gg/tmp/sketchcatch-ui-references` 아래다.

| 저장소 | commit | 주로 볼 것 |
| --- | --- | --- |
| `components` | `3f01803dd43a9bc50956b6ebcd760b686c18aa38` | App Shell, Split Panel, table, status |
| `board-components` | `8d95412aa7f260240620867525d08d7c4d343599` | Board 배치, 겹침 방지, loading/empty |
| `cloudscape-examples` | `35055cf8fb197302784028998a9d8c3c55acea78` | Dashboard, table, metric, error |
| `react-flow-example-apps` | `9593bb53d85da4b8e4a6c62d07dc01866ee964b1` | node, edge, minimap, pan/zoom |
| `shadcn-admin` | `e16c87f213a5ba5e45964e9b67c792105ec74d26` | SaaS sidebar, form, drawer, empty state |
| `template-dashboard-oss` | `a20f619680e4582122c331bacf2efdef6daf460f` | metric, 비용/위험 상태, 반응형 Dashboard |

공개 제품 화면 조사 자료는 `gg/tmp/sketchcatch-ui-references/browser-analysis/README.md`에 있다. 화면은 같은 폴더의 `screenshots`에 있다.

Brainboard와 Miro의 실제 앱, Figma의 실제 편집기, Lucidscale와 CloudMaker의 실제 제품 화면은 로그인 또는 로딩 제한 때문에 DOM 수치를 확인하지 못했다. 이 제품들은 역할과 정보 우선순위만 참고한다.

## 5. 공통 화면 계약

### App Shell

Cloudscape의 아래 파일을 기준으로 구조를 본다.

- `components/src/app-layout/index.tsx`
- `components/src/app-layout/defaults.ts`
- `components/src/app-layout/constants.scss`
- `components/src/app-layout/styles.scss`

확인한 값:

- 기본 navigation 폭: 280px
- 기본 tools 폭: 290px
- 닫힌 navigation 폭: 40px
- 일반 content 최소 폭: 280px
- form content 최대 폭: 800px
- wizard content 최대 폭: 1080px

SketchCatch 적용:

- Dashboard는 256~280px sidebar를 사용한다.
- Workspace는 Board 넓이가 우선이므로 sidebar를 항상 두지 않는다.
- 오른쪽 inspector는 desktop에서 320px로 시작하고 280px 아래로 줄이지 않는다.
- 1120px 아래에서는 오른쪽 inspector를 overlay drawer 또는 bottom panel로 바꾼다.
- 688px 아래에서는 navigation과 inspector를 동시에 열지 않는다.

### Split Panel

아래 파일을 기준으로 본다.

- `components/src/split-panel/interfaces.ts`
- `components/src/split-panel/styles.scss`
- `components/src/split-panel/utils/size-utils.ts`
- `board-components/pages/with-app-layout/app-layout.tsx`

확인한 값:

- bottom panel 최소 높이: 160px
- side panel 최소 폭: 280px
- main content 최소 폭: 250px
- 기본 side panel 폭: viewport의 약 1/3
- 기본 bottom panel 높이: viewport의 약 1/2
- panel은 `collapse`와 `hide`를 구분한다.

SketchCatch 적용:

- Terraform, Check, Deployment log는 bottom panel로 열 수 있다.
- Resource inspector는 side panel이 기본이다.
- 사용자가 닫은 panel을 route 이동 때 강제로 다시 열지 않는다.
- panel을 열어도 Board가 640px보다 좁아지면 bottom panel로 전환한다.

### 상태 표현

`components/src/status-indicator/interfaces.ts`의 상태를 공통 어휘로 쓴다.

```text
not-started / pending / in-progress / loading
success / warning / error / stopped / info
```

모든 비동기 화면은 아래 상태를 빠짐없이 가진다.

- 처음 상태: 아직 실행하지 않음
- loading: 기존 화면을 지우지 않고 진행 상태 표시
- empty: 데이터가 없다는 뜻과 다음 행동 표시
- partial: 일부만 성공했다는 범위 표시
- warning: 계속할 수 있지만 확인이 필요함
- blocked: 다음 단계로 갈 수 없음
- error: 실패 이유와 다시 시도 표시
- success: 완료 결과와 다음 행동 표시

## Milestone 0. 현재 구조와 계약 고정

### 목표

새 UI가 기존 기능을 끊지 않도록 route, API, type, 저장 흐름을 먼저 지도처럼 정리한다.

### 작업 범위

- `apps/web/app`의 route 목록 기록
- `apps/web/features`에서 UI와 기능 로직 분리
- `packages/types`의 `ArchitectureJson`, Terraform, Deployment type 확인
- API endpoint와 인증 요구 여부 기록
- 삭제 대상 UI와 보존 대상 기능 로직 구분

### 참고할 기존 기능 또는 route

- `apps/web/app/dashboard`
- `apps/web/app/workspace`
- `apps/web/features/diagram-editor`
- `apps/web/features/workspace/api.ts`
- `apps/web/features/workspace/project-draft-repository.ts`
- `packages/types/src/index.ts`

### 적용할 레퍼런스

`components/src/app-layout/index.tsx`처럼 화면 frame과 content를 분리하는 방식을 본다. Cloudscape component를 설치하라는 뜻이 아니라, route가 기능 로직을 소유하지 않게 만드는 구조만 참고한다.

### DESIGN.md에서 지켜야 할 규칙

이 단계에서는 새 색이나 component 모양을 정하지 않는다. `DESIGN.md`의 token과 공통 화면 계약만 구현 기준으로 고정한다.

### 완료 조건

- 각 route가 어떤 API와 type을 쓰는지 알 수 있다.
- UI를 지워도 남아야 하는 파일 목록이 있다.
- `ArchitectureJson` 저장, Terraform 생성, Deployment 실행의 연결이 끊기지 않는다.

### 검증 방법

- route 목록과 실제 파일이 맞는지 확인
- type import 경로 확인
- 기존 API test를 실행해 UI 교체와 관계없는 기능이 유지되는지 확인

### 커밋 기준

`Docs: UI 재구축 계약 정리`

### 다음 마일스톤으로 넘어가기 전 확인할 것

화면 파일과 기능 파일을 이름만 보고 판단하지 말고 import graph를 확인한다.

## Milestone 1. Landing / Auth

### 목표

Landing에서 제품을 한 문장으로 보여주고, 로그인과 회원가입으로 바로 이동하게 한다.

### 작업 범위

- `/`
- `/login`
- `/signup`
- 비밀번호 재설정 화면
- 로그인 후 원래 가려던 route 복귀

### 참고할 기존 기능 또는 route

- `apps/web/app/page.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/signup/page.tsx`
- `apps/web/features/auth`

### 적용할 레퍼런스

- Figma 공개 화면: 78px header와 흰 배경, 검정 CTA를 확인했지만 SketchCatch header는 `DESIGN.md`의 64px를 사용한다.
- `shadcn-admin/src/features/errors/general-error.tsx`: 전체 화면 error에서 복귀 행동을 분명히 하는 방식만 참고한다.
- Landing에는 Cloud console식 sidebar를 넣지 않는다.

### DESIGN.md에서 지켜야 할 규칙

- 격자는 Landing hero에만 아주 옅게 사용 가능
- primary CTA는 한 화면에 하나
- 제품 설명 card를 여러 개 늘어놓지 않음
- 로고가 없어도 제품명이 첫 화면에서 분명해야 함

### 상태

- 로그인 요청 중: 버튼 안 진행 표시, 중복 제출 차단
- 인증 실패: field 근처에 짧은 이유
- callback 지연: 빈 화면 대신 처리 중 표시
- callback 실패: 다시 로그인과 Dashboard 이동 제공

### 완료 조건

- 키보드만으로 로그인 가능
- 잘못된 값, 서버 오류, callback 오류가 구분됨
- 로그인 성공 후 Dashboard 또는 원래 route로 이동

### 검증 방법

- 375px, 768px, 1280px 화면 캡처
- Caps Lock, 빈 입력, 잘못된 비밀번호, callback 실패 확인
- focus 순서와 error 연결 확인

### 커밋 기준

`Ui: Landing과 인증 화면 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

인증 화면에서 제품 기능을 길게 설명하지 않는다.

## Milestone 2. Dashboard Shell

### 목표

프로젝트, 최근 작업, 상태, 비용을 빠르게 훑는 운영 화면을 만든다.

### 작업 범위

- `/dashboard`
- 프로젝트 목록과 상세 진입
- Settings와 Costs 진입점
- 최근 Deployment와 실패 상태
- 새 프로젝트 primary CTA

### 참고할 기존 기능 또는 route

- `apps/web/app/dashboard`
- `apps/web/features/dashboard`
- `apps/web/features/projects`
- `apps/web/features/costs`

### 적용할 레퍼런스

- App Shell: `cloudscape-examples/basic-vite/src/components/base-app-layout.tsx`
- navigation: `cloudscape-examples/basic-vite/src/components/navigation-panel.tsx`
- table: `cloudscape-examples/basic-vite/src/pages/dashboard/items-table.tsx`
- metric: `cloudscape-examples/basic-vite/src/pages/dashboard/statistics-block.tsx`
- shadcn sidebar: `shadcn-admin/src/components/ui/sidebar.tsx`
- shadcn header: `shadcn-admin/src/components/layout/header.tsx`
- Tremor layout: `template-dashboard-oss/src/app/layout.tsx`
- Tremor overview: `template-dashboard-oss/src/app/(main)/overview/page.tsx`

확인한 값:

- shadcn desktop sidebar 256px, icon sidebar 48px, mobile drawer 288px
- shadcn header 64px
- Tremor desktop sidebar 288px
- metric grid: mobile 1열, 작은 화면 2열, 큰 화면 3~4열
- table empty row 높이 예시: 96px

SketchCatch 적용:

- sidebar 256px, 접으면 48px
- header 64px
- main max width 1440px, 좌우 24~32px
- 첫 줄은 3~4개 metric, 둘째 줄부터 프로젝트와 최근 Deployment
- metric은 장식이 아니라 실제 클릭 가능한 필터 또는 상세 이동과 연결

### DESIGN.md에서 지켜야 할 규칙

화면 바깥은 흰색 또는 `#fafafa`, 일반 card는 12px radius와 hairline border를 쓴다. 검정은 새 프로젝트 primary CTA에 집중하고 Dashboard 전체를 dark surface로 만들지 않는다.

### 상태

- 프로젝트 없음: 새 프로젝트 CTA 하나
- 비용 데이터 없음: 연결 또는 분석 전이라는 이유 표시
- 최근 Deployment 실패: status와 재진입 link
- Dashboard API 일부 실패: 성공한 영역은 유지하고 실패한 영역만 error

### 완료 조건

- 5초 안에 최근 프로젝트와 실패 Deployment를 찾을 수 있음
- table은 검색, 정렬, empty, loading을 가짐
- 모바일에서 sidebar는 drawer가 되고 본문을 밀지 않음

### 검증 방법

- 프로젝트 0개, 1개, 30개 fixture
- 긴 프로젝트명과 긴 status message
- 375, 768, 1280, 1440px 캡처

### 커밋 기준

`Ui: Dashboard Shell 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

Dashboard 전체를 dark theme으로 만들지 않는다.

## Milestone 3. 새 프로젝트 시작

### 목표

사용자가 시작 방법을 고르고 필요한 입력만 한 뒤 다음 화면으로 이동한다.

### 작업 범위

- `/workspace/new`
- 빈 Board
- AI
- Reverse Engineering
- Template
- GitHub Repository

### 참고할 기존 기능 또는 route

- `apps/web/app/workspace/new/page.tsx`
- `apps/web/app/workspace/ai/page.tsx`
- `apps/web/app/workspace/reverse/page.tsx`
- `apps/web/app/workspace/repository/page.tsx`

### 적용할 레퍼런스

- shadcn form과 empty state를 참고하되 card 안에 card를 넣지 않는다.
- 시작 방식은 command 선택처럼 한 번에 훑을 수 있게 만든다.
- wizard 최대 폭은 Cloudscape의 1080px을 상한으로 참고한다.

### 적용값

- 선택 영역 최대 폭 960~1080px
- 항목 높이 최소 72px
- 설명은 2줄 이하
- 빈 Board는 중요도가 낮으므로 작은 text action으로 둘 수 있음
- 선택 후에만 필요한 입력을 펼침

### DESIGN.md에서 지켜야 할 규칙

선택 항목은 12px card, 입력과 CTA는 8px radius를 쓴다. 한 화면에 검정 primary CTA는 하나만 두고 설명은 2줄을 넘기지 않는다.

### 상태

- GitHub 미연결: callback으로 이동
- AWS Role 미연결: Reverse 화면 안에서 연결하지 않고 Settings로 이동
- Template loading 실패: 다른 시작 방법은 계속 선택 가능

### 완료 조건

- 다섯 시작 방식이 같은 단계로 보이되 필요한 조건이 다름을 알 수 있음
- browser back으로 입력이 사라지지 않음
- 중복 프로젝트 생성이 차단됨

### 검증 방법

- 각 시작 방식 happy path와 연결 없음 상태
- 새 탭 callback 후 돌아오기
- 모바일 한 열, desktop 두 열 이하

### 커밋 기준

`Ui: 새 프로젝트 시작 흐름 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

선택 화면에서 기능 전체를 설명하지 않는다.

## Milestone 4. Workspace / Architecture Board

### 목표

Architecture Board를 가장 넓게 쓰면서 Resource 탐색, 선택, 수정, 저장을 빠르게 한다.

### 작업 범위

- `/workspace`
- React Flow node와 edge
- Resource palette
- Resource inspector
- 저장 상태, undo/redo, zoom, minimap
- container 자동 배치와 크기 조절

### 참고할 기존 기능 또는 route

- `apps/web/app/workspace/page.tsx`
- `apps/web/features/diagram-editor`
- `apps/web/features/parameter-input`
- `apps/web/features/workspace/project-draft-repository.ts`

### 적용할 레퍼런스

- 기본 Board: `react-flow-example-apps/reactflow-vite/src/App.tsx`
- App Router 예시: `react-flow-example-apps/reactflow-nextjs-app-router/src/components/Flow.tsx`
- edge action: `react-flow-example-apps/reactflow-vite/src/edges/ButtonEdge.tsx`
- 겹침 방지: `board-components/src/internal/layout-engine/grid.ts`
- Board loading/empty: `board-components/pages/with-app-layout/widgets-board.tsx`
- Board와 palette: `board-components/pages/dnd/engine-page-template.tsx`

### 적용값과 비율

- 상단 project bar: 56~64px
- 왼쪽 palette: 256px, 접으면 48px
- 오른쪽 inspector: 320px, 최소 280px, 최대 400px
- 중앙 Board: 남는 폭 전부, desktop에서 최소 640px 확보
- bottom panel: 최소 160px
- Board grid: 24px
- node와 edge action은 zoom에 따라 읽을 수 있어야 함

### 상호작용

- 기본은 선택 모드
- 트랙패드 두 손가락으로 Board 이동
- `Ctrl/Command + wheel`로 확대/축소
- 이동 모드에서는 Resource가 움직이지 않음
- 선택한 Resource만 inspector에 표시
- VPC, AZ, Subnet은 container이고 뒤에 깔려도 경계가 보임
- `contains` 관계가 자동 배치와 자동 크기를 결정
- 연결선은 선택하거나 hover할 때 행동을 보여줌

### DESIGN.md에서 지켜야 할 규칙

24px 격자는 Architecture Board 안에서만 보인다. palette와 inspector는 흰 surface와 hairline border를 쓰고, 기술적인 code나 log가 아닌 영역을 검게 만들지 않는다.

### 상태

- Board loading: 기존 Board를 지우지 않고 상단 상태 표시
- 빈 Board: 중앙 한 줄 안내와 Resource 추가 action
- 저장 중/저장됨/저장 실패를 project bar에 표시
- 충돌: server 버전과 local 버전을 구분해 선택
- 잘못된 배치: 즉시 원래 위치로 돌리고 이유 표시

### 완료 조건

- palette, Board, inspector가 서로 겹치지 않음
- 100개 Resource에서도 기본 조작 가능
- container 포함 관계와 일반 edge가 시각적으로 구분됨
- 수동 위치와 자동 정리 기준이 일관됨

### 검증 방법

- Resource 0, 10, 50, 100개 fixture
- VPC → AZ → Subnet → EC2/RDS 포함 관계
- desktop/mobile screenshot과 canvas pixel 확인
- pan, zoom, drag, edge, save 직접 조작

### 커밋 기준

큰 작업은 `Ui: Workspace Shell 재구축`, `Ui: Architecture Board 조작 연결`, `Ui: Resource Inspector 연결`로 나눈다.

### 다음 마일스톤으로 넘어가기 전 확인할 것

Board가 panel보다 작아지는 구성을 허용하지 않는다.

## Milestone 5. AI 시작 화면

### 목표

프로젝트 생성 전에 대화로 요구사항을 좁히고, 마지막에 Practice Architecture 미리보기를 확인한다.

### 작업 범위

- `/workspace/ai`
- 자연어와 구조화된 운영 조건
- 답변 streaming
- guardrail warning
- Architecture Draft 미리보기와 적용

### 참고할 기존 기능 또는 route

- `apps/web/app/workspace/ai/page.tsx`
- `apps/web/features/workspace/workspace-ai-chat-history.ts`
- `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`
- `apps/web/features/workspace/api.ts`

### 적용할 레퍼런스

- Figma의 좁은 도구와 넓은 작업면이라는 역할 분리를 참고한다. 실제 editor DOM 수치는 확인하지 못했으므로 숫자는 Workspace 계약을 따른다.
- CloudMaker의 AI 제안은 Board를 가리지 않는 보조 정보라는 방향만 참고한다.
- Split Panel의 collapse/hide를 이용해 상세 근거를 접는다.

### 적용 구조

- desktop: 대화 360~420px + 미리보기 나머지 폭
- 작은 화면: 대화와 미리보기를 tab으로 전환
- 질문, 선택값, 경고, 최종 적용을 한 화면에 모두 card로 펼치지 않음
- “왜 이 구조인지”는 접힌 상세에 둠

### DESIGN.md에서 지켜야 할 규칙

대화와 미리보기의 바깥 배경은 흰색을 유지한다. AI 답변마다 장식 card를 만들지 않고, 적용 CTA만 검정으로 강조한다.

### 상태

- 답변 대기, streaming, 중단, 다시 시도
- 지원 범위 밖 요구: 막지 말고 경고와 수정 방법
- Draft 생성 실패: 대화 내용 유지
- conflict: 사용자가 누른 옵션을 우선하고 충돌 이유 표시

### 완료 조건

- 대화 중 미리보기가 깜빡이거나 사라지지 않음
- 최종 적용 전 Resource와 관계를 확인 가능
- 적용하면 `ArchitectureJson`으로 Workspace에 전달

### 검증 방법

- DB 포함 backend, API server, static site
- 지원 범위 밖 문장
- streaming 중 취소와 재시도
- 미리보기 적용 후 Workspace 저장

### 커밋 기준

`Ui: AI 시작 화면 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

AI 설명이 실제 결과보다 더 큰 면적을 차지하지 않는다.

## Milestone 6. Reverse Engineering

### 목표

검증된 AWS Role로 기존 Resource를 읽고, 구조 후보를 확인한 뒤 새 프로젝트를 만든다.

### 작업 범위

- `/workspace/reverse`
- 기본 전체 scan과 고급 filter
- Resource Explorer 상태
- 부분 실패와 권한 부족
- 구조 후보와 전체 계정 보기
- Resource parameter와 import suggestion
- 확인 후 프로젝트 생성

### 참고할 기존 기능 또는 route

- `apps/web/app/workspace/reverse/page.tsx`
- `apps/web/features/workspace/ReverseEngineeringPanel.tsx`
- `apps/web/features/workspace/useReverseEngineeringOptions.ts`
- `apps/web/features/workspace/reverse-engineering-board-candidates.ts`

### 적용할 레퍼런스

- Lucidscale 공개 화면: cloud 환경을 구조와 거버넌스 정보로 함께 보여주는 방향을 확인했다. 실제 import UI는 접근하지 못했다.
- CloudMaker 공개 제품 이미지: 넓은 Board, 왼쪽 탐색, 작은 상단 도구, 오른쪽 설정 진입을 확인했다. 실제 panel 수치는 접근하지 못했다.
- Cloudscape table과 Split Panel 수치를 실제 구현 기준으로 사용한다.
- 공개 조사 기록: `gg/tmp/sketchcatch-ui-references/browser-analysis/README.md`

### 적용 구조

- 첫 행동은 “기존 AWS 가져오기” 한 개
- 기본값: 현재 project 이름, 검증된 AWS 연결, 전체 scan
- region과 Resource filter는 고급 설정에 숨김
- scan 뒤에는 Board 미리보기를 먼저 보여줌
- 왼쪽 300~360px에는 구조 후보를 크게 표시
- 오른쪽 상세는 부분 실패, Resource parameter, Terraform import를 접힌 section으로 표시
- 후보는 무조건 3개 만들지 않는다. 연결 근거가 충분하면 하나로 자동 선택하고, 헷갈릴 때만 여러 후보를 제시한다.

### DESIGN.md에서 지켜야 할 규칙

Board만 24px 격자를 쓰고 주변 panel은 흰색을 쓴다. warning은 `#ab6400` 계열의 text와 icon으로 표현하고, 화면 전체를 색으로 칠하지 않는다.

### 상태

- Role 없음: Settings 이동
- Resource Explorer 없음: 주요 API로 가능한 만큼 읽고 발견 범위 제한 표시
- 권한 부족: 실패한 서비스 이름과 필요한 권한
- partial: 읽은 Resource는 유지
- UNKNOWN: 숨기지 않고 원래 ARN/type과 함께 표시
- 후보 없음: 전체 계정 보기로 확인 후 수동 분리

### 완료 조건

- 한 번의 기본 실행으로 가능한 전체 Resource를 발견
- 포함 관계와 dependency를 Board에서 구분
- 어떤 서비스가 빠졌는지 알 수 있음
- 사용자가 후보를 고른 뒤에만 프로젝트 생성

### 검증 방법

- Resource 0개, 단일 서비스, 여러 서비스가 섞인 계정
- Resource Explorer on/off
- 일부 service permission denied
- UNKNOWN 포함
- 후보 1개와 여러 후보 모두 확인

### 커밋 기준

`Ui: Reverse Engineering 화면 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

“전체”라는 표현을 쓸 때 실제 발견하지 못한 범위를 숨기지 않는다.

## Milestone 7. Terraform Preview

### 목표

Board에서 만든 구조가 어떤 Terraform으로 바뀌는지 확인하고, 오류 위치와 동기화 제안을 이해하게 한다.

### 작업 범위

- Terraform code editor
- validate 결과
- Board ↔ code 변경 제안
- 저장되지 않은 변경 이탈 방지
- artifact 상태

### 참고할 기존 기능 또는 route

- `apps/web/features/workspace/terraform-code-highlighting.ts`
- `apps/web/features/workspace/terraform-issues-state.ts`
- `apps/web/features/workspace/terraform-sync-proposals.ts`
- `apps/web/features/workspace/terraform-leave-save-state.ts`

### 적용할 레퍼런스

- Cloudscape Split Panel: bottom 최소 160px, side 최소 280px
- `components/pages/app-layout/with-full-page-table-and-split-panel.page.tsx`
- `shadcn-admin/src/features/tasks/components/tasks-mutate-drawer.tsx`: 긴 form을 drawer 안에서 scroll하고 닫을 때 상태를 정리하는 방식

### 적용 구조

- Board와 code를 동시에 볼 때 55:45를 시작값으로 사용
- Board 폭이 640px 아래가 되면 code를 full panel로 전환
- code font 13px, dark surface
- file tree 220~260px, code 나머지 폭
- 오류 목록은 bottom panel 또는 code 옆 gutter

### DESIGN.md에서 지켜야 할 규칙

code와 diagnostic 집중 영역만 dark surface를 쓴다. 일반 toolbar와 주변 panel은 흰색이고, code는 13px 기술 글꼴을 쓴다.

### 상태

- 생성 전, 생성 중, 최신, Board보다 오래됨
- validate success/warning/error
- code 수정으로 Board 동기화 제안 있음
- 저장되지 않은 변경이 있을 때만 이탈 확인

### 완료 조건

- 오류를 누르면 해당 파일과 줄로 이동
- Board Resource와 Terraform Resource 매핑 확인
- 자동 수정은 diff 확인 후에만 적용

### 검증 방법

- 정상 code, syntax error, permission과 무관한 validate error
- 긴 파일명과 여러 파일
- Board 수정 후 stale 상태
- code 수정 후 동기화 제안

### 커밋 기준

`Ui: Terraform Preview 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

validate와 실제 Plan을 같은 결과처럼 표현하지 않는다.

## Milestone 8. Safety / Cost Check

### 목표

배포 전에 비용과 보안 위험을 빠르게 보고, 막힌 이유를 Resource 단위로 확인한다.

### 작업 범위

- finding 요약
- Resource별 비용
- checklist
- blocked gate
- AI 쉬운 설명

### 참고할 기존 기능 또는 route

- `apps/web/features/workspace/pre-deployment-diagnostics.ts`
- `apps/web/features/workspace/pre-deployment-finding-source.ts`
- `apps/web/features/workspace/safety-finding-ai-event.ts`
- `apps/web/features/costs`

### 적용할 레퍼런스

- metric card: `template-dashboard-oss/src/app/(main)/overview/page.tsx`
- status badge: `template-dashboard-oss/src/components/ui/DashboardChartCard.tsx`
- warning/error progress: `template-dashboard-oss/src/components/ui/ProgressBar.tsx`
- error fallback: `components/src/error-boundary/fallback.tsx`

### 적용 구조

- 위쪽: 예상 월 비용, high finding 수, Check 완료 상태
- 아래쪽: finding table과 선택한 Resource 상세
- severity 색만으로 구분하지 않고 icon과 text를 같이 사용
- AI 설명은 원본 finding 아래 보조 설명
- 비용을 모르면 0원으로 표시하지 않고 “계산 못 함”으로 표시

### DESIGN.md에서 지켜야 할 규칙

metric card는 12px radius와 hairline border를 쓴다. severity는 색에만 의존하지 않고 text와 icon을 함께 쓴다. 검정 CTA는 검사 실행 또는 다음 단계 하나에만 쓴다.

### 상태

- not analyzed, analyzing, complete
- warning: 승인 가능
- blocked: Apply 불가, 이유와 해결 행동
- partial cost: 계산한 항목과 못 한 항목 분리
- analysis error: 이전 결과가 있으면 유지

### 완료 조건

- high finding에서 해당 Board Resource로 이동
- blocked 이유가 Apply 버튼 근처에도 보임
- 비용 합계와 Resource별 합계 기준이 같음

### 검증 방법

- finding 0, 1, 50개
- SSH `0.0.0.0/0`, RDS 공개, NAT Gateway 비용
- 비용 데이터 일부 없음
- color blindness 기준 확인

### 커밋 기준

`Ui: Safety와 Cost Check 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

AI 설명이 finding 원본을 대신하지 않는다.

## Milestone 9. Deployment Console

### 목표

저장 → 검사 → 승인 → Plan → Apply 단계를 섞지 않고 보여준다.

### 작업 범위

- Direct Deployment
- Git/CI/CD handoff
- Plan 변경 요약
- Apply 승인
- 실시간 log와 진행 상태
- 실패 복구 행동

### 참고할 기존 기능 또는 route

- `apps/web/features/workspace/deployment-actions.ts`
- `apps/web/features/workspace/workspace-deployment-artifacts.ts`
- `apps/web/features/workspace/live-observation.ts`
- `apps/web/features/workspace/api.ts`

### 적용할 레퍼런스

- Cloudscape status 종류와 Split Panel
- `cloudscape-examples/basic-vite/src/pages/dashboard/items-table.tsx`: status가 있는 운영 table
- `components/pages/app-layout/with-stacked-notifications-and-table.page.tsx`: notification과 table 우선순위

### 적용 구조

- 단계 표시: 저장, 검사, Plan, 승인, Apply
- 현재 단계 하나만 크게 표시
- Plan은 create/update/delete/replace 수를 먼저 표시
- log는 dark bottom panel, 최소 160px, 사용자가 높이 조절
- Apply CTA는 조건 충족 전 disabled가 아니라 blocked 이유와 함께 표시

### DESIGN.md에서 지켜야 할 규칙

log만 dark surface를 사용한다. Plan과 승인 panel은 흰색이다. 위험한 Apply는 검정 CTA로 분명히 하되 blocked 상태에서는 이유를 버튼 가까이에 표시한다.

### 상태

- queued, running, waiting approval, success, failed, canceled
- connection failure, permission denied, quota, region, provider error
- log stream 끊김과 Deployment 실패를 구분
- Direct Deployment와 Git/CI/CD 결과를 같은 status 어휘로 표시

### 완료 조건

- Plan과 Apply를 혼동하지 않음
- delete와 replace가 눈에 띔
- 승인자와 승인 시각 확인
- 실패 후 원본 error와 쉬운 설명 모두 확인

### 검증 방법

- mock Plan create/update/delete/replace
- Apply 성공, 실패, 취소
- log 재연결
- blocked Safety Gate
- 좁은 화면에서 log bottom panel

### 커밋 기준

`Ui: Deployment Console 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

“배포” 버튼 한 번으로 Plan과 Apply를 동시에 실행하지 않는다.

## Milestone 10. Deployment History / Cleanup

### 목표

과거 Deployment 결과와 현재 Resource를 보고, Cleanup 범위와 위험을 확인한다.

### 작업 범위

- Deployment History 목록
- 실행 상세와 log
- 생성된 Resource 목록
- Cleanup preview와 실행
- 실패한 Cleanup 재시도

### 참고할 기존 기능 또는 route

- Dashboard의 Deployment History route와 연결 API
- `apps/web/features/workspace/workspace-deployment-artifacts.ts`
- shared Deployment, log, cleanup type

### 적용할 레퍼런스

- Cloudscape table: `cloudscape-examples/basic-vite/src/pages/dashboard/items-table.tsx`
- shadcn table: `shadcn-admin/src/features/tasks/components/tasks-table.tsx`
- table은 header, counter, search/filter, pagination, empty를 함께 가진다.

### 적용 구조

- desktop: History table + 선택한 실행의 side panel 320~400px
- mobile: table을 card로 바꾸지 말고 중요 열만 남기고 상세 drawer
- Cleanup은 History 상세 안의 위험 action
- 삭제 예정 Resource를 먼저 보여주고 확인 문구를 입력하게 함

### DESIGN.md에서 지켜야 할 규칙

History table은 흰 바탕과 hairline border를 사용한다. Cleanup은 일반 검정 CTA와 구분되는 위험 행동으로 보이게 하며, 삭제 범위를 먼저 읽게 한다.

### 상태

- History 없음
- 실행 중인 Deployment
- 성공, 실패, 취소
- Cleanup 가능, 일부만 가능, 불가
- Cleanup running, partial, failed, success

### 완료 조건

- 언제, 누가, 무엇을 배포했는지 확인
- log와 artifact 이동 가능
- Cleanup 전에 삭제 범위를 확인
- partial cleanup에서 남은 Resource가 보임

### 검증 방법

- History 0, 1, 100개
- 긴 error, 긴 Resource ARN
- Cleanup preview와 취소
- partial cleanup 재시도

### 커밋 기준

`Ui: Deployment History와 Cleanup 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

Cleanup을 일반 secondary action처럼 가볍게 보이게 하지 않는다.

## Milestone 11. Template / GitHub Repository

### 목표

Template과 Repository를 새 프로젝트의 입력으로 쓰고, 최종 결과는 같은 Architecture Board로 보낸다.

### 작업 범위

- `/dashboard/templates`
- Template 검색, filter, 정렬, tag
- Template 저장과 적용
- `/workspace/repository`
- GitHub callback과 분석 상태
- 최종 Practice Architecture Preview

### 참고할 기존 기능 또는 route

- `apps/web/app/dashboard/templates/page.tsx`
- `apps/web/app/workspace/repository/page.tsx`
- `apps/web/app/integrations/github/callback/page.tsx`
- `apps/web/features/resource-settings/template-library.ts`

### 적용할 레퍼런스

- shadcn의 검색 가능한 목록과 form
- Cloudscape table/filter 구조
- Template Gallery는 card를 사용해도 되지만 page section 자체를 card로 감싸지 않음

### DESIGN.md에서 지켜야 할 규칙

Template item은 12px card로 만들 수 있지만 card 안에 card를 넣지 않는다. filter와 search input은 8px radius, 적용 CTA만 검정으로 강조한다.

### 상태

- Template 없음, 검색 결과 없음, loading 실패
- GitHub 미연결, 권한 없음, repository 없음
- 분석 중, partial, unsupported stack, success
- 적용 전 자동 backup 결과

### 완료 조건

- Dashboard와 Workspace에서 같은 Template 목록을 봄
- Template 적용 전 현재 Board 자동 backup
- Repository 분석 결과가 `ArchitectureJson` 미리보기로 연결

### 검증 방법

- Template 0, 1, 100개
- 검색/정렬/filter 조합
- public/private repository
- callback 실패와 재시도

### 커밋 기준

`Ui: Template과 Repository 시작 흐름 재구축`

### 다음 마일스톤으로 넘어가기 전 확인할 것

Template과 GitHub가 별도 Board 형식을 만들지 않는다.

## Milestone 12. E2E Visual QA

### 목표

화면이 예쁜지만 보지 않고, 처음부터 Cleanup까지 실제 사용자 흐름과 모든 상태를 확인한다.

### 작업 범위

- 전체 route 연결
- responsive
- keyboard와 focus
- loading/empty/error/warning/blocked/success
- console error와 network failure
- screenshot 비교

### 참고할 기존 기능 또는 route

Milestone 1~11의 모든 route와 연결 기능을 대상으로 한다. 현재 route 목록은 Milestone 0에서 고정한 지도를 사용한다.

### 적용할 레퍼런스

clone한 저장소의 responsive 구현과 공개 화면 조사 캡처를 비교 기준으로 쓴다. 다만 최종 합격 기준은 레퍼런스와 똑같은지가 아니라 `DESIGN.md`와 이 문서의 완료 조건을 지켰는지다.

### DESIGN.md에서 지켜야 할 규칙

색, 글꼴, radius, CTA, grid, dark surface 규칙을 모든 화면 크기에서 다시 확인한다.

### 화면 크기

- 375 x 812: 모바일
- 768 x 1024: tablet
- 1280 x 720: 작은 desktop
- 1440 x 900: 기본 desktop
- 1920 x 1080: 넓은 desktop

### 필수 E2E 시나리오

1. 로그인 → Dashboard → 빈 Board → Terraform → Check → Plan → Apply → History
2. AI → Preview → Workspace 저장
3. Reverse Engineering → partial scan → 후보 선택 → 프로젝트 생성
4. Template → 자동 backup → 적용
5. GitHub callback → 분석 → Preview → Workspace
6. failed Deployment → error 설명 → History → Cleanup

### 시각 검증 기준

- 겹침 없음
- text 잘림 없음
- horizontal scroll은 code/table에서만 의도적으로 발생
- Board가 빈 화면이 아님
- panel을 열고 닫아도 layout이 튀지 않음
- loading 중 기존 결과가 순간적으로 사라지지 않음
- primary CTA는 화면마다 하나가 분명함
- dark surface가 Dashboard 전체로 번지지 않음

### 완료 조건

- 모든 route가 직접 열림
- 모든 비동기 상태가 실제 화면으로 확인됨
- browser console error 없음
- 핵심 E2E에서 API 요청과 화면 결과가 일치
- 발견한 문제를 수정한 뒤 같은 시나리오를 다시 통과

### 검증 방법

- Playwright 또는 실제 browser로 클릭, 입력, 이동
- desktop/mobile screenshot
- React Flow canvas pixel 확인
- network 실패와 느린 응답 주입
- build, typecheck, lint, 관련 test

### 커밋 기준

화면별 수정은 나누고 마지막 검증 근거만 `Test: UI E2E 검증 보강`으로 커밋한다.

### 다음 마일스톤으로 넘어가기 전 확인할 것

문서의 완료 조건 중 실제로 확인하지 않은 항목을 완료로 표시하지 않는다.

## 6. 커밋 정책

- 마일스톤 하나가 끝날 때마다 커밋한다.
- 큰 마일스톤은 route 또는 화면 단위로 나눈다.
- 커밋 전 가능한 범위에서 build, typecheck, lint를 실행한다.
- 첫 줄은 팀 commit convention을 따른다.
- 본문에는 사용자가 이해할 수 있게 무엇이 달라졌는지 쉽게 쓴다.

예시:

```text
Ui: Workspace Shell 재구축

Architecture Board가 화면의 중심이 되도록 패널 폭과 접힘 동작을 다시 만들었습니다.
기존 ArchitectureJson 저장과 Terraform 연결 로직은 그대로 사용합니다.
```

## 7. 구현 작업자가 반드시 지킬 순서

이 문서를 먼저 읽고 Milestone 0부터 순서대로 진행한다.

- 문서에 없는 화면을 임의로 추가하지 않는다.
- 기존 기능 계약과 충돌하면 억지로 맞추지 말고 충돌을 기록한다.
- 한 마일스톤을 일부만 끝냈다면 partial이라고 적고 다음으로 넘기지 않는다.
- 레퍼런스는 구조 근거이고, 색과 글꼴과 radius는 `DESIGN.md`를 따른다.
- 공개 제품에서 확인하지 못한 값은 추측하지 않는다.
- 구현 후 문서의 완료 조건을 다시 읽고 검증, 수정, 재검증한다.

## 8. 조사 자료 위치

- clone 저장소: `gg/tmp/sketchcatch-ui-references`
- 공개 화면 조사: `gg/tmp/sketchcatch-ui-references/browser-analysis/README.md`
- 공개 화면 캡처: `gg/tmp/sketchcatch-ui-references/browser-analysis/screenshots`

이 자료는 구현 참고용이다. 제품 bundle에 포함하지 않는다.
