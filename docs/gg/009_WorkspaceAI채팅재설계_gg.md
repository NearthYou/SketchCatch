# Workspace AI 채팅 재설계

## 1. 한 줄 목표

Board 위에 떠 있는 AI 버튼과 채팅 패널을 새로 만들되, **AI가 사용자의 확인 없이 Board나 Terraform을 바꾸지 못하게 한다.**

## 2. 재설계 시작 당시 상태와 문제

예전 `WorkspaceAiChatDock` 화면은 UI 삭제 작업에서 제거됐다. 재설계를 시작할 당시 `/workspace`에는 실제 AI 버튼이나 패널이 없었다.

당시 남아 있던 것은 화면이 아니라 기능이었다.

- 자연어로 Architecture 초안 만들기
- 현재 Board 수정안 미리보기
- Terraform 코드와 오류 설명
- 안전하게 고칠 수 있는 Terraform 수정안
- 음성 입력
- 대화 저장
- 사용자가 적용을 눌렀을 때만 Board 변경

그래서 예전 JSX와 CSS를 되살리지 않고, 남아 있던 API와 상태 계산 코드만 새 화면에 연결하기로 했다.

## 3. 실제로 조사한 레퍼런스

임시 clone 위치는 `/tmp/sketchcatch-ai-chat-references`다. 이 폴더는 제품 저장소에 넣지 않는다.

| 저장소 | 확인한 commit | 읽은 주요 파일 |
| --- | --- | --- |
| Cloudscape Components | `3f01803` | `src/split-panel/side.tsx`, `src/split-panel/styles.scss`, `src/split-panel/utils/size-utils.ts`, `src/prompt-input/internal.tsx`, `src/button-dropdown/tooltip.tsx` |
| Cloudscape Board Components | `8d95412` | `pages/with-app-layout/app-layout.tsx`, `src/internal/resize-handle/index.tsx`, `src/internal/resize-handle/styles.scss` |
| Cloudscape Examples | `35055cf` | `chat-ui-vite/src/components/chat-ui/chat-ui.tsx`, `chat-ui-input-panel.tsx`, `chat-ui-vite/src/styles/chat-ui.module.scss` |
| React Flow Examples | `9593bb5` | `reactflow-nextjs-app-router/src/components/Flow.tsx`, `reactflow-vite/src/App.tsx` |
| shadcn-admin | `e16c87f` | `src/components/ui/sheet.tsx`, `src/components/ui/tooltip.tsx`, `src/features/chats/components/new-chat.tsx` |

공개 화면은 Brainboard 로그인 화면, Figma 공개 화면, Miro 공개 화면, CloudMaker 공개 화면을 브라우저에서 확인했다. 로그인 없이 실제 편집기에 들어갈 수 없는 제품은 내부 편집기 수치를 추측하지 않았다.

확인한 공개 DOM 수치:

- Figma 고정 header: 78px
- Miro header: 72px
- Miro 주요 버튼: 높이 40px, radius 8px
- CloudMaker 고정 header 영역: 약 130px
- Cloudscape side split panel: 기본 폭은 viewport의 약 1/3
- Cloudscape resize hit area: 18px
- Cloudscape chat input: 최대 6줄

레퍼런스의 문구, 브랜드, 이미지, HTML은 복사하지 않는다. panel 구조, focus 흐름, 입력 고정 방식만 참고한다.

## 4. 닫힌 AI 런처

- 크기: 44px x 44px
- 형태: radius 10px의 compact square
- 배경: `DESIGN.md`의 검정 primary 색
- 기본 표시: 아이콘만 표시
- hover와 keyboard focus: `AI 채팅 열기` tooltip 표시
- focus: 흰색 안쪽 선과 검정 바깥 선을 함께 보여 배경과 관계없이 찾을 수 있게 함
- 응답 완료를 사용자가 아직 보지 않았다면 작은 상태점만 표시
- 프로젝트가 없으면 disabled 처리하고 이유를 tooltip으로 알림
- glow, gradient, bounce animation은 사용하지 않음

위치는 Board 오른쪽 아래를 기준으로 하되 Inspector와 작업 패널이 열리면 그 왼쪽으로 이동한다. React Flow 확대·축소 버튼과 minimap 영역을 가리지 않는다.

## 5. 열린 AI 패널

### Desktop

- 오른쪽 dock처럼 열림
- 폭: `clamp(360px, 31vw, 420px)`
- Board와 panel 사이에 1px divider
- Inspector가 열려 있으면 Inspector 왼쪽에 위치
- Terraform·검사·배포 작업 패널과 동시에 펼치지 않음
- header: `AI Assistant`, 현재 문맥, 닫기 버튼
- 본문: 대화와 미리보기
- 하단: 입력창과 전송·중지·음성 버튼
- 입력창은 하단에 고정하고 대화만 스크롤

### Tablet과 Mobile

- 768px 이하에서는 오른쪽의 얇은 panel을 사용하지 않음
- 상단 Workspace bar 아래를 채우는 전체 화면 assistant로 전환
- 입력창 아래에 `env(safe-area-inset-bottom)` 여백 적용
- 모바일 키보드가 입력창을 가리지 않도록 `100dvh` 사용
- 닫으면 Board로 돌아가고 focus는 런처로 복귀

## 6. Board와 다른 패널의 관계

- AI와 Terraform·검사·배포 panel 중 하나만 크게 열 수 있다.
- AI panel이 열려도 왼쪽 Resource panel은 그대로 사용할 수 있다.
- Inspector가 열리면 AI panel과 런처를 Inspector 왼쪽으로 이동한다.
- AI panel은 React Flow 내부가 아니라 Board 바깥 floating layer에 둔다.
- AI panel을 닫아도 대화, 생성한 미리보기, 입력 중인 문장은 유지한다.

## 7. 상태 표시

| 상태 | 화면에 보이는 말 | 의미 |
| --- | --- | --- |
| Empty | 아직 대화가 없습니다 | 첫 요청 전 |
| Ready | 입력 가능 | 요청 가능 |
| Sending | 요청 보내는 중 | 서버에 요청 전달 중 |
| Generating | 제안 만드는 중 | AI 응답 생성 중 |
| Preview | 제안 생성됨 | Board 또는 코드에 아직 미적용 |
| Approval required | 적용 대기 | 사용자가 적용 또는 취소 선택 |
| Error | 요청 실패 | 다시 시도 가능 |
| Disabled | 프로젝트가 필요함 | 필요한 문맥 없음 |
| Offline | AI 연결을 사용할 수 없음 | fallback 또는 연결 불가 |
| Completed | 응답 완료 | 설명 생성 완료 |

색만으로 상태를 구분하지 않는다. 아이콘, 짧은 상태 이름, 설명을 함께 표시한다.

## 8. Keyboard와 focus

- `Tab`으로 런처에 이동 가능
- `Enter` 또는 `Space`로 열기
- 열리면 입력창으로 첫 focus 이동
- `Escape`로 닫기
- 닫으면 런처로 focus 복귀
- desktop dock은 Board의 keyboard 조작을 막는 focus trap을 사용하지 않음
- mobile 전체 화면에서는 화면 밖으로 focus가 빠지지 않게 관리
- 생성 상태는 `aria-live="polite"`로 알림
- `prefers-reduced-motion`이면 panel 전환 animation 제거

## 9. 기존 기능과 승인 경계

재사용할 기능:

- `features/workspace/api.ts`의 AI API
- `workspace-ai-diagram-adapter.ts`
- `workspace-ai-chat-history.ts`
- `workspace-ai-chat-routing.ts`
- `workspace-ai-patch-preview.ts`
- `workspace-terraform-ai.ts`

반드시 지킬 경계:

1. AI가 초안이나 수정안을 만든다.
2. Board에는 미리보기만 표시한다.
3. 사용자가 `Board에 적용`을 눌러야 실제 Board를 바꾼다.
4. Terraform 수정도 현재 코드와 바뀔 코드를 먼저 보여준다.
5. 사용자가 `수정 적용`을 눌러야 실제 코드를 바꾼다.
6. Deployment는 AI가 실행하지 않는다.

## 10. 수정할 파일

- `apps/web/app/workspace/WorkspaceProjectClient.tsx`
- `apps/web/app/workspace/operations/WorkspaceOperationsDock.tsx`
- `apps/web/app/workspace/operations/use-workspace-terraform.ts`
- 새 `apps/web/app/workspace/ai-assistant/` 폴더
- 관련 test

## 11. 구현 마일스톤

1. 현재 구조와 레퍼런스 조사, 이 문서 작성
2. 새 런처와 tooltip, 충돌 없는 위치 구현
3. desktop AI dock과 실제 대화·미리보기 연결
4. mobile 전체 화면, focus, keyboard 처리
5. Empty, loading, error, approval 상태 연결
6. test, typecheck, lint, build, 실제 route 브라우저 QA

마일스톤마다 구현과 검증이 끝나면 바로 커밋한다.

## 12. 시각 QA 완료 조건

- 375px, 768px, 1280px 이상에서 확인
- 빈 Board와 Resource가 많은 Board에서 확인
- 왼쪽 panel, Inspector, 작업 panel을 각각 열고 겹침 확인
- 긴 대화, 긴 Terraform 코드, 오류, 생성 중, 승인 대기 확인
- panel을 닫고 다시 열어도 대화가 남는지 확인
- 승인 전 Board와 Terraform이 바뀌지 않는지 확인
- browser console과 실패한 network 요청 확인

## 13. 그대로 복사하지 않을 것

- Brainboard, Figma, Miro, CloudMaker의 문구와 브랜드
- Cloudscape component 코드 전체
- shadcn의 Radix dependency
- 보라색 AI gradient, glow, 큰 원형 버튼
- 기능이 없는 badge와 가짜 성공 상태

## 14. 구현 결과

- 44px 검정 rounded-square 런처를 실제 `/workspace`에 연결함
- desktop AI panel 폭을 360~420px로 제한함
- 768px 이하에서 전체 폭 assistant로 전환함
- AI를 열면 Inspector와 작업 panel을 접어 Board 폭을 확보함
- Terraform·검사·배포 panel과 AI panel이 동시에 펼쳐지지 않게 함
- 자연어 Architecture 생성과 현재 Board 수정 미리보기를 연결함
- 추가 질문의 일반 선택지와 Resource ID 선택을 구분함
- Terraform Preview와 Terraform 오류 설명을 연결함
- 안전한 Terraform 수정안은 사용자가 승인해야 적용되게 함
- 설계 시뮬레이션과 음성 입력을 연결함
- 대화, 입력, 미리보기는 panel을 닫아도 유지함
- `Escape` 닫기와 런처 focus 복귀를 연결함
- online/offline, 생성 중, 오류, 적용 대기 상태를 구분함

## 15. 실제 검증 결과

브라우저에서 실제 로그인 프로젝트로 아래 흐름을 확인했다.

```text
AI 런처 열기
→ 자연어 수정 요청
→ AI 추가 질문
→ 선택지 답변
→ Board 변경 미리보기
→ 취소
→ 미리보기 Resource가 사라지고 실제 Board는 유지됨
```

```text
AI panel 열기
→ Terraform 설명
→ 현재 Board에서 Terraform 코드 생성
→ 실제 설명 응답 표시
```

추가 확인:

- 375 x 812: 전체 폭 assistant, 입력창과 닫기 버튼 표시, 가로 잘림 없음
- 768 x 1024: 전체 폭 assistant, 긴 대화 scroll과 하단 입력창 표시
- 1280px 이상: 오른쪽 dock, Board 하단 확대·축소 도구 표시
- `Escape`로 닫은 뒤 focus가 AI 런처로 돌아옴
- AI panel을 열면 Terraform 작업 panel이 닫힘
- Terraform 작업 panel을 열면 AI panel이 닫힘
- Inspector와 작업 panel이 열린 상태에서 AI를 열면 두 panel이 접히고 Board 폭이 확보됨
- 새 browser console error 없음

자동 검증:

```text
web test: 759개 통과
web lint: 통과
web typecheck: 통과
web production build: 통과
```

브라우저의 기존 React Flow resize 경고는 개발 중 route reload 순간에만 기록됐고, 이번 AI panel에서 새로 발생한 오류는 아니다.
