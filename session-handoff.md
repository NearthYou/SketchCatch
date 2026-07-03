# 세션 핸드오프

이 파일은 최신 세션 하나를 다음 세션이 빠르게 이어받기 위한 압축본이다. 누적 이력은 `agent-progress.md`에 남긴다.

## 현재 검증된 것

- Issue #129 worktree `feature/sw/129-direct-deployment-failure-ai`는 `origin/dev` 기준으로 fast-forward된 뒤 Direct Deployment 실패 설명 slice를 구현했다.
- `GET /api/deployments/:deploymentId/failure-explanation`은 `FAILED` deployment만 허용하며, 첫 `ERROR` 로그 또는 `errorSummary`를 마스킹해 실패 stage, 첫 오류 로그, cleanup 필요 여부, nextActions를 반환한다.
- `DeploymentPanel`은 실패한 deployment가 선택됐을 때 실패 요약 카드와 다음 행동을 표시한다.
- `docs/data-models.md`와 `docs/sw/008_배포실패설명가이드_sw.md`에 DTO/흐름/클론 코딩 자료가 반영됐다.
- #129 검증:
  - `pnpm harness:check` - passed before edits
  - `pnpm --filter @sketchcatch/api exec tsx --test src/routes/deployments.test.ts` - passed
  - `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/api.test.ts` - passed
  - `pnpm typecheck` - passed
  - `pnpm lint` - passed
  - `pnpm build` - passed
  - `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm --filter @sketchcatch/api test` - passed
  - `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm exec turbo test --env-mode=loose` - passed
  - `git diff --check` - passed
- 루트 `pnpm test`는 기존 Turbo strict task env에서 `S3_BUCKET_NAME`이 API task로 전달되지 않아 실패한다. 같은 전체 테스트는 `turbo test --env-mode=loose`로 통과했다.
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

- #129에서 Direct Deployment 실패 설명 DTO/API/UI/docs를 추가했다.
- `packages/types/src/index.ts`에 `DeploymentFailureExplanation`과 response type을 추가했다.
- `apps/api/src/deployments/deployment-failure-explanation.ts`를 추가하고 deployment route에 실패 설명 endpoint를 연결했다.
- `apps/web/features/workspace/DeploymentPanel.tsx`와 API helper에 실패 설명 조회/표시를 추가했다.
- `docs/sw/008_배포실패설명가이드_sw.md`를 추가했다.
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

## 2026-07-03 - Issue #128 Worker 1-1 핸드오프

### 현재 검증된 것

- Direct Deployment 승인 스냅샷 재검증 동작은 기존 production code가 이미 만족했다. production 파일은 수정하지 않았다.
- apply precondition 회귀 테스트를 추가했다.
  - artifact hash drift
  - tfplan hash drift
  - AWS account drift
  - AWS region drift
  - missing approval snapshot fields
  - drift 감지 시 apply service가 AWS credential 준비, plan file write, Terraform 실행 전에 멈추는지
- 기존 destroy precondition 동작은 targeted destroy service test run으로 계속 검증했다.
- `docs/sw/005_승인스냅샷재검증클론코딩가이드_sw.md`를 추가하고 `docs/sw/README.md`에서 연결했다.

### 실행한 검증

- `pnpm harness:check` - passed before edits
- `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-approval-service.test.ts src/deployments/deployment-apply-service.test.ts src/deployments/deployment-destroy-service.test.ts` - passed
- `pnpm --filter @sketchcatch/api test` - failed once because existing tests require `S3_BUCKET_NAME`
- `$env:S3_BUCKET_NAME='sketchcatch-test-bucket'; pnpm --filter @sketchcatch/api test` - passed
- `pnpm --filter @sketchcatch/api lint` - passed
- `pnpm --filter @sketchcatch/api typecheck` - passed
- `pnpm lint` - passed
- `pnpm typecheck` - passed
- `pnpm build` - passed
- `git diff --check` - passed
- `pnpm harness:check` - passed after note update

### 남은 리스크와 다음 행동

- 이 worker branch를 #128 Worker 1-2 또는 1-3 범위로 확장하지 않는다. Parent agent가 이 focused diff를 review하고 PR을 연다.
- 실제 AWS apply/destroy, cloud mutation, Git/CI/CD handoff, secret access는 수행하지 않았다.
