# Git/CI/CD 설정 수렴 및 PR 재시도 설계

- 작성일: 2026-07-22
- 상태: 설계 방향 승인 · 작성 명세 검토 대기
- 대상: Workspace Delivery의 Git/CI/CD Phase 3
- 문서 성격: 구현 작업 명세. 확정 계약은 구현과 함께 `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`에 반영한다.

## 1. 목적

이 기능은 사용자가 한 번 승인하면 SketchCatch가 현재 프로젝트에 필요한 GitHub 설정과 AWS 신뢰 정책을 실제 외부 상태와 일치시키고, 배포 설치 PR을 생성하거나 복구한다.

현재는 PR 생성, Repository 설정 적용, AWS Role trust 적용이 서로 분리되어 있다. PR만 생성되어도 Phase 3이 완료되므로 GitHub에 예전 `SKETCHCATCH_PROJECT_ID`가 남은 상태에서 Pipeline으로 넘어갈 수 있다. 또한 PR 생성 뒤 DB 저장이 실패하거나 기존 PR이 닫히면 동일 작업을 안전하게 재개할 수 없다.

이 설계는 다음 결과를 보장한다.

- 한 번의 `설정 적용 및 PR 생성` 승인으로 GitHub 설정, AWS 신뢰 정책, PR을 순서대로 처리한다.
- 각 외부 상태를 다시 읽어 기대값과 일치한 경우에만 완료로 기록한다.
- 어느 단계에서 실패해도 성공한 외부 작업을 다시 확인한 뒤 같은 handoff에서 이어서 진행한다.
- 잘못된 설정이나 닫힌 PR 때문에 Direct Deployment를 Destroy하거나 다시 배포하지 않는다.
- 실제 PR merge, Pipeline 실행, Terraform Apply, Destroy는 이 승인에 포함하지 않는다.

## 2. 선택한 접근법

### 선택: API reserve, durable setup worker와 단계 원장

API가 하나의 설정 명령을 DB에 reserve하고 durable setup worker가 다음 세 단계를 소유한다.

1. AWS OIDC provider와 Role trust 수렴 및 검증
2. GitHub Repository 설정 수렴 및 검증
3. PR 생성, 갱신 또는 재사용 및 검증

외부 mutation 전에 handoff와 단계 상태를 RDS에 먼저 저장하고 production mutation은 API request process가 아니라 식별 가능한 ECS setup worker에서 실행한다. 각 단계는 read-before-write와 read-after-write를 사용한다. 응답 유실이나 DB 저장 실패 뒤에도 다음 요청에서 외부 상태를 다시 읽어 이미 성공한 작업을 복구한다. provider 요청 결과를 알 수 없는 경우에는 자동으로 다음 worker가 덮어쓰지 않고 격리한다.

### 제외한 접근법

#### 프런트엔드에서 기존 API 세 개를 연속 호출

변경량은 작지만 browser refresh, 탭 종료, 네트워크 단절과 부분 실패를 서버가 복구할 수 없다. 프런트엔드 성공 상태와 실제 GitHub/AWS 상태가 다시 분리되므로 제외한다.

#### 기존 JSONB 필드만 확장

단계 결과를 표시하는 데는 충분하지만 동일 revision의 동시 실행, lease, 외부 성공 후 DB 실패, 단계별 attempt를 DB 수준에서 보장하기 어렵다. 운영 검증 비용이 큰 이번 요구에는 적합하지 않다.

## 3. 사용자 승인 경계

Phase 3에는 변경 내용을 한 화면에서 보여주고 하나의 실행 버튼을 둔다.

- GitHub Environment 이름과 허용 branch
- SketchCatch가 관리할 Actions variable 이름과 비민감 값
- 삭제할 미사용 관리 variable
- AWS OIDC provider 생성 여부
- AWS Role trust에 추가하거나 갱신할 정확한 statement
- 생성하거나 갱신할 PR 파일, 제목과 대상 branch

버튼 클릭은 위 변경 전체에 대한 명시적 사용자 승인이다. 별도 Repository 설정 체크박스, AWS 체크박스와 개별 적용 버튼은 제거한다. 서버는 승인 사용자와 승인 시각을 저장한다.

기존 `UserAcceptedChange` 경계를 유지하고 accepted configuration revision을 승인 detail hash로 연결한다. 동일 revision의 실패 재개와 read-only reconciliation은 같은 승인을 재사용하므로 다시 체크받지 않는다. 서버가 계산한 revision이 바뀐 경우에만 새 preview와 새 승인을 요구한다.

이 승인은 다음 동작을 승인하지 않는다.

- PR merge 또는 강제 merge
- GitHub Actions workflow dispatch
- Terraform Plan, Apply 또는 Destroy
- 애플리케이션 release 실행
- 사용자 소유 Git branch나 관리 대상이 아닌 Repository variable 변경

## 4. 영속 상태와 migration

최신 확인 migration은 `0054_remove_practice_live_profile.sql`이다. 구현 시 다음 번호를 다시 확인하고 팀과 번호를 조정한다. 현재 예상 번호는 `0055`다.

### `git_cicd_handoffs` 확장

다음 필드를 추가한다.

| 필드 | 계약 |
| --- | --- |
| `github_repository_id` | 이름 변경과 동명이 Repository를 구분하는 GitHub immutable ID |
| `configuration_revision` | 현재 설정 전체의 secret-free SHA-256. 기존 row는 `null` |
| `generated_artifact_revision` | revision 렌더링 뒤 manifest 제외 생성 파일들의 canonical path/hash SHA-256 |
| `setup_source_commit_sha` | 최초 설정 시 확인한 Repository commit provenance. configuration revision에는 미포함 |
| `predecessor_handoff_id` | 새 revision이 기존 SketchCatch PR을 안전하게 인수할 때의 이전 handoff |
| `setup_status` | `action_required`, `waiting_for_execution`, `running`, `quarantined`, `ready`, `superseded` |
| `execution_status` | `blocked`, `awaiting_merge`, `ready`, `drifted` |
| `activated_target_sha` | active revision의 파일을 검증한 target branch commit SHA |
| `setup_authorized_by_user_id` | 이번 통합 설정을 승인한 사용자 |
| `setup_authorized_at` | 통합 설정 승인 시각 |
| `setup_executor_id` | 현재 durable setup worker execution ID |
| `setup_worker_task_arn` | production ECS worker task ARN. local test는 `null` |
| `setup_dispatch_token` | handoff/attempt에서 계산한 비민감 idempotent worker dispatch token |
| `setup_heartbeat_at` | worker 생존 확인 시각 |
| `setup_error_code` | 마스킹된 안정 오류 코드 |
| `setup_error_message` | 비밀값과 raw provider body가 없는 사용자 메시지 |

동일 `(project_id, source_repository_id, target_branch, configuration_revision)`은 하나의 handoff만 가질 수 있다. 기존 handoff는 외부 설정 증거가 없으므로 PR URL이 있어도 `ready`로 backfill하지 않고 `configuration_revision = null`, `setup_status = action_required`로 둔다.

### `git_cicd_handoff_steps`

단계별 상태를 별도 table에 저장한다.

| 필드 | 계약 |
| --- | --- |
| `handoff_id`, `step` | 복합 PK. step은 `repository_settings`, `aws_trust`, `pull_request` |
| `status` | `pending`, `running`, `outcome_unknown`, `verified`, `failed`, `not_required` |
| `attempt_count` | 실제 단계 실행을 시작한 횟수 |
| `desired_revision` | 해당 단계의 기대 상태 hash |
| `observed_revision` | provider read-back으로 확인한 상태 hash |
| `started_at`, `verified_at`, `updated_at` | 실행 및 검증 시각 |
| `last_error_code`, `last_error_message` | 비민감 안정 오류 정보 |

### `git_cicd_repository_bindings`

Repository variable과 고정 workflow 파일은 branch가 아니라 Repository 전체에 영향을 준다. 따라서 하나의 `github_repository_id`는 한 시점에 하나의 SketchCatch project만 소유한다. `main`과 `dev`를 서로 다른 project가 소유하는 것도 허용하지 않는다.

binding table은 `github_repository_id`를 PK로 사용하고 현재 project, source repository, target branch, `active_handoff_id/configuration_revision`, `pending_handoff_id/configuration_revision`, setup/execution 상태와 Repository 전체 설정 lease를 저장한다. setup 상태는 `pending_setup`, `updating`, `action_required`, `quarantined`, `ready`, `retiring`이다. lease에는 owner handoff, token, fencing counter, expiry, `mutation_started_at`, `non_stealable_until`과 heartbeat 시각이 포함된다.

새 revision을 시작하면 첫 외부 mutation 전에 binding을 `updating`으로 바꿔 기존 Pipeline을 fence한다. 이때 이전 ready handoff는 감사 기록으로 남지만 release/infra API는 binding이 `ready`가 아니므로 실행을 거부한다. 새 setup이 모두 검증된 뒤에만 active handoff와 revision을 바꾸고 setup 상태를 `ready`로 만든다. PR이 아직 open이면 execution 상태는 `awaiting_merge`이며 Pipeline API는 계속 차단된다. target branch의 manifest와 생성 파일이 active revision과 일치하는 commit을 검증한 뒤에만 execution 상태를 `ready`로 바꾼다. 명확한 setup 실패는 `action_required`, 결과 불명확은 `quarantined`, target/provider drift는 `drifted`로 유지한다.

setup과 Direct/App/Infra 실행은 기존 `project_execution_leases`를 함께 사용한다. lease source에 `git_cicd_setup`을 추가한다. 설정 승인을 reserve하는 transaction은 project coordination row를 잠그고 binding을 먼저 `pending_setup`으로 바꾼다. 이미 Direct/App/Infra 실행 lease가 있으면 그 실행은 중단하지 않고 setup을 `waiting_for_execution`으로 queue한다. `pending_setup` 이후의 새 Direct/App/Infra 등록은 거부되므로 기존 실행이 끝나면 setup이 다음 소유자가 된다.

pending 상태에서도 이전 `active_*` 값은 감사와 기존 run snapshot 연결을 위해 보존하고 새 handoff/revision은 `pending_*`에 기록한다. 새 setup이 모두 검증된 transaction에서만 pending 값을 active로 승격하고 이전 handoff를 `superseded`로 만든다. provider operation 시작 전 사용자가 pending setup을 취소하면 pending 값만 지우고 이전 ready binding을 복원한다.

`pending_setup` gate는 새 run 등록, retry와 새 side effect 시작에만 적용한다. 승인 transaction보다 먼저 project execution lease를 획득한 기존 run은 저장된 immutable execution snapshot, run ID, OIDC identity와 기존 fencing version을 기준으로 heartbeat, 상태 조회, terminal completion과 cancellation을 계속 처리한다. binding이 pending으로 바뀌었다는 이유로 진행 중 Terraform/Release의 heartbeat나 완료 보고를 거부하지 않는다. 기존 run이 terminal이 되어 lease를 해제한 뒤 setup dispatcher가 이어받는다.

active 실행이 없으면 같은 transaction에서 setup owner로 project execution lease를 획득하고 binding을 `updating`으로 전환한다. release/infra/direct 등록도 동일한 coordination row를 잠근 transaction 안에서 binding gate 확인과 project execution lease 획득을 함께 수행한다. release가 먼저 lease를 얻으면 setup은 기다리고, setup이 먼저 `pending_setup/updating`을 기록하면 release는 side effect 전에 거부된다. setup worker는 모든 provider mutation과 최종 read-back이 끝날 때까지 project execution lease를 유지한다.

coordination lock 순서는 항상 project execution row → Repository binding → AWS Role lease다. 외부 provider 호출 동안 이 DB transaction lock은 유지하지 않고, 획득한 durable lease/fence만 유지한다.

worker loss가 `quarantined`를 만들면 project execution lease가 만료되더라도 durable binding fence가 새 Direct/App/Infra 실행을 계속 차단한다. recovery worker가 새 provider write를 해야 할 때는 project execution lease를 다시 획득해야 한다. setup이 ready 또는 명확한 action-required 상태로 끝난 뒤에만 lease를 해제하며, pending setup 취소는 provider operation이 하나도 시작되지 않은 경우에만 허용한다.

다른 활성 프로젝트가 같은 Repository를 사용하려 하면 외부 변경 전에 `GIT_CICD_REPOSITORY_ALREADY_BOUND`로 중단한다. binding과 Role lease의 active guard FK는 project/handoff 삭제에 `ON DELETE RESTRICT`를 사용해 active mutation lease가 cascade로 사라지지 않게 한다. 삭제 coordinator가 binding을 `retiring`으로 바꾸고 새 mutation을 차단한 뒤, non-stealable window와 진행 중 provider 호출이 끝난 것을 확인해야 guard와 binding을 제거한다. 그 전에는 `GIT_CICD_SETUP_IN_FLIGHT`로 삭제를 중단한다. 안전하게 제거된 뒤 새 프로젝트가 같은 Repository를 정확한 값으로 다시 연결할 수 있다.

### `git_cicd_aws_role_leases`

같은 AWS Role을 여러 프로젝트가 동시에 갱신하지 않도록 Role ARN hash를 PK로 하는 별도 lease row를 둔다. row에는 exact Role ARN, owner handoff, lease token, fencing counter, expiry, `mutation_started_at`, `non_stealable_until`과 heartbeat 시각을 저장한다. 짧은 transaction으로 lease를 획득한 뒤 외부 호출을 수행하며, mutation 직전과 결과 저장 직전에 token과 fencing counter를 다시 확인한다. 외부 호출 동안 DB transaction이나 pooled session advisory lock을 유지하지 않는다.

### `git_cicd_provider_mutations`

각 GitHub/AWS write 호출 전에 append-only operation row를 만든다. row에는 operation ID, handoff/step, provider scope, configuration revision, executor/task identity, lease token/fencing counter, request fingerprint, `prepared`, `in_flight`, `succeeded`, `failed`, `outcome_unknown` 상태, 시작/응답 시각과 read-back hash를 저장한다. provider request body나 credential은 저장하지 않는다.

DB fencing token만으로 이미 전송된 provider 요청을 취소할 수는 없다. 따라서 모든 GitHub/AWS mutation client는 자동 재시도를 끄고 명시적 hard timeout을 사용한다. 호출 직전에는 operation을 `in_flight`로 바꾸고 `hard timeout + provider settling margin`보다 긴 `non_stealable_until`을 transaction으로 기록한다. 이 구간에는 heartbeat가 끊겨도 다른 worker가 lease를 인수할 수 없다.

더 강하게, worker heartbeat가 끊기거나 provider response를 확인하지 못한 `in_flight` operation은 시간이 지났다는 이유만으로 자동 인수하지 않는다. operation과 step을 `outcome_unknown`, setup을 `quarantined`, execution을 `drifted`로 만든다. 새 provider write와 release/infra 실행은 모두 금지한다. recovery worker는 원 ECS task가 stopped 상태임을 확인하고 provider별 quarantine window가 지난 뒤, 간격을 둔 두 번의 remote read-back이 같은 상태임을 확인할 때까지만 read-only로 동작한다. 그 뒤 operation 결과를 확정하고 동일한 accepted revision이면 convergence를 재개한다. 원 worker가 늦게 돌아오면 lease token을 다시 확인해 추가 provider 호출이나 verified 전환을 하지 않으며, 가능한 경우 late-completion evidence를 남겨 binding을 다시 검증하게 한다.

GitHub/AWS API에는 conditional version을 제공하지 않는 write가 있으므로 이 설계는 임의 시간 뒤까지 살아 있는 외부 요청을 수학적으로 fence한다고 주장하지 않는다. 대신 결과가 불명확한 동안 자동 takeover와 실행을 금지하고, 식별 가능한 worker 종료와 bounded provider finalization assumption, 반복 read-back을 운영 조건으로 둔다. 이 assumption을 충족하지 못하면 setup은 계속 격리되어 operator 확인 없이는 진행하지 않는다.

### `project_execution_leases` 확장

기존 Direct/App/Infra 공통 실행 lease의 source/check constraint에 `git_cicd_setup`을 추가한다. setup reserve와 모든 실행 등록이 같은 project coordination transaction을 사용하도록 repository API를 확장한다. 별도 setup 전용 project lease를 만들지 않는다.

### configuration revision

다음 secret-free 입력을 canonical JSON으로 정렬한 뒤 SHA-256을 계산한다.

- project ID
- GitHub Repository ID, owner ID, owner/name
- target branch와 project-scoped Environment 이름
- 승인 Plan ID와 Terraform artifact SHA-256
- source Deployment와 deployment target fingerprint
- semantic build configuration revision. source root, package manager, lockfile kind, build command, output path와 Dockerfile 경로처럼 workflow 생성에 영향을 주는 필드만 포함
- SketchCatch 관리 variable의 정확한 key/value 또는 삭제 의도. 파생 값인 `SKETCHCATCH_CONFIGURATION_REVISION`은 제외
- OIDC provider와 원하는 Role trust statement
- generator/template version과 revision placeholder를 포함한 생성 파일 template의 path와 SHA-256

token, credential, secret 원문과 provider raw response는 revision에 포함하지 않는다.

revision 계산 뒤 workflow와 manifest에 그 값을 렌더링하고 실제 생성 파일 hash를 별도 `generatedArtifactRevision`으로 계산한다. manifest는 자신을 제외한 생성 파일의 path/hash와 configuration revision을 기록한다. 따라서 workflow가 configuration revision을 포함해도 self-referential hash가 생기지 않는다. Repository variable `SKETCHCATCH_CONFIGURATION_REVISION`도 계산 뒤 파생시켜 exact sync한다.

setup을 만들 때 확인한 Repository commit SHA는 `setup_source_commit_sha` provenance로 저장하지만 configuration revision에는 넣지 않는다. 이후 일반 application push의 `${{ github.sha }}`는 runtime commit이며 새 setup이나 설치 PR을 요구하지 않는다. build command, source root, Dockerfile처럼 workflow 계약 자체가 바뀌면 semantic build configuration revision이 달라져 새 configuration revision을 만든다.

## 5. 통합 설정 흐름

`GET /api/projects/:projectId/git-cicd-handoffs/setup-preview`는 현재 서버 상태로 configuration revision과 승인할 변경을 계산한다. `POST /api/projects/:projectId/git-cicd-handoffs/setup`은 사용자가 확인한 revision을 받아 handoff를 reserve하고 durable setup worker를 dispatch한다. worker가 최초 실행, 실패 재개, 열린 PR 갱신과 설정 재적용을 수행하며 API는 polling 가능한 handoff snapshot을 반환한다.

### 5.1 mutation 전 검증

서버는 다음을 다시 읽는다.

- 사용자와 project 접근 권한
- 현재 Board와 active Source Repository의 exact GitHub Repository ID
- valid monitoring branch/path
- verified AWS connection과 현재 deployment target
- semantic build configuration revision과 setup 시작 commit SHA provenance
- 성공한 최초 Direct ApplicationRelease
- 서버가 선택한 승인 Apply Plan과 S3 artifact hash
- public HTTPS `SKETCHCATCH_PUBLIC_BASE_URL`
- Static Site URL과 API Base URL을 포함한 현재 handoff configuration
- 현재 GitHub App installation의 required Repository permission
- AWS OIDC provider, Role trust와 연결 Role의 현재 read 권한

POST의 `acceptedConfigurationRevision`이 서버의 최신 preview revision과 다르면 외부 mutation 전에 409로 중단한다. GitHub 권한이 부족하면 binding을 fence하거나 AWS/GitHub를 변경하기 전에 중단한다. 각 단계 시작 직전에도 현재 configuration revision을 다시 비교한다. 중간에 Plan, Repository, target 또는 build config가 바뀌면 남은 단계를 실행하지 않는다.

### 5.2 handoff reserve와 lease

서버는 project execution coordination row와 GitHub Repository ID에 짧은 transaction lock을 잡고 binding과 동일 revision의 handoff를 조회한다.

- 없으면 외부 호출 전에 `draft/action_required` handoff와 세 step row를 만든다.
- 있으면 같은 handoff를 재사용한다.
- active Direct/App/Infra project execution lease가 있으면 binding을 `pending_setup`, handoff를 `waiting_for_execution`으로 저장하고 worker dispatch를 실행 종료 뒤로 미룬다.
- Repository binding의 유효한 setup lease가 있으면 두 번째 요청은 외부 호출을 시작하지 않고 HTTP 202와 같은 handoff snapshot을 반환한다.
- lease가 만료됐고 `in_flight/outcome_unknown` provider operation이 없을 때만 새 token/fencing counter로 인수하고 remote read-back부터 재개한다.
- `in_flight` owner가 사라졌으면 자동 인수하지 않고 setup을 `quarantined`로 전환해 read-only recovery worker를 dispatch한다.
- 첫 외부 mutation 전에 binding을 `updating`으로 바꿔 기존 Pipeline을 fence한다.

project execution lease를 setup owner가 획득한 뒤 worker dispatch attempt와 deterministic client token을 저장하고 ECS `RunTask` idempotency에 같은 token을 사용한다. dispatch response가 유실되면 새 attempt를 즉시 만들지 않고 저장 token과 task 상태를 먼저 조정한다. 중복 task가 생겨도 Repository binding lease와 project execution lease를 모두 확인한 하나만 provider 단계에 들어갈 수 있다.

외부 호출 동안 DB transaction을 열어 두지 않는다. lease heartbeat, provider mutation journal과 단계별 짧은 transaction만 사용한다. production POST handler는 GitHub/AWS mutation을 직접 실행하지 않는다.

### 5.3 실행 순서

```text
현재 설정 검증
→ handoff/steps reserve
→ AWS OIDC/trust 수렴·검증
→ Repository 설정 수렴·검증
→ PR ensure·검증
→ setup과 Repository binding ready
```

권한과 provider 존재 여부를 read-only로 먼저 확인한 뒤 AWS를 첫 mutation 단계로 둔다. OIDC provider 생성 권한이 없는 기존 connection은 GitHub variable을 바꾸기 전에 실패한다. provider가 명확히 거부한 단계는 `failed`, handoff와 binding은 `action_required`가 된다. timeout, worker loss처럼 결과를 확정할 수 없는 단계는 `outcome_unknown/quarantined`가 되며 새 write를 시작하지 않는다. 이미 검증된 단계도 재시도 때 remote read-back을 한 번 수행해 아직 같은 상태인지 확인한다. 일치하면 write 없이 다음 단계로 진행한다.

세 setup step이 검증되면 open PR도 Phase 3 기준으로는 `setup_status = ready`다. 다만 이는 “설정 PR을 안전하게 준비했다”는 뜻이며 실행 승인이 아니다. open PR이면 `execution_status = awaiting_merge`를 유지하고, merged/no-op target commit의 생성 파일과 manifest가 active revision과 일치할 때만 `execution_status = ready`로 승격한다.

## 6. GitHub Repository 설정 수렴

### 관리 범위

`createRepositorySettingsPreview()`가 생성한 `SKETCHCATCH_*` key의 명시적 allowlist만 관리한다. 사용자 variable과 다른 도구의 variable은 보존한다.

- 기대값이 비어 있지 않으면 exact upsert한다.
- 선택값이 비어 있으면 그 관리 key를 DELETE하고 404/absence를 확인한다.
- 모든 관리 key를 다시 조회해 exact 값 또는 absence를 확인한다.
- 특히 `SKETCHCATCH_PROJECT_ID`는 현재 project ID와 byte-for-byte 일치해야 한다.
- `SKETCHCATCH_CONFIGURATION_REVISION`은 canonical 입력으로 계산된 현재 revision과 byte-for-byte 일치해야 한다.
- `SKETCHCATCH_RELEASE_API_URL`은 public HTTPS origin 정규화 결과와 일치해야 한다.

GitHub는 Repository variable의 조회, 생성, 갱신과 삭제 API를 제공한다.

- <https://docs.github.com/en/rest/actions/variables>

### Environment와 branch 제한

Environment 이름은 project rename과 무관하고 충돌하지 않는 `sketchcatch-<project-id>` 형식을 사용한다. Environment를 생성하거나 읽고 custom deployment branch policy가 exact target branch 하나를 허용하도록 수렴시킨다. 다른 branch가 이 Environment를 사용하지 못하는 것을 다시 조회해 확인한다.

- <https://docs.github.com/en/rest/deployments/environments>
- <https://docs.github.com/en/rest/deployments/branch-policies>

기존 workflow 호환을 위해 managed variable은 이번 범위에서 Repository level을 유지한다. Environment-level variable은 runner가 Environment를 선언한 뒤에만 사용할 수 있고 workflow-level `vars`/`env`를 덮어쓰지 않으므로, 별도 workflow refactor 없이 저장 위치만 바꾸지 않는다.

- <https://docs.github.com/en/actions/reference/workflows-and-actions/variables#configuration-variable-precedence>

### 권한

GitHub App installation token만 사용한다. 필요한 Repository permission은 Contents, Pull requests, Workflows, Actions/Variables, Administration이다. setup preview와 POST preflight는 installation permission을 실제로 조회한다. 권한 부족은 `GITHUB_APP_PERMISSION_REQUIRED`와 누락 permission 목록으로 분류하고 OAuth login token으로 우회하지 않는다.

## 7. AWS OIDC와 Role trust 수렴

### GitHub OIDC provider

AWS 계정의 `token.actions.githubusercontent.com` OIDC provider를 조회하고 다음을 검증한다.

- exact issuer/provider URL `https://token.actions.githubusercontent.com`
- 현재 AWS account의 provider ARN
- client ID 목록에 `sts.amazonaws.com`이 존재함

없으면 통합 승인 preview에 포함된 범위에서 URL과 client ID `sts.amazonaws.com`으로 생성한다. provider가 있지만 client ID가 빠졌으면 다른 client ID를 보존하고 `AddClientIDToOpenIDConnectProvider`로 추가한 뒤 다시 읽는다. 기본 AWS connection CloudFormation template에는 필요한 `List/Get/CreateOpenIDConnectProvider`와 `AddClientIDToOpenIDConnectProvider` 권한을 최소 범위로 추가한다. 기존 connection이 필요한 권한을 갖지 않으면 추측하거나 성공 처리하지 않고 `AWS_OIDC_PROVIDER_PERMISSION_REQUIRED`로 중단한다. 이미 정확한 provider가 있는 기존 connection은 template 갱신 없이 검증만 진행할 수 있다. provider 생성이나 client ID 추가가 필요하지만 권한이 없는 기존 connection만 AWS 연결 권한 갱신이 필요하다. 다른 client ID, provider thumbprint와 provider 자체는 자동 삭제하지 않는다.

### GitHub OIDC subject 호환성

GitHub는 2026-07-15 이후 생성되거나 opt-in한 Repository의 기본 OIDC subject에 owner/repository ID를 포함한다. 서버는 GitHub Repository OIDC 설정을 read-only로 조회한다.

- 기본 name-based subject
- 기본 immutable-ID subject
- 지원하는 `repo + context` customization

정확한 effective subject를 계산할 수 없거나 지원하지 않는 custom template이면 AWS를 변경하기 전에 `GITHUB_OIDC_SUBJECT_UNSUPPORTED`로 중단한다. name-based와 immutable-ID subject를 동시에 허용하지 않는다. GitHub API가 현재 Repository에 실제 적용하는 template/claims를 판별한 뒤 exact environment subject 하나만 사용한다. name-based가 확인된 기존 Repository에는 name-based subject만, immutable 형식이나 지원 custom template이 확인된 Repository에는 그 subject만 허용한다. 형식 전환 시 SketchCatch가 관리하는 이전 subject statement를 같은 mutation에서 제거하고 새 exact statement로 교체한다. 판별할 수 없으면 wildcard나 두 형식 병행으로 완화하지 않고 fail-closed한다.

- <https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims>
- <https://docs.github.com/en/rest/actions/oidc>

### trust statement

Sid는 `SketchCatchGitHubOidc<hash(repository-id|environment)>`처럼 Repository/Environment scoped 값으로 만든다. apply는 해당 Sid만 upsert한다.

- 외부 statement를 보존한다.
- 다른 SketchCatch Repository/Environment Sid를 보존한다.
- legacy `SketchCatchGitHubActionsOidc`는 subject가 현재 desired subject와 정확히 같을 때만 scoped Sid로 교체한다.
- 이미 정확하면 `UpdateAssumeRolePolicy`를 호출하지 않는다.
- Role policy 크기 제한을 넘으면 wildcard를 쓰지 않고 전용 Role을 요구한다.

read-after-write는 다음 전체를 검증한다.

- `Effect: Allow`
- exact Federated provider ARN
- `Action: sts:AssumeRoleWithWebIdentity`
- exact `aud`
- exact effective environment subject 하나
- update 전 보존 대상 statement fingerprint가 update 후에도 모두 존재함

같은 Role에 대한 SketchCatch 동시 변경은 `git_cicd_aws_role_leases`의 lease와 fencing counter로 직렬화한다. heartbeat가 유지되는 동안 다른 setup은 해당 Role을 변경하지 않는다. 외부 actor의 동시 변경이나 lease 상실이 read-after-write에서 감지되면 자동으로 권한을 넓히거나 덮어쓰지 않고 실패 후 재개한다.

## 8. PR 생성·갱신·복구

Git provider의 동작을 `createPullRequest()`에서 `ensurePullRequest()`로 바꾼다. provider는 handoff ID, configuration revision, head/base, persisted remote head SHA, manifest와 생성 파일 hash를 기준으로 SketchCatch 소유 PR인지 확인한다.

동일 revision 재시도도 remote head가 마지막으로 저장한 `pullRequestHeadSha`와 일치하고 manifest/생성 파일이 현재 handoff 소유임을 확인한 경우에만 branch를 갱신한다. 새 revision은 `predecessor_handoff_id`로 이전 handoff를 연결한다. 이전 PR이 open이고, base가 같고, remote head가 저장된 `pullRequestHeadSha`와 일치하며, manifest가 predecessor handoff/revision을 정확히 가리킬 때만 새 handoff가 그 PR을 인수한다. 새 manifest와 파일을 쓴 뒤 read-back에 성공하면 새 handoff에 같은 PR을 연결하고 이전 handoff를 `superseded`로 만든다. 사용자 commit, branch 이동 또는 manifest 불일치가 있으면 기존 PR을 수정하지 않고 새 owned branch/PR을 만든다.

| 현재 상태 | 동작 |
| --- | --- |
| PR 없음 | 안정적인 SketchCatch branch에 파일을 쓰고 새 PR 생성 |
| 같은 revision의 open PR | 저장한 head SHA와 ownership을 확인한 뒤 생성 파일과 PR title/body를 갱신하고 같은 PR 번호 유지 |
| 새 revision과 안전한 predecessor open PR | ownership 검증 후 같은 PR을 새 handoff로 인수·갱신 |
| 새 revision과 수정된 predecessor PR | 기존 PR을 보존하고 새 owned branch/PR 생성 |
| closed, unmerged | 기존 PR을 다시 열지 않고 persisted attempt 번호의 새 branch와 새 PR 생성 |
| merged, target 파일 동일 | 새 PR 없이 `verified` |
| merged, 원하는 파일 변경 | 새 configuration revision handoff와 새 PR 생성 |
| 파일 변경 없음 | 409가 아니라 remote PR/target 검증 후 no-op 성공 |
| PR POST 응답 유실 | `quarantined` 후 안정 read-back에서 exact head/base와 manifest PR을 확인해 기존 PR 연결 |
| branch 422 | exact existing ref와 manifest를 검증한 경우에만 재사용 |
| 수동 branch 충돌 | 사용자 branch를 force push하지 않고 새 owned branch 또는 명시적 실패 |

가능하면 Git Data API로 blob/tree/commit을 하나 만들고 owned branch ref를 한 번 갱신해 파일별 다중 commit을 피한다. target branch를 force push하지 않는다.

생성 workflow에는 expected project ID와 configuration revision을 비민감 상수로 포함한다. 실행 시 Repository variable의 `SKETCHCATCH_PROJECT_ID`, `SKETCHCATCH_CONFIGURATION_REVISION`과 각각 비교하고 하나라도 다르면 `curl` 전에 명확한 오류로 종료한다. release/infra 요청에는 configuration revision, GitHub Repository ID, target branch, `${{ github.sha }}`와 `${{ github.run_id }}`를 함께 보낸다. 기존 workflow처럼 revision이 없거나 active binding과 다르면 서버는 외부 실행을 시작하기 전에 거부한다. HTTP 요청은 `curl --fail-with-body`를 사용해 다음 provider 오류가 단순 404 반복으로만 보이지 않게 한다.

## 9. API와 DTO

`GitCicdHandoff` 응답에 다음 setup summary를 추가한다.

```ts
type GitCicdSetupStepStatus =
  | "pending"
  | "running"
  | "outcome_unknown"
  | "verified"
  | "failed"
  | "not_required";

type GitCicdSetupNextAction =
  | "start"
  | "resume"
  | "wait_for_execution"
  | "update_pr"
  | "create_pr"
  | "reapply_settings"
  | "reconcile_provider_state"
  | "none";

type GitCicdSetupStep = {
  status: GitCicdSetupStepStatus;
  attemptCount: number;
  desiredRevision: string;
  observedRevision: string | null;
  verifiedAt: IsoDateTimeString | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type GitCicdHandoffSetupPreview = {
  configurationRevision: string;
  repositorySettings: GitCicdRepositorySettingsPreview;
  awsRoleDiff: GitCicdAwsRoleDiff | null;
  pullRequest: {
    title: string;
    targetBranch: string;
    files: Array<{ path: string; sha256: string }>;
  };
  requiredGitHubPermissions: string[];
  willEnsureAwsOidcProvider: boolean;
};

type EnsureGitCicdHandoffSetupRequest = {
  architectureId: string;
  terraformArtifactId: string;
  sourceDeploymentId: string;
  approvedApplyPlanArtifactId: string;
  sourceRepositoryId: string;
  acceptedConfigurationRevision: string;
};

type GitCicdExecutionProof = {
  configurationRevision: string;
  repositoryId: string;
  targetBranch: string;
  commitSha: string;
  workflowRunId: string;
};

type GitCicdHandoffSetup = {
  configurationRevision: string | null;
  generatedArtifactRevision: string | null;
  status:
    | "action_required"
    | "waiting_for_execution"
    | "running"
    | "quarantined"
    | "ready"
    | "superseded";
  ready: boolean;
  executionStatus: "blocked" | "awaiting_merge" | "ready" | "drifted";
  executionReady: boolean;
  activatedTargetSha: string | null;
  nextAction: GitCicdSetupNextAction;
  repositorySettings: GitCicdSetupStep;
  awsTrust: GitCicdSetupStep;
  pullRequest: GitCicdSetupStep;
  errorCode: string | null;
  errorMessage: string | null;
};
```

generated workflow가 호출하는 기존 release/infra request DTO에는 `configurationRevision`과 `targetBranch`를 추가한다. `repositoryId`, `commitSha`, `workflowRunId` 등 기존 필드는 유지하며 위 `GitCicdExecutionProof` 계약을 충족한다. 이 필드는 인증을 대신하지 않으며, 서버가 active binding과 GitHub read-back을 선택하는 입력이다. 서버가 확인한 OIDC identity, Actions run, `activatedTargetSha`와 exact manifest/file evidence만 실행 권한의 근거가 된다.

응답 규칙은 다음과 같다.

- 이미 ready인 동일 handoff no-op이면 200
- 새 실행, 실패 재개 또는 provider reconciliation을 queue하면 202와 handoff snapshot
- 다른 worker가 실행 중이면 202와 동일 handoff snapshot을 반환하고 중복 dispatch하지 않음
- stale configuration이나 binding 충돌이면 side effect 없는 409
- dispatch 전 read-only preflight가 일시적으로 불가능하면 side effect 없는 502/503
- dispatch 뒤 worker의 GitHub/AWS 오류는 handoff GET의 `failed` 또는 `quarantined` step과 안정 오류 정보로 조회
- provider 결과가 불명확하면 `quarantined` snapshot과 `reconcile_provider_state`; 새 write와 execution은 계속 차단
- 권한이나 지원하지 않는 설정이면 안정 오류 코드와 `action_required`

기존 개별 apply endpoint는 Web에서 사용하지 않는다. 호환 기간에는 동일 orchestrator와 step ledger를 통하도록 만들고, 별도 상태 기록 없는 우회 mutation을 허용하지 않는다.

## 10. UI 상태와 문구

Phase 3 이름은 `CI/CD 연결 및 PR`로 표시한다. 세 단계와 서버 상태를 그대로 보여준다.

```text
Repository 설정     완료 / 진행 중 / 확인 필요
AWS 신뢰 정책       완료 / 진행 중 / 확인 필요
배포 PR             완료 / 진행 중 / 확인 필요
```

버튼 문구는 서버 `nextAction`으로 결정한다.

- 최초: `설정 적용 및 PR 생성`
- active 배포 실행 존재: `현재 배포 종료 후 자동 시작`
- 부분 실패: `설정 계속하기`
- 열린 PR 변경: `기존 PR 업데이트`
- 닫힌 PR: `새 PR 생성`
- merged 이후 외부 drift: `설정 다시 적용`
- provider 결과 불명확: `외부 상태 다시 확인`

PR URL만 존재한다고 Phase 3을 완료하지 않는다. 현재 configuration revision에서 Repository settings와 AWS trust가 `verified/not_required`이고 PR step이 `verified`일 때만 `setup.ready = true`다. 이 값으로 Phase 3을 완료하고 Phase 4 상태를 표시한다.

Phase 4 화면은 `setup.ready`가 되면 표시하되 open PR에서는 `PR 병합 대기` 상태만 보여주고 실행 제어는 활성화하지 않는다. 실제 실행 제어와 release/infra API는 `executionReady`까지 true인 경우에만 허용한다. 따라서 “PR 준비 완료”와 “target branch에서 현재 revision 실행 가능”을 서로 다른 상태로 표현한다.

새로고침 후에도 RDS step 상태를 복원한다. 실패 시 일반적인 “상태 충돌” 대신 실패 단계, 안전한 원인, 다음 버튼을 보여준다. `quarantined` 상태에서는 새 적용 버튼을 활성화하지 않고 원 worker 종료와 read-only reconciliation 진행 상태를 표시한다. raw GitHub/AWS 응답, token, credential은 표시하지 않는다.

## 11. Pipeline 연결 규칙

- Pipeline provenance는 최신 non-cancelled PR이 아니라 handoff와 Repository binding의 setup이 같은 handoff/revision에서 `ready`이고 execution도 `ready`인 경우만 사용한다.
- handoff 또는 Repository binding의 setup/execution이 ready가 아니면 UI의 Infra 실행 명령과 새 Pipeline 실행 제어를 비활성화하고, release/infra의 새 run 등록·retry API도 같은 조건으로 요청을 거부한다. 이미 lease를 가진 run의 heartbeat, 조회, completion, cancellation callback은 immutable run snapshot과 fencing version으로 terminal까지 허용한다.
- Direct 실행은 Git/CI/CD setup의 `pending_setup`, `updating`, `quarantined`, `retiring` 동안만 새 등록을 거부한다. `action_required`, `ready/awaiting_merge` 상태에서는 setup worker가 project execution lease를 소유하지 않을 때 Direct 실행을 허용하되, 실행 뒤 configuration revision을 다시 계산해 달라졌으면 기존 Git/CI/CD execution을 `drifted`로 만든다.
- PR merge 후 기존 polling은 유지하되 target branch의 manifest와 생성 파일을 GitHub에서 읽어 active configuration revision과 exact content hash를 검증한 commit SHA를 `activated_target_sha`로 저장한다.
- generated workflow 요청은 configuration revision, Repository ID, target branch와 GitHub commit SHA를 전달한다. 서버는 OIDC identity와 active binding/revision을 먼저 확인하고, GitHub Actions run을 read-back해 Repository ID, run attempt, head SHA, head branch와 workflow path가 요청 및 active handoff와 일치하는지 검증한다. 이어 요청 SHA가 exact manifest/파일을 포함하며 target branch 이력에 속하는지 확인한 뒤에만 execution을 `ready`로 승격하거나 기존 evidence를 사용한다.
- release/infra 서비스는 workflow가 보낸 project 설정이나 artifact 위치를 실행 입력으로 신뢰하지 않고 active handoff와 승인 Plan에서 다시 조회한다.
- 각 release/infra 등록 요청은 provider mutation journal에 `in_flight/outcome_unknown` operation이 없는지 확인하고, managed Repository variables/Environment와 AWS OIDC/trust의 exact read-back을 다시 수행한다. read-back이 다르거나 일시적으로 불가능하면 execution을 `drifted`로 만들고 cloud/release side effect 없이 실패한다.
- revision이 없거나 이전 revision인 legacy workflow, target branch 밖의 commit, manifest 없는 commit은 release/infra side effect 전에 안정 오류로 거부한다.
- Repository variable drift가 생기면 생성 workflow의 project ID/revision guard가 API 호출 전에 중단한다.
- Delivery의 수동 새로고침은 Repository/AWS read-only 검증을 다시 수행할 수 있다. 자동 polling은 RDS 상태만 읽어 provider 호출을 반복하지 않는다.

## 12. 오류와 복구 계약

| 실패 경계 | 재시도 동작 |
| --- | --- |
| setup 권한 preflight 실패 | binding fence와 외부 mutation 없이 권한 보강 안내 |
| active Direct/App/Infra 실행 중 setup 승인 | binding `pending_setup`, 기존 실행은 계속, 새 실행은 차단, 종료 뒤 setup 자동 시작 |
| setup reserve와 release 등록 동시 요청 | project coordination transaction에서 하나만 먼저 획득; 승자는 실행하고 다른 쪽은 대기/거부 |
| AWS update 전 | AWS 단계부터 시작 |
| AWS 성공 응답 확인 후 step DB 저장 실패 | 같은 worker/lease에서 trust read-back, 불필요한 update 없이 Repository 진행 |
| AWS 응답 유실 또는 worker loss | `outcome_unknown/quarantined`, executor 종료와 안정 read-back 전에는 write/실행 금지 |
| Repository write 전 | AWS 재검증 후 Repository 단계 시작 |
| Repository 성공 응답 확인 후 step DB 저장 실패 | 같은 worker/lease에서 GitHub read-back으로 verified 복구 후 PR 진행 |
| Repository 응답 유실 또는 worker loss | `outcome_unknown/quarantined`, executor 종료와 안정 read-back 전에는 write/실행 금지 |
| PR commit 후 POST 전 | owned branch를 검증하고 PR 생성 |
| PR POST 성공 확인 후 step DB 저장 실패 | 같은 worker/lease에서 exact head/base/manifest PR을 찾아 연결 |
| PR POST 응답 유실 또는 worker loss | `outcome_unknown/quarantined`, 안정 read-back으로 결과를 확정한 뒤에만 재개 |
| 최종 HTTP 응답 유실 | 같은 revision handoff를 반환 |
| 동시 더블 클릭 | handoff와 PR 각각 하나만 생성 |
| worker 중단과 provider 요청 지연 | 자동 인수 금지, `quarantined`에서 executor 종료와 안정 read-back만 수행 |
| active mutation 중 project 삭제 | binding을 보존하고 side effect 없는 `GIT_CICD_SETUP_IN_FLIGHT` |
| 중간 configuration 변경 | 남은 mutation 없이 stale 409, 새 revision으로 다시 시작 |
| legacy/이전 revision workflow 요청 | release/infra side effect 전 409와 안정 오류 코드 |

실패 때문에 verified step을 무조건 다시 쓰지 않는다. 다만 재개할 때 remote state가 달라졌으면 결과가 명확한 drift는 해당 step을 `failed`, handoff를 `action_required`로 되돌리고 exact convergence를 수행한다. `outcome_unknown`은 먼저 격리 복구 계약을 통과해야 하며 곧바로 새 write로 전환하지 않는다.

## 13. 검증 전략

실제 GitHub/AWS mutation은 운영 배포 뒤에만 확인할 수 있으므로 구현 단계에서는 모든 provider 경계를 결정론적 test double로 검증한다.

### 운영 권한 compatibility preflight

기능 배포 전에 현재 production GitHub App과 AWS connection을 read-only로 검사하는 preflight를 제공한다.

- GitHub installation이 Contents, Pull requests, Workflows, Actions/Variables, Administration required permission을 모두 승인했는지 확인한다.
- AWS connection이 현재 Role과 OIDC provider를 읽을 수 있는지 확인한다.
- OIDC provider가 없으면 새 connection template이 create 권한을 포함하는지 안내하고, 기존 stack은 권한 갱신이 필요하다고 명시한다.
- preflight가 실패하면 setup 버튼을 실행 가능한 것처럼 표시하지 않고 정확한 권한 보강 동작을 보여준다.

GitHub App permission 변경은 installation owner의 승인이 있어야 기존 installation에 반영된다. CloudFormation Role policy 변경도 기존 stack에는 자동 반영되지 않는다. 이 두 provider 제약은 코드로 우회하지 않으며, production 재시험 전에 preflight가 green이어야 한다.

### Provider 단위

Repository settings:

- 이전 project ID A를 현재 B로 교체하고 read-back
- 미사용 optional 관리 key 삭제
- 관리 대상이 아닌 variable 보존
- partial write와 응답 유실은 격리되고 안정 read-back 뒤에만 재개
- write 후 값 불일치 시 verified 금지
- GitHub 401, 403, 404, 409/422, 5xx 분류
- Environment exact branch policy 생성·갱신·재조회

AWS:

- OIDC provider 존재, 누락, 잘못된 client ID
- 기존 provider의 다른 client ID를 보존하면서 `sts.amazonaws.com` 추가
- name-based 및 immutable-ID subject
- effective subject 형식마다 trust subject가 정확히 하나이고 이전 managed 형식이 제거됨
- 지원하지 않는 custom OIDC template의 side effect 0
- unrelated, multi-Repository, legacy statement 보존
- Principal, Effect, Action, aud/sub 전체 검증
- exact policy에서 update 호출 0회
- update 응답 유실은 격리 후 안정 read-back, 성공 응답 뒤 DB 저장 실패는 같은 lease에서 복구
- Role ARN과 verified connection 불일치 시 mutation 0회
- policy size 초과와 concurrent drift fail-closed

PR:

- 신규, open update, closed new PR, merged no-op, merged changed revision
- source branch 준비 뒤 재시도
- POST 응답 유실은 격리 후 exact existing PR 탐색으로 결과 확정
- exact 422만 복구하고 다른 충돌은 fail-closed
- manual divergence에서 사용자 branch 비변경
- tree/commit 후 DB 실패에서 중복 PR 없음

### Orchestrator와 DB

- 세 단계의 직전/직후 failure injection
- `project_execution_leases`의 `git_cicd_setup` source와 setup 전체 보유
- active Direct/App/Infra 실행 중 setup queue, 기존 실행 보존과 새 실행 차단
- `pending_setup`에서도 기존 run heartbeat/status/completion/cancellation은 성공하고 새 run/retry만 거부됨
- release가 먼저 lease를 얻는 interleaving과 setup이 먼저 binding fence를 얻는 interleaving
- setup의 ready check와 release의 lease 획득 사이 check-then-act race가 없음
- lease 만료 인수와 heartbeat
- hard timeout보다 긴 non-stealable mutation window와 delayed provider response
- stale worker가 늦게 반환해도 새 worker가 먼저 write/ready를 수행하지 않음
- unknown outcome이 있는 동안 setup/execution이 계속 격리되고 provider write가 0회임
- 동시 두 요청 coalescing
- configuration revision unique constraint
- Repository 전체 binding 충돌과 branch만 다른 cross-project 요청 차단
- binding `updating/action_required` 중 release/infra API fencing
- AWS Role lease token, fencing counter, in-flight operation이 없을 때만 만료 인수
- active mutation 중 project 삭제 차단과 mutation 종료 후 binding 정리
- legacy handoff `action_required` backfill
- project 삭제 후 stale GitHub 변수의 exact 교체
- 각 mutation 직전 stale revision 검사와 side effect 0
- 일반 application commit 변경은 configuration revision을 바꾸지 않음
- semantic build configuration 변경은 새 configuration revision을 만듦

### API와 Web

- 한 번의 승인으로 세 단계 실행
- 부분 실패 응답에 handoff ID와 next action 포함
- 다른 사용자의 resume 차단
- PR만 생성되고 settings/trust가 미검증이면 Phase 3 진행 중
- 세 단계 검증 전 Phase 4 비활성화
- 새로고침 뒤 partial state 복원
- 별도 체크박스와 apply 버튼 제거
- 동적 CTA와 접근성 상태 문구
- generated workflow의 project ID mismatch 사전 차단
- generated workflow의 revision mismatch와 legacy missing revision 사전 차단
- open PR에서는 setup ready지만 execution awaiting_merge 유지
- merge commit의 manifest/파일/SHA read-back 뒤에만 execution ready
- target branch 밖 commit과 이전 workflow가 release/infra side effect 전에 거부됨
- waiting setup이 UI 새로고침 뒤 복원되고 active 실행 종료 후 새 승인 없이 시작됨
- active Infra heartbeat가 setup 승인 뒤에도 성공해 Terraform run을 중단하지 않음
- `curl --fail-with-body`와 안정 오류 본문

상태 조합은 `selectCurrentCicdSetupAction()` 같은 순수 함수로 추출해 DOM source 정규식보다 직접 단위 테스트한다.

### 완료 전 명령

```bash
pnpm --filter @sketchcatch/types test
pnpm --filter @sketchcatch/api test
pnpm --filter @sketchcatch/web test
pnpm migration:compatibility:check
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

외부 mutation 없이 API route부터 Web 상태까지 연결한 integration fixture도 실행한다. 관련 없는 장시간 테스트는 추가하지 않되, 위 failure matrix는 운영 재시험을 대체하는 필수 회귀 범위다.

## 14. 운영 Go/No-Go 기준

다음 조건이 모두 충족되어야 운영 재시험을 진행한다.

- stale ID A가 있는 fixture가 한 번의 setup 요청으로 ID B에 exact convergence한다.
- production GitHub App installation과 AWS connection의 read-only compatibility preflight가 green이다.
- 모든 응답/DB 저장 실패 fixture가 같은 handoff로 복구된다.
- 동시 요청에서도 PR과 handoff가 하나다.
- exact AWS policy 재시도는 provider write 0회다.
- 다른 Repository와 외부 IAM statement가 보존된다.
- 새 GitHub immutable OIDC subject fixture가 통과한다.
- name-based와 immutable-ID subject를 동시에 허용하는 trust가 생성되지 않는다.
- 세 단계 검증 전 Phase 4가 어떤 상태 조합에서도 활성화되지 않는다.
- open PR 상태에서는 release/infra 실행이 차단되고 exact target commit 검증 뒤에만 열린다.
- generated workflow가 stale project ID/revision을 API 호출 전에 차단하고 서버도 legacy/이전 revision 요청을 거부한다.
- delayed provider mutation과 worker loss fixture에서 unknown outcome이 자동 인수되지 않고 setup/execution이 격리된다.
- setup과 Direct/App/Infra 양방향 race fixture에서 project execution lease 소유자가 항상 하나이고 provider/deployment mutation이 겹치지 않는다.
- setup pending 중 기존 run callback은 terminal까지 처리되고 새 registration/retry는 side effect 없이 거부된다.
- migration compatibility, focused tests, full lint/typecheck/build와 harness가 모두 통과한다.

운영에서는 기존 demo project를 Destroy하지 않는다. 새 setup 버튼으로 Repository/AWS 상태를 수렴시키고 기존 PR 상태에 따라 업데이트 또는 새 PR을 만든 뒤, merge 후 첫 Pipeline 한 번만 확인한다.

## 15. 수용 기준

1. 사용자는 Phase 3에서 한 번만 승인한다.
2. GitHub Repository 설정, Environment branch policy, AWS trust, PR이 모두 실제 read-back으로 검증된다.
3. `SKETCHCATCH_PROJECT_ID`가 현재 project ID와 다르면 Phase 3이 완료되지 않는다.
4. PR 생성만으로 Phase 3이나 Pipeline이 활성화되지 않는다.
5. 실패 뒤 `설정 계속하기`가 정확한 단계부터 재개한다.
6. 열린 PR은 중복 생성하지 않고 갱신한다.
7. 닫힌 PR은 Destroy 없이 새 PR을 만든다.
8. merged/no-change는 새 PR 없이 설정만 재수렴할 수 있다.
9. 외부 성공 후 응답 또는 DB 저장이 실패해도 중복 PR과 불필요한 AWS update가 없다.
10. 다른 프로젝트, Repository, IAM trust statement와 사용자 GitHub 설정을 침범하지 않는다.
11. Repository 전환 중에는 기존 workflow의 release/infra 요청도 binding fence를 통과하지 못한다.
12. production GitHub App과 기존 AWS connection의 필수 권한이 read-only preflight로 확인된 뒤에만 운영 재시험을 시작한다.
13. open PR 준비 완료와 target branch 실행 준비 완료가 분리되며, 이전 revision workflow는 서버 실행 gate를 통과하지 못한다.
14. provider mutation 결과가 불명확하면 자동 lease takeover, 새 provider write와 Pipeline 실행을 금지하고 안전한 reconciliation 전까지 격리한다.
15. setup과 Direct/App/Infra 실행은 같은 project execution lease를 원자적으로 사용하며 어느 interleaving에서도 동시에 provider mutation을 수행하지 않는다.
16. setup 대기 상태가 기존 실행의 heartbeat/completion을 끊지 않으며, 기존 실행이 끝날 때까지 새 run과 retry만 차단한다.
