# Terraform Apply 실행 흐름 정리

이 문서는 `Terraform Apply 실행`을 처음 보는 사람이 코드 흐름과 구현 범위를 따라갈 수 있게 정리한 문서다.

목표는 네 가지다.

1. 사용자가 Apply 버튼을 누른 뒤 어떤 함수가 순서대로 호출되는지 알 수 있게 한다.
2. 실제 AWS 리소스 생성이 어디에서 일어나는지 분명히 한다.
3. Plan 승인, hash 검증, 로그 마스킹, 결과 저장의 경계를 설명한다.
4. 이번 구현에서 제외한 Destroy와 cleanup 책임을 명확히 한다.

## 1. 이번 구현 범위

이번 작업은 승인된 Terraform Plan을 실제 AWS에 적용하는 Apply 흐름을 구현한다.

실제로 생성 가능한 MVP 리소스 범위는 아래로 제한한다.

- VPC
- Public Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- S3 Bucket

Terraform resource type 기준으로는 아래 타입만 live apply 허용 대상이다.

- `aws_vpc`
- `aws_subnet`
- `aws_internet_gateway`
- `aws_route_table`
- `aws_route_table_association`
- `aws_security_group`
- `aws_security_group_rule`
- `aws_instance`
- `aws_s3_bucket`

이 목록에 없는 resource type이 Plan 변경 대상에 들어오면 Plan 단계에서 `risk_analysis`로 막힌다.

Destroy 자동 실행은 이번 구현 범위에서 제외했다. Apply가 성공하면 AWS 리소스가 실제로 남을 수 있으므로, 실습 후 cleanup은 AWS 콘솔 또는 별도 절차로 확인해야 한다.

## 2. 전체 구조

Apply 실행은 5개 경계로 나뉜다.

| 층 | 위치 | 책임 |
| --- | --- | --- |
| Frontend | [apps/web/features/workspace](../../apps/web/features/workspace) | Apply 확인 UI, API 호출, 결과 표시 |
| API route | [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts) | 인증, 실행 가능 여부 검증, project lock, background job 시작 |
| Backend service | [apps/api/src/deployments/deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | 승인 snapshot 검증, Terraform CLI 실행, 결과 수집 |
| Storage | RDS, S3 | state object key, DeployedResource, TerraformOutput, logs 저장 |
| Terraform CLI | `terraform init/apply/output/show` | 실제 AWS 리소스 생성과 결과 조회 |

같은 이름의 함수가 있으니 먼저 구분해야 한다.

| 이름 | 파일 | 의미 |
| --- | --- | --- |
| `runDeploymentApply` | [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts) | 프론트에서 `/apply` API를 호출하는 HTTP helper |
| `runDeploymentApply` | [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | 실제 Terraform CLI를 실행하는 backend service |
| `markDeploymentApplyRunning` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | Apply background job 시작 전에 Deployment를 `RUNNING`으로 바꾼다. |
| `completeDeploymentApply` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | Apply 성공 후 state key, 리소스, outputs를 저장하고 `SUCCESS`로 바꾼다. |
| `approvedPlanArtifactId` | `deployments` row | 사용자가 승인한 `tfplan` artifact id |
| `stateObjectKey` | `deployments` row | Apply 후 S3에 저장한 `terraform.tfstate` object key |

## 3. 사용자가 보는 흐름

```text
Workspace 배포 패널
-> Deployment 생성
-> Terraform Plan 실행
-> Plan summary와 logs 확인
-> Plan 승인
-> Terraform Apply 실행 버튼 클릭
-> Apply 확인 영역에서 AWS account/region/change count 확인
-> 실제 AWS 리소스 생성 버튼 클릭
-> RUNNING 상태 확인
-> 새로고침
-> Apply results, Terraform outputs, logs 확인
```

프론트엔드는 AWS SDK나 Terraform CLI를 직접 실행하지 않는다. 프론트는 API만 호출한다.

## 4. 프론트엔드 흐름

관련 파일:

- [apps/web/features/workspace/WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx)
- [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts)

### 4.1 API helper

[api.ts](../../apps/web/features/workspace/api.ts)에 Apply와 결과 조회 helper를 추가했다.

```ts
runDeploymentApply(deploymentId)
listDeploymentResources(deploymentId)
listTerraformOutputs(deploymentId)
```

호출 API는 아래다.

```http
POST /api/deployments/:deploymentId/apply
GET /api/deployments/:deploymentId/resources
GET /api/deployments/:deploymentId/outputs
```

### 4.2 버튼 활성화 조건

Apply 버튼은 Plan 승인 이후에만 의미가 있다.

`DeploymentPanel`의 핵심 조건은 아래다.

| 값 | 의미 |
| --- | --- |
| `isPlanApproved` | `approvedAt`과 `approvedPlanArtifactId`가 있으면 true다. |
| `canApply` | 승인된 Deployment이고, `RUNNING`/`SUCCESS`가 아니고, block 상태가 아니면 true다. |
| `showApplyConfirmation` | 사용자가 Apply 버튼을 누른 뒤 확인 영역을 보여줄지 결정한다. |
| `deploymentResources` | Apply 후 state에서 추출한 실제 리소스 목록이다. |
| `terraformOutputs` | Apply 후 Terraform output 목록이다. |

확인 영역에서는 AWS account, region, Plan 변경 수를 보여주고, 이번 MVP Apply 범위와 비용 발생 가능성을 안내한다.

### 4.3 화면 결과 표시

Apply 후 화면은 세 가지 결과를 보여준다.

| 영역 | 내용 |
| --- | --- |
| Deployment details | `stateObjectKey`, `resultWarningSummary`, error summary |
| Apply results | Terraform address, resource type, resource id |
| Terraform outputs | output name, sensitive 여부, output value |

Terraform이 sensitive로 표시한 output은 화면에서 실제 값을 보여주지 않고 `[sensitive]`로 표시한다.

## 5. API route 흐름

관련 파일:

- [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)

Apply 시작 API는 아래다.

```http
POST /api/deployments/:deploymentId/apply
```

라우트에서 하는 일:

1. 사용자 인증과 프로젝트 접근 권한을 확인한다.
2. Deployment와 Terraform artifact가 존재하는지 확인한다.
3. Plan이 승인되어 있는지 확인한다.
4. Deployment가 `RUNNING`, `SUCCESS`, block 상태이면 막는다.
5. 같은 프로젝트에 다른 실행 중 Deployment가 있으면 막는다.
6. `markDeploymentApplyRunning`으로 즉시 `RUNNING` 상태를 저장한다.
7. `runDeploymentApply`를 background job으로 시작한다.
8. 응답은 `202 Accepted`와 `RUNNING` Deployment를 반환한다.

중요한 점은 API 응답이 Apply 완료를 의미하지 않는다는 것이다. `/apply` 응답은 background job을 시작했다는 뜻이고, 사용자는 이후 새로고침으로 상태와 로그를 다시 확인한다.

결과 조회 API는 아래다.

```http
GET /api/deployments/:deploymentId/resources
GET /api/deployments/:deploymentId/outputs
```

`/outputs`는 sensitive output의 `value`를 `null`로 내려준다.

## 6. Backend Apply 서비스 흐름

관련 파일:

- [apps/api/src/deployments/deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)
- [apps/api/src/deployments/terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)
- [apps/api/src/deployments/deployment-apply-artifact-storage.ts](../../apps/api/src/deployments/deployment-apply-artifact-storage.ts)
- [apps/api/src/deployments/deployment-apply-results.ts](../../apps/api/src/deployments/deployment-apply-results.ts)

전체 순서는 아래다.

```text
Deployment 조회
-> Terraform artifact 조회
-> current Plan artifact 조회
-> verified AWS connection 조회
-> 승인된 tfplan S3 다운로드
-> Terraform artifact workspace 복원
-> Terraform artifact hash 계산
-> tfplan hash 계산
-> 승인 snapshot 검증
-> AWS temporary credential env 준비
-> workspace에 tfplan 파일 쓰기
-> terraform init
-> terraform apply tfplan
-> terraform output -json
-> terraform show -json
-> terraform.tfstate S3 업로드
-> TerraformOutput 저장
-> DeployedResource 저장
-> Deployment SUCCESS 저장
```

### 6.1 승인 snapshot 검증

Apply 직전에는 `assertDeploymentApplyPreconditions`를 다시 호출한다.

검증하는 값은 아래다.

| 값 | 이유 |
| --- | --- |
| `approvedTerraformArtifactId` | 사용자가 승인한 Terraform artifact와 현재 실행 artifact가 같은지 확인 |
| `approvedPlanArtifactId` | 사용자가 승인한 `tfplan`과 현재 Plan artifact가 같은지 확인 |
| `approvedTerraformArtifactHash` | Plan 이후 Terraform 원문이 바뀌지 않았는지 확인 |
| `approvedTfplanHash` | S3에서 받은 `tfplan` 바이너리가 승인 시점과 같은지 확인 |
| `approvedAwsAccountId` | 다른 AWS 계정으로 apply되는 일을 방지 |
| `approvedAwsRegion` | 다른 region으로 apply되는 일을 방지 |

이 값이 하나라도 다르면 Apply를 실행하지 않는다.

### 6.2 실제 AWS 리소스 생성 지점

실제 AWS 리소스 생성은 아래 호출에서 일어난다.

```ts
runTerraformApply(workspace.workdir, {
  env: awsCredentials.env,
  planFileName: "tfplan"
})
```

내부 Terraform CLI 명령은 아래다.

```bash
terraform apply -input=false -no-color tfplan
```

여기서 `tfplan`은 Plan 단계에서 S3에 저장했고, 사용자가 승인한 plan hash와 다시 대조한 파일이다.

### 6.3 결과 수집

Apply가 성공하면 세 가지 후처리를 한다.

| 후처리 | 명령/저장 위치 | 목적 |
| --- | --- | --- |
| Terraform outputs | `terraform output -json` -> `terraform_outputs` | 사용자가 확인할 output 저장 |
| Deployed resources | `terraform show -json` -> `deployed_resources` | 실제 state에 남은 Terraform resource 저장 |
| Terraform state | `terraform.tfstate` -> S3 | 이후 운영 확인과 복구를 위한 state artifact 저장 |

`terraform output -json`과 `terraform show -json`의 stdout은 로그에 남기지 않는다. stdout은 파싱에만 사용하고, stderr만 마스킹해서 apply stage 로그에 남긴다.

## 7. 실패와 경고 처리

Apply 전 실패와 Apply 후 후처리 실패는 다르게 다룬다.

| 상황 | 처리 |
| --- | --- |
| 승인 snapshot 불일치 | Apply 실행 전 중단, `FAILED`, `failureStage: "apply"` |
| `terraform init` 실패 | `FAILED`, `failureStage: "apply"` |
| `terraform apply` 실패 | `FAILED`, `failureStage: "apply"` |
| `terraform output -json` 실패 | Apply 자체는 성공했으므로 `SUCCESS` 유지, warning 저장 |
| `terraform show -json` 실패 | Apply 자체는 성공했으므로 `SUCCESS` 유지, warning 저장 |
| `terraform.tfstate` S3 업로드 실패 | Apply 자체는 성공했으므로 `SUCCESS` 유지, warning 저장 |

실제 AWS Apply가 성공한 뒤에는 `FAILED`로 뒤집지 않는다. AWS 리소스는 이미 생성됐기 때문이다. 대신 `resultWarningSummary`와 apply 로그에 사용자가 확인해야 할 경고를 남긴다.

## 8. 저장 모델

이번 작업에서 추가된 저장 계약은 아래다.

| 위치 | 필드/테이블 | 의미 |
| --- | --- | --- |
| `deployments` | `state_object_key` | S3에 저장한 `terraform.tfstate` object key |
| `deployments` | `result_warning_summary` | Apply 성공 후 후처리 경고 요약 |
| `deployed_resources` | table | Apply 후 state에서 추출한 실제 resource 목록 |
| `terraform_outputs` | table | Apply 후 Terraform output 목록 |

마이그레이션 파일은 아래다.

```text
apps/api/drizzle/0016_apply_results.sql
apps/api/drizzle/meta/0016_snapshot.json
```

`0015`는 사용하지 않고, 사용자 요청대로 `0016`부터 Apply 결과 저장 마이그레이션을 둔다.

## 9. AWS 권한

AWS 연결 생성 안내와 CloudFormation template에는 MVP Apply에 필요한 Terraform 권한을 추가했다.

허용 범위는 EC2/VPC 계열과 S3 bucket 계열 작업이다. 이 권한은 이번 MVP resource type을 실제로 만들고 조회하기 위한 최소 데모 범위로 본다.

민감 정보 원칙은 그대로 유지한다.

- AWS credential은 env로만 Terraform에 전달한다.
- credential, token, password, DB URL은 로그에 남기지 않는다.
- Terraform sensitive output은 저장/응답/화면에서 실제 값을 노출하지 않는다.

## 10. 작업 내용 요약

이번 구현에서 한 작업은 아래다.

1. Plan 단계에서 MVP live apply 미지원 resource type을 block하도록 whitelist를 추가했다.
2. `POST /api/deployments/:deploymentId/apply` API와 background apply job을 추가했다.
3. 승인된 `tfplan`만 apply되도록 artifact hash, `tfplan` hash, AWS account/region snapshot을 재검증했다.
4. Terraform CLI에 `apply`, `output -json`, `show -json` 실행 helper를 추가했다.
5. Apply 성공 후 Terraform state를 S3에 저장하고, resources/outputs를 RDS에 저장했다.
6. 프론트엔드에 Apply 확인 UI, 실행 버튼, 결과 목록, output 표시를 연결했다.
7. AWS 연결 안내와 CloudFormation template에 MVP Apply용 Terraform 권한을 추가했다.
8. 테스트 fake repository와 route/service 테스트 계약을 Apply 결과 모델에 맞춰 갱신했다.
9. `docs/data-models.md`, `docs/deployment.md`, 이 문서에 Apply 계약과 운영 흐름을 정리했다.

## 11. 완료 조건

완료 조건은 아래 7개다.

1. 승인된 Plan artifact가 없으면 Apply가 시작되지 않는다.
2. 승인 시점의 Terraform artifact hash, `tfplan` hash, AWS account, region이 Apply 직전 값과 다르면 Apply가 시작되지 않는다.
3. MVP 범위 밖 Terraform resource type은 Plan 단계에서 block되어 Apply로 넘어가지 않는다.
4. Apply 실행은 backend에서만 수행되고, 프론트엔드는 확인 UI와 API 호출만 담당한다.
5. `terraform apply tfplan` 성공 후 S3 state, DeployedResource, TerraformOutput이 조회 가능한 형태로 저장된다.
6. Apply 전/중 실패는 `FAILED`와 `failureStage: "apply"`로 남고, Apply 성공 후 후처리 실패는 warning으로 남는다.
7. AWS credential과 Terraform sensitive output은 로그, 응답, 화면에 실제 값이 노출되지 않는다.
