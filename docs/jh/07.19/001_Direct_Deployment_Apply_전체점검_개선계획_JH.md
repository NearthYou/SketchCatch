# Direct Deployment Apply 전체 점검 개선 계획

## 1. 목적

이 계획은 Direct Deployment의 `approve -> execute -> Terraform Apply -> 결과 저장 -> application release` 경로에서 확인된 안전성과 상태 일관성 문제를 개선하기 위한 문서다.

현재 구현은 사용자가 승인한 Terraform artifact와 binary `tfplan`, AWS account, region을 Apply 직전에 다시 확인한다. 이 기본 승인 경계는 유지한다. 개선 대상은 승인 이후 실행에 사용하는 Terraform state, no-change 최적화의 application release 처리, ECS worker 취소, Apply 성공 후 결과 저장, 실패 단계 분류다.

이 작업은 다음을 하지 않는다.

- 사용자 승인 없이 Terraform Apply, Destroy 또는 application release를 실행하지 않는다.
- `terraform apply -target` 같은 부분 Apply를 도입하지 않는다.
- Direct Deployment와 Git/CI/CD Deployment Path를 하나의 실행 상태로 합치지 않는다.
- 프런트엔드에서 Terraform CLI나 AWS SDK를 실행하지 않는다.
- 실제 AWS Apply/Destroy를 자동 검증에 포함하지 않는다. live 검증은 별도 승인과 cleanup 계획이 있을 때만 수행한다.

## 2. 점검 결론

현재 Apply 경로는 승인 snapshot 검증, Terraform artifact 안전 검사, `tfplan` hash 검증, AWS account/region 검증, 로그 마스킹, 프로젝트 execution lease의 기본 구조를 갖추고 있다.

그러나 다음 문제 때문에 현재 상태를 운영 안전 완료로 판단할 수 없다.

| 우선순위 | 문제 | 사용자 영향 |
| --- | --- | --- |
| P0 | 재배포 Plan과 Apply가 서로 다른 Terraform state를 사용할 수 있음 | 사용자가 본 Plan이 실제 변경 대상과 달라지거나 Apply가 stale plan으로 실패함 |
| P0 | no-change `full_stack`이 release 결과와 lease fencing을 누락함 | 부분 실패·취소를 성공으로 기록하거나 stale worker가 AWS 변경을 계속할 수 있음 |
| P1 | ECS worker 취소가 graceful abort 없이 worker를 종료함 | partial `terraform.tfstate`를 잃어 생성된 리소스를 자동 cleanup하기 어려움 |
| P1 | Apply 성공 후 결과 저장 장애가 Deployment를 `FAILED`로 뒤집음 | AWS에는 리소스가 생성됐지만 성공 이력과 cleanup state가 사라질 수 있음 |
| P2 | application release 실패를 `failureStage: "apply"`로 저장함 | 사용자가 Terraform 문제로 오인하고 잘못된 복구 절차를 수행함 |

## 3. 반드시 지켜야 할 실행 불변조건

### 3.1 Plan과 Apply는 같은 state를 사용한다

사용자가 확인한 Plan을 만든 Terraform state와 Apply 직전에 workspace에 복원한 state의 identity가 같아야 한다.

최소 identity는 다음 값을 포함한다.

- state를 소유한 Deployment ID
- S3 `stateObjectKey`
- Terraform state lineage
- Terraform state serial
- AWS account와 region
- Terraform artifact hash
- binary `tfplan` hash

하나라도 달라지면 Apply를 실행하지 않고 새 Plan을 요구한다. Terraform CLI의 stale plan 오류에만 의존하지 않고 서버가 AWS credential 준비와 Terraform 실행 전에 차단해야 한다.

### 3.2 lease를 잃은 worker는 더 이상 AWS를 변경하거나 결과를 저장하지 않는다

Terraform Apply와 application release는 같은 `LeaseFence`와 lease heartbeat에서 파생된 `AbortSignal`을 사용한다. no-change 최적화도 이 규칙의 예외가 아니다.

lease heartbeat가 실패하면 다음 동작을 보장한다.

1. 실행 중인 Terraform 또는 application release를 중단한다.
2. stale worker의 terminal write를 fencing version으로 거부한다.
3. 가능한 partial state와 release recovery evidence를 보존한다.
4. 새 실행자가 같은 프로젝트 lease를 인수한 뒤 이전 worker가 AWS를 다시 변경하지 못하게 한다.

### 3.3 AWS Apply 성공 사실은 후처리 장애가 뒤집지 않는다

`terraform apply tfplan`이 exit code `0`으로 끝난 시점부터 실제 cloud mutation은 성공한 것으로 본다. 이후 output 파싱, resource inventory 수집, state 업로드, 로그 기록 또는 일부 DB 저장이 실패해도 이를 Terraform Apply 실패로 기록하지 않는다.

후처리 장애는 다음 중 하나로 남긴다.

- `SUCCESS`와 `resultWarningSummary`
- 성공 증거의 terminal 저장을 아직 확정할 수 없는 복구 가능 상태

DB 장애 때문에 성공 여부 자체를 저장할 수 없다면 `FAILED`로 추정하지 않는다. worker/job recovery가 실제 Apply 결과와 S3 evidence를 확인해 terminal 상태를 확정해야 한다.

### 3.4 실패 단계는 실제 실패한 실행 주체를 가리킨다

- Terraform Apply 실패: `failureStage: "apply"`
- application release 실패: `failureStage: "application_release"`
- release rollback 실패: `failureStage: "rollback"`
- AWS credential 준비 실패: `failureStage: "aws_connection"`

화면은 이 값을 기준으로 서로 다른 로그와 복구 절차를 안내한다.

## 4. 개선 항목 1: 재배포 state를 Plan 전에 고정

### 4.1 현재 문제

신규 Deployment row는 이전 성공 Deployment의 `stateObjectKey`를 승계하지 않는다. Plan은 현재 Deployment의 `stateObjectKey`만 확인하므로 신규 재배포를 빈 state로 계산할 수 있다.

반면 Apply는 `selectDeploymentStateBaseline()`으로 이전 성공 Deployment를 찾아 state를 workspace에 주입한다. 결과적으로 다음 순서가 가능하다.

```text
이전 성공 Deployment state 존재
-> 신규 Deployment 생성(stateObjectKey = null)
-> 빈 state로 Terraform Plan 생성
-> 사용자가 전체 신규 생성처럼 보이는 Plan 승인
-> Apply 직전에 이전 state 복원
-> 승인된 tfplan과 현재 state lineage/serial 불일치
-> stale plan 실패 또는 승인 내용과 다른 실행 위험
```

관련 코드:

- `apps/api/src/deployments/deployment-service.ts`
- `apps/api/src/deployments/deployment-plan-service.ts`
- `apps/api/src/deployments/deployment-apply-service.ts`

### 4.2 목표 설계

Plan 시작 시 프로젝트의 state baseline을 한 번 선택하고 그 identity를 Plan artifact에 고정한다.

권장 순서는 다음과 같다.

1. `selectDeploymentStateBaseline()`을 Plan과 Apply가 함께 사용하는 provider-neutral helper로 이동한다.
2. Plan 전에 baseline state를 S3에서 내려받아 workspace에 복원한다.
3. state lineage/serial과 baseline Deployment ID, object key를 Plan identity에 포함한다.
4. 승인 snapshot에 해당 Plan의 state identity를 포함한다.
5. Apply 직전에 같은 baseline state를 복원하고 identity를 다시 계산한다.
6. 현재 state identity가 승인된 Plan과 다르면 `409 Conflict`로 차단하고 새 Plan을 요구한다.
7. 새 Apply 결과가 성공적으로 저장된 뒤에만 이전 Deployment의 state ownership을 정리한다.

DB 필드가 필요하다면 `DeploymentPlanArtifact`에 아래와 같은 명시적 identity를 추가하는 방안을 우선 검토한다.

```ts
type DeploymentPlanStateIdentity = {
  baselineDeploymentId: string | null;
  stateObjectKey: string | null;
  lineageSha256: string | null;
  serial: number | null;
};
```

S3 optimization sidecar에만 의존해서는 안 된다. 현재 계약상 optimization evidence 저장 실패는 Plan 자체를 실패시키지 않으므로, Apply 안전성에 필수인 state identity는 Plan 승인 snapshot 또는 동등한 durable record에 남겨야 한다.

### 4.3 회귀 테스트

- 이전 `SUCCESS` Deployment state가 있는 신규 Deployment Plan이 그 state를 복원한다.
- Plan과 Apply가 같은 baseline Deployment ID와 lineage/serial을 사용한다.
- Plan 후 다른 Deployment가 state를 갱신하면 Apply는 Terraform 실행 전에 차단된다.
- 최신 Deployment가 `DESTROYED`이면 오래된 state로 fallback하지 않는다.
- account, region 또는 target identity가 다른 state를 선택하지 않는다.
- state 업로드에 실패한 최신 성공 기록이 있으면 오래된 state로 조용히 fallback하지 않는다.

## 5. 개선 항목 2: no-change도 일반 release 완료 규칙 사용

### 5.1 현재 문제

verified no-change 경로는 Terraform Apply를 생략한 뒤 `executeApplicationRelease()`를 호출하지만 다음 값을 전달하거나 처리하지 않는다.

- `leaseFence`
- lease heartbeat failure가 결합된 `executionSignal`
- `partially_failed`
- `cancelled`
- `partially_cancelled`

따라서 application release가 부분 실패 또는 취소로 끝나도 Deployment가 `SUCCESS`가 될 수 있다. lease를 잃은 worker도 release mutation을 계속할 수 있다.

### 5.2 목표 설계

no-change는 Terraform 실행 여부만 최적화한다. application release의 승인, fencing, cancellation, 결과 저장 규칙은 일반 `full_stack` 경로와 완전히 같아야 한다.

공통 helper를 추출한다.

```ts
executeAndFinalizeApplicationRelease({
  deployment,
  accessContext,
  leaseFence,
  abortSignal,
  repository
});
```

이 helper는 다음을 한곳에서 처리한다.

1. `activeStage`를 `application_release`로 변경한다.
2. `leaseFence`와 combined `AbortSignal`을 trusted release worker에 전달한다.
3. `succeeded`, `partially_failed`, `cancelled`, `partially_cancelled`를 각각 올바른 Deployment 상태로 변환한다.
4. 성공일 때만 `completeDeploymentApply()`를 호출한다.
5. terminal write에서 fencing version을 다시 확인한다.

### 5.3 회귀 테스트

- no-change `full_stack` release가 `partially_failed`를 반환하면 `PARTIALLY_FAILED`를 유지한다.
- `cancelled`는 `CANCELLED`, `partially_cancelled`는 `PARTIALLY_CANCELED`를 유지한다.
- release 호출에 현재 `leaseFence`가 전달된다.
- lease heartbeat 실패 시 release signal이 abort되고 `completeDeploymentApply()`가 호출되지 않는다.
- 성공한 no-change `infrastructure`는 application release를 실행하지 않는다.
- 성공한 no-change `full_stack`은 Terraform CLI를 실행하지 않지만 application release는 실행한다.

## 6. 개선 항목 3: ECS worker graceful cancellation

### 6.1 현재 문제

운영 취소 경로는 ECS `StopTask`로 deployment worker를 종료한다. 그러나 `deployment-worker.ts`는 `SIGTERM`이나 `SIGINT`를 `AbortController`로 변환하지 않는다.

worker가 바로 종료되면 `runDeploymentApply()`의 cancellation 분기와 `uploadPartialStateAfterFailedApply()`가 실행될 기회를 잃는다. AWS에는 일부 리소스가 생성됐지만 RDS와 S3에는 cleanup 가능한 최신 state가 없을 수 있다.

### 6.2 목표 설계

1. worker entrypoint에 process-level `AbortController`를 둔다.
2. `SIGTERM`과 `SIGINT`를 받으면 signal을 abort하되 즉시 `process.exit()`하지 않는다.
3. signal을 `createDeploymentWorkerOperationRunner()`와 Terraform/application release까지 전달한다.
4. Terraform child process를 종료한 뒤 partial state 업로드와 fenced terminal write를 기다린다.
5. ECS task definition의 `stopTimeout`이 Terraform 종료 grace와 state 업로드 시간을 감당하는지 확인한다.
6. grace 안에 cleanup을 완료하지 못하면 API가 worker terminal 상태를 확인하고 복구 필요 `FAILED` summary를 남긴다.
7. application release 단계는 기존 recovery worker로 durable step과 실제 AWS 상태를 재검증한다.

API cancellation 요청과 ECS `StopTask` 사이에 별도 cooperative cancellation 신호를 둘 수 있다면 다음 순서를 권장한다.

```text
cancellationRequestedAt 저장
-> worker가 polling/runtime signal로 abort 시작
-> Terraform child 종료와 partial state 업로드
-> grace 초과 시 ECS StopTask fallback
-> task terminal 확인
-> fenced terminal 상태 확정
```

### 6.3 회귀 테스트

- worker가 `SIGTERM`을 받으면 operation `AbortSignal`이 abort된다.
- Terraform Apply 중 abort 시 partial state 업로드를 시도한다.
- partial state 업로드 성공 시 `FAILED`, `failureStage: "apply"`, `stateObjectKey`를 저장한다.
- state 업로드 실패 시 확인 필요 warning과 실패 원인을 남긴다.
- application release 취소는 recovery worker가 실제 ECS 상태를 확인하기 전 성공 또는 완전 취소로 확정되지 않는다.
- worker가 이미 terminal이면 중복 StopTask와 중복 terminal write를 수행하지 않는다.

## 7. 개선 항목 4: Apply 성공과 후처리 결과 분리

### 7.1 현재 문제

Terraform Apply 성공 후 output/state/resource inventory를 모아 `saveDeploymentApplyResults()`로 저장한다. 이 저장이나 일부 로그 기록이 실패하면 outer catch가 `failDeployment()`를 호출해 Deployment를 `FAILED`로 바꾼다.

이 상태에서는 실제 AWS Apply 성공과 SketchCatch metadata 저장 실패가 같은 실패로 표시된다. state가 S3에 업로드됐더라도 DB pointer 저장 전에 예외가 발생하면 cleanup 경로가 해당 state를 찾지 못할 수 있다.

### 7.2 목표 설계

실행을 다음 두 경계로 나눈다.

```text
Cloud mutation boundary
  terraform apply tfplan
  -> 성공/실패 확정

Post-apply evidence boundary
  output 수집
  state inspection
  state S3 upload
  resource/output DB 저장
  Deployment terminal 저장
```

구현 원칙:

1. `terraform apply` 성공 여부를 별도 변수 또는 명시적 outcome으로 유지한다.
2. Apply 성공 이후의 예외를 일반 `failDeploymentApplyRun()`으로 보내지 않는다.
3. output/state/inventory의 개별 실패는 누적 warning으로 만든다.
4. state 업로드가 성공하면 다른 결과 저장보다 먼저 fenced `stateObjectKey` checkpoint를 남긴다.
5. DB transaction 결과가 모호하면 같은 idempotency key로 재조회해 commit 여부를 확인한다.
6. terminal 저장이 끝내 실패하면 startup reconciliation이 S3 Apply evidence와 worker job을 확인해 복구할 수 있게 한다.
7. 로그 저장 실패는 cloud mutation 결과를 바꾸지 않는다.

필요하다면 `Deployment` status를 즉시 늘리기보다 기존 `RUNNING`과 worker job recovery를 활용하고, 실제 성공 증거 없이 `SUCCESS` 또는 `FAILED`를 추정하지 않는다.

### 7.3 회귀 테스트

- output JSON 파싱 실패 후 `SUCCESS`와 warning을 유지한다.
- state inspection 실패 후 `SUCCESS`와 warning을 유지한다.
- state 업로드 실패 후 `SUCCESS`, `stateObjectKey: null`, warning을 유지한다.
- state 업로드 성공 후 output/resource 저장 실패가 발생해도 state checkpoint를 잃지 않는다.
- duration/warning 로그 저장 실패가 terminal Deployment 결과를 바꾸지 않는다.
- DB 응답이 실패했지만 transaction이 commit된 경우 중복 resource/output을 만들지 않는다.
- worker가 terminal 저장 전에 종료되면 startup reconciliation이 실제 Apply outcome을 복구한다.

## 8. 개선 항목 5: application release 실패 단계 수정

### 8.1 현재 문제

일반 `full_stack`과 `application` scope에서 application release가 실패하면 `failDeploymentApplyRun()`을 호출한다. 이 helper는 `failureStage: "apply"`를 고정한다.

화면은 `failureStage`를 기준으로 개발자 점검 항목을 고르므로 ECS/ECR/S3/CloudFront 실패에도 Terraform stderr, `tfplan` hash, state를 우선 확인하라고 안내한다.

### 8.2 목표 설계

terminal failure helper가 실제 stage를 받도록 변경한다.

```ts
failDeploymentRun({
  failureStage: "apply" | "application_release" | "rollback",
  ...
});
```

- Terraform command 실패는 `apply`를 사용한다.
- output reconciliation과 trusted runtime activation 실패는 `application_release`를 사용한다.
- baseline 복구 또는 cancellation recovery 실패는 `rollback`을 사용한다.
- 기존 `stateObjectKey`와 Terraform Apply 결과는 application release 실패 뒤에도 보존한다.

### 8.3 회귀 테스트

- `application` scope release 실패가 `failureStage: "application_release"`로 저장된다.
- `full_stack` Terraform 성공 후 release 실패도 `application_release`로 저장된다.
- Terraform Apply 자체 실패는 계속 `apply`로 저장된다.
- UI가 application release 실패에 CodeBuild, ECR digest, ECS health, S3/CloudFront evidence를 안내한다.

## 9. 권장 구현 순서

### Slice 1: 실패를 재현하는 테스트 추가

- 신규 Deployment 재배포 state 불일치
- no-change partial/cancel outcome
- no-change lease heartbeat failure
- ECS worker SIGTERM cancellation
- post-apply DB/log 저장 실패
- application release failure stage

테스트가 현재 구현에서 실패하는 것을 먼저 확인한다.

### Slice 2: Plan/Apply state identity 통일

- state baseline 선택 helper 통합
- Plan 전 state 복원
- approved Plan state identity 저장
- Apply 직전 identity 재검증

이 단계가 끝나기 전에는 재배포 Apply 개선을 완료로 표시하지 않는다.

### Slice 3: application release 완료 경로 통합

- no-change와 일반 경로가 같은 release helper 사용
- lease fence와 combined signal 전달
- partial/cancel 결과 보존

### Slice 4: post-apply checkpoint와 terminal 저장 정리

- cloud mutation outcome과 metadata outcome 분리
- state checkpoint 선저장
- idempotent 결과 저장과 복구 경로 추가

### Slice 5: graceful worker cancellation

- worker signal handling
- ECS stop timeout 검증
- partial state와 recovery evidence 저장

### Slice 6: failure stage와 UI 진단 정리

- stage-aware failure helper
- API/공유 타입/화면 회귀 테스트

## 10. 예상 변경 파일

### Shared contract

- `packages/types/src/index.ts`
- `docs/data-models.md`

### API와 worker

- `apps/api/src/deployments/deployment-service.ts`
- `apps/api/src/deployments/deployment-plan-service.ts`
- `apps/api/src/deployments/deployment-approval-service.ts`
- `apps/api/src/deployments/deployment-apply-service.ts`
- `apps/api/src/deployments/deployment-worker-service.ts`
- `apps/api/src/deployments/deployment-worker-dispatcher.ts`
- `apps/api/src/deployment-worker.ts`
- `apps/api/src/routes/deployments.ts`
- 관련 API/worker 테스트

### Web

- `apps/web/features/workspace/deployment-presentation.ts`
- `apps/web/features/workspace/DirectDeploymentScreen.tsx`
- 관련 Workspace 테스트

### Canonical docs

- `docs/architecture.md`
- `docs/deployment.md`
- `docs/data-models.md`

Plan state identity를 DB에 추가한다면 `apps/api/drizzle/**` migration이 필요하다. 실제 구현 세션에서는 migration 번호를 정하기 전에 최신 번호를 다시 확인하고 `🚨 DB MIGRATION` 협업 경고를 먼저 공유해야 한다.

## 11. 완료 조건

1. 신규 재배포 Plan과 Apply가 같은 state baseline과 lineage/serial을 사용한다.
2. state identity가 바뀌면 AWS credential 준비와 Terraform 실행 전에 Apply를 차단한다.
3. no-change `full_stack`이 일반 release와 같은 fencing, cancellation, partial failure 규칙을 사용한다.
4. ECS worker 취소 시 가능한 partial state를 S3와 Deployment record에 남긴다.
5. Terraform Apply 성공 이후 후처리 장애가 해당 cloud mutation을 Terraform 실패로 바꾸지 않는다.
6. application release 실패가 `failureStage: "application_release"`로 표시된다.
7. sensitive output, AWS credential, token, state 원문을 로그나 API 응답에 노출하지 않는다.
8. Direct Deployment와 Git/CI/CD 실행의 프로젝트 단일 lease 규칙이 유지된다.
9. 변경 범위의 집중 회귀 테스트와 `pnpm migration:compatibility:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`, `git diff --check`가 통과한다. 전체 테스트는 별도 필요성이 있거나 사용자가 요청할 때 실행한다.
10. 실제 AWS 검증이 필요하면 별도 승인, 비용 범위, cleanup plan과 결과 evidence를 기록한다.

## 12. 배포 중단 기준

다음 중 하나라도 확인되면 Apply 개선을 운영에 배포하지 않는다.

- Plan과 Apply의 state baseline 또는 lineage/serial이 다르다.
- no-change 경로가 `leaseFence` 없이 application release를 실행한다.
- partial/cancel release 결과가 `SUCCESS`로 바뀐다.
- worker 취소 뒤 AWS Resource가 남았는데 최신 partial state를 찾을 수 없다.
- Apply 성공 후 metadata 장애가 state pointer를 잃은 `FAILED`를 만든다.
- application release 실패가 Terraform Apply 실패로 표시된다.
- 기존 승인 artifact/hash/account/region 검증이 약화된다.

## 13. 점검 및 검증 기록

문서 작성 전 점검에서 다음 결과를 확인했다.

- API Apply/Plan/Approval/Worker/Optimization 집중 테스트: 90/90 통과
- Web Direct Deployment 집중 테스트: 97/97 통과
- `pnpm harness:check`: 통과
- `git diff --check`: 통과

현재 테스트 통과는 위 문제들이 없다는 뜻이 아니다. 신규 Deployment state 승계, no-change release terminal outcome, ECS worker SIGTERM, Apply 성공 후 DB 저장 장애 시나리오가 기존 테스트에 포함되지 않아 별도 회귀 테스트가 필요하다.

이 점검에서는 실제 Terraform Apply/Destroy, AWS Resource mutation, Git/CI/CD handoff를 실행하지 않았다.

## 14. 2026-07-19 구현 결과

- `DeploymentPlanArtifact`에 baseline Deployment ID, state object key, lineage hash, serial을 저장하고 migration `0053_deployment_plan_state_identity`를 추가했다.
- 신규 재배포 Plan은 프로젝트의 최신 호환 state를 복원하며, Apply는 현재 baseline identity가 다르면 AWS credential 준비 전에 새 Plan을 요구한다.
- verified no-change `full_stack`도 일반 release와 같은 lease fence, 결합 `AbortSignal`, partial/cancel outcome 처리를 사용한다.
- deployment worker는 `SIGTERM`/`SIGINT`를 operation `AbortSignal`로 전달하며 ECS worker `stopTimeout`을 120초로 설정했다.
- Terraform Apply 성공 후 state upload가 끝나면 resource/output 저장보다 먼저 fenced state checkpoint를 남긴다. 결과 저장 실패는 `SUCCESS` warning으로 남기고 Terraform 성공을 `FAILED`로 뒤집지 않는다.
- application output reconciliation 및 runtime release 예외는 `failureStage: "application_release"`로 저장한다.
- 집중 Plan/Apply/worker 테스트 65개와 migration compatibility, production infrastructure structure, lint, typecheck, build, harness, diff 검사가 통과했다. 사용자 요청에 따라 전체 테스트는 실행하지 않았다.
- 실제 AWS Apply/Destroy는 실행하지 않았다. 검증 명령과 결과는 `agent-progress.md`에 기록한다.
