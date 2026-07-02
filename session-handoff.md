# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 현재 검증된 것

- InfrastructureGraph 중심 Workspace 동기화 v1 구현이 현재 브랜치에 커밋됐다.
- Terraform Preview 생성 경로는 `DiagramJson -> InfrastructureGraph -> Terraform`로 정리됐다.
- 같은 DiagramJson에서 VPC/EC2/S3 계열 Terraform Preview가 반복 생성되는 테스트가 통과했다.
- `data.aws_ami.filter`는 renderer/parser/catalog에서 `values.filter: [{ name, values }]` 구조로 정렬됐다.
- Advanced Parameters UI는 제거됐고, 기존 optional 또는 catalog 밖 `parameters.values`는 보존된다.
- Terraform editor 역동기화는 create/delete/rename 구조 변경을 proposal로 반환하며, 사용자 승인 전 DiagramJson 구조를 바꾸지 않는다.
- rename proposal은 같은 `terraformBlockType/resourceType/normalized values` 그룹에서 diagram-only 1개와 terraform-only 1개가 정확히 한 쌍일 때만 생성된다.
- Frontend proposal 적용은 사용자가 체크한 proposal만 반영하며, 미반영 proposal이 남으면 dirty/pending 상태를 유지한다.
- `docs/data-models.md`, `docs/jh/기타/008_...AI작업지시서_JH.md`, `docs/jh/기타/009_...사람용설명_JH.md`가 실제 구현 결과에 맞게 갱신됐다.
- Terraform leave dialog의 `저장하고 나가기`는 저장 실패/검증 오류/proposal 대기 시 더 이상 무반응처럼 보이지 않고, 다이얼로그 안에 차단 안내를 표시한다.
- Terraform leave dialog 저장 중에는 버튼을 잠가 중복 저장과 race를 줄인다.
- `feature_list.json`에는 동시에 `in_progress`인 항목이 없다.

## 이번 세션의 변경 사항

- shared type에 Terraform block identity, multi-file sync input, sync proposal response를 추가했다.
- API Terraform service에 identity helper, InfrastructureGraph projection, graph 기반 preview renderer, multi-file parser/source metadata, create/delete/rename proposal 생성을 추가했다.
- API proposal 생성은 unsupported/parser error/duplicate identity에서 자동 반영하지 않고 diagnostics를 반환한다.
- Web parameter panel에서 Advanced Parameters UI를 제거하고 nested `list`/`set` block 반복 렌더링을 보강했다.
- Web Terraform panel은 여러 Terraform file을 sync API에 전달하고, structural proposal은 pending panel에서 명시 선택 후 반영한다.
- Web Terraform leave dialog에 저장 상태 모델과 status/alert 피드백 UI를 추가했다.
- 하위 AI 리뷰 6개 축에서 나온 blocking 피드백을 반영했다.
  - Preview 지원 범위와 proposal 지원 범위를 문서에서 분리했다.
  - ambiguous rename과 object key order 문제를 수정했다.
  - partial proposal approval 후 clean 처리되는 문제를 수정했다.
  - ignored JH 문서 008/009를 `git add -f`로 커밋했다.

## 검증

- `pnpm --filter @sketchcatch/api exec tsx --test src/services/terraform/terraform-identity.test.ts src/services/terraform/infrastructure-graph.test.ts src/services/terraform/diagram-to-terraform.test.ts src/services/terraform/terraform-to-diagram.test.ts src/routes/terraform.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/workspace/terraform-panel-utils.test.ts features/workspace/workspace-right-panel-layout.test.ts features/parameter-input/validation.test.ts features/parameter-input/parameter-panel-source.test.ts features/diagram-editor/diagram-utils.test.ts` - passed
- `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-leave-save-state.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/terraform-sync-proposals.test.ts features/workspace/workspace-deployment-artifacts.test.ts features/workspace/deployment-actions.test.ts` - passed
- `pnpm --filter @sketchcatch/web typecheck` - passed
- `pnpm catalog:check` - passed
- `pnpm harness:check` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed

## 아직 깨졌거나 미검증된 것

- 기존 unrelated 변경 `DESIGN.md` 삭제 상태는 이번 작업에서 건드리지 않았다.
- 기존 unrelated 변경 `apps/web/next-env.d.ts` 변경 상태는 이번 작업에서 건드리지 않았다.
- 실제 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff는 실행하지 않았다.
- `HARNESS-007`: Representative Use Journey의 browser/API smoke는 아직 없다.
- 브라우저 수동 smoke는 수행하지 않았다. 자동/단위/빌드 검증으로 이번 구현 범위를 확인했다.

## 다음으로 최선의 행동

- 브라우저에서 VPC, EC2, S3, `data.aws_ami`를 포함한 workspace를 열어 Terraform Preview와 proposal panel을 수동 smoke한다.
- Terraform editor에서 proposal 대기 상태를 만든 뒤 leave dialog의 `저장하고 나가기`, `계속 편집하기`, `저장하지 않고 나가기`를 수동 smoke한다.
- 다음 조각을 진행한다면 proposal 승인 후 실제 diagram edge 추론 정책 또는 Terraform code -> resource 생성 UX를 별도 이슈로 다룬다.

## 건드리지 말아야 할 것

- `.env`, private key, AWS credential, DB password, real access token
- 사용자 승인 없는 Terraform apply/destroy, cloud mutation, Git/CI/CD handoff
- 사용자 확인 없는 Voice Requirement Input 또는 AI 제안의 Practice Architecture 반영
- frontend UI component 안의 Terraform 실행, AWS SDK 호출, deployment mutation logic

## 참고 명령

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```
