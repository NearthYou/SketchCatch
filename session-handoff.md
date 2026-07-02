# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 현재 검증된 것

- `pnpm harness:check`가 invalid 파라미터 Terraform Preview 유지 수정 후 통과했다.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts`가 수정 전 재현 실패를 보였고 수정 후 통과했다.
- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/diagram-to-terraform.test.ts src/routes/terraform.test.ts`가 통과했다.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`가 invalid 파라미터 Terraform Preview 유지 수정 후 통과했다.
- `pnpm harness:check`가 기본 IaC 파라미터 skeleton 자동 생성 작업 후 통과했다.
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts`가 통과했다.
- `pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/drag-transaction.test.ts`가 통과했다.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`가 모두 통과했다.
- `feature_list.json`에는 동시에 `in_progress`인 항목이 없다.

## 이번 세션의 변경 사항

- 파라미터 변경 후 resource block이 Terraform Preview에서 사라지는 원인을 확인했다.
- 원인은 파라미터 패널이 required 값 누락 시 `parameters.invalid = true`를 저장하고, Terraform Preview 생성기가 invalid node를 통째로 제외하던 정책이었다.
- `apps/api/src/services/terraform/diagram-to-terraform.ts`에서 `parameters`가 있는 resource node는 invalid 상태여도 Preview block을 렌더링하게 수정했다.
- `apps/api/src/services/terraform/diagram-to-terraform.test.ts`에 invalid resource node가 Preview에서 사라지지 않는 재현 테스트를 추가했다.
- `docs/sw/001_테라폼변환구현가이드_sw.md`, `docs/sw/003_테라폼동기화구조설명_sw.md`에서 invalid node 출력 제외 문구를 최신 Preview skeleton 정책에 맞게 수정했다.
- `apps/web/features/diagram-editor/diagram-utils.ts`에서 Preview skeleton subset 기본값 생성을 추가했다.
- 기본값 생성 대상은 `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_instance`, `aws_s3_bucket`으로 제한했다.
- `aws_ami`와 범위 밖 catalog 리소스는 기존처럼 `values: {}`를 유지한다.
- `aws_security_group`에는 공개 `ingress`를 자동 생성하지 않고 기본 `egress`, `name`, `description`, `tags`만 생성한다.
- `aws_instance`의 `ami`, `subnetId`, `vpcSecurityGroupIds`와 S3 `bucket` 이름은 자동 생성하지 않는다.
- `parameters.values` deep clone을 추가해 copy/paste 후 nested 객체/배열이 원본과 공유되지 않게 했다.
- copy/paste 또는 resource name 변경 시 자동 생성된 `tags.Name`만 새 이름으로 갱신하고 사용자 수정값은 보존한다.
- `apps/web/features/diagram-editor/diagram-utils.test.ts`에 skeleton 생성, 제외 리소스, design node, deep clone, 자동 태그 동기화/보존 테스트를 추가했다.
- 커밋:
  - `f4f3217 Feat: 리소스 기본 파라미터 skeleton 생성`
  - `d169035 Fix: 파라미터 복사와 이름 변경 보존 정책 적용`

## 아직 깨졌거나 미검증된 것

- 기존 unrelated 변경 `DESIGN.md` 삭제 상태는 이번 작업에서 건드리지 않았다.
- 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- 브라우저에서 Subnet 또는 EC2 Instance 파라미터 변경 후 Terraform Preview block 유지 여부를 직접 보는 수동 smoke는 아직 수행하지 않았다.
- `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.

## 다음으로 최선의 행동

- Terraform Preview 화면에서 subset 리소스를 직접 추가해 파라미터 패널과 Preview 표시가 기대와 맞는지 수동 smoke를 수행한다.
- 특히 Subnet 또는 EC2 Instance처럼 required reference가 비어 invalid가 될 수 있는 리소스에서, 값 변경 후 block이 유지되는지 확인한다.
- 필요하면 후속 단계 문서인 `004_3단계_파라미터InfrastructureGraph동기화_JH.md`를 읽고 parameter 변경과 InfrastructureGraph 동기화 작업을 별도 브랜치/이슈로 진행한다.

## 건드리지 말아야 할 것

- `.env`, private key, AWS credential, DB password, real access token
- 사용자 승인 없는 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff
- 사용자 확인 없는 Voice Requirement Input 또는 AI 제안의 Practice Architecture 반영
- frontend UI component 안의 Terraform 실행, AWS SDK 호출, deployment mutation logic

## 참고 명령

```bash
pnpm harness:check
pnpm --filter @sketchcatch/web exec tsx --test features/diagram-editor/diagram-utils.test.ts features/diagram-editor/reference-drop-targets.test.ts features/diagram-editor/drag-transaction.test.ts
pnpm lint
pnpm typecheck
pnpm build
```
