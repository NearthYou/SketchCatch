# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 2026-07-03 최신 핸드오프 - Natural Language Diagramming 결정사항 재감사

### 현재 검증된 것

- Natural Language Diagramming은 `/workspace/ai` 별도 화면이 아니라 `/workspace` 보드 안의 오른쪽 AI 패널에서 동작한다. `/workspace/ai`는 `/workspace`로 redirect한다.
- 자연어 Requirement Prompt가 우선이고, 보조 선택은 자연어가 모호할 때만 사용된다.
- 보조 선택 기본값은 `auto`이며 UI 라벨은 `자연어 기준으로 자동 판단`이다.
- 자연어와 선택지가 충돌하면 자연어/대체 시나리오가 우선되고 `selection_overridden_by_prompt` 경고가 표시된다.
- 같은 요청은 같은 `ArchitectureJson`을 반환한다. LLM 설명 문구는 결정성 기준 밖이다.
- 규칙 엔진은 고정 템플릿으로 `static_site`, `api_server`, `backend_with_db`, `server_storage`, `serverless_function` 초안을 만든다.
- 생성 node type은 `UNKNOWN` 없이 지원 ResourceType만 사용한다.
- Lambda/서버리스 프롬프트는 `LAMBDA` 초안을 생성한다.
- Redis, SQS/SNS/EventBridge/Step Functions 등 지원 밖 리소스는 제외 경고를 남기고, DynamoDB/NoSQL은 RDS 대체 경고를 남긴다.
- 초안은 workspace 보드에 반투명 preview로 먼저 표시되고, preview 중 보드 편집은 read-only로 잠긴다.
- preview 중 사용자는 카드 안의 `생성`, `취소`, `다시 생성`만 사용할 수 있다.
- `생성`은 전체 보드 교체로 적용하고 preview를 제거한다. `취소`는 preview만 제거한다.
- 기존 보드에 리소스가 있으면 `board_replacement_required` 경고가 AI 초안 카드 하단에 표시된다.

### 이번 세션의 변경 사항

- `serverless_function` 시나리오와 Lambda 고정 템플릿을 추가했다.
- `/workspace/ai` route를 `/workspace` redirect로 바꿨다.
- Workspace AI 패널 제목을 Natural Language Diagramming 방향으로 정리하고, preview 상태의 추가 생성 버튼을 숨겼다.
- 미지원 리소스 감지/대체 규칙을 보강하고, 관련 API/Web/adapter 테스트를 추가했다.
- `docs/data-models.md`에 시나리오, 지원 ResourceType, guardrail warning 계약을 기록했다.

### 검증

- `apps/api/src/routes/ai.test.ts` - 25 tests passed.
- `workspace-ai-guardrail-warning.test.ts` - 3 tests passed.
- `workspace-resource-chip-class.test.ts` - 3 tests passed.
- `workspace-ai-diagram-adapter.test.ts` - 9 tests passed.
- `flow-mappers.test.ts` - 7 tests passed.
- `npm exec --package=pnpm@11.8.0 -- pnpm harness:check`, `lint`, `typecheck`, `build` - passed.

### 아직 주의할 점

- Patch preview/apply는 미래 확장으로만 남아 있다. 현재 생성 적용은 전체 교체다.
- Existing unrelated change: `apps/web/next-env.d.ts` remains unstaged.

## 2026-07-03 최신 핸드오프 - 지원 불가 요구사항 대체 생성

### 현재 검증된 것

- 자연어 다이어그램 생성은 지원 범위 밖 리소스 요구를 감지하면 가능한 경우 지원 리소스 초안으로 대체한다.
- `EKS/Kubernetes`, `ECS/Fargate`, `ALB/Auto Scaling` 요구는 단일 EC2/API 서버 초안으로 대체되고 `unsupported_requirement_substituted` 경고가 표시된다.
- `멀티 리전` 요구는 단일 리전 초안으로 대체했다는 경고를 남긴다.
- `CI/CD 자동 구성`, 실시간 비용/보안 보장, 조직 내부 시스템 연동처럼 보드 리소스로 대체할 수 없는 요구는 기존처럼 제외 경고를 남긴다.
- 선택지가 다른 값이어도 자연어에서 대체 가능한 요구가 감지되면 대체 시나리오가 우선된다.
- 공식 검증: `npm exec --package=pnpm@11.8.0 -- pnpm harness:check`, `lint`, `typecheck`, `build`가 모두 통과했다.

### 이번 세션의 변경 사항

- `packages/types/src/index.ts`에 `unsupported_requirement_substituted` warning code를 추가했다.
- `apps/api/src/services/aiArchitectureScenarioResolution.ts`에 지원 불가 요구사항 대체 규칙과 대체/제외 경고 분기 로직을 추가했다.
- `apps/api/src/routes/ai.test.ts`에서 대체 생성 경고, 선택지보다 자연어 대체가 우선되는 동작, 애매한 기본 fallback이 발생하지 않는 동작을 검증했다.
- `apps/web/features/workspace/WorkspaceAiPanelPieces.tsx`와 관련 테스트에 새 경고 라벨을 추가했다.

### 아직 주의할 점

- Patch mode는 아직 없다. 현재 `생성`은 전체 보드 교체다.
- 기존 unrelated 변경인 `apps/web/next-env.d.ts`는 이번 작업 범위 밖이라 건드리지 않았다.
- `pnpm`은 현재 shell PATH에 없어서 공식 검증은 `npm exec --package=pnpm@11.8.0 -- pnpm ...`로 실행했다.

## 2026-07-03 최신 핸드오프 - 자연어 우선 Architecture Draft 미리보기

### 현재 검증된 것

- Workspace AI Architecture Draft는 자연어 프롬프트 단서를 선택지보다 우선한다.
- 프롬프트가 모호하고 선택지도 `auto`이면 기본 `api_server` 초안을 만들고 `ambiguous_prompt_fallback` 경고를 남긴다.
- 지원 범위 밖 요구사항은 리소스로 만들지 않고 `unsupported_resource_omitted` 경고를 남긴다.
- 지원 가능한 단서와 미지원 요구가 섞이면 지원 가능한 부분만 만들고 `partial_generation` 경고를 남긴다.
- 같은 요청은 같은 `ArchitectureJson`을 반환한다. LLM 설명은 별도 보조 설명이다.
- Workspace AI 초안은 실제 workspace 보드에 반투명 preview로 표시된다.
- preview 중 보드 드래그, 드롭, 연결, 선택 편집, 삭제, 복사/붙여넣기는 막힌다.
- 사용자가 `생성`을 누르면 preview가 실제 보드로 전체 교체 적용된다. `취소`와 `다시 생성`도 제공된다.
- 기존 보드에 리소스가 있으면 카드 하단에 전체 교체 경고가 표시된다.
- 공식 검증: `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 모두 통과했다.

### 이번 세션의 변경 사항

- `packages/types/src/index.ts`에 Architecture Draft 경고 코드들을 추가했다.
- `apps/api/src/services/aiArchitectureScenarioResolution.ts`를 자연어 우선 rule-based 결정기로 정리했다.
- `apps/api/src/services/aiArchitectureDraftMetadata.ts`에서 보안 config 조정, 예산, 부분 생성 경고 문구를 한국어로 정리했다.
- `apps/web/features/workspace/WorkspaceAiPanel.tsx`에서 초안 생성과 보드 적용을 분리하고 preview 생성/취소/재생성 흐름을 구현했다.
- `apps/web/features/diagram-editor/*`에 preview diagram 상태, 읽기 전용 flow mapper, 반투명 노드/엣지 스타일, preview 안내 배지를 추가했다.
- 관련 API/Web 테스트를 자연어 우선, 결정적 `ArchitectureJson`, preview read-only 계약에 맞춰 갱신했다.

### 아직 깨졌거나 미검증된 것

- Patch mode는 아직 없다. 현재 `생성`은 의도적으로 전체 보드 교체다.
- Browser 수동 확인은 하지 않았다. 단위 테스트, 타입체크, lint, build로 검증했다.
- 기존 unrelated 변경 `apps/web/next-env.d.ts`는 이번 작업 전부터 있었고 건드리지 않았다.
- `git diff --check`는 통과했지만 Windows line-ending warning을 출력했다.

### 다음으로 최선의 행동

- Patch-preview mode를 추가한다. 패치된 모습만 반투명으로 보여주고 사용자가 승인할 때만 실제 보드에 반영한다.
- 브라우저에서 Workspace AI 패널로 초안 생성, 취소, 다시 생성, 생성 적용 흐름을 수동 확인한다.

## 현재 검증된 것

- `pnpm harness:check`가 중복 상세 기획 문서 정리 후 통과했다.
- `git diff --check`가 중복 상세 기획 문서 정리 후 통과했다.
- 삭제 대상 문서 참조가 repo 전체에서 더 이상 나오지 않는다.
- `pnpm harness:check`가 방어형 포지셔닝 문장 제거 후 통과했다.
- `git diff --check`가 방어형 포지셔닝 문장 제거 후 통과했다.
- 요청받은 방어형 포지셔닝/낮은 숙련도 중심 검색어가 repo 전체에서 더 이상 나오지 않는다.
- `pnpm harness:check`가 타깃 사용자 표현 보정 후 통과했다.
- `git diff --check`가 타깃 사용자 표현 보정 후 통과했다.
- `pnpm harness:check`가 상세 기획서 추가 후 통과했다.
- `git diff --check`가 상세 기획서 변경 후 통과했다.
- `scripts/init-harness.ps1` 기본 실행이 통과했다.
- `pnpm harness:check`가 통과했다.
- `feature_list.json`은 PowerShell `ConvertFrom-Json`과 Node JSON parse를 통과했다.
- docs H1 scan에서 H1 없는 markdown 파일이 더 이상 나오지 않았다.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`가 모두 통과했다.
- `HARNESS-001`부터 `HARNESS-006`까지 `passing` evidence가 기록되었다.

## 이번 세션의 변경 사항

- 별도 재구성본 파일과 관련 기록을 삭제했다.
- `docs/README.md`에서 별도 재구성본 링크와 문서 정리 기준을 삭제했다.
- `docs/product.md`, `docs/000_상세기획서.md`의 대상 사용자 소개에서 부정형/방어형 포지셔닝 문장을 삭제했다.
- `docs/product.md`, `docs/000_상세기획서.md`의 타깃 사용자 표현을 플랫폼/DevOps 엔지니어와 기술 리드/SRE까지 포함하는 톤으로 바꿨다.
- `docs/gg/003_기획서.md`의 담당자별 참고 문서 타깃 사용자도 같은 방향으로 조정했다.
- `docs/sw/003_테라폼동기화구조설명_sw.md`의 사용자 수준을 나누는 표현을 `사용자 관점/구현 관점`으로 바꿨다.
- `docs/000_상세기획서.md`를 추가했다.
- 상세 기획서에는 서비스 정의, 문제 정의, 현재 구현 상태, 핵심 서비스 여정, 기능 요구사항, 4인 책임 분배, Representative Use Journey, 보안/운영 정책, 성공 기준, 검증 전략, 리스크, 구현 순서를 담았다.
- `docs/README.md`에 상세 기획서 링크와 책임 설명을 추가했다.
- `docs/product.md`에 상세 기획서 참조 링크를 추가했다.
- `docs/adr`, `docs/ck`, `docs/sw`, `docs/ys`에 README 인덱스를 추가했다.
- `docs/README.md`의 담당자별 참고 문서 표를 폴더별 인덱스로 연결했다.
- `docs/AGENTS.md`에 담당자별 참고 문서 추가/변경 시 인덱스 갱신 규칙을 추가했다.
- H1이 없던 `docs/gg/004_역할분배.md`, `docs/ys/006-로그인&익명로그인_삭제관련.md`에 제목을 추가했다.
- root `AGENTS.md`에 Harness Operating Loop를 추가했다.
- 루트에 `agent-progress.md`, `feature_list.json`, `session-handoff.md`, `clean-state-checklist.md`, `evaluator-rubric.md`, `quality-document.md`를 추가했다.
- `scripts/check-harness.mjs`와 `scripts/init-harness.ps1`를 추가해 시작 기준선과 하네스 규칙을 검사한다.
- `docs/README.md`에 하네스 파일을 문서 map과 SSOT 우선순위에 추가했다.

## 아직 깨졌거나 미검증된 것

- `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 이번 상세 기획서 작업 후에는 실행하지 않았다.
- `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.
- Turbo는 체크를 통과하지만 sandbox git user 때문에 dubious ownership warning을 출력한다.
- 기존 unrelated 변경 `apps/web/next-env.d.ts`는 이 세션에서 건드리지 않았다.
- 이번 docs 정리는 삭제/이동 없이 인덱스 추가와 제목 보강으로 제한했다.

## 다음으로 최선의 행동

- 공유 문서에서 사용자군 설명이 과하게 방어적으로 읽히지 않는지 팀 피드백을 확인한다.
- `docs/000_상세기획서.md`의 "개발자가 바로 잡아야 할 구현 순서"에서 하나의 workstream을 골라 구현한다.
- `HARNESS-007`로 넘어가 Representative Use Journey의 최소 smoke를 정의한다. 실제 AWS apply/destroy는 사용자 승인과 cleanup plan 없이는 실행하지 않는다.

## 건드리지 말아야 할 것

- `.env`, private key, AWS credential, DB password, real access token
- 사용자 승인 없는 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff
- 사용자 확인 없는 Voice Requirement Input 또는 AI 제안의 Practice Architecture 반영

## 참고 명령

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1 -Verify
pnpm lint
pnpm typecheck
pnpm build
```
## 2026-07-03 최신 핸드오프 - Architecture Draft 화살표 렌더링 수정

### 현재 검증된 것
- AI 초안 `ArchitectureJson.edges`는 보드 `DiagramEdge`로 변환될 때 source/target handle ID를 갖는다.
- 생성 edge는 노드 위치를 기준으로 `handle-left/right/top/bottom` 중 자연스러운 연결점을 자동 선택한다.
- preview/locked 상태에서도 React Flow의 edge 위치 계산용 handle DOM은 유지되고, 사용자 연결 생성만 비활성화된다.
- 관련 테스트와 web build가 통과했다.

### 이번 세션 변경 사항
- `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`에서 생성 edge에 기본 handle을 부여했다.
- `apps/web/features/diagram-editor/DiagramNodeView.tsx`에서 preview/locked 상태의 handle 렌더링 방식을 바꿨다.
- `apps/web/features/diagram-editor/diagram-editor.module.css`에 비활성 handle 숨김 규칙을 추가했다.
- `apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts` 기대값에 handle 계약을 추가했다.

### 아직 주의할 점
- `npm exec --package=pnpm@11.8.0 -- pnpm ...` 체크는 npm cache/network 접근이 `ENOTCACHED`로 실패했다.
- root `turbo build`는 package manager binary를 찾지 못해 실패했지만, 변경 영향이 있는 web build는 직접 통과했다.
- 기존 unrelated 변경인 `apps/web/next-env.d.ts`는 건드리지 않았다.
## 2026-07-03 최신 핸드오프 - Security Group area 포함관계 수정

### 현재 검증된 것
- AI 생성 다이어그램에서 `securityGroupIds`가 있는 EC2/RDS 같은 리소스는 참조된 Security Group area 아래에 배치된다.
- Security Group area는 보호 대상 리소스가 사용하는 Subnet 아래에 배치된다.
- `aws_security_group.security_group.id`, `aws_subnet.subnet.id` 같은 Terraform reference도 보드 노드 참조로 해석된다.
- area box는 오른쪽/아래뿐 아니라 왼쪽/위쪽으로도 확장되어 child node를 실제로 감싼다.
- `VPC > Subnet > Security Group > Resource` 포함관계가 adapter 테스트로 검증됐다.

### 이번 세션 변경 사항
- `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`에서 security boundary parent 결정 로직을 추가했다.
- `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`에서 Terraform reference 기반 parent lookup을 추가했다.
- `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`에서 area fitting을 bounds 기반으로 바꿨다.
- `apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts`에서 SG containment 기대값과 실제 containment assertion을 추가했다.

### 아직 주의할 점
- 현재 shell에서 `pnpm`이 없어 `pnpm harness:check`와 `scripts/init-harness.ps1`은 실패했다. `node scripts/check-harness.mjs`, lint, typecheck, web build는 통과했다.
- 기존 unrelated 변경인 `apps/web/next-env.d.ts`는 건드리지 않았다.
