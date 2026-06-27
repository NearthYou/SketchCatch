# 배포 Plan 실행 흐름 정리

이 문서는 `Terraform Plan 실행`을 처음 보는 사람이 코드 흐름을 따라갈 수 있게 정리한 문서다.

목표는 세 가지다.

1. 사용자가 버튼을 누른 뒤 어떤 함수가 순서대로 호출되는지 알 수 있게 한다.
2. 각 함수 안에서 중요한 코드가 무슨 뜻인지 설명한다.
3. Plan, 승인, 저장, 로그, 보안 경계가 어디서 나뉘는지 분명히 한다.

## 1. Plan은 무엇이고 Apply와 뭐가 다른가

`Terraform Plan 실행`은 실제 AWS 리소스를 만들거나 수정하지 않는다.

Plan 단계는 Terraform이 "Apply를 하면 무엇이 바뀔지" 미리 계산하고, 그 결과를 사용자가 승인할 수 있게 저장하는 단계다.

```text
Terraform artifact 복원
-> terraform init
-> terraform plan -out=tfplan
-> terraform show -json tfplan
-> Plan summary 저장
-> tfplan S3 저장
-> 사용자 승인 대기
```

실제 AWS 리소스 변경은 나중에 `terraform apply tfplan`에서 일어난다. 현재 구현은 Apply 전까지다.

## 2. 전체 구조

Plan 실행은 3개 층으로 나뉜다.

| 층 | 위치 | 책임 |
| --- | --- | --- |
| Frontend | [apps/web/features/workspace](../../apps/web/features/workspace) | 버튼, 선택값, API 호출, 결과 표시 |
| API route | [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts) | 인증, 요청 검증, 실행 lock, background job 시작 |
| Backend service | [apps/api/src/deployments](../../apps/api/src/deployments) | Terraform 실행, 로그 저장, Plan artifact 저장, 승인 검증 |

같은 이름의 함수가 있으니 먼저 구분해야 한다.

| 이름 | 파일 | 의미 |
| --- | --- | --- |
| `runDeploymentPlan` | [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts) | 프론트에서 `/plan` API를 호출하는 HTTP helper |
| `runDeploymentPlan` | [apps/api/src/deployments/deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts) | 실제 Terraform CLI를 실행하는 backend service |
| `markDeploymentInitRunning` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | 이름은 init이지만 Plan 실행 lock에도 사용한다. |
| `currentPlanArtifactId` | `deployments` row | 현재 승인 대상인 최신 Plan artifact id |
| `approvedPlanArtifactId` | `deployments` row | 사용자가 실제 승인한 Plan artifact id |

현재 Plan service는 `terraform validate`를 호출하지 않는다. `terraform-runner.ts`에는 `runTerraformValidate`가 남아 있지만, `/plan` 흐름에서 실제 호출되는 명령은 `init`, `plan`, `show -json`이다.

## 3. 사용자가 보는 흐름

```text
Workspace 배포 패널
-> Architecture snapshot 선택
-> Terraform artifact 선택
-> verified AWS connection 선택
-> Deployment 생성
-> Terraform Plan 실행
-> RUNNING 상태 확인
-> 새로고침
-> Plan summary와 logs 확인
-> 승인 가능한 Plan이면 Plan 승인
-> approval snapshot 확인
```

이 흐름에서 프론트는 Terraform을 실행하지 않는다. 프론트는 API만 호출한다.

## 4. 프론트엔드 흐름

관련 파일:

- [apps/web/features/workspace/WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx)
- [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts)

### 4.1 `DeploymentPanel`

[WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx)의 `DeploymentPanel`이 배포 UI 전체를 맡는다.

중요한 상태값은 아래다.

| 상태값 | 뜻 |
| --- | --- |
| `projectDetails` | 프로젝트 상세다. architecture 목록과 asset 목록이 들어 있다. |
| `awsConnections` | 사용자의 AWS 연결 목록이다. |
| `deployments` | 프로젝트의 Deployment 실행 기록 목록이다. |
| `deploymentLogs` | 선택한 Deployment의 Terraform 로그다. |
| `selectedArchitectureId` | 사용자가 고른 architecture snapshot id다. |
| `selectedTerraformArtifactId` | 사용자가 고른 Terraform artifact id다. |
| `selectedAwsConnectionId` | 사용자가 고른 AWS connection id다. |
| `selectedDeploymentId` | 현재 화면에서 보고 있는 Deployment id다. |
| `requestState` | API 요청 중인지, 실패했는지 나타낸다. |
| `errorMessage` | API 실패 메시지다. |

### 4.2 버튼 활성화 계산

`DeploymentPanel`은 버튼을 바로 누를 수 있는지 boolean으로 계산한다.

| 값 | 의미 |
| --- | --- |
| `verifiedAwsConnections` | `status === "verified"`인 AWS 연결만 남긴다. |
| `terraformArtifacts` | asset 중 `assetType === "terraform_file"`인 것만 남긴다. |
| `architectureTerraformArtifacts` | 선택한 architecture에 속한 Terraform artifact만 남긴다. |
| `selectedDeployment` | `selectedDeploymentId`와 일치하는 Deployment를 찾는다. |
| `canCreateDeployment` | architecture, Terraform artifact, AWS connection이 모두 선택됐고 요청 중이 아니면 true다. |
| `hasCurrentPlan` | 선택한 Deployment에 `currentPlanArtifactId`가 있으면 true다. |
| `isPlanApproved` | `approvedAt`과 `approvedPlanArtifactId`가 있으면 true다. |
| `canRunPlan` | Deployment가 있고, `RUNNING`이 아니고, 아직 승인되지 않았고, 요청 중이 아니면 true다. |
| `canApprovePlan` | Plan이 있고, 승인 전이고, `blockedBy === "missing_approval"`이면 true다. |

`risk_analysis`로 막힌 Plan은 `canApprovePlan`이 false라서 승인할 수 없다.

### 4.3 화면 진입 시 데이터 로딩

함수:

```ts
loadDeploymentData
```

호출 API:

```text
getProjectDetails(projectId)
listAwsConnections()
listDeployments(projectId)
```

하는 일:

1. 프로젝트 상세, AWS 연결, Deployment 목록을 동시에 불러온다.
2. 최신 architecture를 기본 선택한다.
3. 그 architecture에 맞는 Terraform artifact를 기본 선택한다.
4. verified AWS connection을 기본 선택한다.
5. 최신 Deployment를 기본 선택한다.

이 단계에서는 Terraform이 실행되지 않는다. 화면 선택값만 준비한다.

### 4.4 Deployment 생성 버튼

함수:

```ts
createProjectDeployment
```

호출 흐름:

```text
createProjectDeployment
-> [api.ts](../../apps/web/features/workspace/api.ts) createDeployment
-> POST /api/projects/:projectId/deployments
-> backend createDeployment
-> deployments row 생성
```

`createProjectDeployment`가 하는 일:

1. `canCreateDeployment`가 false면 중단한다.
2. 선택한 `architectureId`, `terraformArtifactId`, `awsConnectionId`로 API를 호출한다.
3. 응답 Deployment를 화면 목록 맨 앞에 추가한다.
4. 방금 만든 Deployment를 선택한다.
5. 이전 로그를 비운다.

프론트 API helper:

```ts
createDeployment({
  projectId,
  architectureId,
  terraformArtifactId,
  awsConnectionId
})
```

HTTP 요청:

```http
POST /api/projects/:projectId/deployments
```

### 4.5 Terraform Plan 실행 버튼

함수:

```ts
startTerraformPlan
```

호출 흐름:

```text
startTerraformPlan
-> [api.ts](../../apps/web/features/workspace/api.ts) runDeploymentPlan
-> POST /api/deployments/:deploymentId/plan
-> API가 RUNNING Deployment를 즉시 반환
-> 화면 목록에서 해당 Deployment를 RUNNING으로 갱신
```

중요한 점:

`POST /plan` 응답은 Plan 완료 결과가 아니다. API route는 background job을 시작하고 바로 `202 Accepted`를 반환한다.

그래서 사용자는 실행 직후 `RUNNING` 상태를 보고, 나중에 `새로고침`으로 Plan 결과와 logs를 다시 확인한다.

이미 유효한 current Plan artifact가 있으면 backend service가 Terraform을 다시 실행하지 않고 상태를 `PENDING`으로 되돌릴 수 있다. 이 경우 첫 응답은 `RUNNING`이어도 새로고침 후에는 기존 Plan 결과가 그대로 보인다.

### 4.6 Plan 승인 버튼

함수:

```ts
approveCurrentPlan
```

호출 흐름:

```text
approveCurrentPlan
-> [api.ts](../../apps/web/features/workspace/api.ts) approveDeploymentPlan
-> POST /api/deployments/:deploymentId/approve
-> backend approveDeploymentPlan
-> approval snapshot 저장
```

승인 가능한 Plan은 `blockedBy === "missing_approval"`인 Plan뿐이다.

`blockedBy === "risk_analysis"`인 Plan은 위험 차단 상태라 승인할 수 없다.

## 5. 프론트 API helper

파일: [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts)

이 파일은 fetch wrapper다. 판단은 거의 하지 않고 HTTP 요청만 만든다.

| 함수 | HTTP | 의미 |
| --- | --- | --- |
| `createDeployment` | `POST /api/projects/:projectId/deployments` | Deployment 생성 |
| `listDeployments` | `GET /api/projects/:projectId/deployments` | Deployment 목록 조회 |
| `runDeploymentPlan` | `POST /api/deployments/:deploymentId/plan` | Plan 실행 요청 |
| `approveDeploymentPlan` | `POST /api/deployments/:deploymentId/approve` | 현재 Plan 승인 요청 |
| `listDeploymentLogs` | `GET /api/deployments/:deploymentId/logs` | 로그 조회 |

여기 있는 `runDeploymentPlan`은 HTTP helper다. 실제 Terraform 실행은 backend service의 `runDeploymentPlan`이 한다.

## 6. API route 흐름

파일: [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)

route의 책임은 Terraform 실행이 아니다. route는 요청을 검증하고 background job을 시작한다.

### 6.1 공통 helper

| 함수 | 의미 |
| --- | --- |
| `getDeploymentRequestContext` | 현재 user id를 구하고 `accessContext`와 repository를 만든다. |
| `createUserProjectAccessContext` | user id를 `{ kind: "user", userId }` 형태로 만든다. |
| `handleDeploymentError` | domain error를 HTTP `404` 또는 `409`로 변환한다. |
| `toDeployment` | DB row의 `Date`를 ISO string으로 바꿔 API 응답 타입에 맞춘다. |
| `toDeploymentLog` | log row를 API 응답 타입으로 바꾼다. |
| `requireDeploymentInitArtifact` | Deployment의 Terraform artifact가 같은 project/architecture에 속하는지 확인한다. |

`getDeploymentRequestContext` 흐름:

```text
getDatabaseClient
-> requireActiveUserId
-> createUserProjectAccessContext
-> createPostgresDeploymentRepository
```

즉 현재 사용자와 DB repository를 준비한다.

### 6.2 Deployment 생성 route

Route:

```http
POST /api/projects/:projectId/deployments
```

호출 순서:

```text
createDeploymentParamsSchema.parse
-> createDeploymentBodySchema.parse
-> getDeploymentRequestContext
-> createDeployment([deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts))
-> 201 Created
```

각 부분의 뜻:

| 코드 | 뜻 |
| --- | --- |
| `createDeploymentParamsSchema` | URL의 `projectId`가 UUID인지 확인한다. |
| `createDeploymentBodySchema` | body의 `architectureId`, `terraformArtifactId`, `awsConnectionId`가 UUID인지 확인한다. |
| `getDeploymentRequestContext` | 현재 사용자와 repository를 준비한다. |
| `createDeployment` | project, architecture, artifact, AWS connection을 검증하고 DB row를 만든다. |

### 6.3 Plan 실행 route

Route:

```http
POST /api/deployments/:deploymentId/plan
```

호출 순서:

```text
deploymentParamsSchema.parse
-> getDeploymentRequestContext
-> getDeployment
-> requireDeploymentInitArtifact
-> deployment.status === "RUNNING" 확인
-> repository.markDeploymentInitRunning
-> startDeploymentPlanJob(startedFromStatus 포함)
-> 202 Accepted
```

각 부분의 뜻:

| 코드 | 뜻 |
| --- | --- |
| `deploymentParamsSchema.parse` | URL의 `deploymentId`가 UUID인지 확인한다. |
| `getDeployment` | Deployment가 존재하고 현재 사용자가 접근 가능한지 확인한다. |
| `requireDeploymentInitArtifact` | Terraform artifact가 Deployment와 맞는지 확인한다. |
| `deployment.status === "RUNNING"` | 이미 실행 중이면 중복 실행을 막는다. |
| `markDeploymentInitRunning` | DB 상태를 `RUNNING`으로 바꾸고 기존 approval snapshot을 지운다. |
| `startDeploymentPlanJob` | 실제 Plan service를 background로 실행한다. 이때 route가 `RUNNING`으로 바꾸기 전 상태를 `startedFromStatus`로 같이 넘긴다. |
| `202 Accepted` | 실행을 접수했음을 응답한다. 완료 응답이 아니다. |

`startDeploymentPlanJob`의 핵심:

```ts
void runDeploymentPlan(input, repository).catch(...)
```

`void`는 route가 Promise 완료를 기다리지 않는다는 뜻이다.

`startedFromStatus`가 필요한 이유:

route는 background job을 시작하기 전에 DB 상태를 먼저 `RUNNING`으로 바꾼다. 그런데 service는 "사용자가 원래 `PENDING` 상태의 기존 Plan을 다시 실행했는지" 알아야 Plan artifact 재사용 여부를 판단할 수 있다.

### 6.4 Plan 승인 route

Route:

```http
POST /api/deployments/:deploymentId/approve
```

호출 순서:

```text
deploymentParamsSchema.parse
-> z.object({}).parse(request.body ?? {})
-> getDeploymentRequestContext
-> approveDeploymentPlan([deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts))
-> 200 OK
```

승인 가능 여부는 request body로 판단하지 않는다. 서버에 저장된 현재 Deployment 상태와 Plan artifact metadata로 판단한다.

## 7. Repository와 DB 함수

파일: [apps/api/src/deployments/deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts)

`DeploymentRepository`는 DB 접근 계약이다. service는 이 repository를 통해 DB를 사용한다.

| 함수 | 의미 |
| --- | --- |
| `findAccessibleProject` | project가 현재 user 소유인지 확인한다. |
| `findArchitectureInProject` | architecture가 project에 속하는지 확인한다. |
| `findTerraformArtifactForArchitecture` | artifact가 project/architecture에 속하고 `terraform_file`인지 확인한다. |
| `findTerraformArtifactById` | Terraform artifact metadata를 조회한다. |
| `findVerifiedAwsConnectionById` | 현재 user의 verified AWS connection만 조회한다. |
| `markDeploymentInitRunning` | `PENDING` 또는 `FAILED`만 `RUNNING`으로 바꾼다. |
| `saveDeploymentPlan` | Plan artifact insert와 Deployment update를 transaction으로 처리한다. |
| `approveDeployment` | approval snapshot을 저장하고 block을 해제한다. |
| `failDeployment` | Deployment를 `FAILED`로 바꾸고 실패 정보를 저장한다. |
| `getNextDeploymentLogSequence` | 다음 로그 sequence 번호를 구한다. |
| `createDeploymentLogs` | 로그 여러 줄을 저장한다. |

### 7.1 `createDeployment`

호출 흐름:

```text
requireAccessibleProject
-> findArchitectureInProject
-> findTerraformArtifactForArchitecture
-> findVerifiedAwsConnectionById
-> repository.createDeployment
```

의미:

1. 현재 사용자의 프로젝트인지 확인한다.
2. 선택한 architecture가 project에 속하는지 확인한다.
3. Terraform artifact가 같은 project와 architecture에 속하는지 확인한다.
4. AWS connection이 verified 상태인지 확인한다.
5. `status = "PENDING"` Deployment row를 만든다.

이 단계에서는 Terraform을 실행하지 않는다.

### 7.2 `markDeploymentInitRunning`

DB update 조건:

```text
deployments.id = deploymentId
status in ("PENDING", "FAILED")
```

저장하는 값:

```text
status = "RUNNING"
approval snapshot fields = null
updatedAt = now
```

의미:

새 Plan을 시작하면 이전 승인은 더 이상 믿을 수 없다. 그래서 승인 관련 필드를 모두 지운다.

### 7.3 `saveDeploymentPlan`

이 함수는 transaction으로 실행된다.

```text
insert deployment_plan_artifacts
-> update deployments
-> commit
```

`deployment_plan_artifacts`에 저장하는 값:

| 값 | 뜻 |
| --- | --- |
| `id` | Plan artifact id |
| `deploymentId` | 이 Plan이 속한 Deployment |
| `terraformArtifactId` | Plan 생성에 사용한 Terraform artifact |
| `terraformArtifactSha256` | Plan 생성 시점의 Terraform 파일 hash |
| `objectKey` | S3 `tfplan` 위치 |
| `sha256` | `tfplan` 바이너리 hash |
| `accountId` | Plan 실행 AWS account |
| `region` | Plan 실행 AWS region |

`deployments`에 업데이트하는 값:

| 값 | 뜻 |
| --- | --- |
| `currentPlanArtifactId` | 방금 만든 Plan artifact id |
| `status = "PENDING"` | Plan 실행 완료, 사용자 액션 대기 |
| `planSummary` | 화면에 보여줄 변경 요약 |
| `isBlocked`, `blockedBy`, `blockedReason` | 승인 가능 여부와 차단 이유 |
| `failureStage = null`, `errorSummary = null` | 이전 실패 정보 제거 |
| approval snapshot fields = `null` | 이전 승인 무효화 |

transaction을 쓰는 이유는 Plan artifact row와 Deployment pointer가 항상 같이 맞아야 하기 때문이다.

### 7.4 `approveDeployment`

이 함수는 조건부 update로 race condition을 막는다.

update 조건:

```text
deployments.id = deploymentId
currentPlanArtifactId = approvedPlanArtifactId
status = PENDING
isBlocked = true
blockedBy = missing_approval
```

이 조건이 하나라도 안 맞으면 승인 저장이 실패한다.

예를 들어 승인 버튼을 누르는 순간 다른 요청이 새 Plan을 저장했다면 `currentPlanArtifactId`가 달라진다. 그러면 승인은 실패해야 한다.

## 8. Backend Plan service

파일: [apps/api/src/deployments/deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts)

핵심 함수:

```ts
runDeploymentPlan(input, repository, options)
```

이 함수가 실제 Terraform Plan 실행 전체를 조율한다.

### 8.1 입력값

```ts
type RunDeploymentPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
};
```

| 값 | 뜻 |
| --- | --- |
| `deploymentId` | Plan을 실행할 Deployment id |
| `accessContext` | 현재 사용자 정보 |
| `startedFromStatus` | route가 `RUNNING`으로 바꾸기 전 Deployment 상태다. 기존 Plan artifact 재사용 판단에 쓴다. |

### 8.2 `options`의 의미

`RunDeploymentPlanOptions`는 테스트에서 외부 의존성을 바꿔 끼우기 위한 dependency injection이다.

예를 들어 테스트에서는 진짜 Terraform CLI 대신 fake `runTerraformPlan`을 넣을 수 있다.

운영에서는 기본 구현을 사용한다.

```text
options.runTerraformPlan이 있으면 그걸 쓰고,
없으면 defaultRunTerraformPlan을 쓴다.
```

### 8.3 `terraform` 결과 객체

함수 초반에 아래 객체를 만든다.

```ts
const terraform = {
  init: null,
  validate: null,
  plan: null,
  showJson: null
};
```

뜻:

각 Terraform 단계의 실행 결과를 담는다. 실패 시 어느 단계까지 실행됐는지 알 수 있다.

현재 Plan service는 `validate`를 실행하지 않으므로 `terraform.validate`는 계속 `null`이다. 결과 타입 호환을 위해 필드는 남아 있다.

### 8.4 Plan 실행 전 검증

호출 순서:

```text
getDeployment
-> requireDeploymentTerraformArtifact
-> requireDeploymentAwsConnection
-> canReuseDeploymentPlanArtifact
-> repository.findArchitectureInProject
```

각 함수의 뜻:

| 함수 | 뜻 |
| --- | --- |
| `getDeployment` | Deployment가 존재하고 현재 사용자가 접근 가능한지 확인한다. |
| `requireDeploymentTerraformArtifact` | Terraform artifact가 Deployment의 project/architecture와 맞는지 확인한다. |
| `requireDeploymentAwsConnection` | verified AWS connection을 가져온다. |
| `canReuseDeploymentPlanArtifact` | 기존 current Plan artifact를 그대로 써도 되는지 확인한다. |
| `findArchitectureInProject` | Pre-Deployment Check에 사용할 architecture JSON을 가져온다. |

### 8.5 기존 Plan artifact 재사용 경로

코드:

```ts
const canReusePlanArtifact = await canReuseDeploymentPlanArtifact(...)
```

뜻:

이미 `PENDING` 상태에 유효한 current Plan artifact가 있으면 Terraform을 다시 실행하지 않고 기존 Plan을 재사용한다.

재사용 조건:

| 조건 | 뜻 |
| --- | --- |
| `startedFromStatus === "PENDING"` | 사용자가 원래 `PENDING` 상태에서 Plan 버튼을 다시 눌렀다. |
| `currentPlanArtifactId` 있음 | 재사용할 Plan artifact pointer가 있다. |
| `planSummary` 있음 | 화면에 표시할 Plan 결과가 이미 저장되어 있다. |
| `isBlocked === true` | 승인 또는 risk block 대기 상태다. |
| Plan artifact row 존재 | `deployment_plan_artifacts` row가 실제로 있다. |
| Plan artifact의 `deploymentId` 일치 | 다른 Deployment의 Plan을 재사용하지 않는다. |
| Plan artifact의 `terraformArtifactId` 일치 | 현재 Terraform artifact와 같은 Plan이다. |
| `terraformArtifactSha256` 있음 | legacy Plan artifact가 아니다. |
| AWS `accountId`, `region` 일치 | Plan을 만들 때의 AWS 대상과 현재 연결 metadata가 같다. |

재사용 가능하면 service는 `restorePendingDeploymentStatus`를 호출한다.

route가 이미 `RUNNING`으로 바꿔둔 상태를 다시 `PENDING`으로 돌리고, Terraform 명령은 하나도 실행하지 않는다.

재사용이 불가능하면 아래의 Pre-Deployment Check와 Terraform 실행 경로로 계속 진행한다.

### 8.6 Pre-Deployment Check

코드:

```ts
const preDeploymentAnalysis = analyzePreDeployment(architecture.architectureJson);
```

뜻:

architecture JSON을 보고 비용, 보안, 설정 위험을 분석한다.

`severity === "high"` finding이 있으면 나중에 `risk_analysis`로 block한다.

중요한 점:

high-risk가 있어도 Plan 실행 자체는 멈추지 않는다. Plan 결과를 저장한 뒤 승인 또는 Apply로 넘어가지 못하게 막는다.

### 8.7 Terraform용 AWS env 준비

코드:

```ts
const awsCredentials = await prepareTerraformAwsCredentialEnv(awsConnection);
```

뜻:

verified AWS connection을 STS AssumeRole로 임시 credential로 바꾼다.

Terraform process에 넘기는 env:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AWS_REGION
```

이 값들은 DB, API 응답, 로그에 저장하지 않는다.

### 8.8 Terraform workspace 복원

코드:

```ts
workspace = await prepareTerraformWorkspace({
  objectKey: artifact.objectKey,
  fileName: artifact.fileName
});
```

뜻:

S3에 저장된 Terraform artifact를 임시 디렉터리에 `.tf` 파일로 복원한다.

반환값:

| 값 | 뜻 |
| --- | --- |
| `workdir` | Terraform CLI를 실행할 임시 디렉터리 |
| `mainFilePath` | 복원된 `.tf` 파일 경로 |
| `cleanup` | 임시 디렉터리를 삭제하는 함수 |

### 8.9 Terraform artifact hash 계산

코드:

```ts
const terraformArtifactSha256 = createSha256(
  await readTerraformArtifactFile(workspace.mainFilePath)
);
```

뜻:

Plan 생성 시점의 Terraform 파일 내용을 hash로 고정한다.

승인 시점에 S3 Terraform 파일을 다시 읽어 이 hash와 비교한다. 다르면 Plan 생성 후 파일이 바뀐 것이므로 승인하지 않는다.

### 8.10 Terraform 명령 실행 순서

실행 순서:

```text
runTerraformInit
-> appendTerraformOutput
-> runTerraformPlan
-> appendTerraformOutput
-> runTerraformShowJson
-> appendTerraformErrorOutput
```

각 명령:

| 함수 | 실제 명령 | 실패 시 |
| --- | --- | --- |
| `runTerraformInit` | `terraform init -backend=false -input=false -no-color` | `FAILED`, `failureStage = init` |
| `runTerraformPlan` | `terraform plan -input=false -no-color -out=tfplan` | `FAILED`, `failureStage = plan` |
| `runTerraformShowJson` | `terraform show -json tfplan` | `FAILED`, `failureStage = plan` |

각 단계에서 `exitCode !== 0`이면 다음 단계로 넘어가지 않고 `failDeploymentPlanRun`을 호출한다.

### 8.11 `terraform init`

의미:

Provider와 module을 준비한다.

옵션 의미:

| 옵션 | 뜻 |
| --- | --- |
| `-backend=false` | remote backend를 초기화하지 않는다. |
| `-input=false` | CLI가 사용자 입력을 기다리지 않게 한다. |
| `-no-color` | 로그에 color code가 섞이지 않게 한다. |

### 8.12 `terraform plan -out=tfplan`

의미:

Apply하면 어떤 변경이 생길지 계산하고, 결과를 `tfplan` 바이너리 파일로 저장한다.

이 단계도 AWS 리소스를 변경하지 않는다.

`-out=tfplan`이 중요한 이유:

나중에 Apply를 할 때 사용자가 승인한 바로 이 Plan 파일만 실행해야 하기 때문이다.

### 8.13 `terraform show -json tfplan`

의미:

바이너리 `tfplan`을 JSON으로 변환한다.

이 JSON은 summary count를 만들기 위해서만 사용한다.

`showJson.stdout`은 DB 로그에 저장하지 않는다. raw Plan JSON은 크고 민감할 수 있기 때문이다.

### 8.14 Plan summary 생성

코드:

```ts
const planSummary = createBlockedPlanSummary(
  createDeploymentPlanSummaryFromTerraformShowJson(terraform.showJson.stdout),
  preDeploymentAnalysis.findings
);
```

첫 번째 함수:

```ts
createDeploymentPlanSummaryFromTerraformShowJson
```

`resource_changes[].change.actions`를 보고 count를 만든다.

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

두 번째 함수:

```ts
createBlockedPlanSummary
```

Pre-Deployment Check의 high-risk finding을 Plan warning으로 합친다.

그리고 `blocked: true`로 만든다.

여기서 `blocked: true`는 Plan이 실패했다는 뜻이 아니다. Apply로 넘어가기 전에 승인 또는 위험 해결이 필요하다는 뜻이다.

### 8.15 block 이유 계산

코드:

```ts
const block = createDeploymentPlanBlock(planSummary);
```

기준:

| 조건 | 저장값 |
| --- | --- |
| delete 또는 replace 있음 | `blockedBy = "risk_analysis"` |
| high-risk warning 있음 | `blockedBy = "risk_analysis"` |
| 위험 없음 | `blockedBy = "missing_approval"` |

`missing_approval`은 정상 Plan이지만 사용자 승인이 필요하다는 뜻이다.

`risk_analysis`는 위험 차단 상태라 승인 API에서 막힌다.

### 8.16 `tfplan` S3 업로드

코드:

```ts
uploadedPlanArtifact = await planArtifactStorage.uploadDeploymentPlanArtifact({
  deploymentId: deployment.id,
  planArtifactId,
  planFilePath: join(workspace.workdir, defaultPlanFileName)
});
```

뜻:

Terraform이 만든 `tfplan` 바이너리를 S3에 저장한다.

반환값:

| 값 | 뜻 |
| --- | --- |
| `objectKey` | S3 저장 위치 |
| `sha256` | `tfplan` 파일 내용 hash |

### 8.17 Plan metadata DB 저장

코드:

```ts
repository.saveDeploymentPlan({
  deploymentId,
  planArtifact,
  planSummary,
  isBlocked,
  blockedBy,
  blockedReason
})
```

뜻:

S3에 저장한 `tfplan`의 metadata를 RDS에 저장하고, Deployment의 현재 Plan pointer를 업데이트한다.

성공하면 Deployment는 `PENDING` 상태가 된다.

`PENDING`은 Plan 실행이 끝났고 사용자 승인 같은 다음 액션을 기다린다는 뜻이다.

### 8.18 S3 업로드 후 DB 저장 실패

S3 업로드는 성공했는데 DB 저장이 실패할 수 있다.

이 경우 흐름:

```text
S3 tfplan upload 성공
-> DB save 실패
-> cleanupUploadedPlanArtifact
-> Deployment FAILED 저장
```

`cleanupUploadedPlanArtifact`는 S3에 올라간 `tfplan`을 best-effort로 삭제한다.

best-effort는 삭제를 시도하되, 삭제 실패 때문에 원래 실패 처리를 더 망치지 않는다는 뜻이다.

### 8.19 `finally` cleanup

코드:

```ts
await workspace?.cleanup();
```

성공, 실패, 예외와 관계없이 임시 Terraform 디렉터리를 삭제한다.

## 9. Plan service helper 함수

파일: [apps/api/src/deployments/deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts)

| 함수 | 의미 |
| --- | --- |
| `canReuseDeploymentPlanArtifact` | 기존 current Plan artifact를 Terraform 재실행 없이 재사용할 수 있는지 확인한다. |
| `restorePendingDeploymentStatus` | 재사용 경로에서 route가 바꾼 `RUNNING` 상태를 다시 `PENDING`으로 되돌린다. |
| `requireDeploymentTerraformArtifact` | artifact가 Deployment의 project/architecture와 맞는지 확인한다. |
| `requireDeploymentAwsConnection` | verified AWS connection을 확인한다. |
| `failDeploymentPlanRun` | Terraform 명령 실패를 `FAILED` 상태로 저장한다. |
| `createBlockedPlanSummary` | high-risk finding을 Plan warning에 합친다. |
| `createDeploymentPlanBlock` | `risk_analysis`인지 `missing_approval`인지 결정한다. |
| `toPlanWarning` | CheckFinding을 Plan warning 형태로 바꾼다. |
| `appendTerraformOutput` | init/plan stdout과 stderr를 로그로 저장한다. |
| `appendTerraformErrorOutput` | show-json stderr만 로그로 저장한다. |
| `appendOutputLines` | 출력 문자열을 줄 단위 log row로 바꾼다. |
| `splitOutputLines` | 줄 나누기, trim, secret 마스킹, 빈 줄 제거를 한다. |
| `summarizeTerraformFailure` | Terraform 실패를 짧은 error summary로 만든다. |
| `summarizeUnexpectedPlanFailure` | 예상 못한 예외를 error summary로 만든다. |
| `createSha256` | 문자열 또는 bytes를 sha256 hash로 만든다. |

로그 level 기준:

| 출력 | level |
| --- | --- |
| stdout | `INFO` |
| 성공한 명령의 stderr | `WARN` |
| 실패한 명령의 stderr | `ERROR` |

`terraform show -json tfplan`의 stdout은 저장하지 않는다.

## 10. Terraform workspace

파일: [apps/api/src/deployments/terraform-workspace.ts](../../apps/api/src/deployments/terraform-workspace.ts)

핵심 함수:

```ts
prepareTerraformWorkspace
```

흐름:

```text
mkdtemp
-> toSafeTerraformFileName
-> downloadTerraformArtifactFromS3
-> writeFile
-> { workdir, mainFilePath, cleanup } 반환
```

각 부분의 뜻:

| 코드 | 뜻 |
| --- | --- |
| `mkdtemp` | OS 임시 폴더 아래 실행 전용 디렉터리를 만든다. |
| `toSafeTerraformFileName` | 위험한 파일명이나 `.tf`가 아닌 파일명을 `main.tf`로 바꾼다. |
| `downloadTerraformArtifactFromS3` | S3에서 Terraform artifact 원문을 가져온다. |
| `writeFile` | 임시 디렉터리에 Terraform 파일을 쓴다. |
| `cleanup` | 임시 디렉터리를 삭제한다. |

`toSafeTerraformFileName`이 필요한 이유:

S3 metadata의 파일명을 그대로 쓰면 `../secret.tf` 같은 위험한 경로가 될 수 있다. 그래서 마지막 파일명만 사용하고, 이상하면 `main.tf`를 쓴다.

## 11. Terraform runner

파일: [apps/api/src/deployments/terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)

공개 함수와 실제 명령:

| 함수 | 실제 명령 |
| --- | --- |
| `runTerraformInit` | `terraform init -backend=false -input=false -no-color` |
| `runTerraformValidate` | `terraform validate -no-color` |
| `runTerraformPlan` | `terraform plan -input=false -no-color -out=tfplan` |
| `runTerraformShowJson` | `terraform show -json tfplan` |

네 함수 모두 내부에서 `runTerraformCommand`를 호출한다.

단, 현재 `/plan` service가 실제로 호출하는 것은 `runTerraformInit`, `runTerraformPlan`, `runTerraformShowJson`이다. `runTerraformValidate`는 runner에 남아 있지만 현재 Plan 실행 경로에서는 호출되지 않는다.

### 11.1 `runTerraformCommand`

역할:

Terraform process를 실행하고 결과를 객체로 반환한다.

반환 타입:

```ts
type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};
```

중요한 코드의 의미:

| 코드 | 뜻 |
| --- | --- |
| `terraformBinary = options.terraformBinary ?? "terraform"` | 기본 실행 파일은 `terraform`이다. |
| `timeoutMs = options.timeoutMs ?? 60_000` | 기본 timeout은 60초다. |
| `createTerraformProcessEnv(options.env)` | Terraform process에 넘길 env를 만든다. |
| `ensureTerraformPluginCacheDir` | provider cache 디렉터리를 만든다. |
| `spawn(terraformBinary, args, { cwd: workdir, shell: false })` | shell 없이 실행 파일과 args 배열로 실행한다. |
| `stdio: ["ignore", "pipe", "pipe"]` | stdin은 막고 stdout/stderr만 받는다. |
| `child.kill("SIGTERM")` | timeout이면 process를 종료한다. |

`shell: false`는 shell injection 위험을 줄이고 인자 경계를 명확히 한다.

### 11.2 `createTerraformProcessEnv`

역할:

Terraform process에 넘길 환경변수를 만든다.

전체 `process.env`를 넘기지 않고 필요한 값만 상속한다.

상속하는 값 예:

```text
PATH
TEMP
TMP
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

`TF_PLUGIN_CACHE_DIR`은 provider plugin cache 위치다.

## 12. AWS runtime credential

파일: [apps/api/src/aws-connections/aws-connection-runtime-credentials.ts](../../apps/api/src/aws-connections/aws-connection-runtime-credentials.ts)

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
| `assertVerifiedAwsConnection` | connection이 verified이고 accountId, roleArn, externalId, region이 있는지 확인한다. |
| `getAwsAccountIdFromRoleArn` | Role ARN에 들어 있는 AWS account id를 꺼낸다. |
| `assumeRoleForTerraform` | externalId를 넣어 STS AssumeRole을 호출한다. |
| `getCallerIdentityForTerraform` | 임시 credential이 실제 어느 account인지 확인한다. |
| `assertRoleRequiresExternalIdForTerraform` | externalId 없이 assume 가능한 위험한 role인지 검사한다. |
| `createTerraformAwsCredentialEnv` | Terraform에 넘길 AWS env 네 개를 만든다. |

반환 credential 원문은 DB, API 응답, 로그에 저장하지 않는다.

## 13. Plan summary parser

파일: [apps/api/src/deployments/deployment-plan-summary.ts](../../apps/api/src/deployments/deployment-plan-summary.ts)

핵심 함수:

```ts
createDeploymentPlanSummaryFromTerraformShowJson
```

역할:

`terraform show -json tfplan` stdout을 화면용 요약으로 바꾼다.

흐름:

```text
parseTerraformShowJson
-> resource_changes 반복
-> change.actions 확인
-> count 증가 또는 warning 추가
```

JSON parse 실패나 최상위 값이 object가 아니면 `DeploymentPlanSummaryParseError`를 던진다.

## 14. Plan artifact storage

파일: [apps/api/src/deployments/deployment-plan-artifact-storage.ts](../../apps/api/src/deployments/deployment-plan-artifact-storage.ts)

핵심 함수:

```ts
createS3DeploymentPlanArtifactStorage
```

이 함수는 storage 객체를 만든다.

| 함수 | 뜻 |
| --- | --- |
| `uploadDeploymentPlanArtifact` | `tfplan` 파일을 S3에 업로드한다. |
| `deleteDeploymentPlanArtifact` | S3의 `tfplan` 파일을 삭제한다. |

`uploadDeploymentPlanArtifact` 흐름:

```text
readFile(planFilePath)
-> buildDeploymentPlanArtifactObjectKey
-> PutObjectCommand
-> createSha256
-> { objectKey, sha256 } 반환
```

S3 object key:

```text
deployments/{deploymentId}/plans/{planArtifactId}.tfplan
```

저장 옵션:

| 옵션 | 뜻 |
| --- | --- |
| `ContentType = "application/octet-stream"` | 바이너리 파일로 저장한다. |
| `ServerSideEncryption = "AES256"` | S3 server-side encryption을 켠다. |

## 15. 로그와 마스킹

저장하는 로그:

| Terraform 단계 | 저장 출력 |
| --- | --- |
| `init` | stdout, stderr |
| `plan` | stdout, stderr |
| `show -json` | stderr만 |

저장하지 않는 로그:

```text
terraform show -json tfplan stdout
```

이 stdout은 raw Plan JSON이라 크고 민감할 수 있다.

마스킹 함수:

```ts
maskDeploymentMessage
```

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

## 16. Plan 승인 흐름

파일: [apps/api/src/deployments/deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts)

핵심 함수:

```ts
approveDeploymentPlan
```

호출 순서:

```text
getDeployment
-> assertDeploymentCanBeApproved
-> findDeploymentPlanArtifactById
-> Plan artifact deployment id 확인
-> Terraform artifact id 확인
-> findTerraformArtifactById
-> project/architecture 확인
-> requireDeploymentAwsConnection
-> account/region 확인
-> downloadTerraformArtifactFromS3
-> createSha256
-> terraformArtifactSha256 존재 확인
-> Terraform artifact hash 비교
-> repository.approveDeployment
```

### 16.1 `assertDeploymentCanBeApproved`

막는 조건:

| 조건 | 이유 |
| --- | --- |
| `status === "RUNNING"` | 아직 Plan 결과가 확정되지 않았다. |
| `currentPlanArtifactId` 없음 | 승인할 Plan이 없다. |
| `planSummary` 없음 | Plan 결과가 저장되지 않았다. |
| `!isBlocked` | 승인으로 풀 block 상태가 아니다. |
| `blockedBy !== "missing_approval"` | 승인 가능한 block이 아니다. |

즉 `risk_analysis` Plan은 승인할 수 없다.

### 16.2 Plan 이후 drift 확인

승인 전에 다시 확인하는 것:

| 확인 | 막는 문제 |
| --- | --- |
| Plan artifact의 `deploymentId` | 다른 Deployment의 Plan 승인 방지 |
| Plan artifact의 `terraformArtifactId` | Plan 이후 artifact pointer 변경 방지 |
| Terraform artifact의 project/architecture | 다른 project/architecture artifact 승인 방지 |
| AWS account/region | Plan 이후 AWS 대상 변경 방지 |
| Terraform artifact hash | Plan 이후 S3 Terraform 파일 내용 변경 방지 |

`terraformArtifactSha256`이 없는 legacy Plan artifact도 승인하지 않는다. 새 Plan을 다시 만들어야 한다.

### 16.3 approval snapshot

승인 성공 시 `deployments`에 아래 값이 저장된다.

| 필드 | 뜻 |
| --- | --- |
| `approvedByUserId` | 승인한 사용자 |
| `approvedAt` | 승인 시각 |
| `approvedTerraformArtifactId` | 승인 당시 Terraform artifact id |
| `approvedPlanArtifactId` | 승인한 Plan artifact id |
| `approvedTerraformArtifactHash` | 승인 당시 Terraform 파일 hash |
| `approvedTfplanHash` | 승인한 `tfplan` hash |
| `approvedAwsAccountId` | 승인 당시 AWS account |
| `approvedAwsRegion` | 승인 당시 AWS region |

이 snapshot은 나중에 Apply 직전 다시 비교할 기준점이다.

## 17. 저장 경계

RDS에 저장하는 것:

- Deployment 상태
- Plan summary
- block 상태와 reason
- current Plan artifact pointer
- Plan artifact metadata
- Deployment logs
- approval snapshot

S3에 저장하는 것:

- 원본 Terraform artifact
- `tfplan` 바이너리

저장하지 않는 것:

- AWS temporary credentials
- AWS access key, secret key, session token
- raw `terraform show -json` 전체 stdout
- Terraform sensitive output
- Terraform 원문 파일 content

## 18. 실패 흐름

Terraform 단계 실패:

| 실패 위치 | 저장 상태 |
| --- | --- |
| `terraform init` 실패 | `status = FAILED`, `failureStage = init` |
| `terraform plan` 실패 | `status = FAILED`, `failureStage = plan` |
| `terraform show -json` 실패 | `status = FAILED`, `failureStage = plan` |

Plan artifact 저장 실패:

```text
tfplan S3 업로드 성공
-> RDS 저장 실패
-> S3 tfplan best-effort 삭제
-> Deployment FAILED 저장
```

임시 workspace는 성공, 실패, 예외와 관계없이 cleanup한다.

## 19. 현재 구현 범위와 남은 범위

구현된 범위:

- Deployment 생성
- verified AWS connection 선택
- Terraform artifact S3 복원
- STS AssumeRole 기반 임시 Terraform env 준비
- `terraform init`
- `terraform plan -out=tfplan`
- `terraform show -json tfplan`
- Plan summary 파싱
- high-risk/delete/replace block
- 기존 current Plan artifact 재사용
- `tfplan` S3 저장
- Plan artifact metadata RDS 저장
- Deployment current Plan pointer 갱신
- Plan 승인 API
- approval snapshot 저장
- Plan 실행 로그 저장과 조회
- frontend Plan 실행/승인 UI

남은 범위:

- Apply API 구현
- Apply 직전 approval snapshot 검증 helper 연결
- Apply 직전 S3 Terraform artifact hash 재계산
- Apply 직전 S3 `tfplan` hash 재계산
- Plan service의 `terraform validate` 재연결 여부 결정
- `terraform apply tfplan`
- `terraform output -json`
- 생성 리소스 저장
- sensitive output 마스킹
- destroy/cleanup

## 20. 코드를 읽는 순서

처음 읽을 때는 아래 순서가 덜 헷갈린다.

1. [apps/web/features/workspace/WorkspaceRightPanel.tsx](../../apps/web/features/workspace/WorkspaceRightPanel.tsx)
   - `DeploymentPanel`
   - `canRunPlan`
   - `canApprovePlan`
   - `startTerraformPlan`
   - `approveCurrentPlan`

2. [apps/web/features/workspace/api.ts](../../apps/web/features/workspace/api.ts)
   - `runDeploymentPlan`
   - `approveDeploymentPlan`
   - `listDeploymentLogs`

3. [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)
   - `app.post("/deployments/:deploymentId/plan", ...)`
   - `startDeploymentPlanJob`
   - `app.post("/deployments/:deploymentId/approve", ...)`

4. [apps/api/src/deployments/deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts)
   - `runDeploymentPlan`
   - `createDeploymentPlanBlock`
   - `appendTerraformOutput`
   - `failDeploymentPlanRun`

5. [apps/api/src/services/aiPreDeploymentAnalysis.ts](../../apps/api/src/services/aiPreDeploymentAnalysis.ts)
   - `analyzePreDeployment`

6. [apps/api/src/deployments/terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)
   - `runTerraformInit`
   - `runTerraformPlan`
   - `runTerraformShowJson`
   - `runTerraformCommand`
   - `runTerraformValidate`는 runner 함수지만 현재 Plan service에서는 호출하지 않는다.

7. [apps/api/src/deployments/terraform-workspace.ts](../../apps/api/src/deployments/terraform-workspace.ts)
   - `prepareTerraformWorkspace`
   - `downloadTerraformArtifactFromS3`

8. [apps/api/src/deployments/deployment-plan-summary.ts](../../apps/api/src/deployments/deployment-plan-summary.ts)
   - `createDeploymentPlanSummaryFromTerraformShowJson`

9. [apps/api/src/deployments/deployment-plan-artifact-storage.ts](../../apps/api/src/deployments/deployment-plan-artifact-storage.ts)
   - `uploadDeploymentPlanArtifact`

10. [apps/api/src/deployments/deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts)
   - `approveDeploymentPlan`
   - `assertDeploymentApplyPreconditions`

11. [apps/api/src/deployments/deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts)
    - `DeploymentRepository`
    - `saveDeploymentPlan`
    - `approveDeployment`

## 21. 진짜 핵심 요약

```text
프론트 버튼 클릭
-> API route가 RUNNING lock 설정
-> background로 backend runDeploymentPlan 시작
-> 기존 current Plan artifact를 재사용할 수 있으면 PENDING으로 되돌리고 종료
-> S3 Terraform artifact를 임시 workdir에 복원
-> STS 임시 AWS env 생성
-> terraform init
-> terraform plan -out=tfplan
-> terraform show -json tfplan
-> show JSON에서 summary만 파싱
-> tfplan은 S3 저장
-> metadata와 hash는 RDS 저장
-> delete/replace/high-risk면 risk_analysis로 block
-> 아니면 missing_approval로 block
-> 사용자가 승인하면 approval snapshot 저장
```

Plan은 미리보기와 승인 대상 생성이다.

Apply는 아직 연결되지 않았다.
