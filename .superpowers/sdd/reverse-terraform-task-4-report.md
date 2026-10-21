# Reverse Engineering Terraform Management Task 4 보고서

## 결과

최초 Terraform import plan의 action을 importing 주소에 한해서만 별도 분석한다. `no-op`, `update`는 승인 후보로 유지하고 `create`, `delete`, `delete/create`, `create/delete` 및 명시됐지만 malformed인 importing/actions는 `risk_analysis`로 차단한다. importing이 없는 일반 create/delete/replace와 기존 warning 정책은 바꾸지 않았다.

위험 import plan은 아래 상태를 같은 판정 결과로 저장한다.

- `planSummary.blocked: true`
- `isBlocked: true`
- `blockedBy: "risk_analysis"`
- 정렬된 Terraform 주소와 action을 포함한 `blockedReason`

기존 pending import plan은 새 판정을 받았다는 증거가 없으므로 `importSafetyGateVersion: 1`이 없으면 재사용하지 않고 재계획하며, 재계획 전 직접 승인도 거부한다. import ID 원문은 summary, block reason, warning, log에 저장하지 않는다.

## TDD 증거

### RED 1 — import 판정·저장·승인

명령:

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/deployments/deployment-plan-summary.test.ts \
  src/deployments/deployment-safety-gate.test.ts \
  src/deployments/deployment-plan-service.test.ts \
  src/deployments/deployment-approval-service.test.ts
```

최초 sandbox 실행은 `tsx` IPC socket 생성 시 `listen EPERM`으로 테스트 전에 중단됐다. 같은 명령을 승인된 실행 환경에서 다시 실행했다.

결과: 62개 중 58 pass, 4 expected fail.

- malformed importing metadata가 `importCount`에서 빠짐: `0 !== 1`
- 위험 importing action이 `planSummary.blocked`를 세우지 않음: `false !== true`
- infrastructure plan 저장이 차단 필드를 계속 `false/null`로 저장함
- 실제 `risk_analysis` 차단 plan도 승인됨: `Missing expected rejection`

### GREEN 1 — 기본 구현

동일 명령 결과: 62/62 pass.

apply 및 Task 3 import-only 회귀를 추가한 명령:

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/deployments/deployment-plan-summary.test.ts \
  src/deployments/deployment-safety-gate.test.ts \
  src/deployments/deployment-plan-service.test.ts \
  src/deployments/deployment-approval-service.test.ts \
  src/deployments/deployment-apply-service.test.ts \
  src/deployments/deployment-optimization.test.ts
```

결과: 107/107 pass. import-only `no-op` plan이 no-change shortcut으로 빠지지 않고 Apply를 실행하는 기존 회귀도 통과했다.

### RED 2 — 배포 전 생성된 pending import plan

독립 리뷰에서 `importCount`만 가진 기존 pending plan이 새 게이트를 거치지 않고 재사용·승인될 수 있음을 확인했다.

첫 fixture 실행은 optimization evidence에 허용되지 않는 `no-op` action을 넣어 assertion 전 parse error가 발생했다. fixture를 기존 evidence 계약의 `create` action으로 바로잡은 뒤 RED를 다시 확인했다.

명령:

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/deployments/deployment-plan-service.test.ts \
  src/deployments/deployment-approval-service.test.ts
```

결과: 52개 중 50 pass, 2 expected fail.

- legacy import plan이 `init` 뒤 기존 plan을 재사용해 `plan`, `show-json`을 실행하지 않음
- safety-gate evidence가 없는 legacy import plan 승인 거부가 없음

### GREEN 2 — safety-gate version marker

`DeploymentPlanSummary.importSafetyGateVersion?: 1`을 추가하고 새로 분석한 import plan에만 기록했다. marker가 없는 `importCount > 0` plan은 cache reuse 전에 fresh plan으로 전환하고 승인 경계에서도 재계획을 요구한다.

동일 명령 결과: 52/52 pass.

최종 focused 명령 결과: 109/109 pass, 0 fail.

## 변경 파일

- `packages/types/src/index.ts`
  - optional `importSafetyGateVersion` 계약 추가
- `apps/api/src/deployments/deployment-plan-summary.ts`
  - `change.importing` 명시 여부를 actions와 분리 파싱
  - malformed importing도 import summary에서 빠지지 않게 처리
  - 주소/action 기준 결정적 정렬, import ID 비보존
- `apps/api/src/deployments/deployment-safety-gate.ts`
  - importing 주소만 safe/unsafe 판정
  - deterministic `risk_analysis` block 생성
  - legacy import plan 재계획 판정과 version marker 제공
- `apps/api/src/deployments/deployment-plan-service.ts`
  - infrastructure plan에 block 4개 필드를 일관되게 저장
  - marker 없는 pending import plan reuse 금지
- `apps/api/src/deployments/deployment-approval-service.ts`
  - 실제 block 및 marker 없는 legacy import plan 승인 거부
  - `warning.blocksApproval`만 있는 legacy warning은 계속 승인 가능
- `apps/api/src/deployments/deployment-plan-summary.test.ts`
- `apps/api/src/deployments/deployment-safety-gate.test.ts`
- `apps/api/src/deployments/deployment-plan-service.test.ts`
- `apps/api/src/deployments/deployment-approval-service.test.ts`
- `docs/data-models.md`
  - import summary, safety gate, persistence, legacy replan 계약 동기화

## 검증

통과:

- focused plan/summary/safety/approval/apply/optimization: 109/109
- `pnpm --filter @sketchcatch/api typecheck`
- `pnpm --filter @sketchcatch/api lint`
- `pnpm --filter @sketchcatch/types typecheck`
- `pnpm --filter @sketchcatch/types lint`
- `pnpm lint`: 5/5 workspace tasks
- `pnpm harness:check`
- `git diff --check`

기준선 실패:

- `pnpm typecheck`: Task 4가 수정하지 않은 `apps/web/features/workspace/WorkspaceRightPanel.tsx:1159`에서 `TerraformCodePanel.isMutationLocked` prop 누락으로 실패. `git show HEAD`와 현재 파일이 동일하다.
- `pnpm build`: Next.js compile 뒤 같은 Web type error로 실패. API build 단계에는 Task 4 오류가 보고되지 않았다.
- `pnpm test`: exit 1. Task 4 focused 109개와 types 71개는 통과했지만 기존 보호선의 다른 영역이 실패했다.
  - API 최소 재현: `src/services/authoredTerraformArchitecturePresets.test.ts` 1건
  - Web 별도 재현: Template/Diagram/typography/CI-CD styling 관련 13건
- standalone API 전체 suite 진단은 3분 30초 이상 종료되지 않아 중단했다. 위 API 실패는 해당 단일 파일로 재현했다.

## 리뷰와 자체 점검

독립 1차 리뷰에서 legacy pending import plan의 fail-open 재사용·승인 경로 1건을 Important로 발견했다. version marker와 재계획/승인 차단 테스트로 보완했다. 2차 리뷰 결과 남은 Critical/Important/Minor 지적은 없었다.

- safe matrix: importing `no-op`, `update`만 승인 후보
- blocked matrix: importing `create`, `delete`, 양방향 replace
- malformed: 명시된 importing metadata 또는 actions는 fail-closed
- scope: importing이 없는 일반 destructive action은 기존 approvable warning 정책 유지
- persistence: summary/deployment block 상태와 reason 일치
- compatibility: legacy warning `blocksApproval`만으로는 승인 차단하지 않음
- reuse: marker 없는 기존 import plan은 fresh plan 강제
- privacy: import ID, AWS credential, secret 값 비보존
- mutation: Terraform plan/apply/destroy 및 AWS 호출을 실행하지 않음
- schema: DB migration 없음
- UI/resource type 변경 없음

평가 루브릭 자체 점검: Hard Fail 없음. Correctness 2, Verification 1(기준선 broad 실패 명시), Scope discipline 2, Reliability 2, Maintainability 2, Handoff readiness 2 — 총 11/12, Accept.

## 커밋

- 제목: `Fix: 기존 AWS import 변경 안전 차단`
- 이 보고서와 구현은 같은 Task 4 커밋에 포함하며, 최종 SHA는 커밋 후 handoff에 기록한다.
