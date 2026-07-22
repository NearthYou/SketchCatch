# Git/CI/CD 설정 수렴 및 PR 재시도 명세

- 작성일: 2026-07-22
- 상태: 구현
- 대상: Workspace Delivery의 Git/CI/CD Phase 3·4

## 1. 해결할 문제

이 기능은 사용자가 한 번 승인하면 현재 프로젝트에 필요한 GitHub 설정과 AWS 신뢰 정책을 확인·적용하고, 배포 설치 PR을 생성하거나 복구한다.

기존 흐름은 PR을 만든 뒤 Repository 설정과 AWS 신뢰 정책을 따로 적용했다. 이 때문에 GitHub에 이전 프로젝트의 `SKETCHCATCH_PROJECT_ID`가 남아 있어도 Phase 3이 완료될 수 있었고, PR이나 Pipeline이 실패하면 Direct Deployment를 Destroy하고 처음부터 다시 해야 했다.

이번 구현은 다음을 보장한다.

- Repository 설정 → AWS 신뢰 정책 → PR을 서버가 한 요청에서 순서대로 처리한다.
- 외부 작업 전에 `draft` handoff를 저장해 중간 실패 후 같은 record에서 재개한다.
- GitHub와 AWS의 실제 상태를 다시 읽어 일치한 경우에만 검증 완료로 저장한다.
- 잘못된 설정, 닫힌 PR 또는 실패한 Pipeline 때문에 Direct Deployment를 다시 하지 않는다.
- DB schema, migration, 별도 worker와 lease table은 추가하지 않는다.

## 2. 사용자 흐름

Phase 3에는 `설정 적용 및 PR 생성` 버튼 하나를 둔다.

1. 최초 클릭은 현재 승인 Apply Plan과 서버 계산 설정으로 handoff를 `draft` 저장한다.
2. GitHub Environment와 Actions variables를 현재 프로젝트 값으로 수렴시킨다.
3. 필요한 AWS Role trust statement를 수렴시킨다.
4. 설치 PR을 생성하거나 기존 PR을 안전하게 재사용한다.
5. 세 단계가 모두 검증된 경우에만 Phase 3을 완료로 표시한다.

중간에 실패하면 저장된 `draft`가 화면에 다시 표시된다. 사용자는 `설정 계속하기`를 눌러 같은 승인과 handoff로 재개한다.

Pipeline이 실패하면 Phase 3 완료 표시는 유지하고 Phase 4에 `설정 재적용 및 Retry PR 생성`을 표시한다. 이 버튼은 설정을 다시 확인하고 새 retry PR이 필요한 경우 생성한다.

## 3. 서버 실행 순서와 저장 증거

`POST /api/projects/:projectId/git-cicd-handoffs`는 최초 handoff를 만들고 통합 설정을 시작한다.

`POST /api/git-cicd-handoffs/:handoffId/setup`은 다음 상태를 재개한다.

- `draft`: 중간 실패 지점부터 다시 수렴한다.
- `pr_created`: 외부 설정과 PR을 다시 확인한다.
- `pipeline_failed`, `cancelled`: 설정을 확인한 뒤 retry PR을 준비한다.
- 과거 `pipeline_running`, `pipeline_success`: 새 검증 필드가 없을 때 Repository/AWS 증거만 보완하고 기존 Pipeline과 PR 상태는 바꾸지 않는다.

Repository와 AWS 단계는 provider 결과만 믿지 않는다. read-back 검증이 성공한 뒤 기존 `git_cicd_handoffs.repository_settings_preview`와 `aws_role_diff` JSONB에 `appliedAt`, `verified`를 기록한다. 증거 저장이 실패하면 다음 PR 단계로 진행하지 않는다.

별도 table이나 migration은 없다.

## 4. GitHub Repository 설정

SketchCatch가 관리하는 Actions variable은 서버 preview의 값과 정확히 일치하도록 수렴시킨다.

- 값이 있으면 현재 값을 먼저 읽고 다른 경우에만 생성·갱신한다.
- 값이 비어 있으면 해당 managed variable을 삭제하고 실제로 없어진 것을 확인한다.
- 관리 대상이 아닌 Repository variable은 변경하지 않는다.
- `SKETCHCATCH_PROJECT_ID`와 `SKETCHCATCH_RELEASE_API_URL`이 현재 handoff와 일치해야 한다.

GitHub Environment는 `targetBranch` 하나만 배포할 수 있도록 custom deployment branch policy를 설정한다. Environment 설정과 branch policy를 다시 읽어 정확히 한 개의 branch rule이 일치해야 완료로 기록한다.

## 5. AWS 신뢰 정책

AWS Role trust는 Repository와 Environment에서 계산한 deterministic scoped Sid를 사용한다.

- 현재 Repository/Environment statement만 추가 또는 교체한다.
- 같은 Role에 있는 다른 Repository, Environment와 일반 IAM statement는 보존한다.
- 과거 고정 Sid statement는 현재 Repository/Environment 조건이 정확히 일치할 때만 scoped Sid로 교체한다.
- 기대 statement가 이미 정확하면 IAM write를 생략한다.
- write가 필요하면 적용 후 Role trust를 다시 읽어 exact 조건을 검증한다.

검증 결과를 handoff에 저장하지 못하면 PR을 만들지 않는다.

## 6. PR 생성과 복구

PR provider는 SketchCatch가 소유한 변경만 갱신한다.

- 열린 PR의 saved head SHA와 handoff manifest ownership이 모두 일치할 때만 생성 파일을 갱신한다.
- 열린 PR이나 생성 파일을 사용자가 수정했다면 기존 branch와 PR을 보존하고 새 `retry-N` branch와 PR을 만든다.
- 닫혔고 병합되지 않은 PR은 기존 branch를 덮어쓰지 않고 새 retry branch를 사용한다.
- 이미 병합되었고 target branch 파일이 기대값과 같으면 성공으로 재사용한다.
- retry suffix는 중첩하지 않고 다음 안전한 번호를 선택한다.

`pipeline_failed` 또는 `cancelled` 재개에서는 실패 run identity로 안정적인 retry token을 만든다. 이 경우에만 `sketchcatch/<project>/ci-cd/retry.json`을 추가·갱신한다. ECS App workflow는 이 exact path를 다시 포함하므로 retry PR이 병합되면 앱 Pipeline이 다시 시작한다. 최초 설치 PR에는 retry file을 만들지 않는다.

## 7. Workflow 안전장치

생성 workflow는 AWS credential이나 SketchCatch 실행 API를 사용하기 전에 Repository variable의 `SKETCHCATCH_PROJECT_ID`와 생성 당시 project ID를 비교한다. 값이 없거나 다르면 외부 작업 없이 실패한다.

SketchCatch API 호출은 `curl --fail-with-body`를 사용해 HTTP 오류 상태와 응답 본문을 함께 남긴다. 이 검사는 잘못된 프로젝트 ID로 다른 프로젝트의 release·infra·destroy API를 호출하는 것을 막는다.

## 8. 완료 판정

Phase 3 완료에는 다음 세 조건이 모두 필요하다.

- `repositorySettingsPreview.verified === true`
- `awsRoleDiff`가 없거나 `awsRoleDiff.verified === true`
- PR URL이 있고 handoff가 `draft` 또는 `cancelled`가 아님

각 행의 부분 완료 표시는 위 Phase 완료 판정과 같은 증거를 사용한다. PR만 만들어졌다는 이유로 Phase 4로 넘어가지 않는다.

Pipeline 실패는 Phase 3 설정 미완료로 되돌리지 않는다. Phase 4에서 retry setup action을 제공한다.

## 9. 승인 경계

한 번의 통합 설정 승인은 GitHub Repository 설정, GitHub Environment branch policy, AWS Role trust와 PR 파일 생성·갱신까지 포함한다.

다음 동작은 포함하지 않는다.

- PR merge 또는 강제 merge
- GitHub Actions workflow dispatch
- Terraform Plan, Apply 또는 Destroy
- 애플리케이션 release 실행
- 사용자 소유 Git branch나 관리 대상이 아닌 Repository/AWS 설정 변경

같은 승인 내용으로 실패를 재개하거나 provider 상태를 다시 확인할 때는 새 승인을 요구하지 않는다. 승인 Plan, Repository, target branch 또는 deployment target이 달라지면 stale configuration 409로 중단한다.

## 10. 검증 범위

구현 단계에서는 provider 경계를 mock으로 검증한다.

- 단계 실행 순서와 `draft` 선저장
- Repository variable 생성·수정·삭제와 exact read-back
- Environment exact branch policy와 no-op 재실행
- AWS scoped statement 보존, legacy migration, no-op과 증거 저장 실패
- 열린 PR 사용자 변경 보존, 닫힌/병합 PR과 retry branch
- 최초 PR과 실패 재시도의 retry file 차이
- stale project ID guard가 외부 호출보다 먼저 실행되는지
- Phase 3 완료 판정과 Phase 4 retry CTA
- 과거 Pipeline handoff의 증거 보완 시 PR/Pipeline 상태 보존

실제 GitHub/AWS mutation, PR merge와 배포는 이 구현 검증에 포함하지 않는다. 배포 후 한 번의 승인된 운영 acceptance에서 확인한다.
