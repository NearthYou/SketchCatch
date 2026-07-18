# Workspace 시각 개편 단계별 접근

> 대상 브랜치: `fix/gg/qa-followup`
>
> 작성일: 2026-07-12
>
> 관련 문서: `001_Workspace_오른쪽패널_현재디자인_롤백기준_gg.md`, `009_WorkspaceAI채팅재설계_gg.md`, `010_WorkspaceAI채팅완전재구축_gg.md`, `DESIGN.md`

## 1. 목적

Workspace 오른쪽 패널, Deployment 모달, AI 채팅창의 시각 디자인을 단계적으로 개선한다.

모든 단계에서 아래 동작은 고정한다.

- 기존 버튼 개수, 문구, 순서, 활성·비활성 조건
- 버튼별 `onClick`, form submit, keyboard 동작
- 클릭 뒤 열리는 화면과 닫히는 화면
- Resource, Terraform, Deployment, AI 상태 전환
- API 요청의 종류, 순서, payload
- Board, Terraform, Deployment 변경 전 사용자 승인
- Terraform 미저장 변경 이탈 확인
- AI 초안·수정안의 미리보기와 명시적 적용

시각 변경 때문에 위 동작을 바꿔야 하는 상황이 생기면 해당 단계의 범위를 중단하고 별도 기능 작업으로 분리한다.

## 2. 공통 시각 기준

### Desktop

- Workspace 보조 패널은 Board와 1px 경계로 구분한다.
- 오른쪽 패널과 AI 채팅은 `376px`에서 `416px` 사이의 읽기 가능한 폭을 기본으로 한다.
- 주요 텍스트 버튼 높이는 `40px`, compact icon 버튼은 `40px × 40px`를 기본으로 한다.
- AI launcher는 `44px × 44px`를 유지한다.
- 버튼 radius는 `8px`, panel radius는 floating surface일 때만 `8px`를 사용한다.
- section card 중첩을 줄이고 제목, 여백, divider로 정보 계층을 만든다.
- 기본 간격은 `8px`, section 사이 간격은 `16px` 또는 `24px` 단위로 맞춘다.

### Tablet과 Mobile

- `768px` 이하에서 오른쪽의 좁은 패널을 전체 화면 sheet로 전환한다.
- `100dvh`와 `env(safe-area-inset-bottom)`을 사용해 모바일 키보드와 하단 안전 영역을 처리한다.
- header와 닫기 버튼, 현재 내용, 하단 주요 행동이 한 화면 흐름에서 유지돼야 한다.
- 버튼 label을 줄이거나 기능 버튼을 숨겨 공간을 만들지 않는다.
- 가로 스크롤을 만들지 않는다.

### AI 채팅

- `header / transcript / composer`의 세 영역을 유지한다.
- transcript만 세로 스크롤한다.
- composer는 panel 아래에 고정하고 textarea는 최대 6줄까지 자란다.
- 전송, 중지, 음성 입력 버튼은 기존 조건과 handler를 그대로 사용한다.
- 메시지, suggestion, 결과 card, 사용자 승인 행동의 DOM 의미와 순서를 보존한다.

### Deployment 모달

- Desktop에서는 화면 가장자리와 간격을 둔 console surface로 보인다.
- Mobile에서는 화면을 온전히 사용하는 modal로 보인다.
- 닫기, 검사, 기준 저장, Plan, 승인, Direct Deployment, Git/CI/CD, 기록과 결과 행동을 재배치하거나 합치지 않는다.
- 위험 행동과 승인 행동은 기존 disabled·warning·confirmation 규칙을 유지한다.

## 3. 접근 1: CSS-only 시각 개편

### 사용 시점

현재 작업에서 먼저 적용한다.

### 변경 방식

- 기존 TSX의 button, form, dialog, tab, handler를 수정하지 않는다.
- `workspace.module.css`, `ParameterInputPanel.module.css`, 필요한 Diagram Editor style만 조정한다.
- 기존 selector를 사용해 버튼 크기, 간격, 표면, 반응형 배치를 바꾼다.
- 중복된 옛 style과 마지막 override의 실제 우선순위를 확인한 뒤 최종 시각 계약을 한곳에서 명확히 한다.
- 기능 assertion은 유지하고 CSS selector를 검사하는 시각 assertion만 새 기준으로 바꾼다.

### 장점

- 기능 회귀 위험이 가장 낮다.
- API와 승인 로직 diff가 생기지 않는다.
- Desktop과 Mobile을 같은 markup으로 빠르게 맞출 수 있다.

### 한계

- 현재 DOM 순서가 만든 시각적 제약은 그대로 남는다.
- 큰 `workspace.module.css`의 cascade 복잡도가 남는다.
- 서로 다른 panel이 같은 style 파일을 공유하는 구조는 개선되지 않는다.

### 완료 조건

- 기능 TSX와 API 파일에 diff가 없다.
- 기존 버튼 수와 handler 문자열이 바뀌지 않는다.
- Desktop에서 panel, modal, chat composer가 겹치지 않는다.
- `375px`, `768px`, `1280px` 기준에서 가로 잘림이 없다.

## 4. 접근 2: JSX 배치 정리

### 목표

접근 1에서 보존한 기능을 유지하면서, CSS만으로 해결하기 어려운 시각 계층을 semantic wrapper와 DOM 배치로 정리한다.

### 적용 전 조건

- 접근 1의 화면과 기능 계약이 기준선으로 확정돼 있어야 한다.
- 각 화면의 버튼 목록, label, handler, disabled 조건을 source contract로 기록해야 한다.
- Desktop과 Mobile에서 focus 순서와 Escape 동작을 기록해야 한다.

### 진행 단계

#### 4.1 현재 동작 계약 고정

- `WorkspaceRightPanel.tsx`, `DeploymentPanel.tsx`, `WorkspaceAiChatDock.tsx`에서 모든 button과 form을 목록화한다.
- 각 항목의 label, handler, disabled 조건, 결과 화면을 테스트에 고정한다.
- API 함수 호출 위치와 사용자 승인 전후의 상태 변경 위치를 비교 기준으로 남긴다.

#### 4.2 의미 단위 wrapper 추가

- 오른쪽 패널을 `header`, `navigation`, `content`, `footer action` 영역으로만 나눈다.
- Deployment 모달을 `modal header`, `primary workflow`, `status`, `secondary disclosure` 영역으로만 나눈다.
- AI 채팅을 `header`, `tab navigation`, `transcript`, `approval result`, `composer` 영역으로만 나눈다.
- button 자체와 handler는 새로 만들지 않고 기존 element를 해당 wrapper 안으로 이동한다.

#### 4.3 DOM 순서와 focus 확인

- 시각 순서와 keyboard focus 순서를 동일하게 맞춘다.
- CSS `order`로 focus 순서와 다른 배치를 만들지 않는다.
- modal close, tab 이동, composer, 승인 버튼의 기존 접근성 속성을 유지한다.
- Mobile에서도 Desktop과 같은 기능 순서를 유지한다.

#### 4.4 반응형 layout 분리

- 같은 DOM 위에서 Desktop dock과 Mobile full-screen sheet를 CSS로 나눈다.
- 작은 화면 때문에 버튼을 삭제하거나 overflow menu로 합치지 않는다.
- transcript와 modal body만 스크롤 영역이 되도록 ownership을 한 곳으로 정한다.

### 예상 변경 파일

- `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- `apps/web/features/workspace/DeploymentPanel.tsx`
- `apps/web/features/workspace/WorkspaceAiChatDock.tsx`
- `apps/web/features/workspace/workspace.module.css`
- 관련 source contract test

### 위험과 방지책

| 위험 | 방지책 |
| --- | --- |
| 버튼 누락 또는 중복 | 변경 전후 button 목록과 label 개수를 source contract로 비교 |
| handler가 다른 버튼에 연결됨 | 기존 handler 표현과 button label mapping을 테스트로 고정 |
| form submit 변화 | form 경계와 submit button type을 그대로 유지 |
| focus 순서 변화 | DOM 순서 기준 keyboard 시나리오 확인 |
| modal 닫기 동작 변화 | backdrop click, close button, Escape 각각 별도 확인 |

### 완료 조건

- 버튼 목록, handler, disabled 조건, API 호출 위치가 기준선과 같다.
- 사용자 승인 전에 Board, Terraform, Deployment 상태가 변하지 않는다.
- wrapper는 layout 책임만 가지며 상태와 side effect를 만들지 않는다.
- Desktop과 Mobile의 DOM 기능 순서가 같다.

## 5. 접근 3: Presentational component 분리

### 목표

접근 2의 안정된 영역을 기능 controller와 표현 component로 나눠, 이후 시각 변경이 API·상태·승인 로직에 닿지 않게 한다.

### 적용 전 조건

- 접근 2의 DOM 구조와 동작 계약이 안정돼 있어야 한다.
- controller가 소유할 상태와 presentational component가 받을 값·callback을 명확히 구분해야 한다.
- 분리 작업 중 기능 개선이나 새로운 UX를 함께 넣지 않는다.

### 권장 경계

```text
WorkspaceRightPanel controller
├─ WorkspacePanelShell view
├─ WorkspacePanelNavigation view
└─ 기존 Resource / Terraform content

DeploymentPanel controller
├─ DeploymentModalShell view
├─ DeploymentWorkflowView
└─ DeploymentSecondarySectionsView

WorkspaceAiChatDock controller
├─ AiChatShell view
├─ AiChatTranscript view
├─ AiChatResultCards view
└─ AiChatComposer view
```

controller는 state, API, 승인, 취소, 저장, 적용을 소유한다.
presentational component는 props를 화면에 표시하고 전달받은 callback만 호출한다.

### 진행 단계

#### 5.1 Props 계약 작성

- 각 view가 표시할 data와 callback을 `readonly` props로 정의한다.
- view props에 API client, storage, router, Diagram Editor context 전체를 넘기지 않는다.
- `onApply`, `onCancel`, `onClose`, `onSubmit`처럼 사용자 행동 callback만 전달한다.

#### 5.2 Stateless view 추출

- 먼저 header, shell, button group처럼 상태가 없는 작은 영역을 추출한다.
- 다음으로 transcript와 result card처럼 data rendering만 하는 영역을 추출한다.
- 마지막에 composer와 Deployment workflow처럼 form 의미가 있는 영역을 추출한다.
- 추출할 때 기존 button element의 label, type, disabled, callback을 그대로 옮긴다.

#### 5.3 Controller side effect 보존

- API 호출, local storage, Diagram 변경, Terraform 적용, Deployment 승인 로직은 기존 controller 파일에 남긴다.
- view는 Promise 결과를 해석하거나 다음 상태를 결정하지 않는다.
- 사용자 승인 전 미리보기 상태와 승인 뒤 적용 상태의 경계를 controller test로 고정한다.

#### 5.4 Component별 style 소유권 이동

- 공용 token은 유지하고 panel별 style module을 분리한다.
- Workspace panel, Deployment modal, AI chat이 서로의 selector를 덮어쓰지 않게 한다.
- 반응형 breakpoint와 safe-area 규칙은 각 shell component가 소유한다.

### 예상 파일 구조

```text
apps/web/features/workspace/
├─ WorkspaceRightPanel.tsx
├─ workspace-panel/
│  ├─ WorkspacePanelShell.tsx
│  └─ workspace-panel-shell.module.css
├─ DeploymentPanel.tsx
├─ deployment-panel/
│  ├─ DeploymentModalShell.tsx
│  ├─ DeploymentWorkflowView.tsx
│  ├─ DeploymentSecondarySectionsView.tsx
│  └─ deployment-panel.module.css
├─ WorkspaceAiChatDock.tsx
└─ ai-chat/
   ├─ AiChatShell.tsx
   ├─ AiChatTranscript.tsx
   ├─ AiChatResultCards.tsx
   ├─ AiChatComposer.tsx
   └─ ai-chat.module.css
```

### 위험과 방지책

| 위험 | 방지책 |
| --- | --- |
| controller와 view 사이 props 증가 | 화면에 필요한 최소 data와 callback만 전달 |
| callback identity로 불필요한 render 증가 | 실제 문제가 확인된 callback만 `useCallback` 유지 또는 추가 |
| form 경계 분리로 submit 변화 | form element와 submit button을 같은 view에 유지 |
| 승인 로직이 view로 이동 | 적용 가능 여부 계산과 실제 적용 함수는 controller에 유지 |
| style module 분리 중 화면 차이 | 접근 2의 시각 기준 screenshot과 selector 계약으로 비교 |

### 완료 조건

- presentational component가 API, storage, router를 직접 호출하지 않는다.
- controller의 API 호출 순서와 승인 로직이 분리 전과 같다.
- 버튼 수, label, type, disabled 조건, callback 결과가 분리 전과 같다.
- 각 style module이 자기 shell과 하위 표현만 꾸민다.
- 이후 버튼 크기나 panel 간격 변경이 controller diff 없이 가능하다.

## 6. 단계 선택 원칙

```text
지금
→ 접근 1로 시각 디자인만 개편

CSS 제약 때문에 DOM 계층이 문제일 때
→ 접근 2를 별도 PR로 진행

접근 2가 안정되고 반복적인 시각 수정이 controller까지 번질 때
→ 접근 3을 별도 PR로 진행
```

접근 2와 접근 3을 한 PR에서 동시에 수행하지 않는다.
각 단계는 앞 단계의 기능·시각 기준을 회귀 검증 기준으로 사용한다.

## 7. 이번 작업 범위

이번 작업에서는 접근 1만 구현한다.

- Workspace 오른쪽 패널의 버튼 모양, 크기, 위치, 간격
- Resource Inspector의 카드 중첩과 정보 밀도
- Deployment 모달의 surface, header, content spacing, action button 표현
- AI 채팅창의 header, tab, transcript, message, composer, launcher layout
- Desktop과 Mobile 반응형 CSS
- 바뀐 시각 selector에 필요한 최소 source contract test

접근 2와 접근 3은 이 문서를 실행 기준으로만 남기며 이번 코드 변경에는 포함하지 않는다.
