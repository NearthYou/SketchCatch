# 에이전트 진행 로그

이 파일은 새 세션이 이전 대화 기억 없이도 저장소의 현재 작업 상태를 복구하기 위한 지속 상태다. 제품 범위의 정답은 `docs/product.md`, 계약의 정답은 `docs/data-models.md`, 실행 경계의 정답은 `docs/architecture.md`에 둔다. 이 파일은 "지금 에이전트 작업이 어디까지 검증되었는가"만 기록한다.

## 현재 검증된 상태

- Repository root directory: `./` (local repository root)
- Standard startup path: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1`
- Standard verification path for code/infrastructure changes: `pnpm lint`, `pnpm typecheck`, `pnpm build`
- Lightweight harness verification: `pnpm harness:check` or `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1`
- Current harness feature list: `feature_list.json`
- Current handoff note: `session-handoff.md`
- Highest priority unfinished harness feature: `HARNESS-007`
- Current blocker: none

## 세션 레코드

### 2026-07-03 - Terraform 검증 오류 줄 표시

- Goal: Terraform 검증에서 오류가 난 줄을 editor 안에서 빨간줄로 표시한다.
- Completed:
  - `TerraformDiagnostic.line`과 `severity: "error"`를 기준으로 editor 줄 위치를 계산하는 `terraform-diagnostic-line-highlights` helper를 추가했다.
  - Terraform editor에 diagnostic underline overlay를 추가해 오류 줄 하단에 얇은 빨간줄을 표시하게 했다.
  - 같은 오류 줄 번호도 빨간색으로 강조해 실제 오류 위치를 더 빨리 찾을 수 있게 했다.
  - warning/info 또는 line이 없는 diagnostic은 빨간줄 대상에서 제외했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts` - failed because helper/CSS/render wiring did not exist.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-diagnostic-line-highlights.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-leave-save-state.test.ts` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - API/shared DTO 계약은 변경하지 않았다. 기존 `TerraformDiagnostic.line`만 UI에서 사용한다.
  - 실제 Terraform CLI 실행, apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 잘못된 Terraform 코드를 입력해 검증 오류가 난 줄에 빨간 underline과 빨간 줄 번호가 보이는지 수동 smoke한다.

### 2026-07-03 - Terraform leave dialog 저장 실패 피드백 수정

- Goal: Terraform 변경사항이 있는 상태에서 나가기 다이얼로그의 `저장하고 나가기`를 눌러도 검증 오류나 proposal 대기 때문에 저장이 실패하면 아무 반응이 없어 보이는 버그를 코드리뷰와 시나리오 테스트로 잡는다.
- Completed:
  - `TerraformCodePanel`의 external save가 `false`를 반환하는 경로가 부모 다이얼로그에서 조용히 무시되는 문제를 확인했다.
  - `terraform-leave-save-state` 상태 모델을 추가해 저장 시작, 저장 성공, 저장 차단 상태를 테스트 가능한 순수 함수로 분리했다.
  - `WorkspaceRightPanel`이 저장 실패 시 다이얼로그를 닫지 않고 "Terraform 패널의 오류나 변경 제안 확인" 안내를 표시하게 했다.
  - 저장 중에는 다이얼로그 버튼을 잠가 중복 저장이나 저장 완료 후 의도치 않은 pending action 실행 가능성을 줄였다.
  - `TerraformLeaveDialog`에 `status`/`alert` 피드백 영역을 추가했다.
- Verification run:
  - Red before fix: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - failed because the save feedback module/state did not exist.
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts` - passed
  - `pnpm --filter @sketchcatch/web typecheck` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/deployment-actions.test.ts` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 저장 성공은 pending leave action을 실행하고 다이얼로그를 닫는다.
  - 저장 실패, 검증 오류, proposal 대기, 이미 loading 중인 저장 차단은 다이얼로그를 유지하고 사용자에게 다음 행동을 보여준다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/소스/타입/빌드 검증으로 확인했다.
  - 기존 unrelated worktree changes remain: `DESIGN.md` 삭제 상태, `apps/web/next-env.d.ts` 변경 상태.
- Next best action:
  - 브라우저에서 Terraform editor에 구조 변경 Terraform을 입력한 뒤 proposal 발생 상태에서 `저장하고 나가기`, `계속 편집하기`, `저장하지 않고 나가기`를 수동 smoke한다.

### 2026-07-03 - InfrastructureGraph Workspace 동기화 v1 구현

- Goal: `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md` 기준으로 InfrastructureGraph 중심 Workspace 동기화 v1 기능을 구현하고 하위 AI 리뷰와 테스트로 검증한다.
- Completed:
  - Terraform block identity, multi-file sync input, create/delete/rename proposal shared type을 추가했다.
  - `DiagramJson -> InfrastructureGraph -> Terraform` Preview 경로를 API service에 연결했다.
  - Preview renderer가 invalid resource node를 유지하고 VPC/EC2/S3 계열 반복 생성 테스트를 통과하게 했다.
  - `data.aws_ami.filter` nested block 구조를 renderer/parser/catalog에서 `values.filter: [{ name, values }]`로 맞췄다.
  - Advanced Parameters UI를 제거하고 기존 optional 또는 catalog 밖 values 보존 정책을 테스트로 고정했다.
  - Terraform editor 역동기화에서 Terraform-only, Diagram-only, 명확한 rename을 proposal로 반환하게 했다.
  - rename proposal은 normalized values 기준으로 정확히 한 쌍일 때만 생성되도록 ambiguity를 제거했다.
  - Frontend Terraform panel은 proposal이 있으면 자동 apply하지 않고, 사용자가 체크한 proposal만 반영한다.
  - partial proposal approval 후 남은 proposal이 있으면 dirty/pending 상태를 유지하게 했다.
  - 하위 AI 리뷰에서 나온 blocking 피드백을 반영하고, ignored JH 문서 008/009를 강제 add로 커밋했다.
- Verification run:
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-identity.test.ts src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts features/parameter-input/validation.test.ts features/parameter-input/parameter-panel-source.test.ts features/diagram-editor/diagram-utils.test.ts` - passed
  - `pnpm catalog:check` - passed
  - `pnpm harness:check` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
  - `docs/data-models.md`에 proposal response, block identity, Advanced Parameters UI 제거/값 보존 정책을 기록했다.
  - `docs/jh/기타/008_...AI작업지시서_JH.md`, `docs/jh/기타/009_...사람용설명_JH.md`는 ignore 대상이지만 이번 커밋에 포함했다.
- Commits:
  - `619194b Feat: Terraform 동기화 proposal 타입 추가`
  - `cd7c870 Feat: DiagramJson InfrastructureGraph projection 추가`
  - `4e1bbf0 Feat: InfrastructureGraph 기반 Terraform Preview 생성`
  - `5e7fee7 Feat: AMI data source filter 동기화 지원`
  - `59444e2 Feat: Advanced Parameters UI 제거`
  - `9bb6a14 Feat: Terraform sync proposal 생성`
  - `315ee43 Feat: Terraform 동기화 proposal 승인 UI 연결`
  - `08223af Docs: Terraform sync proposal 계약 문서화`
  - `8f126fd Fix: Terraform rename proposal 명확성 보강`
  - `f0bbb91 Fix: Terraform proposal 부분 승인 상태 유지`
  - `474f278 Docs: InfrastructureGraph 동기화 v1 구현 기준 정리`
  - `caf849d Fix: Terraform proposal 테스트 fixture 보강`
- Known risks:
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
  - 브라우저 수동 smoke는 아직 수행하지 않았다.
  - `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.
- Next best action:
  - 브라우저에서 VPC/EC2/S3/AMI workspace를 열고 Preview 반복 생성과 proposal panel 부분 승인 흐름을 수동 smoke한다.

### 2026-07-03 - AI 작업 지시서 마일스톤 추가

- Goal: `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md` 최상단에 50줄 이하 마일스톤을 추가한다.
- Completed:
  - AI 작업 지시서를 읽고 제목 바로 아래에 `## 마일스톤` 섹션을 추가했다.
  - 마일스톤은 계약 고정, Preview 경로 정리, 지원 리소스 값 구조 정렬, 파라미터 UI 단순화, Terraform 역동기화 proposal화, Frontend 승인 흐름 연결, 최종 문서화와 검증의 7단계로 정리했다.
  - 추가된 마일스톤 섹션이 35줄임을 확인했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `awk 'BEGIN{count=0; in_section=0} /^## 마일스톤$/{in_section=1} in_section{count++} in_section && /^> \\*\\*For agentic workers:/{print count-1; exit}' docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md` - `35`
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `docs/jh/기타`는 ignore 대상이라 커밋 시 `git add -f docs/jh/기타/...`가 필요하다.
- Known risks:
  - 기능 구현은 아직 시작하지 않았다.
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - AI 작업 지시서의 마일스톤을 기준으로 Commit 1부터 구현을 시작한다.

### 2026-07-02 - InfrastructureGraph 동기화 v1 문서 정리

- Goal: InfrastructureGraph 중심 Workspace 동기화 v1 구현을 시작하기 전에 단계 문서 번호를 정렬하고, 실제 구현용 AI 작업 지시서와 사람용 설명 문서를 분리해 작성한다.
- Completed:
  - `docs/jh/기타`의 단계 문서 순서를 `003_1단계`부터 `007_5단계`까지 맞췄다.
  - `docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md`를 추가했다.
  - `docs/jh/기타/009_InfrastructureGraphWorkspace동기화v1_사람용설명_JH.md`를 추가했다.
  - AI 작업 지시서의 commit plan에서 문서 순서 정리 작업은 제외하고, 실제 기능 구현만 15개 커밋으로 나눴다.
  - Advanced Parameters는 내부 정책 미정으로 UI에서 제거하되, 기존 optional 값은 삭제하지 않는 정책을 문서에 반영했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `find docs/jh/기타 -maxdepth 1 -type f -name '*.md' | sort` - 단계 문서가 `003_1단계`부터 `007_5단계` 순서로 정렬됨
  - `rg -n "문서 순서|단계 문서 번호|007_1단계|003_2단계" docs/jh/기타/008_InfrastructureGraphWorkspace동기화v1_AI작업지시서_JH.md docs/jh/기타/009_InfrastructureGraphWorkspace동기화v1_사람용설명_JH.md` - no matches
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - `docs/jh/기타`는 ignore 대상이라 커밋 시 `git add -f docs/jh/기타/...`가 필요하다.
- Known risks:
  - 기능 구현은 아직 시작하지 않았다. 이번 세션 산출물은 구현 계획과 설명 문서다.
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - AI 작업 지시서의 commit plan에 따라 `Types: Terraform sync proposal 계약 추가`부터 구현을 시작한다.

### 2026-07-02 - invalid 파라미터 Terraform Preview 유지 수정

- Goal: 파라미터 값을 변경한 뒤 불완전한 리소스가 `invalid: true`로 표시되어도 Terraform Preview에서 해당 resource block이 사라지지 않게 한다.
- Root cause:
  - 파라미터 패널은 값 변경 시 required 값 누락을 감지해 `parameters.invalid = true`를 저장한다.
  - Terraform Preview 생성기는 `parameters.invalid === true`인 node를 출력에서 제외하고 있었다.
  - 2단계 skeleton 정책상 `aws_subnet.vpcId`, `aws_instance.ami`처럼 사용자가 나중에 확정해야 하는 값이 있을 수 있으므로, invalid 상태가 Preview block 숨김 조건이 되면 리소스 코드가 사라진다.
- Completed:
  - `generateTerraformFromDiagramJson`이 `parameters`가 있는 resource node는 invalid 상태여도 렌더링하도록 수정했다.
  - invalid 상태는 파라미터 패널/리소스 목록의 경고 상태로 유지하고, Terraform Preview block 제외 조건으로 쓰지 않게 문서를 갱신했다.
  - 재현 테스트를 추가해 `invalid: true`인 resource node도 Terraform Preview에 남는지 검증했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts` - red before fix, passed after fix
  - `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 재현 실패는 `actual: ""`로 확인했으며, 수정 후 같은 테스트가 `resource "aws_vpc" "invalid"` block을 렌더링했다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend UI에 Terraform 실행 또는 AWS SDK 호출을 추가하지 않았다.
- Known risks:
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - 브라우저에서 Subnet 또는 EC2 Instance의 파라미터 값을 변경한 뒤 Terraform Preview block이 유지되는지 수동 smoke를 수행한다.

### 2026-07-02 - 기본 IaC 파라미터 skeleton 자동 생성

- Goal: 캔버스 리소스 추가 시 Terraform Preview가 읽을 수 있는 최소 `parameters.values` skeleton을 자동 생성한다.
- Completed:
  - `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_instance`, `aws_s3_bucket`에 Preview skeleton subset 기본값을 추가했다.
  - `aws_ami`와 범위 밖 리소스는 기존처럼 `values: {}`를 유지하게 했다.
  - `aws_security_group`에는 공개 `ingress`를 자동 생성하지 않고 기본 `egress`만 생성하게 했다.
  - `aws_instance`의 `ami`, `subnetId`, `vpcSecurityGroupIds`와 S3 `bucket` 이름처럼 target 또는 사용자 확정이 필요한 값은 자동 생성하지 않게 했다.
  - `parameters.values` nested 객체/배열을 deep clone해 copy/paste 후 원본과 공유되지 않게 했다.
  - copy/paste 또는 resource name 변경 시 기존 resource name과 같던 자동 `tags.Name`만 새 이름으로 갱신하고 사용자 수정값은 보존하게 했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/drag-transaction.test.ts` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - 테스트를 먼저 실패시키고 구현 후 통과시키는 TDD 흐름으로 skeleton 생성, 제외 리소스, design node, deep clone, 자동 태그 동기화/보존을 검증했다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
  - frontend helper만 수정했으며 API route, DB/RDS/S3 저장 계약, Terraform renderer 출력 정책은 변경하지 않았다.
- Commits:
  - `f4f3217 Feat: 리소스 기본 파라미터 skeleton 생성`
  - `d169035 Fix: 파라미터 복사와 이름 변경 보존 정책 적용`
- Known risks:
  - 기존 unrelated worktree change remains: `DESIGN.md` 삭제 상태.
- Next best action:
  - Terraform Preview 화면에서 subset 리소스를 실제로 추가해 사용자가 보는 파라미터 패널/Preview 표시가 기대와 맞는지 수동 smoke를 수행한다.

### 2026-07-02 - 중복 상세 기획 문서 정리

- Goal: 별도 재구성본을 제거하고 상세 기획서는 canonical 상세 기획서 하나로 유지한다.
- Completed:
  - 별도 재구성본 파일을 삭제했다.
  - `docs/README.md`에서 별도 재구성본 링크와 문서 정리 기준을 삭제했다.
  - 진행 로그와 핸드오프에서 별도 재구성본 생성 기록과 후속 행동을 삭제했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
  - 삭제 대상 문서 참조 검색 - no matches
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않을 예정이다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - `docs/000_상세기획서.md`를 기준 문서로 유지하고, 공유용 문구가 필요하면 해당 문서 안에서 직접 다듬는다.

### 2026-07-02 - 방어형 포지셔닝 문장 제거

- Goal: 대상 사용자 섹션에서 부정형/방어형 포지셔닝 문장을 제거하고, 사용자 유형과 니즈만으로 서비스 범위를 설명한다.
- Completed:
  - `docs/product.md`, `docs/000_상세기획서.md`의 대상 사용자 소개 문장을 삭제했다.
  - 사용자 타깃은 표와 섹션 본문에서 애플리케이션 개발자, 플랫폼/DevOps 엔지니어, 기술 리드/SRE 사용 맥락으로 설명하게 했다.
  - docs 전체에서 관련 방어형 포지셔닝 문구가 남지 않았음을 확인했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
  - requested wording searches - no matches
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않을 예정이다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - 공유 문서에서 사용자군 설명이 과하게 방어적으로 읽히지 않는지 팀 피드백을 확인한다.

### 2026-07-02 - 타깃 사용자 표현 보정

- Goal: 사용자 타깃 표현을 숙련자까지 포함하는 운영 플랫폼 톤으로 조정한다.
- Completed:
  - `docs/product.md`, `docs/000_상세기획서.md`에서 낮은 숙련도 중심 명칭을 `플랫폼/DevOps 엔지니어`, `기술 리드/SRE`, `애플리케이션 개발자` 중심으로 바꿨다.
  - `docs/gg/003_기획서.md`의 담당자별 참고 문서 타깃 사용자도 같은 방향으로 조정했다.
  - `docs/sw/003_테라폼동기화구조설명_sw.md`의 `초보자/입문자/전문가 관점` 표현을 `사용자 관점/구현 관점`으로 바꿨다.
  - docs 전체에서 `입문자|초보|주니어|소규모 DevOps|전문가 관점` 검색 결과가 없음을 확인했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않을 예정이다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - 공유 문서에서도 운영 플랫폼 맥락이 자연스럽게 읽히는지 팀 피드백을 확인한다.

### 2026-07-02 - SketchCatch 상세 기획서 작성

- Goal: 기획자와 개발자가 함께 이해할 수 있는 SketchCatch 상세 기획서를 작성한다.
- Completed:
  - `docs/000_상세기획서.md`를 추가해 서비스 정의, 문제 정의, 대상 사용자, 현재 구현 상태, 핵심 서비스 여정, 기능 요구사항, 4인 책임 분배, Representative Use Journey, 보안/운영 정책, 비지원 범위, 성공 기준, 검증 전략, 리스크, 구현 순서를 정리했다.
  - `docs/README.md`에 상세 기획서 링크와 문서 책임을 추가했다.
  - `docs/product.md`에 상세 기획서 참조 링크를 추가했다.
  - Redis는 내부 Runtime Cache이며 사용자 Practice Architecture Resource가 아니라는 경계를 상세 기획서에 다시 명시했다.
- Verification run:
  - `pnpm harness:check` - passed
  - `git diff --check` - passed
- Evidence recorded:
  - 문서 변경만 수행했으며 code/infrastructure 파일은 수정하지 않았다.
  - 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- Known risks:
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`는 문서 전용 변경이라 실행하지 않았다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - `docs/000_상세기획서.md`의 "개발자가 바로 잡아야 할 구현 순서"를 기준으로 Representative Use Journey smoke 또는 Voice Requirement Input/Bedrock/Amazon Q/Redis/Git/CI/CD/Reverse Engineering 중 하나를 구현 workstream으로 쪼갠다.

### 2026-07-02 - Docs folder cleanup

- Goal: `docs` 폴더에서 canonical 문서와 담당자별 참고 문서를 더 쉽게 찾을 수 있게 정리한다.
- Completed:
  - `docs/adr/README.md`, `docs/ck/README.md`, `docs/sw/README.md`, `docs/ys/README.md` 인덱스를 추가했다.
  - `docs/README.md`의 담당자별 참고 문서 표를 각 폴더 인덱스로 연결했다.
  - `docs/AGENTS.md`에 담당자별 참고 문서를 추가/변경할 때 해당 인덱스를 갱신하라는 규칙을 추가했다.
  - H1 제목이 없던 `docs/gg/004_역할분배.md`, `docs/ys/006-로그인&익명로그인_삭제관련.md`에 제목을 추가했다.
- Verification run:
  - `pnpm harness:check` - passed
  - docs H1 scan - passed
  - docs link target scan - passed
- Evidence recorded:
  - docs H1 scan found no markdown files without an H1 after cleanup.
  - docs link target scan found no missing relative targets in changed index files.
- Commits:
  - `Docs: 문서 인덱스 정리` current commit
- Known risks:
  - 삭제나 이동은 하지 않았다. 기존 링크 파손 위험을 줄이기 위해 인덱스 추가 중심으로 정리했다.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
- Next best action:
  - If the team wants stronger cleanup later, merge or archive stale owner-specific docs after confirming with each owner.

### 2026-07-02 - Harness gap hardening

- Goal: `learn-harness-engineering`의 하네스 원칙을 SketchCatch repo 운영 표면에 맞게 반영한다.
- Completed:
  - 루트 `AGENTS.md`에 Harness Operating Loop를 추가했다.
  - `feature_list.json`, `agent-progress.md`, `session-handoff.md`, `clean-state-checklist.md`, `evaluator-rubric.md`, `quality-document.md`를 추가했다.
  - `scripts/check-harness.mjs`와 `scripts/init-harness.ps1`를 추가해 필수 하네스 파일, single `in_progress`, `passing` evidence 규칙을 검사하게 했다.
  - `docs/README.md`에 에이전트 하네스 상태 파일을 문서 map과 SSOT 우선순위에 연결했다.
- Verification run:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/init-harness.ps1` - passed
  - `pnpm harness:check` - passed
  - `Get-Content -Encoding UTF8 -Raw -LiteralPath feature_list.json | ConvertFrom-Json | Out-Null` - passed
  - `pnpm lint` - passed
  - `pnpm typecheck` - passed
  - `pnpm build` - passed
- Evidence recorded:
  - `HARNESS-001` through `HARNESS-006` are marked `passing` in `feature_list.json` with command evidence.
- Commits:
  - `b096e541 Docs: 에이전트 하네스 보강`
- Known risks:
  - `feature_list.json`은 제품 로드맵이 아니라 에이전트 하네스 작업 추적용이다.
  - Turbo checks pass, but Turbo prints a git dubious ownership warning because the sandbox user differs from the repository owner.
  - Existing unrelated worktree change remains: `apps/web/next-env.d.ts`.
  - `HARNESS-007` baseline E2E smoke remains not started.
- Next best action:
  - Define a minimal Representative Use Journey smoke that does not run real AWS apply/destroy without explicit approval and cleanup planning.
