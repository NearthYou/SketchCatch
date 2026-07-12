# Workspace AI 채팅 완전 재구축

## 1. 한 줄 목표

기존 AI 버튼과 채팅 화면을 전부 지우고, Architecture Board 작업을 방해하지 않는 **새 AI 작업 패널**을 만든다.

AI는 설명과 변경안을 만들 수 있지만, 사용자가 직접 적용하기 전에는 Board, Terraform, Deployment를 바꾸지 못한다.

## 2. 시작 상태

이번 작업은 기존 화면을 고치는 작업이 아니다.

먼저 아래 기존 UI를 삭제했다.

- 기존 AI 런처 JSX
- 기존 AI 채팅 패널 JSX
- 기존 AI 전용 CSS
- 기존 AI 화면 상태 모듈
- 기존 AI 화면 전용 테스트
- `WorkspaceOperationsDock`에 있던 기존 AI 렌더링 연결

삭제 커밋은 `ea466671`이다.

다음 기능 로직은 화면이 아니므로 남겼다.

- AI API 호출
- 프로젝트별 대화 저장
- 음성 입력
- Architecture Draft 생성
- 현재 Board 변경안 미리보기
- Terraform 설명과 오류 설명
- safe fix 미리보기
- 사용자가 승인했을 때만 실제 상태를 바꾸는 함수

## 3. 현재 코드에서 확인한 실제 연결 구조

새 AI 화면은 아래 흐름에 연결한다.

```text
/workspace
→ WorkspaceProjectClient
→ DiagramEditor
→ floatingPanel
→ WorkspaceOperationsDock
→ 새 WorkspaceAiDock
```

`WorkspaceOperationsDock`가 이미 현재 Board와 Terraform 상태를 함께 가지고 있다. 새 AI Dock도 이곳에서 렌더링하면 Terraform 상태를 중복해서 만들지 않아도 된다.

AI가 열릴 때는 다음 순서로 충돌을 막는다.

1. 저장하지 않은 Terraform 변경이 있으면 기존 확인 규칙을 먼저 지킨다.
2. Terraform·검사·배포 작업 패널을 닫는다.
3. 오른쪽 Inspector를 닫는다.
4. AI panel만 연다.

## 4. 실제로 읽은 공개 저장소

임시 clone 위치는 `/tmp/sketchcatch-ai-chat-references`다. 이 폴더는 제품 저장소에 커밋하지 않는다.

| 저장소 | 확인한 commit | 실제로 읽은 파일 |
| --- | --- | --- |
| Cloudscape Components | `3f01803` | `src/split-panel/side.tsx`, `src/split-panel/styles.scss`, `src/split-panel/utils/size-utils.ts`, `src/prompt-input/internal.tsx`, `src/button-dropdown/tooltip.tsx` |
| Cloudscape Board Components | `8d95412` | `pages/with-app-layout/app-layout.tsx`, `src/internal/resize-handle/index.tsx`, `src/internal/resize-handle/styles.scss` |
| Cloudscape Examples | `35055cf` | `chat-ui-vite/src/components/chat-ui/chat-ui.tsx`, `chat-ui-input-panel.tsx`, `chat-ui-vite/src/styles/chat-ui.module.scss` |
| React Flow Examples | `9593bb5` | `reactflow-nextjs-app-router/src/components/Flow.tsx`, `reactflow-vite/src/App.tsx` |
| shadcn-admin | `e16c87f` | `src/components/ui/sheet.tsx`, `src/components/ui/tooltip.tsx`, `src/features/chats/components/new-chat.tsx` |

확인한 원칙은 다음과 같다.

- Cloudscape Split Panel은 내용과 resize 영역을 분리하고 panel을 독립된 `region`으로 표시한다.
- Cloudscape chat은 사용자가 아래를 보고 있을 때만 새 메시지를 따라간다.
- Cloudscape prompt input은 최대 6줄까지만 자란다.
- React Flow의 Controls와 MiniMap은 Board 안쪽 overlay이므로 AI 런처와 같은 모서리에 겹치면 안 된다.
- shadcn sheet는 모바일에서 화면 전체를 덮는 별도 surface와 닫기·focus 흐름을 사용한다.

공개 저장소는 각 저장소의 라이선스를 그대로 따른다. 코드를 복사하지 않고 구조와 상호작용 원칙만 참고한다.

## 5. 브라우저에서 직접 확인한 공개 화면

2026-07-12에 1280 x 720 viewport에서 공개 DOM과 computed style을 다시 확인했다.

| 제품 | 확인 결과 |
| --- | --- |
| Brainboard | 공개 접속 시 로그인 화면으로 이동, 로그인 버튼 높이 48px, radius 6px |
| Figma | 고정 header 78px, 주요 cookie 버튼 높이 46px, radius 8px |
| Miro | header 72px, border 1px, 주요 menu 버튼 높이 40px, radius 8px |
| CloudMaker | 공개 첫 화면과 문서 제목 확인, 로그인 없는 내부 편집기 수치는 추측하지 않음 |

Brainboard, Figma, Miro, CloudMaker의 문구, HTML, 이미지, 로고는 복사하지 않는다.

## 6. 새 닫힌 런처

- 이름: `WorkspaceAiDock`
- 접근성 이름: `AI 채팅 열기`
- 크기: 44 x 44px
- 모양: radius 8px의 compact square
- 색: `DESIGN.md`의 검정 primary와 흰색 icon
- icon: Lucide `Sparkles`
- 위치: desktop은 Board 오른쪽 아래 20px, mobile은 safe area를 포함한 16px
- hover와 focus: tooltip 표시
- focus: 2px outline과 3px offset
- unread: 오른쪽 위 8px 상태점 하나
- disabled: native disabled 대신 `aria-disabled`를 사용해 keyboard focus와 이유 tooltip을 유지
- motion: 눌렀을 때 1px 이동만 허용, glow·gradient·bounce 금지

## 7. 새 열린 panel

### Desktop

- 화면 오른쪽 dock
- 폭: `clamp(376px, 30vw, 416px)`
- 위: Workspace bar 아래 64px
- 아래: 0
- Board와 경계: 왼쪽 1px hairline
- header: `AI Assistant`, 현재 문맥, 닫기 버튼
- status strip: icon, 상태 이름, 짧은 설명
- 대화만 scroll
- 입력창은 아래에 고정
- panel 안에 card를 다시 중첩하지 않음
- Terraform 비교 코드만 dark code block 사용

### Tablet과 Mobile

- 768px 이하에서 `100dvh` 전체 화면
- 오른쪽의 좁은 panel을 사용하지 않음
- focus가 panel 밖으로 빠지지 않게 순환
- 입력 영역 아래에 `env(safe-area-inset-bottom)` 적용
- 닫으면 런처로 focus 복귀

## 8. Board와 다른 도구의 관계

- AI와 Terraform·검사·배포 panel은 동시에 열리지 않는다.
- AI를 열면 Inspector를 닫는다.
- Terraform·검사·배포 panel이 열린 넓은 화면에서는 런처를 그 panel 왼쪽으로 옮긴다.
- 900px 이하에서는 작업 panel이 화면 대부분을 차지하므로, 작업 panel을 닫을 때까지 AI 런처를 숨긴다.
- 닫힌 런처는 가운데 하단 React Flow toolbar를 가리지 않는다.
- 현재 Board에는 MiniMap이 없지만, 나중에 MiniMap이 오른쪽 아래에 추가되면 런처 위치를 MiniMap 왼쪽으로 옮긴다.
- panel은 React Flow 내부 node가 아니라 Workspace의 fixed utility layer다.

## 9. 상태 계약

| 상태 | 화면 이름 | 설명 |
| --- | --- | --- |
| Empty | 대화 시작 전 | 아직 요청 없음 |
| Ready | 입력 가능 | 요청 가능 |
| Sending | 요청 보내는 중 | server로 전달 중 |
| Generating | 제안 만드는 중 | AI 응답 대기 중 |
| Preview | 제안 생성됨 | 아직 실제 상태에는 미적용 |
| Approval required | 적용 대기 | 사용자 적용 또는 취소 필요 |
| Error | 요청 실패 | 오류 문장과 다시 시도 가능 상태 |
| Disabled | 프로젝트가 필요함 | project context 없음 |
| Offline | 연결 확인 필요 | network 요청 차단 |
| Completed | 응답 완료 | 설명 또는 적용 결과 완료 |

상태는 색만 바꾸지 않는다. icon, 이름, 설명을 함께 보여준다.

## 10. 대화와 승인 표시

- 사용자 요청은 오른쪽의 짧은 검정 message surface로 표시한다.
- AI 설명은 왼쪽 정렬의 흰 surface로 표시한다.
- 오류는 error icon과 error 문장을 함께 표시한다.
- 변경 미리보기는 `제안 생성됨`으로 표시한다.
- 실제 적용 전에는 `적용 대기` action bar를 별도로 표시한다.
- 적용 성공은 `사용자가 적용함`으로 표시한다.
- 오래된 Board나 Terraform을 기준으로 만든 결과는 적용하지 않고 `적용 실패`로 표시한다.

## 11. Keyboard와 focus

- `Tab`으로 런처에 접근
- `Enter` 또는 `Space`로 열기
- 열리면 입력창으로 focus 이동
- 새 메시지가 생겨도 사용자의 현재 focus를 빼앗지 않음
- `Escape`로 닫기
- 닫으면 런처로 focus 복귀
- desktop dock은 Board keyboard를 막는 focus trap을 사용하지 않음
- mobile 전체 화면만 focus 순환 적용
- 생성 상태는 `aria-live="polite"`로 알림
- `prefers-reduced-motion`에서는 panel animation과 smooth scroll 제거

## 12. 요청 취소

생성 중지 버튼은 보이는 척만 하면 안 된다.

다음 요청에 모두 같은 `AbortSignal`을 전달한다.

- Architecture Draft
- Board patch preview
- patch 추가 질문
- Terraform 설명
- Terraform 오류 설명
- Design Simulation

오래된 요청의 `finally`가 새 요청 상태를 `idle`로 덮어쓰지 않도록 현재 `AbortController`가 같은 경우에만 정리한다.

## 13. 사용자 승인 경계

1. AI가 Architecture 또는 Terraform 변경안을 만든다.
2. Board 또는 코드 비교 화면에는 미리보기만 표시한다.
3. 사용자가 `Board에 적용` 또는 `수정 적용`을 누른다.
4. 적용 직전에 Board fingerprint와 Terraform 원본 코드를 다시 확인한다.
5. 기준이 달라졌으면 적용하지 않고 실패를 알린다.
6. AI는 Deployment를 실행하지 않는다.

## 14. 새 파일 구조

```text
apps/web/app/workspace/ai-dock/
  WorkspaceAiDock.tsx
  WorkspaceAiDockPanel.tsx
  workspace-ai-dock.module.css

apps/web/features/workspace/
  workspace-ai-dock-state.ts
  workspace-ai-dock-state.test.ts
  workspace-ai-dock-contract.test.ts
```

기존 기능 hook인 `apps/web/app/workspace/ai-assistant/use-workspace-ai-assistant.ts`는 화면이 아니라 대화와 API 상태를 소유하므로 재사용한다.

## 15. 구현 마일스톤

1. 기존 AI UI 완전 삭제
2. 이 설계 문서 작성
3. 새 런처와 desktop dock 구현
4. mobile 전체 화면과 focus 구현
5. 상태, 요청 취소, 승인 경계 연결
6. 자동 검증과 실제 browser QA
7. PR review 해결 후 `dev` 병합

## 16. 시각 QA 완료 조건

- 375px, 768px, 1280px 이상 확인
- 빈 Board와 Resource가 많은 Board 확인
- Inspector와 Terraform panel을 각각 연 뒤 AI 전환 확인
- 긴 대화와 긴 Terraform code 확인
- network offline과 API 오류 확인
- Sending, Generating, Preview, Approval, Completed 확인
- 닫고 다시 열어 대화와 입력 유지 확인
- `Escape` 닫기와 focus 복귀 확인
- 사용자 승인 전 Board와 Terraform 불변 확인
- browser console 새 error 0건
- 가로 overflow 0px

## 17. 복사하지 않을 것

- 다른 제품의 문구, 로고, icon 배치 그대로 복사
- Cloudscape 또는 shadcn component 코드 복사
- 보라색 gradient와 glow
- 큰 원형 AI 버튼
- 기능 없는 badge
- 가짜 streaming
- 사용자 승인 없는 자동 적용

## 18. 실제 구현과 화면 QA 결과

2026-07-12에 실제 `/workspace`에서 확인했다.

### 자동 검사

- Web 전체 테스트: 760개 통과
- 새 AI Dock 집중 테스트: 11개 통과
- lint: 통과
- typecheck: 통과
- build: 통과
- harness 검사: 통과

lint에는 다른 API 작업 파일에 이미 있던 미사용 인자 warning 1개가 남아 있다. 이번 AI Dock 변경에서 생긴 warning은 없다.

### 1280 x 720

- 런처: 44 x 44px
- 열린 panel: 384 x 656px
- panel을 열면 입력창으로 focus 이동
- `Escape`로 닫으면 런처로 focus 복귀
- 입력과 대화는 닫았다 열어도 유지
- Terraform 작업 panel이 열렸을 때 작업 panel 왼쪽 685px, 런처 오른쪽 672px으로 실제 겹침 없음

### 768 x 900

- panel: 화면 전체 768 x 900px
- 입력창 아래쪽: 882px로 화면 안에 유지
- 본문 가로 폭: 768px, 가로 넘침 없음
- 마지막 조작 요소에서 `Tab`을 누르면 닫기 버튼으로 focus 순환

### 375 x 812

- 런처: 오른쪽 16px, 아래 16px, 44 x 44px
- panel: 화면 전체 375 x 812px
- 입력창 아래쪽: 794px로 화면 안에 유지
- 본문과 대화 가로 폭: 375px, 가로 넘침 없음
- 작업 panel이 열리면 런처가 숨겨짐
- 닫힌 동안 AI 확인 질문이 도착하면 unread 상태점과 `읽지 않은 응답 있음` 이름 표시

### 실제 AI 흐름

1. `현재 API 앞에 ALB를 추가해줘` 요청
2. AI가 `API 입구` 등 필요한 확인 질문 표시
3. `API 입구` 선택 뒤 `제안 생성됨`, `적용 대기` 표시
4. Architecture Board의 Resource 수는 22개에서 미리보기 23개로만 표시
5. `취소` 뒤 다시 22개로 복원
6. `실제 상태는 바뀌지 않았습니다` 응답 확인

Terraform Preview 4,012자를 만든 뒤 AI 설명도 실제로 요청했다. 375px 화면에서 긴 설명을 받아도 대화 가로 넘침은 없었다.

API 처리를 잠시 멈춰 생성 중지 버튼도 실제로 확인했다. 요청 중에는 `aria-busy=true`와 `제안 만드는 중`이 표시됐고, 중지 뒤에는 `aria-busy=false`와 `입력 가능`으로 돌아왔다. API는 바로 다시 시작해 health `200`을 확인했다.

### QA 중 발견해서 고친 문제

1. Terraform 작업 panel과 런처가 겹치던 문제
   - 넓은 화면에서는 런처를 작업 panel 왼쪽으로 옮겼다.
   - 작은 화면에서는 작업 panel이 열린 동안 런처를 숨겼다.
2. 닫힌 동안 도착한 AI 확인 질문에 unread 점이 생기지 않던 문제
   - 일반 답변뿐 아니라 확인 질문도 unread 응답으로 처리했다.
3. 생성 중지 뒤 이전 AI 응답을 따라 `응답 완료`로 보이던 문제
   - 마지막 대화가 사용자 요청이면 `입력 가능`으로 표시한다.

### Browser console

새 error는 없었다. 개발 환경의 React DevTools 안내와 HMR 연결 log만 있었다.
