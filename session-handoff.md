# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 2026-07-04 최신 핸드오프 - Terraform 리소스 확장 브랜치 dev 최신화

### 현재 상태

- 현재 브랜치: `Feat/jh/149-terraform-지원하지-않는-리소스-추가`
- 로컬 `dev`는 `origin/dev` 기준 최신 commit `40ec995`까지 fast-forward 했다.
- 이번 세션에서 현재 브랜치에 최신 `dev`를 merge했다.
- merge conflict는 `agent-progress.md`, `session-handoff.md`, `apps/web/features/workspace/workspace-ai-diagram-adapter.ts`, `apps/web/features/workspace/workspace-ai-diagram-adapter.test.ts`에서 발생했고 해결했다.
- 코드 conflict는 dev의 AI diagram reference/usage-arrow 개선과 현재 브랜치의 Region/AZ board-only resource area 정책을 함께 보존하는 방향으로 해결했다.
- 로그 파일 conflict는 `agent-progress.md`에는 양쪽 누적 기록을 모두 남기고, `session-handoff.md`는 현재 브랜치 기준 최신 압축본으로 유지했다.

### 현재 검증된 것

- 최신 nested block cardinality/AZ client validation 커밋 `2de8ae2`는 `git revert --no-commit`으로 되돌렸다. 이 롤백은 `parameter-value-record` helper와 단일 nested block 저장 정책 테스트를 제거하지만, 이전 단계의 Terraform Preview/Sync 지원 리소스 확장은 유지한다.
- 현재 Web catalog에서 생성 가능한 shared Terraform resource/data definition은 모두 `terraformPreview: true`와 `terraformSync: true`다. 아이콘은 생성되지만 Terraform Preview 또는 Terraform Sync 변환에서 제외되는 shared Terraform 리소스 목록은 없다.
- Region/AZ는 더 이상 신규 생성 시 `design_region`/`design_az` metadata node가 아니라 board-only resource area node인 `aws_region`, `aws_availability_zone`으로 생성된다.
- Region/AZ 영역 선택값은 `parameters.values.awsRegion`, `parameters.values.awsAvailabilityZone`에 저장한다. 기존 `design_region`, `design_az`, `sketchcatch_region`, `sketchcatch_az` metadata는 저장 데이터 호환을 위해 읽을 수 있다.
- Terraform Preview는 `aws_region` 영역 리소스가 있어도 `provider "aws"` block을 생성하지 않는다. `ap-northeast-2` 같은 기본 provider region도 자동으로 넣지 않는다.
- Terraform Sync는 `provider "aws" { region = ... }` block을 `aws_region` 영역 리소스 create/update/delete 의도로 해석하지 않고 무시한다.
- AZ-aware 리소스(`aws_subnet`, `aws_ebs_volume`)가 `aws_availability_zone` 영역 안에 있고 명시 `availabilityZone` 값이 없으면 영역의 AZ 값을 Terraform Preview config로 상속한다. 리소스 parameter에 AZ가 있으면 그 값을 우선한다.
- Terraform Sync는 `aws_subnet`, `aws_ebs_volume`의 `availability_zone` attribute를 `aws_availability_zone` 영역 리소스로 승격하고, child resource의 `metadata.parentAreaNodeId`를 AZ 영역 node id로 연결한다.
- Auto Scaling Group은 Terraform resource projection 대상이면서 visual area node로도 동작한다.
- `aws_region`, `aws_availability_zone`은 board-only area resource라 Terraform resource/data block과 ArchitectureJson resource로 변환하지 않는다.

### 이전 누적 검증 메모

- `docs/jh/000_AWS리소스목록_JH.md`에 1순위/2순위 AWS Terraform 리소스 후보와 현재 SketchCatch 보유/미보유 목록을 정리했다.
- 리소스 후보는 1순위 90개, 2순위 22개, 합계 112개다.
- 현재 SketchCatch 보유 리소스는 `packages/types/src/resource-definitions.ts` 기준 44개이며, 대상 후보 중 미보유 리소스는 68개다.
- 같은 문서에 Brainboard AWS Provider `6.47.0` identity card 기준 `Brainboard configurator 조사 결과`를 추가했다.
- Brainboard 조사 결과는 대상 112개 중 111개 확인, `aws_wafv2_web_acl` 1개 미제공/미확인이다.
- Brainboard 조사 섹션에서 `Main parameters`는 identity card `attributes`, `Add blocks`는 `blockTypes` 기준으로 적었다.
- `docs/jh`는 `.gitignore` 대상이므로 이 문서를 커밋하려면 `git add -f docs/jh/000_AWS리소스목록_JH.md`가 필요하다.

### 이번 세션의 변경 사항

- `dev`를 `origin/dev` 최신 상태로 fast-forward 했다.
- 현재 feature 브랜치에 최신 `dev`를 merge하고 conflict를 해결했다.
- `workspace-ai-diagram-adapter.ts`에서는 board-only Region/AZ 제외 로직과 dev의 Terraform reference 기반 parent 탐색 로직을 모두 보존한다.
- `workspace-ai-diagram-adapter.test.ts`에서는 Region/AZ가 `aws_region`/`aws_availability_zone` resource area node로 생성되는 기대값을 유지하고, dev의 usage-arrow 표시 테스트를 함께 보존한다.

## 아직 깨졌거나 미검증된 것

- `HARNESS-007` Representative Use Journey smoke는 아직 `not_started` 상태다.
- `pnpm catalog:check`는 root workspace package link 문제로 이전 세션에서 실패한 상태이며, 이번 dev 최신화 범위에서는 재실행하지 않았다.
- 이번 merge commit은 아직 push하지 않았다.

## 다음으로 최선의 행동

- merge commit을 push한다.
- 필요하면 PR에서 CI 결과를 확인한다.
