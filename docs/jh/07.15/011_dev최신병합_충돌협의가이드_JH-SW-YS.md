# `dev` 최신 병합 충돌 점검 및 통합 가이드

## 1. 이 문서가 답하는 것

이 문서는 현재 JH 작업본에 최신 `origin/dev`를 병합할 때 실제로 충돌하는 파일과 양쪽 변경 의도, 보존해야 할 기능, 권장 해결 방법을 정리한다.

이번 점검에서는 실제 merge, rebase, checkout을 수행하지 않았다. 현재 dirty worktree를 변경하지 않고 `git merge-tree`로 3-way 가상 병합만 수행했다.

## 2. 비교 기준

점검 시각은 2026-07-17이며 `git fetch origin dev` 실행 후 비교했다.

| 항목 | 값 |
| --- | --- |
| 현재 브랜치 | `codex/demo-repository-owner-parity` |
| 현재 HEAD | `5efd6dd463efca7184a6e3be7ceff593f9bd8d21` |
| 최신 `origin/dev` | `783d30b70d82adea9692e3da3b8f0ca48bfca0ea` |
| 공통 조상 | `0caeecbd8cc7811cb1ca145d40687a096fe6b16c` |
| 현재 브랜치 고유 commit | 7개 |
| `origin/dev` 고유 commit | 9개 |
| tracked 미커밋 작업 포함 여부 | 포함. `git stash create`로 작업 tree만 임시 계산했으며 실제 stash 저장이나 worktree 변경은 하지 않음 |
| untracked add/add 충돌 | 없음 |
| 실제 text conflict | 7개 |
| 실제 병합 수행 | 하지 않음 |

커밋된 HEAD만 비교한 결과와 tracked 미커밋 작업까지 포함한 결과 모두 같은 7개 파일에서 충돌했다. 따라서 아래 목록은 현재 작업을 커밋한 뒤 병합해도 그대로 발생할 가능성이 높다.

## 3. 최신 `dev` 변경 의도

### 3.1 SW 운영 릴리즈 안전 보강

관련 commit은 `0b69e1a1` (`Fix: 운영 릴리즈 리뷰 피드백 반영 (#450)`)이다.

이 변경이 하는 일은 다음과 같다.

- `iam:PassRole`을 일반 IAM wildcard action에서 분리한다.
- `iam:PassedToService` 조건으로 PassRole 대상 AWS service를 제한한다.
- Terraform workspace 준비와 Plan 다운로드를 병렬 실행할 때 한쪽이 먼저 실패해도 늦게 만들어진 workspace를 반드시 cleanup한다.
- application cleanup plan에서 nullable `targetKind`를 `!`로 강제하지 않고 먼저 검증한다.

이 변경은 현재 JH 기능을 대체하는 기능이 아니라 반드시 함께 보존해야 하는 권한 및 임시 파일 정리 안전장치다.

### 3.2 Dashboard 연결 정보 캐시

관련 commit은 다음 두 개다.

- `666f6b0a` — 비용과 연결 화면 재방문 캐시 적용
- `b5734d9f` — Dashboard 변경 후 관련 캐시 갱신

이 변경이 하는 일은 다음과 같다.

- AWS 연결 목록을 직접 `useEffect`로 매번 조회하지 않고 React Query로 캐시한다.
- 연결 생성, 검증, 재검증, 삭제 후 AWS 연결·Dashboard·Cost query를 함께 invalidate한다.
- 화면 재방문 시 기존 데이터를 유지하면서 백그라운드로 갱신한다.

현재 JH 설정 화면은 단순 연결 목록보다 더 많은 `AWS connection settings` 정보를 사용하므로 `dev` 파일을 그대로 선택할 수는 없다.

## 4. 실제 text conflict 7개

| 번호 | 파일 | 현재 JH 작업 의도 | 최신 `dev` 의도 | 분류 |
| --- | --- | --- | --- | --- |
| 1 | `apps/api/src/aws-connections/aws-connection-service.ts` | CodeBuild, CodeConnections, Permissions Boundary, managed Role 제한을 포함한 배포 권한 생성 | PassRole을 service 조건이 있는 별도 Allow로 제한 | 수동 결합 필수 |
| 2 | `apps/api/src/aws-connections/aws-connection-service.test.ts` | 통합 배포와 IAM/CodeBuild 연결 권한 회귀 검증 | PassRole wildcard 제거와 service 조건 검증 | 두 테스트 모두 보존 |
| 3 | `apps/api/src/deployments/deployment-apply-service.ts` | execution lease, Release Candidate, 애플리케이션 릴리즈와 Terraform Apply 연결 | 병렬 준비 실패 시 Terraform workspace 누수 방지 | 수동 결합 필수 |
| 4 | `apps/api/src/deployments/deployment-apply-service.test.ts` | full-stack/application Apply와 릴리즈 계약 검증 | Plan 다운로드 실패 시 workspace cleanup 검증 | 두 테스트 모두 보존 |
| 5 | `apps/api/src/deployments/deployment-destroy-service.ts` | execution lease와 application cleanup/rollback을 포함한 Destroy | workspace cleanup 경합 방지와 nullable `targetKind` 검증 | 수동 결합 필수 |
| 6 | `apps/api/src/deployments/deployment-plan-service.ts` | preflight, build evidence, Release Candidate와 Terraform Plan 연결 | workspace 준비 Promise가 늦게 끝나도 cleanup 보장 | 수동 결합 필수 |
| 7 | `apps/web/app/dashboard/settings/settings-dashboard-client.tsx` | enriched AWS settings, CodeConnections, cleanup preview, 개발자 오류 진단 | React Query 캐시 및 Dashboard/Cost 동시 invalidate | 화면 상태 모델 결합 필요 |

`git checkout --ours` 또는 `git checkout --theirs`로 파일 전체를 선택하면 위 안전 기능 중 한쪽이 사라진다. 7개 모두 hunk 단위로 해결해야 한다.

## 5. 충돌별 권장 해결

### 5.1 AWS Role의 `iam:PassRole`

#### 현재 JH 작업본

현재 `terraformFargateIamActions`에 `iam:PassRole`이 포함되어 `Resource: "*"` Allow를 받는다. 별도로 `SketchCatchCodeBuild-*` Role에는 Permissions Boundary와 `iam:PassedToService=codebuild.amazonaws.com` Deny 안전장치가 있다.

#### 최신 `dev`

`iam:PassRole`을 일반 action 배열에서 제거하고 다음 service만 허용하는 별도 statement를 추가한다.

- `autoscaling.amazonaws.com`
- `codebuild.amazonaws.com`
- `codedeploy.amazonaws.com`
- `codepipeline.amazonaws.com`
- `ec2.amazonaws.com`
- `ecs-tasks.amazonaws.com`
- `eks.amazonaws.com`
- `lambda.amazonaws.com`

#### 권장 결합 결과

1. `terraformFargateIamActions`에서 `iam:PassRole`을 제거한다.
2. 최신 `dev`의 service 조건부 PassRole Allow를 JSON policy와 CloudFormation template 양쪽에 추가한다.
3. JH 작업본의 CodeBuild action, CodeConnections action, Permissions Boundary와 `SketchCatchCodeBuild-*` Deny statement는 유지한다.
4. `Resource: "*"`인 action 배열에 `iam:PassRole`이 다시 포함되지 않는지 테스트한다.
5. CloudFormation template과 API가 반환하는 policy document가 같은 조건을 생성하는지 함께 검증한다.

한쪽만 선택하면 다음 문제가 생긴다.

- JH 쪽만 선택: PassRole 권한 범위가 지나치게 넓게 유지된다.
- `dev` 쪽만 선택: CodeBuild/CodeConnections와 Permissions Boundary 기능이 사라질 수 있다.

### 5.2 Terraform workspace cleanup 경합

#### 문제가 발생하는 경우

서비스는 Plan Artifact 다운로드와 Terraform workspace 준비를 `Promise.all`로 동시에 실행한다. Plan 다운로드가 먼저 실패하고 workspace 준비가 나중에 성공하면 기존 `workspace?.cleanup()` 시점에는 workspace 변수가 아직 비어 있을 수 있다. 이후 생성된 임시 디렉터리가 삭제되지 않는다.

#### 최신 `dev` 해결 방식

`workspacePromise`를 별도로 보관하고 `finally`에서 다음 helper를 호출한다.

```ts
await cleanupPreparedTerraformWorkspace({ workspace, workspacePromise });
```

helper는 이미 완성된 workspace가 있으면 즉시 정리하고, 아직 준비 중이면 Promise 완료를 기다린 뒤 정리한다. workspace 준비 자체가 실패하면 cleanup 없이 종료한다.

#### 권장 결합 결과

다음 JH 기능을 그대로 둔 상태에서 cleanup 계약만 이식한다.

- project execution lease와 fencing
- approved Plan/Artifact hash 검증
- Release Candidate 및 application release
- Runtime 좌표와 rollback 처리
- 상태와 로그 기록

적용 대상은 다음 세 서비스다.

- `deployment-plan-service.ts`
- `deployment-apply-service.ts`
- `deployment-destroy-service.ts`

application-only Apply/Destroy 경로에도 동일한 방식이 필요하다. `workspacePromise`를 선언만 하고 일부 경로에서 기존 `workspace?.cleanup()`을 남기면 보호가 불완전하다.

### 5.3 Destroy의 nullable `targetKind`

현재 application cleanup plan은 `deployment.targetKind!`를 사용한다. 최신 `dev`는 먼저 값의 존재를 검사하고 없으면 `DeploymentConflictError("Deployment target kind is missing")`를 반환한다.

권장 결과는 최신 `dev`의 fail-closed 검사를 유지하는 것이다. JH의 application cleanup과 rollback 흐름은 유지하되 non-null assertion은 제거한다.

### 5.4 AWS 설정 화면

#### 현재 JH 화면에서 반드시 보존할 기능

- `listAwsConnectionSettings()` 응답에서 active/verified/cleanup retry 상태 분리
- verified AWS 연결별 CodeConnections 상태 조회
- AWS가 연결되지 않았을 때 안내 모달
- managed Resource 삭제 미리보기와 confirmation token 확인
- `getApiErrorMessage()`를 통한 실패 단계, 서버 원인, 개발자 확인 항목 표시
- 기존 CloudFormation Role 생성과 연결 재개

#### 최신 `dev`에서 반드시 보존할 기능

- React Query 기반 재방문 캐시
- `keepPreviousData`를 사용한 백그라운드 갱신
- 생성·검증·삭제 후 `invalidateAwsConnectionQueries()` 호출
- AWS 연결 변경 후 Dashboard와 Cost query도 함께 갱신

#### 권장 결합 결과

기존 `useAwsConnectionsQuery()`를 그대로 사용하면 enriched settings 응답과 CodeConnections 상태가 사라진다. 다음 중 하나로 통합하되 첫 번째를 권장한다.

1. `useAwsConnectionSettingsQuery()`를 추가해 `listAwsConnectionSettings()`를 query function으로 사용한다.
2. query 결과에서 `deriveAwsConnectionSettingsState()`를 실행해 active/verified/cleanup retry를 계산한다.
3. verified connection ID 목록이 바뀌면 CodeConnections 상태를 query 또는 병렬 fetch로 갱신한다.
4. 모든 mutation 성공 후 `invalidateAwsConnectionQueries(queryClient, user?.id)`를 호출한다.
5. 삭제는 `dev`의 단순 재클릭 삭제가 아니라 JH의 managed cleanup preview와 confirmation token 흐름을 유지한다.
6. query 오류와 mutation 오류 모두 `getApiErrorMessage()`로 개발자 진단을 표시한다.

이 충돌은 단순 UI 코드 선택 문제가 아니다. `dev` 파일 전체를 선택하면 안전한 AWS 정리와 GitHub 빌드 연결 UI가 사라지고, JH 파일 전체를 선택하면 Dashboard 캐시 일관성이 깨진다.

## 6. 같은 파일을 양쪽이 변경했지만 자동 병합되는 항목

다음 4개 파일은 `git merge-tree`가 자동 병합했지만 실제 해결 후 관련 테스트를 실행해야 한다.

| 파일 | 확인할 내용 |
| --- | --- |
| `apps/api/src/deployments/deployment-destroy-plan-service.test.ts` | application/full-stack Destroy Plan 계약과 workspace cleanup 테스트가 모두 남는지 확인 |
| `apps/api/src/deployments/deployment-destroy-service.test.ts` | lease/rollback 테스트와 workspace cleanup/nullable target 테스트가 모두 남는지 확인 |
| `apps/api/src/deployments/deployment-plan-service.test.ts` | preflight/Release Candidate 테스트와 cleanup 경합 테스트가 모두 남는지 확인 |
| `pnpm-lock.yaml` | React Query 항목과 현재 브랜치 package 변경이 모두 존재하며 불필요한 lockfile 재작성은 없는지 확인 |

자동 병합 성공은 기능 계약이 보존됐다는 뜻이 아니다. 특히 테스트 파일은 이름 충돌 없이 추가되더라도 같은 fake repository나 fixture의 기본값이 바뀌어 실패할 수 있다.

## 7. 이번 최신 `dev`와 직접 충돌하지 않는 항목

- `apps/api/drizzle/0047_independent_git_cicd_workflow_runs.sql`
- `apps/api/drizzle/0048_repair_github_installation_connections.sql`
- `apps/api/drizzle/meta/_journal.json`
- Git/CI/CD readiness 신규 파일
- Live Observation 신규 계약 및 화면 파일
- 개발자 오류 진단 helper와 테스트

위 항목은 이번 `origin/dev` 변경과 add/add 또는 text conflict가 없다. 다만 실제 병합 후 typecheck와 관련 테스트로 API 등록 및 shared type 연결을 확인해야 한다.

## 8. 권장 병합 순서

1. 현재 미커밋 작업을 기능 단위로 검토하고 커밋한다.
2. 최신 `origin/dev`를 현재 브랜치에 merge한다.
3. AWS IAM service/test 충돌을 먼저 해결한다.
4. `terraform-workspace.ts`의 cleanup helper를 기준으로 Plan → Apply → Destroy 순서로 해결한다.
5. 배포 서비스 테스트 충돌을 해결하고 cleanup 경합 테스트를 먼저 실행한다.
6. AWS 설정 화면을 enriched query + React Query 방식으로 결합한다.
7. `pnpm-lock.yaml`은 양쪽 package manifest를 확인한 뒤에만 정리한다.
8. conflict marker와 unmerged path가 없는지 확인한다.
9. 아래 최소 검증을 실행한다.

## 9. 필요한 최소 검증

불필요한 전체 테스트를 먼저 실행하지 않는다. 충돌 범위에 맞춰 다음 순서로 검증한다.

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/aws-connections/aws-connection-service.test.ts \
  src/deployments/deployment-plan-service.test.ts \
  src/deployments/deployment-apply-service.test.ts \
  src/deployments/deployment-destroy-plan-service.test.ts \
  src/deployments/deployment-destroy-service.test.ts

pnpm --filter @sketchcatch/web exec tsx --test \
  features/dashboard/aws-connection-settings.test.ts \
  components/query/create-query-client.test.ts \
  features/api-client-error-diagnostics.test.ts

pnpm --filter @sketchcatch/api typecheck
pnpm --filter @sketchcatch/web typecheck
pnpm --filter @sketchcatch/api lint
pnpm --filter @sketchcatch/web lint
git diff --check
pnpm harness:check
```

충돌 해결로 package manifest 또는 shared type이 바뀌었으면 마지막에 전체 `pnpm build`를 추가한다.

## 10. 완료 조건

다음 조건을 모두 만족해야 최신 `dev` 통합이 완료된 것으로 본다.

- 7개 text conflict가 hunk 단위로 해결됐다.
- generic wildcard IAM statement에 `iam:PassRole`이 없다.
- 조건부 PassRole과 JH의 CodeBuild/CodeConnections/Permissions Boundary가 함께 존재한다.
- Plan/Apply/Destroy와 application-only 경로가 늦게 생성된 Terraform workspace까지 cleanup한다.
- application cleanup의 `targetKind`가 fail-closed로 검증된다.
- AWS 설정 화면에서 CodeConnections, cleanup preview, 개발자 진단이 유지된다.
- AWS 설정 화면 재방문 캐시와 mutation 후 Dashboard/Cost invalidation이 동작한다.
- 자동 병합된 테스트와 lockfile을 사람이 검토했다.
- 관련 테스트, lint, typecheck, diff check, harness check가 통과했다.

## 11. 현재 결론

이번 최신 `dev` 병합에서 제품 방향을 새로 결정해야 하는 충돌은 없다. 양쪽 변경은 대체 관계가 아니라 결합 관계다.

- SW 변경은 IAM 권한 축소와 workspace cleanup 안정성을 제공한다.
- Dashboard 변경은 조회 캐시와 mutation 후 데이터 일관성을 제공한다.
- JH 변경은 CodeBuild/CodeConnections, 배포 실행 계약, 안전한 AWS cleanup, 개발자 오류 진단을 제공한다.

따라서 권장 전략은 한쪽 파일을 선택하는 것이 아니라, JH 기능 위에 최신 `dev`의 보안·cleanup·캐시 계약을 이식하는 것이다.
