# 배포 Plan 실행 흐름 정리

## 1. 문서 목적

이 문서는 현재 구현된 Deployment Plan 실행 흐름을 한 번에 이해하기 위한 참고 문서다.

범위는 사용자가 Workspace에서 `Terraform Plan 실행`을 누른 뒤, API가 Terraform artifact를 복원하고 `terraform init`, `terraform validate`, `terraform plan -out=tfplan`, `terraform show -json tfplan`을 실행해 Plan 결과를 저장하고, 사용자가 정상 Plan을 승인하는 단계까지다.

아직 실제 AWS 리소스를 변경하는 `apply`는 이 문서의 구현 완료 범위에 포함하지 않는다.

## 2. 현재 구현 범위

완료된 범위:

- Deployment 생성
- AWS Role Assume 기반 연결 선택
- Terraform artifact S3 복원
- `terraform init`
- `terraform validate`
- `terraform plan -out=tfplan`
- `terraform show -json tfplan`
- Plan summary 파싱
- high-risk 또는 delete/replace change 차단
- `tfplan` 바이너리 S3 저장
- Plan artifact metadata RDS 저장
- Deployment의 현재 Plan pointer 갱신
- Plan 승인 API
- blocked Deployment 승인 차단
- 승인 시점의 Terraform artifact hash, `tfplan` hash, AWS account/region snapshot 저장
- 승인 후 artifact, `tfplan`, AWS 연결 drift를 Apply 전 차단하는 helper
- Plan 실행 로그 저장과 조회
- Workspace 배포 패널에서 Plan 실행, summary, blocked reason, 승인 가능/불가능 상태, 로그 표시

아직 남은 범위:

- Apply API에서 승인 snapshot 검증 helper 연결
- Apply 직전 S3 `tfplan` hash 재계산
- `terraform apply tfplan`
- 생성 리소스 저장
- `terraform output -json` 저장
- sensitive output 마스킹과 화면 표시
- destroy/cleanup

## 3. 사용자 관점 흐름

```text
Workspace 배포 패널
-> Architecture snapshot 선택
-> Terraform artifact 선택
-> verified AWS connection 선택
-> Deployment 생성
-> Deployment record 선택
-> Terraform Plan 실행
-> 실행 중 버튼 비활성화
-> Plan summary, blocked reason, warning, logs 확인
-> 승인 가능한 Plan이면 Plan 승인
-> 승인 snapshot 확인
```

프론트엔드는 AWS SDK나 Terraform CLI를 직접 호출하지 않는다. 화면은 API를 호출하고 결과를 표시하는 역할만 맡는다.

관련 프론트 파일:

- `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- `apps/web/features/workspace/api.ts`

## 4. API 진입점

Plan 실행 API:

```http
POST /api/deployments/:deploymentId/plan
```

Plan 승인 API:

```http
POST /api/deployments/:deploymentId/approve
```

라우트 책임:

1. `deploymentId` param을 Zod로 검증한다.
2. 현재 사용자를 인증하고 project 접근 권한을 만든다.
3. Deployment가 존재하고 사용자가 접근 가능한지 확인한다.
4. 연결된 Terraform artifact가 Deployment의 project/architecture와 맞는지 확인한다.
5. Deployment가 이미 `RUNNING`이면 `409 conflict`를 반환한다.
6. Deployment 상태를 `RUNNING`으로 바꾼다.
7. `runDeploymentPlan`을 백그라운드로 시작한다.
8. 즉시 `202 Accepted`와 `RUNNING` 상태의 Deployment를 응답한다.

중복 실행 방지:

- 프론트에서는 선택된 Deployment가 `RUNNING`이면 Plan 버튼을 비활성화한다.
- 백엔드는 같은 Deployment가 `RUNNING`이면 `409 conflict`로 막는다.

승인 route 책임:

1. `deploymentId` param과 빈 body를 Zod로 검증한다.
2. 현재 사용자를 인증하고 project 접근 권한을 만든다.
3. Deployment, 현재 Plan artifact, Terraform artifact, AWS connection을 확인한다.
4. `risk_analysis` 등 실제 blocked Plan은 `409 conflict`로 막는다.
5. `missing_approval` 상태의 정상 Plan만 승인한다.
6. 승인 시점의 `terraformArtifactId`, Terraform artifact hash, `tfplan` hash, AWS account/region을 Deployment에 저장한다.
7. Deployment의 blocked 상태를 해제한다.

관련 API 파일:

- `apps/api/src/routes/deployments.ts`
- `apps/api/src/routes/deployments.test.ts`

## 5. Backend Plan 서비스 흐름

핵심 서비스:

```ts
runDeploymentPlan(input, repository, options)
```

전체 순서:

```text
1. Deployment 조회와 project 접근 확인
2. Terraform artifact 검증
3. verified AWS connection 조회
4. Architecture snapshot 조회
5. Pre-Deployment Check 실행
6. STS AssumeRole로 Terraform용 임시 AWS env 준비
7. S3 Terraform artifact를 임시 workdir에 복원
8. Deployment status = RUNNING 저장
9. terraform init 실행과 로그 저장
10. terraform validate 실행과 로그 저장
11. terraform plan -out=tfplan 실행과 로그 저장
12. terraform show -json tfplan 실행
13. show JSON stdout은 저장하지 않고 planSummary만 파싱
14. show stderr만 plan 로그로 저장
15. risk/block 상태 계산
16. tfplan 바이너리 S3 업로드와 sha256 계산
17. deployment_plan_artifacts metadata 저장
18. deployments.currentPlanArtifactId 갱신
19. Deployment status = PENDING 저장
20. 임시 workdir cleanup
```

관련 서비스 파일:

- `apps/api/src/deployments/deployment-plan-service.ts`
- `apps/api/src/deployments/terraform-workspace.ts`
- `apps/api/src/deployments/terraform-runner.ts`
- `apps/api/src/deployments/deployment-plan-summary.ts`
- `apps/api/src/deployments/deployment-plan-artifact-storage.ts`

## 6. Terraform 명령 실행 기준

현재 Plan 실행에서 사용하는 명령:

```bash
terraform init -backend=false -input=false -no-color
terraform validate -no-color
terraform plan -input=false -no-color -out=tfplan
terraform show -json tfplan
```

실행 환경:

- Terraform은 API 서버 또는 future worker에서만 실행한다.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`은 STS AssumeRole 결과로만 만든다.
- 임시 credential은 DB, API 응답, 로그에 저장하지 않는다.
- Terraform process env는 필요한 기본 env와 STS 임시 env만 포함한다.
- `TF_IN_AUTOMATION=1`을 설정한다.

## 7. 저장 경계

RDS에 저장하는 것:

- Deployment 상태
- Plan summary
- blocked 상태와 reason
- current Plan artifact pointer
- Plan artifact metadata
- Deployment logs

S3에 저장하는 것:

- 원본 Terraform artifact
- `tfplan` 바이너리

RDS에 저장하지 않는 것:

- raw Terraform file content
- raw `terraform show -json tfplan` 전체 JSON
- AWS temporary credentials
- AWS access key, secret key, session token
- Terraform sensitive output

## 8. Plan artifact 저장 방식

`tfplan` 바이너리는 S3에 저장하고, RDS에는 `deployment_plan_artifacts` row를 저장한다.

```ts
type DeploymentPlanArtifact = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
  createdAt: IsoDateTimeString;
};
```

S3 object key 형식:

```text
deployments/{deploymentId}/plans/{planArtifactId}.tfplan
```

Deployment는 현재 승인 대상 Plan을 `currentPlanArtifactId`로 가리킨다.

승인 후 Deployment는 아래 snapshot을 함께 저장한다.

```ts
type DeploymentApprovalSnapshot = {
  approvedTerraformArtifactId: string;
  approvedPlanArtifactId: string;
  approvedTerraformArtifactHash: string;
  approvedTfplanHash: string;
  approvedAwsAccountId: string;
  approvedAwsRegion: string;
};
```

## 9. Plan summary 파싱 기준

`terraform show -json tfplan`의 `resource_changes[].change.actions`를 기준으로 count를 만든다.

| actions | 처리 |
| --- | --- |
| `["create"]` | `createCount += 1` |
| `["update"]` | `updateCount += 1` |
| `["delete"]` | `deleteCount += 1` |
| `["delete", "create"]` | `replaceCount += 1` |
| `["create", "delete"]` | `replaceCount += 1` |
| `["no-op"]` | 무시 |
| `["read"]` | 무시 |
| 알 수 없는 actions | warning 추가 |

raw show JSON은 저장하지 않는다. 필요한 count와 warning만 `Deployment.planSummary`에 저장한다.

## 10. Risk block 기준

Plan 실행 자체는 high-risk여도 수행한다. 대신 성공한 Plan을 저장한 뒤 Apply로 넘어가지 못하게 blocked 상태로 둔다.

`risk_analysis`로 막는 조건:

- `deleteCount > 0`
- `replaceCount > 0`
- Pre-Deployment Check에서 `severity = "high"` finding 존재

일반 Plan 성공 상태:

- delete/replace/high-risk가 없으면 `blockedBy = "missing_approval"`로 저장한다.
- 즉, Plan 성공 후에도 사용자 승인 전에는 Apply로 넘어갈 수 없다.

승인 기준:

- `blockedBy = "missing_approval"`인 Plan만 승인할 수 있다.
- `blockedBy = "risk_analysis"`인 Plan은 `POST /api/deployments/:deploymentId/approve`에서 `409 conflict`로 막는다.
- 승인되면 `isBlocked = false`, `blockedBy = null`, `blockedReason = null`로 바꾼다.
- 승인 snapshot은 이후 Apply 직전 drift 검증에 사용한다.

## 11. 실패와 rollback 흐름

Terraform 단계 실패:

| 실패 위치 | 저장 상태 |
| --- | --- |
| `terraform init` 실패 | `status = FAILED`, `failureStage = init` |
| `terraform validate` 실패 | `status = FAILED`, `failureStage = validate` |
| `terraform plan` 실패 | `status = FAILED`, `failureStage = plan` |
| `terraform show -json` 실패 | `status = FAILED`, `failureStage = plan` |

Plan artifact 저장 실패:

1. `tfplan` S3 업로드가 끝난 뒤 RDS 저장이 실패할 수 있다.
2. 이 경우 DB transaction은 rollback된다.
3. 업로드된 S3 `tfplan`은 best-effort cleanup으로 삭제한다.
4. 기존 `deployments.currentPlanArtifactId`는 보존한다.
5. Deployment는 `FAILED`, `failureStage = plan`으로 저장한다.

임시 작업 디렉터리는 성공/실패와 관계없이 cleanup한다.

## 12. 로그 저장과 마스킹

저장하는 로그:

- `terraform init` stdout/stderr
- `terraform validate` stdout/stderr
- `terraform plan` stdout/stderr
- `terraform show -json tfplan` stderr

저장하지 않는 로그:

- `terraform show -json tfplan` stdout

show stdout은 raw plan JSON이라 크고 민감할 수 있으므로 저장하지 않는다. 대신 파싱된 summary만 저장한다.

로그 저장 기준:

- `deployment_logs.sequence`로 순서를 보장한다.
- stdout은 보통 `INFO`로 저장한다.
- 성공 stderr는 `WARN`, 실패 stderr는 `ERROR`로 저장한다.
- 저장 전 `maskDeploymentMessage`로 secret 패턴을 마스킹한다.

## 13. 보안 경계

현재 Plan 구현에서 지키는 경계:

- AWS credential 원문은 DB에 저장하지 않는다.
- AWS credential 원문은 API 응답에 포함하지 않는다.
- AWS credential 원문은 로그에 남기지 않는다.
- Terraform 실행은 backend에서만 수행한다.
- 프론트엔드는 AWS SDK나 Terraform CLI를 호출하지 않는다.
- `tfplan`은 S3에 저장하고 metadata/hash만 RDS에 둔다.
- raw `terraform show -json` 결과는 저장하지 않는다.
- destructive change는 Plan 저장 후 `risk_analysis`로 막는다.

아직 열지 않은 경계:

- 실제 `terraform apply`
- `terraform destroy`
- 생성 리소스 조회/저장
- Terraform output 저장

## 14. 테스트 기준

현재 구현된 주요 테스트:

- 정상 Plan 실행과 summary 저장
- `tfplan` S3 업로드와 hash 계산
- RDS 저장 실패 시 S3 cleanup
- 기존 Plan pointer 보존
- high-risk/delete/replace block
- `init` 실패 시 `validate`/`plan` 미실행
- `validate` 실패 시 `plan` 미실행
- `plan` 실패 시 `show-json`/artifact upload 미실행
- raw show JSON 로그 미저장
- secret log 마스킹
- `/plan` route 202 응답
- 중복 `RUNNING` Plan 409 차단
- `/approve` route 200 응답
- risk blocked Deployment 승인 차단
- 승인 snapshot 저장
- 승인 후 Terraform artifact, `tfplan`, AWS account/region drift 차단 helper
- 프론트 API가 `/plan`을 호출하는지 확인
- 프론트 API가 `/approve`를 호출하는지 확인

관련 테스트 파일:

- `apps/api/src/deployments/deployment-plan-service.test.ts`
- `apps/api/src/deployments/deployment-plan-summary.test.ts`
- `apps/api/src/deployments/deployment-plan-artifact-storage.test.ts`
- `apps/api/src/routes/deployments.test.ts`
- `apps/web/features/workspace/api.test.ts`

## 15. 다음 단계

다음 구현은 apply다. 이때 반드시 이어서 확인해야 하는 것:

1. Apply API에서 승인 snapshot 검증 helper를 반드시 호출한다.
2. Apply 직전 S3의 `tfplan` hash를 다시 계산한다.
3. 승인한 hash와 현재 S3 hash가 다르면 apply를 막는다.
4. 승인한 AWS account/region과 현재 AssumeRole 결과가 다르면 apply를 막는다.
5. `terraform apply tfplan`만 실행한다.
6. Apply stdout/stderr도 마스킹해 저장한다.
7. 성공 후 생성 리소스와 `terraform output -json`을 저장한다.
8. cleanup/destroy 흐름 없이는 위험 리소스 apply 범위를 넓히지 않는다.
