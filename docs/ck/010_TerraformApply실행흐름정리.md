# Terraform Apply 실행 흐름 정리

이 문서는 `Terraform Apply 실행`을 처음 보는 사람이 코드 흐름과 구현 범위를 따라갈 수 있게 정리한 문서다.

목표는 아홉 가지다.

1. 사용자가 AWS 연결을 시작한 뒤 어떤 Role이 만들어지는지 알 수 있게 한다.
2. CloudFormation Quick Create URL, `externalId`, trust policy, inline policy 관계를 설명한다.
3. 사용자가 AWS 콘솔에서 무엇을 누르고, SketchCatch 화면에는 무엇을 입력해야 하는지 설명한다.
4. SketchCatch 서버 자체 권한과 사용자 AWS 계정 Role 권한을 분리해서 설명한다.
5. 사용자가 Apply 버튼을 누른 뒤 어떤 함수가 순서대로 호출되는지 알 수 있게 한다.
6. 실제 AWS 리소스 생성이 어디에서 일어나는지 분명히 한다.
7. Plan 승인, hash 검증, 로그 마스킹, 결과 저장의 경계를 설명한다.
8. Destroy와 cleanup 책임을 명확히 한다.
9. 취소, 재시작 복구, SSE 로그, S3 artifact 보호처럼 Apply 운영 안전장치를 설명한다.

## 빠른 링크

- [Apply 전 AWS 연결 선행 흐름](#aws-connection-flow)
- [CloudFormation template 생성과 Quick Create URL](#cloudformation-template)
- [CloudFormation Stack이 만드는 Role](#cloudformation-role)
- [사용자 AWS 계정 Role 권한](#user-role-permissions)
- [Account ID 기반 검증](#account-id-verification)
- [AWS 권한 구분](#aws-permissions)
- [자주 나는 오류와 판단 기준](#common-aws-errors)
- [검증 명령과 확인 범위](#verification-commands)

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
| Frontend | [apps/web/features/workspace](../../apps/web/features/workspace) | Apply 확인 UI, API 호출, 결과 표시, 실행 취소 요청, SSE 로그 수신 |
| API route | [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts) | 인증, 실행 가능 여부 검증, project lock, background job 시작, cancel/SSE endpoint |
| Backend service | [apps/api/src/deployments/deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | 승인 snapshot 검증, Terraform CLI 실행, 결과 수집 |
| Storage | RDS, S3 | 실행 stage/time, state object key, DeployedResource, TerraformOutput, logs, 보호된 artifact 저장 |
| Terraform CLI | `terraform init/apply/output/show` | 실제 AWS 리소스 생성과 결과 조회 |

같은 이름의 함수가 있으니 먼저 구분해야 한다.

| 이름 | 파일 | 의미 |
| --- | --- | --- |
| `runDeploymentApply` | [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts) | 프론트에서 `/apply` API를 호출하는 HTTP helper |
| `runDeploymentApply` | [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | 실제 Terraform CLI를 실행하는 backend service |
| `markDeploymentApplyRunning` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | Apply background job 시작 전에 Deployment를 `RUNNING`으로 바꾼다. |
| `completeDeploymentApply` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | Apply 성공 후 state key, 리소스, outputs를 저장하고 `SUCCESS`로 바꾼다. |
| `requestDeploymentCancellation` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | 실행 중 Deployment에 취소 요청 시각을 저장한다. |
| `startTrackedDeploymentRun` | [deployment-run-registry.ts](../../apps/api/src/deployments/deployment-run-registry.ts) | background job의 `AbortController`를 process memory에 등록한다. |
| `approvedPlanArtifactId` | `deployments` row | 사용자가 승인한 `tfplan` artifact id |
| `stateObjectKey` | `deployments` row | Apply 후 S3에 저장한 `terraform.tfstate` object key |

<a id="aws-connection-flow"></a>

## 2.1 Apply 전 AWS 연결 선행 흐름

Apply는 사용자의 AWS 계정에 실제 리소스를 만든다. 그래서 Apply 전에 사용자의 AWS 계정에 AssumeRole 가능한 Role이 있어야 한다.

이번 수정 이후 기본 연결 방식은 CloudFormation Quick Create다. 사용자가 직접 IAM Role ARN과 policy JSON을 붙여 넣는 흐름이 아니라, SketchCatch가 Stack 생성 URL을 만들어 준다.

전체 순서는 아래다.

```text
Settings AWS 탭
-> 새 AWS 연결 시작
-> POST /api/aws/connections
-> 서버가 externalId 생성
-> GET /api/aws/connections/:connectionId/cloudformation-template
-> CloudFormation Quick Create URL 열기
-> 사용자가 AWS 콘솔에서 Create stack 클릭
-> 사용자 AWS 계정 안에 SketchCatchTerraformExecutionRole 생성
-> SketchCatch 화면에 AWS Account ID 12자리 입력
-> POST /api/aws/connections/:connectionId/verify-created-role
-> 서버가 Role ARN 계산
-> STS AssumeRole + GetCallerIdentity 검증
-> AwsConnection verified 저장
```

핵심은 사용자가 Role ARN을 복사하지 않아도 된다는 점이다. Role 이름을 `SketchCatchTerraformExecutionRole`로 고정했기 때문에 서버는 AWS Account ID만 받아 ARN을 계산한다.

```text
arn:aws:iam::<accountId>:role/SketchCatchTerraformExecutionRole
```

CloudFormation은 Stack 생성이 끝났다고 SketchCatch로 callback하지 않는다. 그래서 Account ID 입력 단계는 아직 필요하다.

### 2.1.1 `POST /api/aws/connections`

이 API는 pending AWS 연결 metadata를 만든다.

저장되는 핵심 값은 `externalId`다. `externalId`는 trust policy 조건에 들어가고, 이후 STS AssumeRole 요청에도 들어간다.

응답에는 아래 안내값이 포함된다.

| 값 | 의미 |
| --- | --- |
| `recommendedRoleName` | `SketchCatchTerraformExecutionRole` |
| `roleSetup.trustPolicy` | 사용자 AWS Role에 들어갈 trust policy |
| `roleSetup.permissionSetup` | Terraform Plan/Apply에 필요한 권한 안내 |
| `callerRoleSetup` | SketchCatch 서버 Role에 필요한 `sts:AssumeRole` 정책 안내 |

이 API는 아직 AWS에 어떤 리소스도 만들지 않는다. RDS에 pending 연결 row만 만든다.

<a id="cloudformation-template"></a>

### 2.1.2 CloudFormation template 생성

연결 row가 만들어지면 프론트는 아래 API로 CloudFormation template을 받는다.

```http
GET /api/aws/connections/:connectionId/cloudformation-template
```

응답에는 `templateBody`, `templateUrl`, `launchStackUrl`, `stackName`, `capabilities`가 들어간다.

`launchStackUrl`은 AWS 콘솔 Quick Create 화면으로 바로 가는 URL이다.

```text
https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-2#/stacks/quickcreate?templateURL=<templateUrl>&stackName=<stackName>&capabilities=CAPABILITY_NAMED_IAM
```

`templateUrl`은 `SKETCHCATCH_PUBLIC_BASE_URL`이 있을 때만 만들어진다. 이 값은 AWS CloudFormation 서비스가 접근할 수 있는 public HTTPS host여야 한다.

`CLOUDFORMATION_TEMPLATE_TOKEN_SECRET`은 public template URL token 서명에 쓴다. token에는 `connectionId`, `roleName`, `callerPrincipalArn`, `externalId`, `expiresAt`이 들어간다.

기본 token TTL은 1시간이다. 만료되면 설정 화면에서 `AWS 콘솔 열기`를 다시 눌러 새 URL을 받아야 한다.

<a id="cloudformation-role"></a>

### 2.1.3 CloudFormation Stack이 만드는 Role

Stack은 사용자 AWS 계정 안에 IAM Role 하나를 만든다.

```text
SketchCatchTerraformExecutionRole
```

Role trust policy는 SketchCatch API 서버 Role만 AssumeRole할 수 있게 한다.

```yaml
AssumeRolePolicyDocument:
  Version: "2012-10-17"
  Statement:
    - Effect: Allow
      Principal:
        AWS: "<SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN>"
      Action: sts:AssumeRole
      Condition:
        StringEquals:
          sts:ExternalId: "<connection externalId>"
```

`SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN`은 사용자마다 바꾸는 값이 아니다. SketchCatch API 서버가 실제로 실행되는 AWS Role ARN이다.

<a id="user-role-permissions"></a>

### 2.1.4 사용자 AWS 계정 Role 권한

이번 MVP 데모에서는 VPC, Subnet, Internet Gateway, Route Table, Security Group, EC2, S3를 자유롭게 조합할 수 있어야 한다.

그래서 CloudFormation으로 생성되는 Role에는 아래 inline policy를 넣는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ec2:*",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    }
  ]
}
```

이 권한은 사용자 AWS 계정 안에서 Terraform이 리소스를 만들고 조회하기 위한 권한이다.

SketchCatch artifact bucket에 `tfplan`이나 `terraform.tfstate`를 저장하는 권한이 아니다.

장기적으로는 Terraform resource type을 보고 더 좁은 least-privilege policy를 생성할 수 있다. 현재는 데모 안정성을 위해 넓은 EC2/S3 권한을 쓴다.

<a id="account-id-verification"></a>

### 2.1.5 Account ID 기반 검증

Stack 생성 후 사용자는 SketchCatch 화면에 AWS Account ID 12자리를 입력한다.

프론트는 12자리 숫자가 들어오면 예상 Role ARN을 보여준다.

```text
arn:aws:iam::<accountId>:role/SketchCatchTerraformExecutionRole
```

검증 버튼은 아래 API를 호출한다.

```http
POST /api/aws/connections/:connectionId/verify-created-role
Content-Type: application/json

{
  "accountId": "123456789012"
}
```

서버는 Account ID로 Role ARN을 계산한 뒤 기존 `verifyAwsConnection` 검증을 재사용한다.

검증 순서는 아래다.

```text
computed roleArn
-> sts:AssumeRole(RoleArn, ExternalId)
-> sts:GetCallerIdentity
-> caller accountId 확인
-> Role ARN accountId와 caller accountId 비교
-> aws_connections.status = verified 저장
```

같은 사용자가 같은 AWS account를 이미 verified 상태로 연결했다면 중복 연결을 막는다.

### 2.1.6 수동 Role ARN fallback

화면에는 `AWS Role ARN`, `연결 테스트`, `검증 저장` 흐름도 남아 있다.

이건 CloudFormation이 아닌 수동 생성이나 디버깅을 위한 fallback이다.

다만 Role 이름은 여전히 `SketchCatchTerraformExecutionRole`이어야 한다. 서버는 Role ARN이 권장 Role 이름으로 끝나는지 검사한다.

## 3. 사용자가 보는 흐름

최초 1회 또는 새 AWS 계정을 붙일 때는 환경설정에서 AWS 연결을 먼저 검증한다.

```text
환경설정
-> AWS
-> 새 AWS 연결 시작
-> AWS 콘솔에서 CloudFormation Stack 생성
-> AWS Account ID 입력
-> CloudFormation Role 검증
-> verified AWS 연결 저장
```

그 다음 프로젝트 Workspace에서 Deployment를 실행한다.

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
| `canCancelDeployment` | Deployment가 `RUNNING`이고 아직 `cancelRequestedAt`이 없으면 true다. |
| `showApplyConfirmation` | 사용자가 Apply 버튼을 누른 뒤 확인 영역을 보여줄지 결정한다. |
| `deploymentResources` | Apply 후 state에서 추출한 실제 리소스 목록이다. |
| `terraformOutputs` | Apply 후 Terraform output 목록이다. |

확인 영역에서는 AWS account, region, Plan 변경 수를 보여주고, 이번 MVP Apply 범위와 비용 발생 가능성을 안내한다.
실행 중인 Deployment를 선택하면 프론트는 `fetch` streaming으로 `/logs/stream`에 연결한다. `EventSource`는
`Authorization` header를 직접 넣기 어려우므로 사용하지 않는다.

### 4.3 화면 결과 표시

Apply 후 화면은 세 가지 결과를 보여준다.

| 영역 | 내용 |
| --- | --- |
| Deployment details | `activeStage`, 실행/완료/실패/취소 시각, `stateObjectKey`, `resultWarningSummary`, error summary |
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

중요한 점은 API 응답이 Apply 완료를 의미하지 않는다는 것이다. `/apply` 응답은 background job을 시작했다는 뜻이고, 사용자는 이후 상태와 로그를 다시 확인한다.
프로젝트 단위 실행 lock은 라우트 체크와 `deployments_project_running_unique` partial unique index를 함께 사용한다.
같은 Deployment에 중복 요청이 거의 동시에 들어와도 `PENDING`/`FAILED`에서 `RUNNING`으로 바뀌는 첫 전이만 성공하도록 한다.

취소 요청 API는 아래다.

```http
POST /api/deployments/:deploymentId/cancel
```

취소 요청은 `cancelRequestedAt`을 저장하고, 현재 API process memory에 등록된 Terraform background job의
`AbortController`를 abort한다. 이미 process가 사라져 active job을 찾을 수 없으면 stale `RUNNING`으로 보고
`FAILED` 처리하며, AWS 리소스 확인이 필요하다는 summary를 남긴다.

결과 조회 API는 아래다.

```http
GET /api/deployments/:deploymentId/resources
GET /api/deployments/:deploymentId/outputs
GET /api/deployments/:deploymentId/logs/stream
```

`/outputs`는 sensitive output의 `value`를 `null`로 내려준다.
`/logs/stream`은 SSE 응답에 `Cache-Control: no-store`와 `X-Accel-Buffering: no`를 붙여 중간 캐시와 proxy buffering을 피한다.

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
-> 승인된 tfplan object key 검증 후 S3 다운로드
-> Terraform artifact workspace 복원
-> Terraform artifact hash 계산
-> tfplan hash 계산
-> 승인 snapshot 검증
-> AWS temporary credential env 준비
-> activeStage = apply 확인
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
`terraform init/apply/output/show` 호출에는 `AbortSignal`이 전달된다. Apply가 시작되기 전 취소되면 `CANCELLED`로
끝낼 수 있지만, `terraform apply` 도중 취소되면 AWS 리소스가 일부 생성됐을 수 있으므로 `FAILED`와 확인 필요 summary를 남긴다.

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
| AWS 연결 또는 STS credential 준비 실패 | `FAILED`, `failureStage: "aws_connection"` |
| Apply 시작 전 init 중 취소 | `CANCELLED`, AWS 리소스 변경 없음 |
| `terraform apply` 중 취소 | `FAILED`, AWS 리소스 일부 변경 가능성 summary 저장 |
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
| `deployments` | `active_stage` | 현재 실행 중인 Terraform stage |
| `deployments` | `started_at`, `completed_at`, `failed_at` | 실행 lifecycle timestamp |
| `deployments` | `cancel_requested_at`, `cancelled_at` | 취소 요청과 취소 완료 timestamp |
| `deployed_resources` | table | Apply 후 state에서 추출한 실제 resource 목록 |
| `terraform_outputs` | table | Apply 후 Terraform output 목록 |

마이그레이션 파일은 아래다.

```text
apps/api/drizzle/0016_apply_results.sql
apps/api/drizzle/meta/0016_snapshot.json
apps/api/drizzle/0017_cynical_thunderbolt.sql
apps/api/drizzle/meta/0017_snapshot.json
```

`0016`은 Apply 결과 저장 모델이고, `0017`은 실행 stage/time/cancel 필드와 project 단위 `RUNNING` partial unique index를 추가한다.

### 8.1 S3 artifact 보호

Plan artifact와 Terraform state는 Deployment scope에 맞는 정확한 object key만 허용한다.

| artifact | 허용 object key |
| --- | --- |
| `tfplan` | `deployments/{deploymentId}/plans/{planArtifactId}.tfplan` |
| state | `deployments/{deploymentId}/state/terraform.tfstate` |

업로드 시에는 `ServerSideEncryption: "AES256"`, artifact metadata, lifecycle용 tag,
`ChecksumSHA256`을 함께 보낸다. `..`, 역슬래시, leading slash가 들어간 key는 저장/다운로드 전에 거부한다.

<a id="aws-permissions"></a>

## 9. AWS 권한

권한은 반드시 두 종류로 나눠서 봐야 한다.

첫 번째는 SketchCatch 서버 자체 권한이다.

두 번째는 사용자 AWS 계정 안에 생성되는 `SketchCatchTerraformExecutionRole` 권한이다.

이 둘을 섞으면 AccessDenied 원인을 잘못 잡게 된다.

### 9.1 SketchCatch 서버 Role 권한

SketchCatch API 서버는 자체 AWS Role로 실행된다.

이 Role에는 사용자 계정의 `SketchCatchTerraformExecutionRole`을 AssumeRole할 수 있는 권한이 필요하다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole"
    }
  ]
}
```

이 정책은 SketchCatch 운영 AWS 계정의 runtime Role에 붙인다.

사용자 AWS 계정 Role에 붙이는 정책이 아니다.

SketchCatch 서버 Role에는 artifact bucket 권한도 필요하다.

`S3_BUCKET_NAME` bucket 아래에서 `projects/*`와 `deployments/*`를 사용한다.

| prefix | 용도 |
| --- | --- |
| `projects/*` | Terraform file, diagram, export 같은 project asset |
| `deployments/*` | `tfplan`, `terraform.tfstate` 같은 Deployment artifact |

Plan artifact와 state 업로드는 `PutObjectCommand`에 `Tagging`을 같이 넣는다.

따라서 `deployments/*`에는 `s3:PutObjectTagging`이 필요하다.

예시는 아래다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSketchCatchProjectArtifacts",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::<artifact-bucket>/projects/*"
    },
    {
      "Sid": "AllowSketchCatchDeploymentArtifacts",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectTagging"
      ],
      "Resource": "arn:aws:s3:::<artifact-bucket>/deployments/*"
    },
    {
      "Sid": "AllowSketchCatchArtifactList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<artifact-bucket>",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "projects/*",
            "deployments/*"
          ]
        }
      }
    }
  ]
}
```

`s3:PutObjectTagging` 오류는 서버 Role 문제다.

사용자 AWS 계정 Role에 `s3:*`를 넣어도 이 오류는 해결되지 않는다.

### 9.2 사용자 AWS 계정 Role 권한

사용자 AWS 계정에는 CloudFormation Stack이 `SketchCatchTerraformExecutionRole`을 만든다.

이 Role에는 Terraform이 사용자 계정 안에서 리소스를 만들고 읽는 권한이 들어간다.

현재 MVP inline policy는 아래다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ec2:*",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    }
  ]
}
```

이 권한은 VPC, Subnet, Internet Gateway, Route Table, Security Group, EC2, S3 Bucket을 만들기 위한 데모 권한이다.

Terraform AWS provider는 S3 bucket을 만들 때 `CreateBucket`만 호출하지 않는다.

bucket policy, ACL, CORS, website, encryption, ownership controls, public access block, object lock 같은 설정도 읽거나 변경할 수 있다.

그래서 세부 S3 action을 하나씩 추가하면 `GetBucketPolicy`, `GetBucketObjectLockConfiguration` 같은 오류가 계속 날 수 있다.

현재는 데모 안정성을 위해 `s3:*`를 사용한다.

### 9.3 필요한 환경 변수

AWS 연결과 Apply 실행에는 아래 값이 필요하다.

```text
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=<SketchCatch artifact bucket>
SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN=arn:aws:iam::<SketchCatch accountId>:role/<runtime-role-name>
SKETCHCATCH_PUBLIC_BASE_URL=https://<public SketchCatch host>
CLOUDFORMATION_TEMPLATE_TOKEN_SECRET=<32자 이상 secret>
TF_PLUGIN_CACHE_DIR=<Terraform provider cache path>
```

`SKETCHCATCH_PUBLIC_BASE_URL`이 없거나 HTTPS가 아니면 `launchStackUrl`이 만들어지지 않을 수 있다.

이 경우 화면에 표시되는 `templateBody`를 복사해 수동으로 CloudFormation Stack을 만들 수 있다.

<a id="common-aws-errors"></a>

### 9.4 자주 나는 오류와 판단 기준

| 오류 | 원인 | 고칠 위치 |
| --- | --- | --- |
| `s3:PutObjectTagging` on `deployments/...tfplan` | SketchCatch artifact bucket에 tag 달 권한 없음 | SketchCatch 서버 Role |
| `s3:CreateBucket` on `arn:aws:s3:::bucket` | 사용자 계정 Role에 S3 생성 권한 없음 | 사용자 CloudFormation Stack Role |
| `BucketAlreadyExists` | S3 bucket 이름 전역 중복 | Terraform bucket 이름 |
| `s3:GetBucketPolicy` | Terraform provider가 bucket 주변 설정 조회 중 권한 부족 | 사용자 CloudFormation Stack Role |
| `s3:GetBucketObjectLockConfiguration` | Terraform provider가 object lock 설정 조회 중 권한 부족 | 사용자 CloudFormation Stack Role |
| `AWS Role account mismatch` | 입력한 Account ID와 STS caller account가 다름 | AWS 콘솔 로그인 계정과 Account ID |
| `CloudFormation template URL is invalid or expired` | signed template token 만료 또는 connection 불일치 | 설정 화면에서 URL 재발급 |

S3 bucket 이름은 전 세계에서 unique해야 한다.

`BucketAlreadyExists`는 권한 문제가 아니다.

bucket 이름을 아래처럼 더 고유하게 바꾼다.

```text
<user>-sketchcatch-demo-<accountId>-<suffix>
```

### 9.5 민감 정보 원칙

민감 정보 원칙은 그대로 유지한다.

- AWS credential은 env로만 Terraform에 전달한다.
- STS temporary credential은 저장하지 않는다.
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
7. AWS 연결 시작 시 CloudFormation Quick Create URL을 열도록 연결 UI를 바꿨다.
8. CloudFormation Stack이 `SketchCatchTerraformExecutionRole`을 만들도록 template을 구성했다.
9. `POST /api/aws/connections/:connectionId/verify-created-role`을 추가해 Account ID만으로 Role 검증을 저장하게 했다.
10. CloudFormation inline policy를 MVP 데모용 `ec2:*`, `s3:*`로 넓혔다.
11. 수동 Role ARN 입력 fallback은 유지했다.
12. 테스트 fake repository와 route/service 테스트 계약을 Apply 결과 모델과 AWS 연결 검증 모델에 맞춰 갱신했다.
13. `docs/data-models.md`, `docs/deployment.md`, 이 문서에 Apply 계약과 운영 흐름을 정리했다.
14. `cancel`, 서버 재시작 후 `RUNNING` recovery, SSE 로그 스트림, S3 artifact 보호, project lock을 추가했다.

## 11. 완료 조건

완료 조건은 아래 13개다.

1. AWS 연결 시작 시 pending `AwsConnection`과 `externalId`가 생성된다.
2. CloudFormation Quick Create URL이 생성되고 AWS 콘솔에서 Stack을 만들 수 있다.
3. Stack은 `SketchCatchTerraformExecutionRole`을 만들고 trust policy에 `externalId`를 넣는다.
4. Stack이 만든 Role에는 MVP 데모용 `ec2:*`, `s3:*` inline policy가 있다.
5. 사용자는 Account ID만 입력해 `verify-created-role`로 연결을 검증할 수 있다.
6. 검증된 연결은 Deployment Plan/Apply에서 재사용된다.
7. 승인된 Plan artifact가 없으면 Apply가 시작되지 않는다.
8. 승인 시점의 Terraform artifact hash, `tfplan` hash, AWS account, region이 Apply 직전 값과 다르면 Apply가 시작되지 않는다.
9. MVP 범위 밖 Terraform resource type은 Plan 단계에서 block되어 Apply로 넘어가지 않는다.
10. Apply 실행은 backend에서만 수행되고, 프론트엔드는 확인 UI와 API 호출만 담당한다.
11. `terraform apply tfplan` 성공 후 S3 state, DeployedResource, TerraformOutput이 조회 가능한 형태로 저장된다.
12. Apply 전/중 실패는 `FAILED`와 `failureStage: "apply"`로 남고, Apply 성공 후 후처리 실패는 warning으로 남는다.
13. AWS credential과 Terraform sensitive output은 로그, 응답, 화면에 실제 값이 노출되지 않고, `tfplan`/state S3 object는 deployment scope와 checksum으로 보호된다.

추가 안전 조건:

- 같은 프로젝트에 동시에 하나의 `RUNNING` Deployment만 존재한다.
- 실행 중 취소 요청을 보낼 수 있고, Apply 중 취소는 partial AWS 변경 가능성을 `FAILED` summary로 남긴다.
- 서버 재시작 후 남은 `RUNNING` Deployment는 시작 시 recovery에서 `FAILED`로 정리된다.
- 실행 로그는 SSE로 볼 수 있으며 응답은 캐시되지 않는다.

<a id="verification-commands"></a>

## 12. 검증 명령과 확인 범위

AWS 연결과 Apply 관련 코드를 바꿨다면 아래 검증을 우선 실행한다.

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api test -- aws-connection-service.test.ts aws-connections.test.ts
npm exec --package=pnpm@11.8.0 -- pnpm lint
npm exec --package=pnpm@11.8.0 -- pnpm typecheck
npm exec --package=pnpm@11.8.0 -- pnpm build
```

첫 번째 테스트는 AWS 연결 service와 route 계약을 확인한다.

확인 범위는 아래다.

- pending 연결 생성 시 `externalId`가 생성된다.
- CloudFormation template body와 Quick Create URL이 생성된다.
- template URL token이 검증된다.
- `verify-created-role`이 Account ID로 Role ARN을 계산한다.
- STS AssumeRole 결과가 verified connection으로 저장된다.
- 잘못된 Account ID는 거부된다.
- 권장 Role 이름이 아닌 ARN은 거부된다.

`lint`, `typecheck`, `build`는 전체 workspace 기준으로 확인한다.

문서만 바꾼 경우에는 전체 build가 필수는 아니다. 그래도 배포 흐름 코드를 함께 바꿨다면 세 명령을 모두 돌린다.

## 13. Apply는 Plan과 무엇이 다른가

Plan은 실제 AWS 리소스를 바꾸지 않는다.

Plan은 `terraform plan -out=tfplan`과 `terraform show -json tfplan`로 변경 예상 결과를 만들고, 그 바이너리 Plan 파일을 승인 대상으로 저장한다.

Apply는 실제 AWS 리소스를 바꾼다.

Apply는 사용자가 승인한 바로 그 `tfplan` 파일을 S3에서 다시 받아 `terraform apply tfplan`로 실행한다.

둘의 차이는 아래처럼 정리할 수 있다.

| 구분 | Plan | Apply |
| --- | --- | --- |
| Terraform 명령 | `terraform plan -out=tfplan` | `terraform apply tfplan` |
| AWS 리소스 변경 | 없음 | 있음 |
| 결과 저장 | Plan summary, `tfplan` metadata | state, resources, outputs |
| 사용자 액션 | 승인 대기 | 실제 생성 확인 |
| 실패 영향 | AWS 변경 없음 | 일부 AWS 변경 가능 |
| 안전장치 | risk block, approval | approval snapshot 재검증 |

Apply가 위험한 이유는 실패나 취소가 항상 원자적으로 되돌아가지 않기 때문이다.

예를 들어 VPC는 만들어졌고 EC2에서 실패할 수 있다. 이 경우 Terraform state 저장이 실패했거나 process가 끊기면 AWS 콘솔에서 실제 리소스를 확인해야 한다.

## 14. 프론트엔드 함수 단위 흐름

파일은 [WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx)다.

`DeploymentPanel`이 Plan, 승인, Apply, 취소, 로그, 결과 표시를 모두 맡는다.

### 14.1 핵심 상태값

| 상태값 | 의미 |
| --- | --- |
| `projectDetails` | 프로젝트 상세, architecture, asset 목록 |
| `awsConnections` | 사용자의 AWS 연결 목록 |
| `deployments` | 프로젝트의 Deployment 기록 |
| `deploymentLogs` | 선택한 Deployment 로그 |
| `deploymentResources` | Apply 후 저장된 실제 resource 목록 |
| `terraformOutputs` | Apply 후 저장된 Terraform output 목록 |
| `selectedArchitectureId` | Deployment 생성에 사용할 architecture snapshot |
| `selectedTerraformArtifactId` | Deployment 생성에 사용할 Terraform artifact |
| `selectedAwsConnectionId` | Deployment 생성에 사용할 verified AWS connection |
| `selectedDeploymentId` | 현재 화면에서 보는 Deployment |
| `showApplyConfirmation` | Apply 최종 확인 UI 표시 여부 |
| `requestState` | API 요청 상태 |
| `errorMessage` | 화면에 보여줄 API 오류 메시지 |

`deploymentResources`와 `terraformOutputs`는 Apply 전에도 조회한다.

아직 Apply 결과가 없으면 빈 배열이고, 화면에는 “아직 기록된 AWS 리소스가 없습니다” 또는 “Terraform output이 없습니다”가 나온다.

### 14.2 버튼 활성화 계산

`DeploymentPanel`은 버튼마다 별도 boolean을 계산한다.

| 값 | 의미 |
| --- | --- |
| `verifiedAwsConnections` | `status === "verified"`인 AWS 연결만 남긴다. |
| `terraformArtifacts` | project asset 중 `assetType === "terraform_file"`만 남긴다. |
| `architectureTerraformArtifacts` | 선택한 architecture에 속한 Terraform artifact만 남긴다. |
| `selectedDeployment` | `selectedDeploymentId`와 일치하는 Deployment |
| `canCreateDeployment` | architecture, Terraform artifact, AWS connection이 모두 선택됐고 요청 중이 아니면 true |
| `hasCurrentPlan` | `currentPlanArtifactId`가 있으면 true |
| `isPlanApproved` | `approvedAt`과 `approvedPlanArtifactId`가 있으면 true |
| `canRunPlan` | Deployment가 있고, RUNNING이 아니고, 승인 전이면 true |
| `canApprovePlan` | Plan이 있고, `blockedBy === "missing_approval"`이면 true |
| `canApply` | 승인됐고, RUNNING/SUCCESS가 아니고, block이 아니면 true |
| `canCancelDeployment` | RUNNING이고 아직 취소 요청이 없으면 true |

`canApply`가 true여도 바로 AWS 리소스를 만들지는 않는다.

사용자가 `Terraform Apply 실행` 버튼을 누르면 `showApplyConfirmation`만 true로 바뀐다.

실제 API 호출은 확인 박스 안의 `실제 AWS 리소스 생성` 버튼을 눌렀을 때 실행된다.

### 14.3 화면 진입 시 데이터 로딩

함수는 `loadDeploymentData`다.

호출 API는 아래다.

```text
getProjectDetails(projectId)
listAwsConnections()
listDeployments(projectId)
```

하는 일은 아래다.

1. 프로젝트 상세, AWS 연결, Deployment 목록을 동시에 불러온다.
2. 최신 architecture를 기본 선택한다.
3. 최신 architecture에 맞는 Terraform artifact를 기본 선택한다.
4. 첫 번째 verified AWS connection을 기본 선택한다.
5. 최신 Deployment를 기본 선택한다.

이 단계에서는 Terraform이나 AWS SDK가 실행되지 않는다.

화면 선택값만 준비한다.

### 14.4 선택한 Deployment 변경 시 결과 로딩

`selectedDeploymentId`가 바뀌면 `loadApplyDetails`가 실행된다.

호출 API는 아래다.

```text
listDeploymentLogs(selectedDeploymentId)
listDeploymentResources(selectedDeploymentId)
listTerraformOutputs(selectedDeploymentId)
```

이 세 API는 Apply가 아직 성공하지 않았어도 호출된다.

결과가 없으면 빈 배열을 내려준다.

선택이 바뀌면 `showApplyConfirmation`은 false로 돌아간다. 다른 Deployment를 보면서 이전 확인창으로 실수 실행하는 일을 막기 위함이다.

### 14.5 Apply 확인 UI

`showApplyConfirmation`이 true이면 확인 박스가 나타난다.

확인 박스는 아래 값을 보여준다.

| 표시값 | 출처 |
| --- | --- |
| AWS account | `approvedAwsAccountId` |
| AWS region | `approvedAwsRegion` |
| Plan changes | `planSummary.create/update/delete/replaceCount` |
| MVP 범위 안내 | 고정 안내 문구 |
| 비용/cleanup 안내 | 고정 안내 문구 |

확인 박스의 핵심 목적은 “Plan 승인”과 “실제 AWS 변경” 사이에 한 번 더 멈추게 하는 것이다.

Plan 승인은 종이 위의 실행 허가이고, Apply는 실제 리소스 생성이다.

### 14.6 `startTerraformApply`

함수 흐름:

```text
canApply 확인
-> runDeploymentApply(selectedDeployment.id)
-> deployments 목록에서 응답 Deployment로 교체
-> selectedDeploymentId 유지
-> showApplyConfirmation = false
-> logs/resources/outputs 다시 조회
```

프론트의 `runDeploymentApply`는 HTTP helper다.

실제 Terraform CLI 실행은 backend의 `runDeploymentApply`에서 일어난다.

`POST /apply` 응답은 Apply 완료가 아니다. route가 background job을 시작하고 `RUNNING` Deployment를 반환한다.

따라서 바로 조회한 resources/outputs는 아직 비어 있을 수 있다.

실행 중에는 SSE 로그 스트림이 붙고, 사용자는 새로고침으로 최종 결과를 확인한다.

### 14.7 `cancelSelectedDeployment`

취소 버튼은 `canCancelDeployment`가 true일 때만 활성화된다.

함수 흐름:

```text
cancelDeploymentRun(selectedDeployment.id)
-> deployments 목록 갱신
-> logs 재조회
```

취소 요청은 즉시 AWS 리소스 rollback을 의미하지 않는다.

Terraform process가 이미 apply 단계에 들어갔다면 일부 리소스가 생성됐을 수 있다.

### 14.8 SSE 로그 스트림

Deployment가 `RUNNING`이면 프론트는 `streamDeploymentLogs`를 호출한다.

`EventSource`를 쓰지 않고 `fetch` streaming을 쓴다.

이유는 인증 때문이다.

`EventSource`는 `Authorization` header를 붙이기 어렵다. `fetch`는 access token을 header에 넣을 수 있다.

프론트 parser는 SSE event 중 `event: log`만 읽고, `data:` JSON을 `DeploymentLog`로 변환한다.

## 15. 프론트 API helper 상세

파일은 [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts)다.

이 파일은 판단을 거의 하지 않는다.

URL을 만들고 `apiFetch` 또는 `fetch`로 요청한다.

| 함수 | HTTP | 의미 |
| --- | --- | --- |
| `runDeploymentApply` | `POST /api/deployments/:deploymentId/apply` | Apply background job 시작 요청 |
| `cancelDeployment` | `POST /api/deployments/:deploymentId/cancel` | 실행 취소 요청 |
| `listDeploymentLogs` | `GET /api/deployments/:deploymentId/logs` | 저장된 로그 전체 조회 |
| `streamDeploymentLogs` | `GET /api/deployments/:deploymentId/logs/stream` | SSE 로그 스트림 연결 |
| `listDeploymentResources` | `GET /api/deployments/:deploymentId/resources` | Apply 결과 resource 목록 조회 |
| `listTerraformOutputs` | `GET /api/deployments/:deploymentId/outputs` | Apply 결과 output 목록 조회 |

`readDeploymentLogStream`은 `ReadableStream`을 직접 읽는다.

`drainSseBuffer`는 `\n\n` 단위로 event를 자른다.

`parseDeploymentLogEvent`는 `event: log`만 인정한다.

`keep-alive` comment는 무시된다.

## 16. Apply API route 상세

파일은 [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)다.

route의 책임은 Terraform을 직접 실행하는 것이 아니다.

route는 인증, 접근권한, 시작 가능 여부, project lock을 확인하고 background job을 시작한다.

### 16.1 공통 context

공통 helper는 `getDeploymentRequestContext`다.

흐름:

```text
getDatabaseClient
-> requireActiveUserId
-> createUserProjectAccessContext
-> createPostgresDeploymentRepository
```

반환값:

| 값 | 의미 |
| --- | --- |
| `accessContext` | `{ kind: "user", userId }` |
| `repository` | Deployment DB 접근 객체 |

route는 이 context를 모든 Deployment API에서 재사용한다.

### 16.2 Apply 시작 route

Route:

```http
POST /api/deployments/:deploymentId/apply
```

호출 순서:

```text
deploymentParamsSchema.parse
-> z.object({}).parse(request.body ?? {})
-> getDeploymentRequestContext
-> getDeployment
-> requireDeploymentInitArtifact
-> requireDeploymentCanStartApply
-> requireNoRunningDeploymentInProject
-> repository.markDeploymentApplyRunning
-> startDeploymentApplyJob
-> 202 Accepted
```

각 단계의 의미:

| 코드 | 의미 |
| --- | --- |
| `deploymentParamsSchema.parse` | URL의 `deploymentId`가 UUID인지 확인한다. |
| `z.object({}).parse` | body는 비어 있어야 한다. 클라이언트가 실행 값을 임의로 보내지 못하게 한다. |
| `getDeployment` | Deployment가 존재하고 현재 사용자가 접근 가능한지 확인한다. |
| `requireDeploymentInitArtifact` | Terraform artifact가 Deployment의 project/architecture에 속하는지 확인한다. |
| `requireDeploymentCanStartApply` | 승인 여부, block 여부, RUNNING/SUCCESS 여부를 확인한다. |
| `requireNoRunningDeploymentInProject` | 같은 project의 다른 RUNNING Deployment를 막는다. |
| `markDeploymentApplyRunning` | DB status를 `RUNNING`, `activeStage`를 `apply`로 바꾼다. |
| `startDeploymentApplyJob` | background job을 등록하고 service를 실행한다. |

`requireDeploymentCanStartApply`가 막는 조건:

| 조건 | 오류 의미 |
| --- | --- |
| `status === "RUNNING"` | 이미 실행 중이다. |
| `status === "SUCCESS"` | 이미 성공한 Apply다. |
| `approvedAt` 또는 `approvedPlanArtifactId` 없음 | 승인 없이 Apply하려 한다. |
| `isBlocked === true` | risk block 또는 missing approval 상태다. |

route가 `RUNNING`으로 먼저 바꾸는 이유는 중복 요청을 빠르게 막기 위해서다.

실제 Apply는 background job에서 비동기로 실행된다.

### 16.3 `startDeploymentApplyJob`

코드 의미:

```text
startTrackedDeploymentRun(deploymentId, async abortSignal => {
  await runDeploymentApply({ ...input, abortSignal }, repository)
})
```

`startTrackedDeploymentRun`은 `AbortController`를 process memory에 저장한다.

취소 API가 들어오면 같은 `deploymentId`의 controller를 찾아 abort한다.

route는 Promise 완료를 기다리지 않는다.

그래서 `/apply` 응답은 `202 Accepted`다.

### 16.4 취소 route

Route:

```http
POST /api/deployments/:deploymentId/cancel
```

호출 순서:

```text
deploymentParamsSchema.parse
-> empty body 검증
-> getDeploymentRequestContext
-> requestDeploymentCancellation
-> cancelTrackedDeploymentRun
-> active job 있으면 202
-> active job 없으면 stale RUNNING으로 보고 failDeployment
```

`requestDeploymentCancellation`은 DB에 `cancelRequestedAt`을 저장한다.

`cancelTrackedDeploymentRun`은 process memory의 `AbortController`를 abort한다.

active job이 없으면 현재 서버 process에서는 Terraform을 멈출 수 없다.

이 경우 Deployment를 `FAILED`로 바꾸고 “AWS 리소스를 확인하라”는 summary를 남긴다.

### 16.5 logs/resources/outputs route

조회 API는 아래다.

```http
GET /api/deployments/:deploymentId/logs
GET /api/deployments/:deploymentId/logs/stream
GET /api/deployments/:deploymentId/resources
GET /api/deployments/:deploymentId/outputs
```

모든 조회는 먼저 `getDeployment`로 접근권한을 확인한다.

`/outputs`는 service layer에서 sensitive output의 `value`를 `null`로 바꿔 내려준다.

`/logs/stream`은 SSE response를 직접 쓴다.

헤더는 아래다.

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Connection: keep-alive
X-Accel-Buffering: no
Vary: Cookie
```

2초마다 `: keep-alive` comment를 보낸다.

## 17. Repository와 DB 함수 상세

파일은 [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts)다.

`DeploymentRepository`는 DB 접근 계약이다.

Apply와 직접 관련된 함수는 아래다.

| 함수 | 의미 |
| --- | --- |
| `findDeploymentById` | Deployment row 조회 |
| `findTerraformArtifactById` | Terraform artifact metadata 조회 |
| `findDeploymentPlanArtifactById` | current Plan artifact metadata 조회 |
| `findVerifiedAwsConnectionById` | 현재 user의 verified AWS connection 조회 |
| `findRunningDeploymentInProject` | project 단위 실행 lock 확인 |
| `markDeploymentApplyRunning` | `PENDING` 또는 `FAILED`를 `RUNNING/apply`로 전환 |
| `completeDeploymentApply` | resources/outputs 저장 후 `SUCCESS`로 전환 |
| `failDeployment` | `FAILED`와 failure summary 저장 |
| `requestDeploymentCancellation` | `cancelRequestedAt` 저장 |
| `cancelDeployment` | `CANCELLED` 저장 |
| `recoverInterruptedDeployments` | 서버 재시작 후 남은 RUNNING을 FAILED로 정리 |
| `getNextDeploymentLogSequence` | 다음 log sequence 계산 |
| `createDeploymentLogs` | 로그 여러 줄 저장 |
| `listDeployedResources` | Apply resource 결과 조회 |
| `listTerraformOutputs` | Terraform output 결과 조회 |

### 17.1 `markDeploymentApplyRunning`

DB update 조건:

```text
deployments.id = deploymentId
status in ("PENDING", "FAILED")
```

저장하는 값:

```text
status = "RUNNING"
activeStage = "apply"
startedAt = now()
completedAt = null
failedAt = null
cancelRequestedAt = null
cancelledAt = null
failureStage = null
errorSummary = null
resultWarningSummary = null
```

`PENDING`이나 `FAILED`에서만 시작할 수 있다.

`SUCCESS`는 route에서 먼저 막고, DB update 조건에서도 제외된다.

project 단위 partial unique index `deployments_project_running_unique`에 걸리면 `undefined`를 반환한다.

### 17.2 `completeDeploymentApply`

이 함수는 transaction으로 실행된다.

흐름:

```text
delete deployed_resources where deploymentId
-> delete terraform_outputs where deploymentId
-> insert resources
-> insert outputs
-> update deployments SUCCESS
-> commit
```

기존 resources/outputs를 먼저 지우는 이유는 재시도나 실패 후 재실행에서 이전 결과가 섞이지 않게 하기 위해서다.

Deployment에 저장하는 값:

| 필드 | 값 |
| --- | --- |
| `status` | `SUCCESS` |
| `activeStage` | `null` |
| `completedAt` | `now()` |
| `stateObjectKey` | state upload 성공 시 S3 key, 실패 시 `null` |
| `resultWarningSummary` | 후처리 warning join 문자열 또는 `null` |
| `failureStage` | `null` |
| `errorSummary` | `null` |

### 17.3 `failDeployment`

실패 시 저장하는 값:

```text
status = "FAILED"
activeStage = null
completedAt = now()
failedAt = now()
failureStage = input.failureStage
errorSummary = input.errorSummary
```

`failureStage`는 `init`, `plan`, `aws_connection`, `apply` 같은 domain stage다.

Apply service는 AWS credential 준비 실패를 `aws_connection`으로 저장한다.

Terraform init/apply 실패는 `apply`로 저장한다.

### 17.4 `cancelDeployment`

Apply 시작 전 init 단계에서 취소되면 `cancelDeployment`를 호출할 수 있다.

저장 값:

```text
status = "CANCELLED"
activeStage = null
completedAt = now()
cancelledAt = now()
failureStage = null
errorSummary = cancellation summary
```

이미 `terraform apply`가 시작된 뒤의 취소는 `CANCELLED`가 아니라 `FAILED`다.

AWS 변경이 일부 일어났을 수 있기 때문이다.

### 17.5 `recoverInterruptedDeployments`

서버 process가 죽으면 memory의 background job 정보도 사라진다.

DB에는 `RUNNING` 상태만 남을 수 있다.

startup recovery는 모든 `RUNNING` Deployment를 `FAILED`로 바꾼다.

`activeStage === "apply"`이면 아래 summary를 남긴다.

```text
Deployment was interrupted while Terraform apply was running. AWS resources may have been partially changed; verify resources before retry.
```

이 처리는 안전하게 실패로 닫는 것이다.

실제 AWS 리소스를 자동 삭제하지 않는다.

## 18. Backend Apply service 상세

파일은 [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)다.

핵심 함수는 아래다.

```ts
runDeploymentApply(input, repository, options)
```

이 함수가 실제 Terraform Apply 실행 전체를 조율한다.

### 18.1 입력값

```ts
type RunDeploymentApplyInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  abortSignal?: AbortSignal;
};
```

| 값 | 의미 |
| --- | --- |
| `deploymentId` | Apply 대상 Deployment |
| `accessContext` | 현재 사용자 접근 context |
| `startedFromStatus` | route가 RUNNING으로 바꾸기 전 상태 |
| `abortSignal` | 취소 요청을 Terraform runner까지 전달하는 signal |

`startedFromStatus`가 있는 이유는 route가 이미 RUNNING으로 바꾼 뒤 service를 호출하기 때문이다.

service는 원래 상태가 `SUCCESS`였는지, route에서 pre-marked running 되었는지 구분해야 한다.

### 18.2 `options`의 의미

`RunDeploymentApplyOptions`는 테스트에서 외부 의존성을 바꿔 끼우기 위한 dependency injection이다.

운영에서는 대부분 기본 구현을 쓴다.

| option | 기본값 | 의미 |
| --- | --- | --- |
| `prepareTerraformWorkspace` | `defaultPrepareTerraformWorkspace` | S3 Terraform artifact를 workdir에 복원 |
| `runTerraformInit` | `defaultRunTerraformInit` | apply 전 init 실행 |
| `runTerraformApply` | `defaultRunTerraformApply` | `terraform apply tfplan` 실행 |
| `runTerraformOutputJson` | `defaultRunTerraformOutputJson` | output 수집 |
| `runTerraformShowStateJson` | `defaultRunTerraformShowStateJson` | state JSON 수집 |
| `prepareTerraformAwsCredentialEnv` | STS 기반 기본 구현 | Terraform용 AWS env 생성 |
| `applyArtifactStorage` | S3 storage | tfplan 다운로드, state 업로드 |
| `readTerraformArtifactFile` | `readFile` | 복원된 `.tf` 파일 hash 계산 |
| `writePlanFile` | `writeFile` | S3에서 받은 tfplan을 workdir에 쓰기 |
| `generateResultId` | `randomUUID` | resources/outputs row id 생성 |

테스트는 이 option을 fake로 바꿔 Terraform이나 AWS를 실제로 호출하지 않는다.

### 18.3 `terraform` 결과 객체

함수 초반에 아래 객체를 만든다.

```ts
const terraform = {
  init: null,
  apply: null,
  outputJson: null,
  showStateJson: null
};
```

이 객체는 각 Terraform 명령 결과를 담는다.

실패해도 어느 단계까지 실행됐는지 테스트와 caller가 확인할 수 있다.

### 18.4 Apply 실행 전 검증 순서

초반 호출 순서:

```text
getDeployment
-> SUCCESS 재실행 방지
-> requireDeploymentTerraformArtifact
-> requireCurrentPlanArtifact
-> requireDeploymentAwsConnection
-> applyArtifactStorage.downloadDeploymentArtifact
-> prepareTerraformWorkspace
-> current Terraform artifact hash 계산
-> current tfplan hash 계산
-> assertDeploymentApplyPreconditions
```

각 함수의 뜻:

| 함수 | 의미 |
| --- | --- |
| `getDeployment` | Deployment 존재와 사용자 접근권한 확인 |
| `requireDeploymentTerraformArtifact` | Terraform artifact가 Deployment의 project/architecture와 맞는지 확인 |
| `requireCurrentPlanArtifact` | current Plan artifact가 있고 같은 Deployment인지 확인 |
| `requireDeploymentAwsConnection` | verified AWS connection과 accountId 확인 |
| `downloadDeploymentArtifact` | S3에서 승인 대상 `tfplan` 다운로드 |
| `prepareTerraformWorkspace` | Terraform artifact를 임시 workdir에 복원 |
| `createSha256` | Terraform artifact와 tfplan hash 계산 |
| `assertDeploymentApplyPreconditions` | approval snapshot과 현재 값 비교 |

이 순서에서 하나라도 실패하면 Terraform CLI는 실행되지 않는다.

### 18.5 `requireCurrentPlanArtifact`

막는 조건:

| 조건 | 오류 |
| --- | --- |
| `deployment.currentPlanArtifactId` 없음 | `Terraform Plan must be completed before apply` |
| Plan artifact row 없음 | `Current deployment plan artifact not found` |
| Plan artifact의 `deploymentId` 불일치 | `Current deployment plan artifact not found` |

Apply는 current Plan artifact가 없으면 시작할 수 없다.

승인 snapshot이 있어도 current pointer가 바뀌었거나 사라졌으면 중단한다.

### 18.6 `assertDeploymentApplyPreconditions`

파일은 [deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts)다.

확인하는 값:

| 확인 | 막는 문제 |
| --- | --- |
| approval snapshot 존재 | 승인 없이 Apply 방지 |
| `approvedTerraformArtifactId === deployment.terraformArtifactId` | 승인 후 artifact pointer 변경 방지 |
| `approvedPlanArtifactId === currentPlanArtifactId` | 승인 후 Plan 변경 방지 |
| `currentPlanArtifact.deploymentId === deployment.id` | 다른 Deployment Plan 적용 방지 |
| `approvedTerraformArtifactHash === currentTerraformArtifactHash` | 승인 후 Terraform 원문 변경 방지 |
| `approvedAwsAccountId === currentAwsConnection.accountId` | 다른 AWS 계정으로 Apply 방지 |
| `approvedAwsRegion === currentAwsConnection.region` | 다른 region으로 Apply 방지 |
| `approvedTfplanHash === currentTfplanHash` | S3 tfplan 변조 또는 변경 방지 |

이 검증은 Apply 안전성의 핵심이다.

사용자가 승인한 Plan과 실제 실행할 Plan이 같은지 보장한다.

### 18.7 AWS credential 준비 실패 처리

코드 경로:

```text
prepareAwsCredentialsForApply
-> prepareTerraformAwsCredentialEnv
-> 실패 시 repository.failDeployment(failureStage = "aws_connection")
-> failureRecorded = true
-> error throw
```

AWS 연결 실패는 Terraform 실패가 아니다.

그래서 `failureStage`를 `aws_connection`으로 남긴다.

`failureRecorded`를 true로 바꾸는 이유는 catch 블록에서 같은 실패를 다시 `apply` 실패로 덮어쓰지 않기 위해서다.

### 18.8 RUNNING 상태 처리

route는 보통 이미 `markDeploymentApplyRunning`을 호출했다.

service는 아래 값으로 그것을 판단한다.

```ts
const wasPreMarkedRunning =
  deployment.status === "RUNNING" && input.startedFromStatus !== undefined;
```

이미 route에서 RUNNING으로 바꿨으면 service는 다시 mark하지 않는다.

테스트나 다른 caller가 service를 직접 호출할 수도 있으므로, pre-marked가 아니면 service가 `markDeploymentApplyRunning`을 직접 호출한다.

### 18.9 tfplan 파일 쓰기

S3에서 받은 `planBuffer`는 workspace 안에 `tfplan` 파일로 쓴다.

```text
writePlanFile(join(workspace.workdir, "tfplan"), Buffer.from(planBuffer))
```

Terraform apply는 이 파일을 인자로 받는다.

즉 Apply는 새 Plan을 계산하지 않는다.

사용자가 승인한 `tfplan` 바이너리를 그대로 적용한다.

### 18.10 Terraform init

실행:

```text
runTerraformInit(workspace.workdir, {
  env: awsCredentials.env,
  signal: input.abortSignal
})
```

실제 명령:

```bash
terraform init -backend=false -input=false -no-color
```

Apply 전에도 init을 다시 실행하는 이유는 workdir이 새 임시 디렉터리이기 때문이다.

init이 cancel되면 아직 AWS 리소스 변경 전이므로 `CANCELLED`로 끝낼 수 있다.

init이 exit code 0이 아니면 `FAILED`, `failureStage = "apply"`다.

### 18.11 Terraform apply

실행:

```text
runTerraformApply(workspace.workdir, {
  env: awsCredentials.env,
  planFileName: "tfplan",
  signal: input.abortSignal
})
```

실제 명령:

```bash
terraform apply -input=false -no-color tfplan
```

여기서 실제 AWS 리소스 생성, 수정, 삭제가 일어난다.

이 명령이 성공하면 `applySucceeded = true`가 된다.

`applySucceeded`가 true가 된 뒤에는 output/state 저장이 실패해도 Deployment를 FAILED로 뒤집지 않는다.

### 18.12 Apply 중 취소

`terraform.apply.cancelled`이면 service는 `failDeploymentApplyRun`을 호출한다.

저장 summary:

```text
Terraform apply was cancelled. AWS resources may have been partially changed; verify resources before retry.
```

Apply 중 취소를 `CANCELLED`로 저장하지 않는 이유는 실제 AWS 변경이 일부 일어났을 수 있기 때문이다.

### 18.13 output 수집

Apply가 성공하면 `terraform output -json`을 실행한다.

실제 명령:

```bash
terraform output -json
```

stdout은 DB 로그에 저장하지 않는다.

stdout은 `parseTerraformOutputsJson`으로 파싱해서 `terraform_outputs`에 저장한다.

stderr만 로그에 남긴다.

output 수집 실패는 warning이다.

이미 AWS Apply는 성공했기 때문이다.

### 18.14 state inspection

다음으로 `terraform show -json`을 실행한다.

실제 명령:

```bash
terraform show -json
```

Plan 단계의 `terraform show -json tfplan`과 다르다.

Apply 후에는 plan 파일이 아니라 현재 workspace state를 JSON으로 읽는다.

stdout은 `extractDeployedResourcesFromTerraformStateJson`으로 파싱한다.

stderr만 로그에 남긴다.

파싱 실패는 warning이다.

### 18.15 state S3 업로드

Apply 후 workspace의 `terraform.tfstate`를 S3에 업로드한다.

object key:

```text
deployments/{deploymentId}/state/terraform.tfstate
```

업로드 실패는 warning이다.

이미 AWS Apply가 성공했기 때문에 Deployment는 `SUCCESS`로 유지한다.

state upload가 실패하면 `stateObjectKey`는 `null`일 수 있다.

### 18.16 Apply 완료 저장

마지막으로 `repository.completeDeploymentApply`를 호출한다.

저장하는 것:

| 값 | 저장 위치 |
| --- | --- |
| state object key | `deployments.state_object_key` |
| warning summary | `deployments.result_warning_summary` |
| deployed resources | `deployed_resources` |
| Terraform outputs | `terraform_outputs` |
| status | `deployments.status = SUCCESS` |

resources와 outputs에는 새 UUID가 붙는다.

`completeDeploymentApply`는 transaction으로 처리된다.

### 18.17 catch/finally

catch 블록은 `applySucceeded === false`이고 `failureRecorded === false`일 때만 Deployment를 실패 처리한다.

이 조건이 중요한 이유:

| 값 | 의미 |
| --- | --- |
| `applySucceeded === false` | 실제 AWS Apply 성공 전 실패다. FAILED로 닫아도 된다. |
| `failureRecorded === false` | 이미 aws_connection 실패 등으로 저장하지 않았다. |

finally는 항상 workspace cleanup을 호출한다.

```text
await workspace?.cleanup()
```

성공, 실패, 예외와 관계없이 임시 디렉터리를 지운다.

## 19. Apply service helper 함수

파일은 [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)다.

| 함수 | 의미 |
| --- | --- |
| `requireDeploymentTerraformArtifact` | artifact가 Deployment의 project/architecture와 맞는지 확인 |
| `requireCurrentPlanArtifact` | current Plan artifact 존재와 deployment 소유 확인 |
| `requireDeploymentAwsConnection` | verified AWS connection과 accountId 확인 |
| `prepareAwsCredentialsForApply` | STS credential 준비, 실패 시 `aws_connection` 저장 |
| `cancelDeploymentBeforeApplyRun` | apply 전 취소를 `CANCELLED`로 저장 |
| `failDeploymentApplyRun` | apply stage 실패를 `FAILED`로 저장 |
| `appendTerraformApplyOutput` | init/apply stdout과 stderr 로그 저장 |
| `appendTerraformApplyStderr` | output/show stderr만 로그 저장 |
| `appendApplyWarnings` | post-apply warning을 WARN log로 저장 |
| `appendOutputLines` | 출력 줄을 로그 row로 변환 |
| `splitOutputLines` | 줄 나누기, trim, secret masking, 빈 줄 제거 |
| `summarizeTerraformFailure` | Terraform 실패 summary 생성 |
| `summarizeUnexpectedApplyFailure` | 예상 못한 예외 summary 생성 |
| `summarizePostApplyWarning` | Apply 성공 후 후처리 warning 생성 |
| `createSha256` | Terraform artifact와 tfplan hash 계산 |

로그 level 기준:

| 출력 | level |
| --- | --- |
| init/apply stdout | `INFO` |
| 성공한 명령의 stderr | `WARN` |
| 실패한 명령의 stderr | `ERROR` |
| post-apply warning | `WARN` |

저장하지 않는 stdout:

```text
terraform output -json stdout
terraform show -json stdout
```

이 둘은 파싱 대상이지 로그 대상이 아니다.

## 20. Terraform runner 상세

파일은 [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)다.

공개 함수와 실제 명령:

| 함수 | 실제 명령 |
| --- | --- |
| `runTerraformInit` | `terraform init -backend=false -input=false -no-color` |
| `runTerraformPlan` | `terraform plan -input=false -no-color -out=tfplan` |
| `runTerraformShowJson` | `terraform show -json tfplan` |
| `runTerraformApply` | `terraform apply -input=false -no-color tfplan` |
| `runTerraformOutputJson` | `terraform output -json` |
| `runTerraformShowStateJson` | `terraform show -json` |

모든 함수는 내부에서 `runTerraformCommand`를 호출한다.

### 20.1 `runTerraformCommand`

역할:

Terraform process를 실행하고 결과 객체를 반환한다.

반환 타입:

```ts
type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};
```

중요한 구현:

| 코드 | 의미 |
| --- | --- |
| `terraformBinary ?? "terraform"` | 기본 실행 파일 |
| `timeoutMs ?? 60_000` | 기본 timeout 60초 |
| `createTerraformProcessEnv(options.env)` | Terraform process env 구성 |
| `ensureTerraformPluginCacheDir` | provider cache 디렉터리 생성 |
| `spawn(..., { shell: false })` | shell 없이 args 배열로 실행 |
| `windowsHide: true` | Windows에서 콘솔창 숨김 |
| `stdio: ["ignore", "pipe", "pipe"]` | stdin 차단, stdout/stderr 수집 |
| `AbortSignal` | 취소 요청 시 `SIGTERM` |

`shell: false`는 shell injection 위험을 줄이고 인자 경계를 명확히 한다.

### 20.2 취소 처리

`options.signal.aborted`가 이미 true이면 process를 시작하지 않는다.

즉시 아래 결과를 반환한다.

```text
exitCode = 130
stderr = "Terraform command cancelled"
cancelled = true
```

process 실행 중 abort되면 `child.kill("SIGTERM")`을 호출하고, 결과에 `cancelled = true`를 담는다.

### 20.3 `createTerraformProcessEnv`

Terraform process에는 전체 `process.env`를 넘기지 않는다.

상속하는 기본 env:

```text
PATH
SystemRoot
WINDIR
TEMP
TMP
TMPDIR
HOME
USERPROFILE
HTTP_PROXY
HTTPS_PROXY
NO_PROXY
```

추가하는 값:

```text
TF_IN_AUTOMATION=1
TF_PLUGIN_CACHE_DIR
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AWS_REGION
```

`TF_PLUGIN_CACHE_DIR`은 provider cache 위치다.

env에 AWS temporary credential이 들어가지만, 이 env는 child process에만 전달된다.

DB나 API 응답에 저장하지 않는다.

## 21. AWS runtime credential 상세

파일은 [aws-connection-runtime-credentials.ts](../../apps/api/src/aws-connections/aws-connection-runtime-credentials.ts)다.

핵심 함수:

```ts
prepareTerraformAwsCredentialEnv
```

흐름:

```text
assertVerifiedAwsConnection
-> getAwsAccountIdFromRoleArn
-> assumeRoleForTerraform
-> getCallerIdentityForTerraform
-> assertRoleRequiresExternalIdForTerraform
-> createTerraformAwsCredentialEnv
```

각 함수의 뜻:

| 함수 | 뜻 |
| --- | --- |
| `assertVerifiedAwsConnection` | connection이 verified이고 accountId, roleArn, externalId, region이 있는지 확인 |
| `getAwsAccountIdFromRoleArn` | Role ARN에서 accountId 추출 |
| `assumeRoleForTerraform` | externalId를 넣어 STS AssumeRole 호출 |
| `getCallerIdentityForTerraform` | 임시 credential이 실제 어느 account인지 확인 |
| `assertRoleRequiresExternalIdForTerraform` | externalId 없이 assume 가능한 위험한 Role인지 검사 |
| `createTerraformAwsCredentialEnv` | Terraform에 넘길 AWS env 네 개 생성 |

`assertAwsApplyPreconditions`도 이 파일에 있다.

이 함수는 승인된 account/region/tfplan hash와 현재 account/region/tfplan hash를 비교한다.

Apply service의 `assertDeploymentApplyPreconditions`가 이 함수를 호출한다.

## 22. Apply result parser 상세

파일은 [deployment-apply-results.ts](../../apps/api/src/deployments/deployment-apply-results.ts)다.

### 22.1 `parseTerraformOutputsJson`

입력:

```text
terraform output -json stdout
```

Terraform output JSON은 output 이름을 key로 가진 object다.

각 값은 보통 아래 형태다.

```json
{
  "sensitive": false,
  "value": "..."
}
```

처리 기준:

| 조건 | 처리 |
| --- | --- |
| 값이 object가 아니면 | 무시 |
| `sensitive === true` | `value = null` |
| `value` 없음 | `null` |
| 정상 output | `{ name, value, sensitive }` |

결과는 output name 기준으로 정렬한다.

민감 output은 저장 단계부터 실제 값을 버린다.

### 22.2 `extractDeployedResourcesFromTerraformStateJson`

입력:

```text
terraform show -json stdout
```

이 함수는 `values.root_module` 아래 resource를 재귀적으로 수집한다.

처리 기준:

| 조건 | 처리 |
| --- | --- |
| `root_module` 없음 | 빈 배열 |
| `mode === "data"` | 저장하지 않음 |
| `address` 또는 `type` 없음 | 저장하지 않음 |
| `provider_name` 없음 | `null` |
| `values.id`가 string/number/boolean | 문자열 resourceId로 저장 |
| child module 있음 | 재귀적으로 수집 |

저장 결과는 `terraformAddress` 기준으로 정렬한다.

resourceId는 AWS resource id를 화면에 보여주기 위한 값이다.

항상 존재한다고 보장하지 않으므로 nullable이다.

### 22.3 parse error

JSON parse 실패나 최상위 값이 object가 아니면 `DeploymentApplyResultParseError`를 던진다.

Apply service는 이 오류를 잡아 warning으로 바꾼다.

이미 Apply가 성공했다면 parse 실패 때문에 Deployment를 FAILED로 바꾸지 않는다.

## 23. Apply artifact storage 상세

파일은 [deployment-apply-artifact-storage.ts](../../apps/api/src/deployments/deployment-apply-artifact-storage.ts)다.

이 storage는 두 일을 한다.

| 함수 | 의미 |
| --- | --- |
| `downloadDeploymentArtifact` | 승인된 `tfplan`을 S3에서 다운로드 |
| `uploadDeploymentState` | Apply 후 `terraform.tfstate`를 S3에 업로드 |

### 23.1 tfplan 다운로드

`downloadDeploymentArtifact`는 먼저 object key를 검증한다.

```text
assertDeploymentPlanArtifactObjectKey
```

기대 key:

```text
deployments/{deploymentId}/plans/{planArtifactId}.tfplan
```

key가 정확히 일치하지 않으면 다운로드하지 않는다.

이 검증은 다른 Deployment의 Plan을 Apply하는 실수를 막는다.

### 23.2 state 업로드

`uploadDeploymentState`는 workspace의 `terraform.tfstate`를 읽는다.

저장 key:

```text
deployments/{deploymentId}/state/terraform.tfstate
```

S3 `PutObjectCommand` 옵션:

| 옵션 | 값 |
| --- | --- |
| `ContentType` | `application/json` |
| `ServerSideEncryption` | `AES256` |
| `Metadata.sketchcatch-deployment-id` | deployment id |
| `Metadata.sketchcatch-artifact-kind` | `terraform-state` |
| `Tagging.sketchcatch-artifact` | `terraform-state` |
| `Tagging.sketchcatch-lifecycle` | `deployment-artifact` |
| `ChecksumSHA256` | state file SHA256 base64 |

`Tagging`을 넣으므로 서버 Role에는 `s3:PutObjectTagging` 권한이 필요하다.

### 23.3 object key 보안

파일은 [deployment-artifact-security.ts](../../apps/api/src/deployments/deployment-artifact-security.ts)다.

검증 기준:

| 조건 | 처리 |
| --- | --- |
| 기대 key와 완전 일치하지 않음 | 거부 |
| `/`로 시작 | 거부 |
| `..` 포함 | 거부 |
| 역슬래시 포함 | 거부 |

이 검증은 path traversal과 cross-deployment artifact 사용을 막는다.

## 24. 로그와 마스킹 상세

로그 저장 함수는 `appendOutputLines`와 `appendDeploymentLogs`다.

`appendOutputLines`는 Terraform stdout/stderr를 줄 단위로 나눈다.

각 줄은 `maskDeploymentMessage`를 거친다.

빈 줄은 저장하지 않는다.

마스킹 대상 예:

```text
AWS access key
aws_access_key_id
aws_secret_access_key
aws_session_token
database_url
password
token
secret
```

마스킹은 service에서 한 번, repository 저장 직전 한 번 더 적용된다.

로그 sequence는 `getNextDeploymentLogSequence`로 현재 max sequence 다음 값을 구한다.

SSE는 sequence가 `sinceSequence`보다 큰 로그만 보낸다.

## 25. 실패 흐름 상세

Apply 실패는 위치에 따라 저장 방식이 다르다.

| 실패 위치 | 저장 |
| --- | --- |
| route precheck 실패 | HTTP `409 conflict`, DB 상태 변경 없음 또는 RUNNING 전환 전 중단 |
| `markDeploymentApplyRunning` 실패 | HTTP `409 conflict` |
| Terraform artifact 없음 | `FAILED`, 예상 못한 apply 실패 summary |
| current Plan artifact 없음 | `FAILED`, 예상 못한 apply 실패 summary |
| AWS connection 없음 | `FAILED`, `failureStage = aws_connection` |
| STS AssumeRole 실패 | `FAILED`, `failureStage = aws_connection` |
| approval snapshot mismatch | `FAILED`, `failureStage = apply` |
| init 실패 | `FAILED`, `failureStage = apply` |
| init 중 취소 | `CANCELLED` |
| apply 실패 | `FAILED`, `failureStage = apply` |
| apply 중 취소 | `FAILED`, partial 변경 가능성 summary |
| output parse 실패 | `SUCCESS`, warning |
| state parse 실패 | `SUCCESS`, warning |
| state upload 실패 | `SUCCESS`, warning |
| complete DB 저장 실패 | 예외 발생, AWS 리소스는 이미 변경됐을 수 있음 |

특히 마지막 경우는 운영상 주의해야 한다.

AWS Apply는 성공했는데 DB 완료 저장이 실패하면, 사용자는 AWS 콘솔과 Terraform state artifact 상태를 함께 확인해야 한다.

## 26. 코드를 읽는 순서

처음 읽을 때는 아래 순서가 덜 헷갈린다.

1. [apps/web/features/workspace/WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx)
   - `DeploymentPanel`
   - `canApply`
   - `showApplyConfirmation`
   - `startTerraformApply`
   - `cancelSelectedDeployment`

2. [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts)
   - `runDeploymentApply`
   - `cancelDeployment`
   - `streamDeploymentLogs`
   - `listDeploymentResources`
   - `listTerraformOutputs`

3. [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)
   - `app.post("/deployments/:deploymentId/apply", ...)`
   - `requireDeploymentCanStartApply`
   - `startDeploymentApplyJob`
   - `app.post("/deployments/:deploymentId/cancel", ...)`
   - `streamDeploymentLogs`

4. [apps/api/src/deployments/deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)
   - `runDeploymentApply`
   - `prepareAwsCredentialsForApply`
   - `appendTerraformApplyOutput`
   - `appendApplyWarnings`
   - `failDeploymentApplyRun`

5. [apps/api/src/deployments/deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts)
   - `assertDeploymentApplyPreconditions`
   - `assertDeploymentApprovalSnapshot`

6. [apps/api/src/aws-connections/aws-connection-runtime-credentials.ts](../../apps/api/src/aws-connections/aws-connection-runtime-credentials.ts)
   - `prepareTerraformAwsCredentialEnv`
   - `assertAwsApplyPreconditions`

7. [apps/api/src/deployments/terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)
   - `runTerraformApply`
   - `runTerraformOutputJson`
   - `runTerraformShowStateJson`
   - `runTerraformCommand`

8. [apps/api/src/deployments/deployment-apply-results.ts](../../apps/api/src/deployments/deployment-apply-results.ts)
   - `parseTerraformOutputsJson`
   - `extractDeployedResourcesFromTerraformStateJson`

9. [apps/api/src/deployments/deployment-apply-artifact-storage.ts](../../apps/api/src/deployments/deployment-apply-artifact-storage.ts)
   - `downloadDeploymentArtifact`
   - `uploadDeploymentState`

10. [apps/api/src/deployments/deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts)
    - `markDeploymentApplyRunning`
    - `completeDeploymentApply`
    - `failDeployment`
    - `cancelDeployment`
    - `recoverInterruptedDeployments`

## 27. 진짜 핵심 요약

```text
AWS 연결 verified 준비
-> Deployment 생성
-> Terraform Plan 실행
-> tfplan S3 저장
-> Plan 승인
-> Apply 버튼 클릭
-> route가 승인/block/RUNNING 상태 확인
-> route가 RUNNING/apply로 전환
-> background runDeploymentApply 시작
-> Deployment/Terraform artifact/current Plan/AWS connection 조회
-> S3에서 tfplan 다운로드
-> Terraform artifact를 임시 workdir에 복원
-> Terraform artifact hash와 tfplan hash 재계산
-> approval snapshot과 현재 값 비교
-> STS AssumeRole로 Terraform AWS env 준비
-> workdir에 tfplan 파일 쓰기
-> terraform init
-> terraform apply tfplan
-> apply 성공 후 terraform output -json
-> apply 성공 후 terraform show -json
-> terraform.tfstate S3 업로드
-> resources/outputs/stateObjectKey/warnings 저장
-> Deployment SUCCESS
```

Apply의 가장 중요한 규칙은 하나다.

사용자가 승인한 `tfplan`과 실제 실행되는 `tfplan`이 같아야 한다.

이 규칙을 지키기 위해 Terraform artifact hash, `tfplan` hash, AWS account, AWS region을 승인 시점과 Apply 직전에 두 번 비교한다.
