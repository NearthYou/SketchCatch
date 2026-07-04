# Blueprint 리디자인 구현 마일스톤

## 마일스톤 1. 기준 확인과 자산 준비

우선순위: P0

- `design/sw/146-blueprint-redesign` 브랜치에서 작업한다.
- 구현 전 `pnpm harness:check`를 통과시킨다.
- `SpoqaHanSansNeo_all.zip`에서 subset `woff2` 파일만 추출한다.
- `Space Grotesk`, `JetBrains Mono`의 필요한 `woff2` weight를 내려받는다.
- 폰트 license를 확인하고 `apps/web/public/fonts/` 아래에 정리한다.
- `docs/sw/spec2.md`, `docs/sw/plan2.md`, `docs/sw/agents2.md`를 구현 기준으로 둔다.

완료 기준:

- 폰트 파일 목록과 경로가 확정되어 있다.
- 외부 런타임 폰트 fetch 없이 self-host 적용이 가능하다.
- 작업 시작 baseline이 기록되어 있다.

## 마일스톤 2. Blueprint 토큰과 전역 리셋 적용

우선순위: P0

- `apps/web/app/globals.css`에 Blueprint color, typography, radius, motion 토큰을 추가한다.
- `@font-face`로 Spoqa Han Sans Neo, Space Grotesk, JetBrains Mono를 연결한다.
- `body`, heading, button, input, select의 기본 폰트와 줄바꿈 규칙을 정리한다.
- `.bp-grid`, `.bp-panel`, `.bp-bracket`, `.bp-titleblock`, `.bp-badge`, `.bp-chip`, `.bp-btn`, `.bp-input` primitive를 추가한다.
- 기존 dark gradient polish와 중복되는 전역 override를 정리한다.

완료 기준:

- 전역 토큰이 기존 화면을 깨지 않으면서 적용된다.
- 한글 단어가 중간에서 부자연스럽게 끊기지 않는다.
- 폰트가 로컬 정적 자산으로 로드된다.

## 마일스톤 3. Architecture Board 핵심 화면 재스킨

우선순위: P0

- `resource-settings` catalog의 일반 리소스 기본 크기를 `124x96`으로 변경한다.
- 관련 resource catalog 테스트 기대값을 갱신한다.
- `diagram-editor.module.css`의 shell, rail, palette, canvas, toolbar, node, handle 스타일을 Blueprint 토큰으로 바꾼다.
- React Flow background를 Blueprint grid와 조화되게 조정한다.
- VPC/Subnet/Security Group 영역 노드의 큰 컨테이너 성격은 유지한다.
- `ParameterInputPanel.module.css`를 Blueprint inspector 스타일로 맞춘다.

완료 기준:

- 새 일반 리소스 노드가 `124x96`으로 생성된다.
- 기존 저장 노드는 마이그레이션 없이 깨지지 않는다.
- 노드가 icon, label, type 중심으로 읽힌다.
- 파라미터 값은 노드에 직접 노출되지 않는다.

## 마일스톤 4. Deployment Safety Gate 완성도 강화

우선순위: P0

- `DeploymentPanel`의 preflight summary를 HIGH/MED/LOW gate card로 재구성한다.
- `isBlocked`, `blockedBy`, `blockedReason`을 gate 상태 copy와 badge로 표현한다.
- `planSummary`의 create/update/delete/replace count와 warnings를 Blueprint plan block으로 표시한다.
- `getDeploymentActionState`는 변경하지 않는다.
- Apply/Destroy confirmation은 현재 안전 문구와 실행 조건을 유지하되 Blueprint style로 정리한다.
- 로그와 결과 패널은 mono console 톤으로 다듬는다.

완료 기준:

- blocked 상태가 의도된 안전 잠금으로 명확히 보인다.
- HIGH/MED/LOW finding이 시각적으로 구분된다.
- Apply/Destroy 버튼 조건은 기존 테스트와 동일하게 유지된다.

## 마일스톤 5. Marketing 재구성

우선순위: P1

- `/`를 밝은 Blueprint landing으로 재구성한다.
- hero에 brand, service positioning, schematic, titleblock을 배치한다.
- 서비스 여정 `Requirement Input -> Architecture Board -> IaC Preview -> Safety Gate -> Deployment History`를 첫 화면 이후 바로 이어서 보여준다.
- feature, safety, principles 섹션을 제품 방향과 맞는 문구로 작성한다.
- metadata description을 multi-cloud-ready IaC operations 톤으로 정리한다.

완료 기준:

- 랜딩이 dark floating object 스타일을 더 이상 사용하지 않는다.
- AWS-only로 읽히는 상위 문구가 제거된다.
- Safety Gate가 랜딩에서도 핵심 신호로 보인다.

## 마일스톤 6. Auth 화면 정합성 적용

우선순위: P1

- `/login`, `/signup`, `/password-reset` 라우트를 유지한다.
- 각 page wrapper를 공통 auth split layout으로 맞춘다.
- 우측 aside에 Blueprint schematic과 Safety Gate titleblock을 배치한다.
- 기존 form 검증, OAuth, 약관, 중복 확인, reset flow는 유지한다.
- form field, social button, message, legal dialog를 Blueprint 토큰으로 정리한다.

완료 기준:

- 로그인, 회원가입, 비밀번호 재설정 흐름이 기존처럼 동작한다.
- 세 Auth 화면이 같은 레이아웃과 시각 언어를 가진다.

## 마일스톤 7. Dashboard와 프로젝트 카드 재스킨

우선순위: P1

- Dashboard shell, sidebar, topbar, nav active state를 Blueprint 스타일로 바꾼다.
- Project card와 `ProjectArchitectureThumbnail`을 mini schematic처럼 보이게 한다.
- 가능한 데이터로만 `BLOCKED`, `OK`, `DEPLOYED`, `DRAFT`, `READY` 상태를 표시한다.
- 새 API나 shared type은 추가하지 않는다.
- Projects, Templates, Settings, Costs 화면의 공통 dashboard primitive도 같은 토큰으로 맞춘다.

완료 기준:

- Dashboard가 밝은 Blueprint 운영 화면처럼 보인다.
- 상태 badge가 실제 데이터가 없을 때도 오해를 만들지 않는다.
- 기존 프로젝트 목록/삭제 메뉴 동작이 유지된다.

## 마일스톤 8. 반응형과 줄바꿈 품질 점검

우선순위: P1

- desktop, tablet, mobile 폭에서 주요 화면을 확인한다.
- 버튼, 카드, 노드, 패널에서 텍스트가 겹치지 않게 조정한다.
- 긴 한국어 문장, 영어 resource type, URL/hash가 각각 자연스럽게 줄바꿈되는지 확인한다.
- fixed-format 요소에는 안정적인 width, min-width, aspect-ratio, grid track을 둔다.

완료 기준:

- 단어와 문장이 부자연스럽게 끊겨 보이지 않는다.
- 모바일에서 주요 버튼과 패널 내용이 부모 밖으로 넘치지 않는다.

## 마일스톤 9. 자동 검증과 브라우저 스모크

우선순위: P0

- `pnpm harness:check`를 다시 실행한다.
- `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web lint`를 실행한다.
- `npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/web typecheck`를 실행한다.
- 전체 `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행한다.
- dev server를 띄우고 `/`, `/login`, `/signup`, `/mypage`, `/workspace/new`를 브라우저로 확인한다.
- 실제 AWS apply/destroy는 실행하지 않는다.

완료 기준:

- 필수 정적 체크가 통과한다.
- 브라우저 스모크에서 빈 화면, 깨진 폰트, 캔버스 미렌더, 텍스트 겹침이 없다.

## 마일스톤 10. 기록, 커밋, PR 준비

우선순위: P2

- `agent-progress.md`에 변경 내용, 검증, 리스크, 다음 행동을 기록한다.
- 다음 세션에 넘길 내용이 있으면 `session-handoff.md`를 갱신한다.
- `feature_list.json`의 `HARNESS-007` 상태는 건드리지 않는다.
- 변경 파일과 폰트 자산 diff를 검토한다.
- PR 제목은 `Design: Blueprint 리디자인 적용` 형식으로 작성한다.
- PR 본문은 한국어로 작성하고 이슈 `#146`, 변경 요약, 검증 결과, 미실행 항목을 포함한다.

완료 기준:

- 리뷰어가 문서와 PR 본문만 보고 변경 의도와 안전 경계를 이해할 수 있다.
- 불필요한 generated/no-op 변경이 없다.
