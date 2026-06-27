# AWS Role 연결 이해 가이드

이 문서는 AWS Role 연결을 처음 보는 사람이 흐름, 코드 위치, 실습 방법을 한 번에 이해하도록 다시 쓴 가이드다.

핵심은 이것이다.

```text
사용자에게 AWS Access Key를 받지 않는다.
사용자 AWS 계정에는 SketchCatch가 assume할 Role만 만든다.
SketchCatch가 connection마다 externalId를 생성한다.
AWS connection은 project 단위가 아니라 SketchCatch 사용자 계정 단위로 한 번 연결한다.
검증된 connection은 여러 project의 Deployment에서 재사용한다.
같은 사용자가 같은 AWS accountId를 verified 상태로 중복 연결할 수 없다.
검증/실행 때마다 STS AssumeRole로 임시 credential만 받아 쓴다.
임시 credential은 DB, API 응답, 프론트 상태, 로그에 저장하지 않는다.
```

현재 구현 범위는 여기까지다.

| 상태 | 내용 |
| --- | --- |
| 구현됨 | AWS Role connection 생성, CloudFormation template 발급, STS test/verify, verified metadata 저장 |
| 구현됨 | AWS connection을 사용자 계정 단위로 관리하고 여러 project에서 재사용 |
| 구현됨 | Deployment 생성 시 verified AWS connection 선택 |
| 구현됨 | Deployment init 실행 전 다시 AssumeRole하고 temporary credential만 Terraform child process env로 전달 |
| 아직 아님 | `terraform plan`, `terraform apply`, `terraform destroy` API |

## 1. 계정 구분

| 구분 | 의미 | 해야 하는 일 |
| --- | --- | --- |
| SketchCatch AWS 계정 | SketchCatch backend가 실행되는 AWS 계정 | backend runtime role 준비, `sts:AssumeRole` 권한 부여, 서버 env 설정 |
| 사용자 AWS 계정 | 실제 연결 대상이 되는 사용자/sandbox AWS 계정 | `SketchCatchTerraformExecutionRole` 생성, RoleArn을 SketchCatch에 입력 |
| SketchCatch 앱 계정 | SketchCatch 로그인 사용자 | 환경설정에서 AWS connection 생성, test/verify 실행, 프로젝트에서 verified connection 선택 |

SketchCatch backend가 사용자 AWS 계정의 Role을 직접 만들지는 않는다. SketchCatch는 Role을 만들 수 있는 CloudFormation template과 trust policy 값을 제공하고, 사용자가 자기 AWS 계정에서 승인한다.

## 2. 전체 흐름

```text
1. SketchCatch 운영자가 backend caller role을 준비한다.
   예: arn:aws:iam::<SKETCHCATCH_ACCOUNT_ID>:role/SketchCatchRuntimeRole

2. 사용자가 SketchCatch 환경설정에서 AWS connection을 만든다.
   POST /api/aws/connections

3. API가 aws_connections에 pending row를 만든다.
   externalId는 서버가 랜덤 생성한다.

4. API가 사용자에게 Role 생성 정보를 내려준다.
   callerPrincipalArn, externalId, trustPolicyTemplate, CloudFormation template

5. 사용자가 자기 AWS 계정에 Role을 만든다.
   Role 이름: SketchCatchTerraformExecutionRole
   Trust principal: SketchCatchRuntimeRole
   Condition: sts:ExternalId = SketchCatch가 발급한 externalId

6. 사용자가 RoleArn을 SketchCatch에 입력한다.
   POST /api/aws/connections/:connectionId/test
   POST /api/aws/connections/:connectionId/verify

7. API가 STS AssumeRole + GetCallerIdentity를 확인한다.
   요청 body는 roleArn만 받는다.
   externalId와 region은 DB의 connection metadata를 사용한다.
   같은 사용자의 같은 AWS account가 이미 verified 상태면 중복 저장하지 않고 실패 처리한다.

8. deployment init 때 deployment.awsConnectionId로 사용자 소유 verified connection을 찾는다.
   매번 다시 AssumeRole하고, 임시 credential만 Terraform child process env에 넣는다.
```

프론트에서는 이렇게 나뉜다.

```text
환경설정 > AWS 탭
-> 계정 단위 AWS connection 생성/test/verify

메인보드 오른쪽 패널 > 배포 탭
-> verified connection 선택
-> Deployment 생성
-> Terraform init 실행
```

## 3. 코드 지도

| 보고 싶은 것 | 링크 |
| --- | --- |
| AWS connection route 전체 | [aws-connections.ts](../../apps/api/src/routes/aws-connections.ts#L94) |
| connection 목록 route | [GET /aws/connections](../../apps/api/src/routes/aws-connections.ts#L94) |
| connection 생성 route | [POST /aws/connections](../../apps/api/src/routes/aws-connections.ts#L117) |
| connection test route | [POST /aws/connections/:connectionId/test](../../apps/api/src/routes/aws-connections.ts#L157) |
| connection verify route | [POST /aws/connections/:connectionId/verify](../../apps/api/src/routes/aws-connections.ts#L197) |
| CloudFormation template route | [GET /aws/connections/:connectionId/cloudformation-template](../../apps/api/src/routes/aws-connections.ts#L247) |
| public template route | [GET /aws/connections/cloudformation-template](../../apps/api/src/routes/aws-connections.ts#L290) |
| connection repository | [createPostgresAwsConnectionRepository](../../apps/api/src/aws-connections/aws-connection-service.ts#L122) |
| connection 목록 service | [listAwsConnections](../../apps/api/src/aws-connections/aws-connection-service.ts#L204) |
| connection 생성 service | [createAwsConnection](../../apps/api/src/aws-connections/aws-connection-service.ts#L215) |
| externalId 생성 | [createAwsExternalId](../../apps/api/src/aws-connections/aws-connection-service.ts#L253) |
| 저장 없는 test service | [testStoredAwsConnection](../../apps/api/src/aws-connections/aws-connection-service.ts#L373) |
| 저장형 verify service | [verifyAwsConnection](../../apps/api/src/aws-connections/aws-connection-service.ts#L272) |
| 같은 AWS account 중복 검증 | [findVerifiedAwsConnectionByAccountId 호출](../../apps/api/src/aws-connections/aws-connection-service.ts#L337) |
| CloudFormation template 생성 | [getAwsConnectionCloudFormationTemplate](../../apps/api/src/aws-connections/aws-connection-service.ts#L421) |
| public template token 검증 | [renderAwsConnectionCloudFormationTemplateFromToken](../../apps/api/src/aws-connections/aws-connection-service.ts#L491) |
| RoleArn 이름 제한 | [isRecommendedAwsConnectionRoleArn](../../apps/api/src/aws-connections/aws-connection-service.ts#L588) |
| 실제 STS 호출 | [testAwsConnection](../../apps/api/src/aws-connections/aws-connection-test-service.ts#L63) |
| AWS SDK STS gateway | [createAwsSdkStsGateway](../../apps/api/src/aws-connections/aws-connection-test-service.ts#L119) |
| externalId 필수 확인 | [assertAwsRoleRequiresExternalId](../../apps/api/src/aws-connections/aws-connection-test-service.ts#L180) |
| deployment 생성 route | [POST /projects/:projectId/deployments](../../apps/api/src/routes/deployments.ts#L135) |
| deployment init route | [POST /deployments/:deploymentId/init](../../apps/api/src/routes/deployments.ts#L214) |
| deployment 생성 service | [createDeployment](../../apps/api/src/deployments/deployment-service.ts#L386) |
| verified connection 조회 | [findVerifiedAwsConnectionById](../../apps/api/src/deployments/deployment-service.ts#L237) |
| deployment init 실행 | [runDeploymentInit](../../apps/api/src/deployments/deployment-init-service.ts#L47) |
| Terraform credential 준비 | [prepareTerraformAwsCredentialEnv](../../apps/api/src/aws-connections/aws-connection-runtime-credentials.ts#L46) |
| Terraform env 격리 | [createTerraformProcessEnv](../../apps/api/src/deployments/terraform-runner.ts#L113) |
| 로그 마스킹 | [maskDeploymentMessage](../../apps/api/src/deployments/log-masking.ts#L14) |
| DB schema | [awsConnections](../../apps/api/src/db/schema.ts#L185), [verified account unique index](../../apps/api/src/db/schema.ts#L203), [deployments.awsConnectionId](../../apps/api/src/db/schema.ts#L223) |
| migration: project_id 제거 | [0010_nostalgic_adam_warlock.sql](../../apps/api/drizzle/0010_nostalgic_adam_warlock.sql#L1) |
| migration: account 중복 방지 | [0011_silly_jasper_sitwell.sql](../../apps/api/drizzle/0011_silly_jasper_sitwell.sql#L1) |
| 공유 타입 | [AwsConnection / DTO](../../packages/types/src/index.ts#L239) |
| 프론트 API helper: AWS connection | [workspace/api.ts](../../apps/web/features/workspace/api.ts#L78) |
| 프론트 API helper: Deployment | [createDeployment](../../apps/web/features/workspace/api.ts#L146), [runDeploymentInit](../../apps/web/features/workspace/api.ts#L181) |
| 환경설정 AWS 연결 탭 | [settings-integrations-client.tsx](../../apps/web/app/settings/settings-integrations-client.tsx#L25) |
| 메인보드 오른쪽 배포 탭 | [WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx#L73) |

## 4. 함수별 역할

### `listAwsConnections`

위치: [aws-connection-service.ts](../../apps/api/src/aws-connections/aws-connection-service.ts#L204)

현재 로그인 사용자의 AWS connection 목록만 반환한다. projectId를 받지 않는다.

프론트에서 쓰는 곳:

```text
환경설정 AWS 탭
메인보드 오른쪽 배포 탭
```

### `createAwsConnection`

위치: [aws-connection-service.ts](../../apps/api/src/aws-connections/aws-connection-service.ts#L215)

하는 일:

```text
1. 로그인 사용자 확인
2. connection id 생성
3. externalId 생성
4. aws_connections에 userId 기준 status = pending 저장
5. trustPolicyTemplate 생성
6. roleSetup, callerRoleSetup, callerPrincipalArn 응답
```

`externalId`는 [createAwsExternalId](../../apps/api/src/aws-connections/aws-connection-service.ts#L253)에서 만든다.

```text
sc_conn_<connectionId>_<random>
```

사용자가 externalId를 만들지 않는 이유는 confused deputy 문제를 막기 위해서다.

`connectionId`와 `externalId`는 역할이 다르다.

| 값 | 생성 시점 | 역할 |
| --- | --- | --- |
| `connectionId` | AWS connection 생성 요청 처리 중 `randomUUID()`로 생성 | SketchCatch 내부에서 `aws_connections` row를 찾는 ID. API path, DB 관계, Deployment의 `awsConnectionId`에서 사용 |
| `externalId` | `connectionId` 생성 직후 `createAwsExternalId(connectionId)`로 생성 | AWS STS `AssumeRole` 요청이 이 SketchCatch connection에서 온 요청인지 확인하는 보안용 값. 사용자 AWS Role trust policy와 STS 호출 양쪽에 같은 값이 들어감 |

`apps/api/src/routes/aws-connections.ts`의 `generateAwsConnectionId`, `generateAwsExternalId`는 운영 흐름에서 사용자가 넘기는 값이 아니다. 테스트에서 랜덤값을 고정하려고 route options로 주입하는 함수다. 운영 기본값은 `connectionId = randomUUID()`, `externalId = createAwsExternalId(connectionId)`다.

`trustPolicyTemplate`은 사용자 AWS 계정에 만들 Role의 출입문 규칙이다. 권한 목록이라기보다 "누가 이 Role을 `AssumeRole` 할 수 있는가"를 정한다.

SketchCatch 흐름에서는 사용자 AWS Role이 이렇게 말하는 정책을 만든다.

```text
나는 SketchCatch backend Role을 믿는다.
단, sts:ExternalId가 이 connection의 externalId와 같을 때만 허용한다.
```

trust policy의 핵심 필드는 아래처럼 읽으면 된다.

| 필드 | 의미 |
| --- | --- |
| `Principal` | 이 Role을 assume할 수 있는 주체. 여기서는 `callerPrincipalArn`, 즉 SketchCatch backend runtime Role |
| `Action` | 허용할 동작. 여기서는 `sts:AssumeRole` |
| `Condition` | 허용 조건. 여기서는 `sts:ExternalId`가 connection의 `externalId`와 같아야 함 |

구분해서 봐야 할 점은 이것이다.

```text
Trust policy = 누가 이 Role에 들어올 수 있는가
Permission policy = 이 Role에 들어온 뒤 무엇을 할 수 있는가
```

즉 trust policy가 SketchCatch의 입장을 허용해도, 사용자 AWS Role에 S3/EC2 같은 permission policy가 붙어 있지 않으면 실제 리소스 조작 권한은 없다. 연결 검증 단계에서는 주로 "SketchCatch가 이 Role을 안전하게 assume할 수 있는가"를 확인한다.

### `testStoredAwsConnection`

위치: [aws-connection-service.ts](../../apps/api/src/aws-connections/aws-connection-service.ts#L373)

저장 없이 연결만 테스트한다. 요청 body는 `roleArn`만 받는다.

```json
{
  "roleArn": "arn:aws:iam::<USER_ACCOUNT_ID>:role/SketchCatchTerraformExecutionRole"
}
```

`externalId`, `region`은 DB의 `aws_connections` row에서 읽는다.

### `verifyAwsConnection`

위치: [aws-connection-service.ts](../../apps/api/src/aws-connections/aws-connection-service.ts#L272)

STS 검증에 성공하면 아래 metadata만 DB에 저장한다.

```text
accountId
roleArn
status = verified
lastVerifiedAt
updatedAt
```

검증 결과의 `accountId`가 이미 같은 사용자의 다른 verified connection에 저장되어 있으면 실패한다.

```text
userId + accountId + status=verified
```

이 조합은 DB partial unique index로도 한 번 더 막는다.

중복일 때 사용자에게 나가는 메시지:

```text
AWS account is already connected
```

저장하지 않는 것:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AssumeRole 결과 credential
```

### `testAwsConnection`

위치: [aws-connection-test-service.ts](../../apps/api/src/aws-connections/aws-connection-test-service.ts#L63)

실제 AWS STS 호출을 담당한다.

```text
1. roleArn + externalId로 AssumeRole
2. 받은 임시 credential로 GetCallerIdentity
3. roleArn의 accountId와 caller identity accountId 비교
4. externalId 없이 AssumeRole을 다시 시도
5. externalId 없이 성공하면 실패 처리
6. accountId, callerArn, region만 반환
```

externalId 없이 열려 있는 Role을 막는 함수는 [assertAwsRoleRequiresExternalId](../../apps/api/src/aws-connections/aws-connection-test-service.ts#L180)다.

### `getAwsConnectionCloudFormationTemplate`

위치: [aws-connection-service.ts](../../apps/api/src/aws-connections/aws-connection-service.ts#L421)

사용자 AWS 계정에 만들 Role의 CloudFormation YAML을 만든다.

응답에 들어가는 주요 값:

```text
templateBody
templateUrl
launchStackUrl
stackName
roleName
capabilities = ["CAPABILITY_NAMED_IAM"]
```

public `templateUrl`은 `CLOUDFORMATION_TEMPLATE_TOKEN_SECRET`으로 서명한다. 검증은 [renderAwsConnectionCloudFormationTemplateFromToken](../../apps/api/src/aws-connections/aws-connection-service.ts#L491)에서 한다.

### `createDeployment`

위치: [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts#L386)

deployment 생성 때 `awsConnectionId`를 반드시 받는다.

```ts
export type CreateDeploymentRequest = {
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string;
};
```

확인하는 것:

```text
project 소유권
architecture가 project에 속하는지
terraformArtifact가 project + architecture에 속하는지
awsConnectionId가 현재 사용자의 verified connection인지
```

여기서 확인하는 것은 "이 project에 속한 connection인지"가 아니다. AWS connection은 user 단위이므로, 현재 사용자가 소유한 verified connection이면 project가 달라도 선택할 수 있다.

### `runDeploymentInit`

위치: [deployment-init-service.ts](../../apps/api/src/deployments/deployment-init-service.ts#L47)

최신 connection을 자동 선택하지 않는다. deployment 생성 시 저장된 `awsConnectionId`만 사용한다.

```text
deployment.awsConnectionId
-> findVerifiedAwsConnectionById(awsConnectionId, userId)
-> roleArn + externalId로 다시 AssumeRole
-> 임시 credential만 Terraform child process env로 전달
```

### `prepareTerraformAwsCredentialEnv`

위치: [aws-connection-runtime-credentials.ts](../../apps/api/src/aws-connections/aws-connection-runtime-credentials.ts#L46)

Terraform 실행 직전에 다시 검증한다.

```text
1. status = verified 확인
2. roleArn accountId와 저장된 accountId 비교
3. roleArn + externalId로 AssumeRole
4. 임시 credential로 GetCallerIdentity
5. 실행 시점 accountId 재확인
6. externalId 없이 AssumeRole되는지 재확인
7. Terraform env만 반환
```

Terraform에 들어가는 env:

```text
AWS_ACCESS_KEY_ID=<temporary>
AWS_SECRET_ACCESS_KEY=<temporary>
AWS_SESSION_TOKEN=<temporary>
AWS_REGION=ap-northeast-2
```

전체 `process.env`는 넘기지 않는다. [createTerraformProcessEnv](../../apps/api/src/deployments/terraform-runner.ts#L113)가 allowlist 기반으로 필요한 값만 넘긴다.

## 5. DB와 env

AWS connection table: [awsConnections](../../apps/api/src/db/schema.ts#L185)

중요 컬럼:

```text
id
userId
accountId
roleArn
externalId
region
status
lastVerifiedAt
```

중요 index:

```text
aws_connections_user_verified_account_unique
-> 같은 userId에서 같은 accountId를 verified 상태로 중복 저장하지 못하게 함
```

deployment table에는 [awsConnectionId](../../apps/api/src/db/schema.ts#L223)가 있다.

관련 migration:

```text
0010_nostalgic_adam_warlock.sql
-> aws_connections.project_id 제거

0011_silly_jasper_sitwell.sql
-> 같은 userId + accountId verified 중복 방지 index 추가
```

서버 env:

```text
AWS_REGION=ap-northeast-2
SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN=arn:aws:iam::<SKETCHCATCH_ACCOUNT_ID>:role/SketchCatchRuntimeRole
CLOUDFORMATION_TEMPLATE_TOKEN_SECRET=<32자 이상 랜덤 secret>
SKETCHCATCH_PUBLIC_BASE_URL=https://<SketchCatch public host>
```

`SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN`은 사용자마다 바꾸는 값이 아니다. SketchCatch backend가 실제로 실행되는 AWS Role ARN이다.

## 6. 실습 준비: AWS 계정과 profile 만들기

이 실습은 실제 AWS STS, IAM, CloudFormation을 호출한다. 처음에는 운영 계정이 아니라 별도 sandbox 계정에서 진행한다.

권장 구조는 AWS 계정 2개다.

```text
SketchCatch AWS 계정 = SketchCatch backend 역할을 만들 계정
사용자 sandbox AWS 계정 = SketchCatch가 연결할 대상 계정
```

빠른 로컬 확인만 할 때는 AWS 계정 1개로도 실습할 수 있다. 이 경우에도 `SketchCatchRuntimeRole`과 `SketchCatchTerraformExecutionRole`은 서로 다른 Role로 만든다. 단, 1계정 실습은 실제 cross-account 운영 구조를 완전히 검증하지는 않는다.

### 6.1 AWS Console에서 계정 준비

새 AWS 계정이 필요하면 AWS Console에서 계정을 만든다. 이미 테스트용 계정이 있으면 새로 만들 필요는 없다.

최소 준비:

```text
1. AWS 계정 생성 또는 기존 sandbox 계정 선택
2. root 계정 MFA 설정
3. 결제 알림 또는 Budget 설정
4. CLI 실습용 IAM user 또는 IAM Identity Center 사용자 준비
5. 실습 후 IAM Role, CloudFormation stack, access key 정리
```

로컬에서 가장 단순한 방법은 실습용 IAM user에 access key를 발급하고 AWS CLI profile로 저장하는 것이다. 이 key는 저장소, 문서, 캡처, 로그에 남기지 않는다.

운영 환경에서는 장기 access key보다 IAM Role, OIDC, SSO 같은 방식을 우선한다. 여기서는 로컬 실습을 빨리 이해하기 위해 CLI profile 기준으로 설명한다.

### 6.2 profile 이름 정하기

profile 이름 예시:

```text
sketchcatch-admin  = SketchCatch AWS 계정 운영자 profile
sketchcatch-caller = SketchCatchRuntimeRole로 동작하는 profile 또는 서버 runtime role
user-sandbox       = 사용자 테스트 AWS 계정 profile
```

역할을 풀면 이렇다.

| profile | 사용하는 곳 | 의미 |
| --- | --- | --- |
| `sketchcatch-admin` | 7번 | `SketchCatchRuntimeRole` 생성/수정, caller role 권한 부여 |
| `sketchcatch-caller` | 로컬 API 실행 | API 서버가 실제 STS 호출을 할 때 쓰는 신분 |
| `user-sandbox` | 9번 | 사용자 AWS 계정에 `SketchCatchTerraformExecutionRole` 생성 |

실습용 권한은 넉넉하게 시작해도 되지만, 운영으로 가져갈 때는 반드시 줄여야 한다.

| profile | 실습 때 필요한 대표 권한 |
| --- | --- |
| `sketchcatch-admin` | `iam:CreateRole`, `iam:UpdateAssumeRolePolicy`, `iam:PutRolePolicy`, `iam:GetRole`, `sts:AssumeRole` |
| `sketchcatch-caller` | 사용자 계정의 `SketchCatchTerraformExecutionRole`에 대한 `sts:AssumeRole` |
| `user-sandbox` | `iam:CreateRole`, `iam:UpdateAssumeRolePolicy`, `iam:GetRole`, `cloudformation:CreateStack`, `cloudformation:DescribeStacks`, `cloudformation:DeleteStack` |

### 6.3 기존 profile 확인 또는 초기화

먼저 현재 등록된 profile을 확인한다.

```powershell
aws configure list-profiles
```

기존 설정이 꼬였거나 잘못된 access key가 환경변수에 남아 있으면 현재 PowerShell 세션에서 먼저 지운다.

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
```

profile 파일을 완전히 초기화해야 하면 백업 후 삭제한다.

```powershell
$awsDir = Join-Path $HOME ".aws"
$stamp = Get-Date -Format "yyyyMMddHHmmss"

Copy-Item "$awsDir\config" "$awsDir\config.bak-$stamp" -ErrorAction SilentlyContinue
Copy-Item "$awsDir\credentials" "$awsDir\credentials.bak-$stamp" -ErrorAction SilentlyContinue

Remove-Item "$awsDir\config" -Force -ErrorAction SilentlyContinue
Remove-Item "$awsDir\credentials" -Force -ErrorAction SilentlyContinue
```

### 6.4 `sketchcatch-admin` profile 만들기

SketchCatch AWS 계정에서 발급한 실습용 access key로 profile을 만든다.

```powershell
aws configure --profile sketchcatch-admin
```

입력값:

```text
AWS Access Key ID     = <SketchCatch AWS 계정의 실습용 access key>
AWS Secret Access Key = <SketchCatch AWS 계정의 실습용 secret>
Default region name   = ap-northeast-2
Default output format = json
```

확인:

```powershell
aws sts get-caller-identity --profile sketchcatch-admin
```

성공하면 `Account`가 SketchCatch AWS 계정 ID로 나온다.

1계정 실습이면 이 profile 하나를 SketchCatch 계정 역할과 사용자 sandbox 역할에 같이 써도 된다. 그 경우 아래 6.5의 `user-sandbox` profile은 같은 access key로 다시 만들거나, 이후 명령에서 `$USER_PROFILE = "sketchcatch-admin"`으로 바꿔도 된다.

### 6.5 `user-sandbox` profile 만들기

사용자 sandbox AWS 계정의 실습용 access key로 profile을 만든다.

```powershell
aws configure --profile user-sandbox
```

입력값:

```text
AWS Access Key ID     = <사용자 sandbox AWS 계정의 실습용 access key>
AWS Secret Access Key = <사용자 sandbox AWS 계정의 실습용 secret>
Default region name   = ap-northeast-2
Default output format = json
```

확인:

```powershell
aws sts get-caller-identity --profile user-sandbox
```

성공하면 `Account`가 사용자 sandbox AWS 계정 ID로 나온다.

### 6.6 `SketchCatchRuntimeRole` 만들기

로컬 API는 `sketchcatch-admin` 권한으로 직접 STS를 호출하면 안 된다. 먼저 SketchCatch backend가 사용할 caller role을 만든 뒤, API는 그 role로 동작하게 한다.

```powershell
$SKETCH_PROFILE = "sketchcatch-admin"
$CALLER_ROLE_NAME = "SketchCatchRuntimeRole"

$SKETCH_ACCOUNT_ID = aws sts get-caller-identity `
  --profile $SKETCH_PROFILE `
  --query Account `
  --output text

$SKETCH_ADMIN_ARN = aws sts get-caller-identity `
  --profile $SKETCH_PROFILE `
  --query Arn `
  --output text

$CALLER_PRINCIPAL_ARN = "arn:aws:iam::$SKETCH_ACCOUNT_ID`:role/$CALLER_ROLE_NAME"
```

`sketchcatch-admin` profile이 이 role을 assume할 수 있도록 trust policy를 만든다.

```powershell
$callerTrustPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Principal = @{ AWS = $SKETCH_ADMIN_ARN }
      Action = "sts:AssumeRole"
    }
  )
} | ConvertTo-Json -Depth 10 -Compress

aws iam create-role `
  --profile $SKETCH_PROFILE `
  --role-name $CALLER_ROLE_NAME `
  --assume-role-policy-document $callerTrustPolicy
```

이미 role이 있으면 trust policy만 업데이트한다.

```powershell
aws iam update-assume-role-policy `
  --profile $SKETCH_PROFILE `
  --role-name $CALLER_ROLE_NAME `
  --policy-document $callerTrustPolicy
```

### 6.7 `sketchcatch-caller` profile 만들기

`sketchcatch-caller`는 access key를 직접 저장하는 profile이 아니다. `sketchcatch-admin`을 source로 삼아 `SketchCatchRuntimeRole`을 assume하는 profile이다.

```powershell
aws configure set profile.sketchcatch-caller.role_arn $CALLER_PRINCIPAL_ARN
aws configure set profile.sketchcatch-caller.source_profile sketchcatch-admin
aws configure set profile.sketchcatch-caller.region ap-northeast-2
aws configure set profile.sketchcatch-caller.output json
```

로컬 API에서 실제 STS를 호출하려면 API 프로세스의 AWS credential이 SketchCatch caller role이어야 한다.

```powershell
aws sts get-caller-identity --profile sketchcatch-caller
```

예상 `Arn`:

```text
arn:aws:sts::<SKETCHCATCH_ACCOUNT_ID>:assumed-role/SketchCatchRuntimeRole/...
```

env에 넣는 값은 STS ARN이 아니라 IAM Role ARN이다.

```text
arn:aws:iam::<SKETCHCATCH_ACCOUNT_ID>:role/SketchCatchRuntimeRole
```

이 값은 위에서 만든 `$CALLER_PRINCIPAL_ARN`이다.

## 7. SketchCatch AWS 계정에서 한 번만 할 일

SketchCatch backend runtime role에 사용자 계정 Role을 assume할 권한을 붙인다.

```powershell
$REGION = "ap-northeast-2"
$SKETCH_PROFILE = "sketchcatch-admin"
$CALLER_ROLE_NAME = "SketchCatchRuntimeRole"
$CALLER_POLICY_NAME = "SketchCatchAssumeTerraformExecutionRole"

$SKETCH_ACCOUNT_ID = aws sts get-caller-identity `
  --profile $SKETCH_PROFILE `
  --query Account `
  --output text

$CALLER_PRINCIPAL_ARN = "arn:aws:iam::$SKETCH_ACCOUNT_ID`:role/$CALLER_ROLE_NAME"

$callerPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Resource = "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole"
    }
  )
} | ConvertTo-Json -Depth 10 -Compress

aws iam put-role-policy `
  --profile $SKETCH_PROFILE `
  --role-name $CALLER_ROLE_NAME `
  --policy-name $CALLER_POLICY_NAME `
  --policy-document $callerPolicy
```

로컬 실습용 secret 생성:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$TEMPLATE_SECRET = [Convert]::ToBase64String($bytes)
```

로컬 API 실행 env:

```powershell
$env:AWS_PROFILE = "sketchcatch-caller"
$env:AWS_REGION = "ap-northeast-2"
$env:SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN = $CALLER_PRINCIPAL_ARN
$env:CLOUDFORMATION_TEMPLATE_TOKEN_SECRET = $TEMPLATE_SECRET

# public URL이 없으면 templateUrl/launchStackUrl 대신 templateBody를 파일로 저장해서 쓰면 된다.
$env:SKETCHCATCH_PUBLIC_BASE_URL = "https://<public-dev-url>"

corepack pnpm --filter @sketchcatch/api dev
```

운영 배포 서버에서는 위 env를 서버 설정으로 한 번만 넣는다. 사용자 추가 때마다 서버를 재시작하거나 env를 바꾸는 구조가 아니다.

## 8. SketchCatch API에서 connection 만들기

```powershell
$API_BASE = "http://localhost:4000/api"

$signupBody = @{
  username = "aws-role-test-user"
  email = "aws-role-test@example.com"
  nickname = "AWS Role Test"
  password = "demo-password-123"
} | ConvertTo-Json -Depth 10

$signup = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/auth/signup" `
  -ContentType "application/json" `
  -Body $signupBody

$TOKEN = $signup.session.accessToken
$headers = @{ Authorization = "Bearer $TOKEN" }

$connectionBody = @{ region = "ap-northeast-2" } | ConvertTo-Json -Depth 10

$connectionSetup = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/aws/connections" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $connectionBody

$CONNECTION_ID = $connectionSetup.awsConnection.id
$EXTERNAL_ID = $connectionSetup.awsConnection.externalId
$CALLER_PRINCIPAL_ARN = $connectionSetup.callerPrincipalArn

$CONNECTION_ID
$EXTERNAL_ID
$CALLER_PRINCIPAL_ARN
```

여기까지 하면 DB에는 사용자 계정 단위의 `pending` connection이 생긴다. 프로젝트를 여러 개 만들어도 이 connection을 재사용한다.

Deployment 실습까지 이어갈 프로젝트가 없다면 아래처럼 프로젝트를 하나 만든다.

```powershell
$projectBody = @{
  name = "AWS Role 연결 실습"
  description = "sandbox 연결 테스트"
} | ConvertTo-Json -Depth 10

$project = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/projects" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $projectBody

$PROJECT_ID = $project.project.id
```

## 9. 사용자 AWS 계정에 Role 만들기

### 9.1 CloudFormation으로 만들기

```powershell
$template = Invoke-RestMethod `
  -Method Get `
  -Uri "$API_BASE/aws/connections/$CONNECTION_ID/cloudformation-template" `
  -Headers $headers

$template.stackName
$template.roleName
$template.launchStackUrl
```

`launchStackUrl`이 있으면 브라우저에서 열고 사용자 AWS 계정으로 로그인해 stack 생성을 승인한다.

CLI로 만들려면 `templateBody`를 파일로 저장한다.

```powershell
$USER_PROFILE = "user-sandbox"
$USER_REGION = "ap-northeast-2"

$template.templateBody | Set-Content -Encoding utf8 .\sketchcatch-terraform-execution-role.yml

aws cloudformation deploy `
  --profile $USER_PROFILE `
  --region $USER_REGION `
  --stack-name $template.stackName `
  --template-file .\sketchcatch-terraform-execution-role.yml `
  --capabilities CAPABILITY_NAMED_IAM

$ROLE_ARN = aws cloudformation describe-stacks `
  --profile $USER_PROFILE `
  --region $USER_REGION `
  --stack-name $template.stackName `
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" `
  --output text

$ROLE_ARN
```

### 9.2 IAM CLI로 직접 만들기

CloudFormation 없이 직접 만들 수도 있다.

```powershell
$USER_PROFILE = "user-sandbox"
$ROLE_NAME = "SketchCatchTerraformExecutionRole"

$trustPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Principal = @{ AWS = $CALLER_PRINCIPAL_ARN }
      Action = "sts:AssumeRole"
      Condition = @{
        StringEquals = @{ "sts:ExternalId" = $EXTERNAL_ID }
      }
    }
  )
} | ConvertTo-Json -Depth 10 -Compress

aws iam create-role `
  --profile $USER_PROFILE `
  --role-name $ROLE_NAME `
  --assume-role-policy-document $trustPolicy

$ROLE_ARN = aws iam get-role `
  --profile $USER_PROFILE `
  --role-name $ROLE_NAME `
  --query "Role.Arn" `
  --output text

$ROLE_ARN
```

이미 Role이 있으면 trust policy만 업데이트한다.

```powershell
aws iam update-assume-role-policy `
  --profile $USER_PROFILE `
  --role-name $ROLE_NAME `
  --policy-document $trustPolicy
```

처음 연결 검증만 할 때는 target Role에 별도 권한 policy를 붙이지 않아도 된다. Terraform `plan/apply`까지 갈 때만 필요한 AWS 권한을 최소 범위로 붙인다.

## 10. SketchCatch에서 test와 verify 실행

저장 없는 test:

```powershell
$testBody = @{ roleArn = $ROLE_ARN } | ConvertTo-Json -Depth 10

$testResult = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/aws/connections/$CONNECTION_ID/test" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $testBody

$testResult
```

성공 응답 예:

```json
{
  "ok": true,
  "accountId": "123456789012",
  "callerArn": "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-conn-test-...",
  "region": "ap-northeast-2"
}
```

저장형 verify:

```powershell
$verifyResult = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/aws/connections/$CONNECTION_ID/verify" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $testBody

$verifyResult.awsConnection
```

성공하면 이렇게 바뀐다.

```text
status = verified
accountId = <USER_ACCOUNT_ID>
roleArn = arn:aws:iam::<USER_ACCOUNT_ID>:role/SketchCatchTerraformExecutionRole
lastVerifiedAt = <timestamp>
```

## 11. deployment init까지 연결하기

이미 project 안에 아래 값이 있어야 한다.

```text
architectureId
terraformArtifactId
verified awsConnectionId
```

deployment 생성:

```powershell
$ARCHITECTURE_ID = "<ARCHITECTURE_ID>"
$TERRAFORM_ARTIFACT_ID = "<TERRAFORM_ARTIFACT_ID>"

$deploymentBody = @{
  architectureId = $ARCHITECTURE_ID
  terraformArtifactId = $TERRAFORM_ARTIFACT_ID
  awsConnectionId = $CONNECTION_ID
} | ConvertTo-Json -Depth 10

$deployment = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/projects/$PROJECT_ID/deployments" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $deploymentBody

$DEPLOYMENT_ID = $deployment.deployment.id
$deployment.deployment
```

Terraform init 실행:

```powershell
$initResult = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE/deployments/$DEPLOYMENT_ID/init" `
  -Headers $headers

$initResult.deployment
```

로그 확인:

```powershell
$logs = Invoke-RestMethod `
  -Method Get `
  -Uri "$API_BASE/deployments/$DEPLOYMENT_ID/logs" `
  -Headers $headers

$logs.logs
```

현재 init은 `terraform init -backend=false -input=false -no-color`만 실행한다. 실제 AWS 리소스 생성, 수정, 삭제, `terraform apply`는 하지 않는다.

## 12. 실패할 때 보는 곳

| 증상 | 확인할 것 |
| --- | --- |
| `The config profile (...) could not be found` | `aws configure list-profiles`로 profile 존재 여부 확인. 없으면 6.4, 6.5, 6.7 순서로 생성 |
| `IncompleteSignature` | 현재 PowerShell 세션에 깨진 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE` 값이 남아 있는지 확인하고 제거 |
| `AccessDenied` on `AssumeRole` | `SketchCatchRuntimeRole` trust policy가 `sketchcatch-admin` principal을 허용하는지, `sketchcatch-admin`에 `sts:AssumeRole` 권한이 있는지 확인 |
| `AWS Role connection test failed` | API 프로세스의 AWS credential이 `SketchCatchRuntimeRole`인지 확인 |
| `AWS Role trust policy must require external ID` | 사용자 AWS Role trust policy에 `sts:ExternalId` 조건이 빠져 있음 |
| `AWS Role account mismatch` | 입력한 RoleArn account와 실제 assumed account가 다름 |
| `AWS account is already connected` | 같은 SketchCatch 사용자가 같은 AWS accountId를 이미 verified 상태로 연결함 |
| `AWS connection region must be ap-northeast-2` | connection region이 `ap-northeast-2`가 아님 |
| `templateUrl`이 null | `SKETCHCATCH_PUBLIC_BASE_URL`이 없거나 public HTTPS가 아님. `templateBody`를 파일로 저장해서 사용 |

API 프로세스 principal 확인:

```powershell
aws sts get-caller-identity --profile sketchcatch-caller
```

사용자 AWS Role trust policy에는 반드시 이 조건이 있어야 한다.

```json
{
  "Condition": {
    "StringEquals": {
      "sts:ExternalId": "<SketchCatch가 발급한 externalId>"
    }
  }
}
```

## 13. 실습 후 정리

CloudFormation으로 만든 경우:

```powershell
aws cloudformation delete-stack `
  --profile user-sandbox `
  --region ap-northeast-2 `
  --stack-name $template.stackName
```

IAM CLI로 직접 만든 경우:

```powershell
aws iam delete-role `
  --profile user-sandbox `
  --role-name SketchCatchTerraformExecutionRole
```

SketchCatch 운영 계정의 caller role inline policy 제거:

```powershell
aws iam delete-role-policy `
  --profile sketchcatch-admin `
  --role-name SketchCatchRuntimeRole `
  --policy-name SketchCatchAssumeTerraformExecutionRole
```

운영 환경에서는 이 policy를 지우면 모든 사용자 AWS 연결이 깨질 수 있다. 실습 계정에서만 정리한다.
