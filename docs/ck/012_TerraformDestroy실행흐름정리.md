# Terraform Destroy 실행 흐름 정리

이 문서는 `Terraform Destroy` 흐름을 처음 보는 사람이 코드 흐름과 안전장치를 따라갈 수 있게 정리한 문서다.

`008_배포Plan실행흐름정리.md`와 같은 방식으로, 사용자가 cleanup을 요청했을 때 어떤 API가 호출되고, 어떤 상태에서만 destroy가 열리며, `terraform plan -destroy`와 승인, 실제 destroy apply가 어디에서 수행되는지 순서대로 설명한다.

목표는 아래와 같다.

1. Destroy가 Plan/Apply와 무엇이 다른지 명확히 한다.
2. 사용자가 명시적으로 cleanup을 실행했을 때 `terraform plan -destroy -> 승인 -> destroy apply`가 어떤 순서로 동작하는지 설명한다.
3. Apply 성공 상태와 Apply 중간 실패 상태에서 cleanup 조건이 어떻게 다른지 설명한다.
4. Apply 실패 후 partial state가 왜 필요하고 어디에 저장되는지 설명한다.
5. Destroy Plan, 승인, Destroy Apply가 각각 어떤 DB 상태를 만들고 검증하는지 설명한다.
6. Hash, AWS account/region, Terraform state, unsupported resource type 같은 안전장치가 어디에서 걸리는지 설명한다.
7. Destroy 실패, 취소, 재시도 가능 상태를 구현 기준으로 정리한다.
8. 관련 테스트가 어떤 시나리오를 막고 있는지 정리한다.

## 1. Destroy는 무엇인가

`Terraform Destroy`는 이미 만들어진 AWS 리소스를 Terraform state 기준으로 삭제하는 흐름이다.

중요한 점은 SketchCatch에서 destroy를 바로 실행하지 않는다는 것이다.

현재 흐름은 항상 아래 순서를 따른다.

```text
Terraform artifact 복원
-> 기존 terraform.tfstate 복원
-> terraform init
-> terraform plan -destroy -out=tfplan
-> terraform show -json tfplan
-> Destroy Plan summary 저장
-> 사용자 승인 대기
-> 승인 snapshot 저장
-> terraform apply tfplan
-> 성공하면 Deployment를 DESTROYED로 변경
```

즉, 사용자가 cleanup을 누른다고 해서 바로 AWS 리소스가 삭제되지 않는다.

먼저 destroy 전용 plan을 만들고, 그 plan을 사용자가 승인한 뒤에만 실제 삭제가 실행된다.

## 2. Destroy Plan과 Destroy Apply의 차이

Destroy 흐름은 두 단계로 나뉜다.

| 단계 | Terraform 명령 | AWS 리소스 변경 | 결과 |
| --- | --- | --- | --- |
| Destroy Plan | `terraform plan -destroy -out=tfplan` | 삭제하지 않음 | 삭제 예정 변경사항을 계산하고 `tfplan`을 저장한다. |
| Destroy Apply | `terraform apply tfplan` | 삭제함 | 승인된 destroy plan을 실제 AWS에 적용한다. |

Destroy Plan은 AWS 리소스를 삭제하지 않는다.

다만 Terraform은 plan 계산 중 provider를 통해 현재 상태를 읽을 수 있다. 그래서 AWS credential은 필요하지만, 실제 삭제는 `terraform apply tfplan`에서만 발생한다.

## 3. 전체 구조

Destroy 실행은 현재 backend/API 기준으로 구현되어 있다.

| 층 | 위치 | 책임 |
| --- | --- | --- |
| API route | [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts) | destroy plan 요청, destroy 실행 요청, 상태 guard, project lock, background job 시작 |
| Destroy Plan service | [apps/api/src/deployments/deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts) | state 복원, `terraform plan -destroy`, summary 생성, destroy plan artifact 저장 |
| Approval service | [apps/api/src/deployments/deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts) | destroy plan 승인 가능 여부 검증, approval snapshot 저장 |
| Destroy service | [apps/api/src/deployments/deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts) | 승인 snapshot 재검증, state 복원, `terraform apply tfplan`, 결과 정리 |
| Terraform runner | [apps/api/src/deployments/terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts) | Terraform CLI 명령 실행 |
| Artifact storage | [apps/api/src/deployments/deployment-apply-artifact-storage.ts](../../apps/api/src/deployments/deployment-apply-artifact-storage.ts) | `tfplan`, `terraform.tfstate` S3 저장/다운로드 |
| Repository | [apps/api/src/deployments/deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | Deployment 상태, plan artifact, approval, logs, outputs/resources 저장 |
| Shared types | [packages/types/src/index.ts](../../packages/types/src/index.ts) | `DESTROYED`, `destroy`, plan `operation` 타입 |

같은 이름의 Plan/Apply 함수와 헷갈리지 않도록 먼저 구분해야 한다.

| 이름 | 파일 | 의미 |
| --- | --- | --- |
| `runTerraformPlan` | [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts) | 일반 apply용 `terraform plan -out=tfplan` |
| `runTerraformDestroyPlan` | [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts) | destroy용 `terraform plan -destroy -out=tfplan` |
| `runTerraformApply` | [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts) | apply plan 또는 destroy plan을 `terraform apply tfplan`로 적용 |
| `runDeploymentDestroyPlan` | [deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts) | destroy plan 생성 backend service |
| `runDeploymentDestroy` | [deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts) | 승인된 destroy plan을 실제 적용하는 backend service |
| `markDeploymentDestroyRunning` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | destroy apply 시작 전 Deployment를 `RUNNING/destroy`로 변경 |
| `completeDeploymentDestroy` | [deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts) | destroy 성공 후 Deployment를 `DESTROYED`로 변경 |

## 4. Destroy가 가능한 Deployment 상태

현재 정책은 보수적이다.

Destroy는 아래 상태에서만 시작할 수 있다.

| Deployment 상태 | 추가 조건 | destroy plan 가능 여부 | 의미 |
| --- | --- | --- | --- |
| `SUCCESS` | `stateObjectKey` 있음 | 가능 | apply가 끝났고 Terraform state가 저장되어 있다. |
| `FAILED` | `failureStage === "apply"` 그리고 `stateObjectKey` 있음 | 가능 | apply 중 실패했지만 partial state가 저장되어 cleanup 대상이 있다. |
| `FAILED` | `failureStage === "destroy"` 그리고 `stateObjectKey` 있음 | 가능 | 이전 destroy가 실패했으므로 새 destroy plan부터 다시 시도한다. |
| `RUNNING` | 무관 | 불가 | 같은 deployment가 이미 실행 중이다. |
| `PENDING` | 무관 | 불가 | 아직 실제 apply가 성공하지 않았고 state도 cleanup 기준이 아니다. |
| `CANCELLED` | 무관 | 불가 | 취소 후 cleanup 정책은 아직 후속 정책으로 남겨둔다. |
| `FAILED` | `failureStage === "plan"` | 불가 | plan 단계 실패는 AWS 리소스 변경이 없다고 보고 destroy cleanup 대상에서 제외한다. |
| `FAILED` | `failureStage === "aws_connection"` | 불가 | AWS credential 준비 실패는 리소스 변경이 없다고 본다. |
| `FAILED` | `stateObjectKey` 없음 | 불가 | Terraform이 무엇을 지워야 하는지 알 수 없다. |
| `DESTROYED` | 무관 | 불가 | 이미 destroy 완료 상태다. |

핵심 조건은 `stateObjectKey`다.

Terraform destroy는 state를 기준으로 삭제 대상을 판단한다. 따라서 state가 없으면, Deployment 상태가 `FAILED`여도 cleanup destroy를 열지 않는다.

## 5. 사용자 관점 흐름

### 5.1 성공한 Deployment cleanup

정상적으로 apply가 성공한 뒤 cleanup을 실행하는 흐름이다.

```text
Deployment status = SUCCESS
stateObjectKey 있음
-> 사용자가 cleanup destroy plan 실행
-> POST /api/deployments/:deploymentId/destroy/plan
-> Terraform destroy plan 생성
-> Deployment status = SUCCESS
-> isBlocked = true
-> blockedBy = missing_approval
-> 사용자가 plan summary 확인 후 승인
-> POST /api/deployments/:deploymentId/approve
-> Deployment status = SUCCESS
-> isBlocked = false
-> 사용자가 destroy 실행
-> POST /api/deployments/:deploymentId/destroy
-> terraform apply tfplan
-> 성공하면 Deployment status = DESTROYED
```

성공 cleanup에서는 destroy plan이 저장되어도 Deployment의 terminal status는 `SUCCESS`로 유지된다.

승인 전에는 `isBlocked = true`이므로 실제 destroy는 실행할 수 없다.

### 5.2 Apply 중간 실패 cleanup

Apply 중간에 Terraform이 일부 리소스를 만들고 실패할 수 있다.

이 경우 SketchCatch는 실패한 apply 직후 best-effort로 partial state를 저장한다.

```text
Deployment status = RUNNING/apply
-> terraform apply tfplan 실행
-> 일부 AWS 리소스 생성 후 실패 또는 취소
-> terraform.tfstate 업로드 시도
-> 업로드 성공 시 stateObjectKey 저장
-> Deployment status = FAILED
-> failureStage = apply
-> 사용자가 cleanup destroy plan 실행
-> terraform plan -destroy
-> 승인
-> destroy apply
-> 성공하면 Deployment status = DESTROYED
```

이때 cleanup은 자동 실행되지 않는다.

사용자가 명시적으로 cleanup destroy plan을 실행해야 한다.

### 5.3 Destroy 실패 후 재시도

Destroy apply 도중에도 삭제가 일부만 끝나고 실패할 수 있다.

이 경우 Deployment는 `FAILED/failureStage=destroy`가 된다.

```text
Deployment status = FAILED
failureStage = destroy
stateObjectKey 있음
-> 사용자가 destroy plan을 다시 생성
-> 새 destroy plan 승인
-> destroy apply 재시도
-> 성공하면 DESTROYED
```

재시도 때 기존 승인을 재사용하지 않는다.

새로운 `terraform plan -destroy`를 만들고, 그 새 plan을 다시 승인해야 한다.

## 6. API route 흐름

Destroy 관련 route는 [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)에 있다.

현재 API는 두 개다.

```text
POST /api/deployments/:deploymentId/destroy/plan
POST /api/deployments/:deploymentId/destroy
```

승인은 기존 approval API를 같이 사용한다.

```text
POST /api/deployments/:deploymentId/approve
```

### 6.1 Destroy Plan route

`POST /api/deployments/:deploymentId/destroy/plan`

route의 순서는 아래와 같다.

```text
params 검증
body가 빈 객체인지 검증
-> accessContext, repository 준비
-> deployment 조회
-> Terraform artifact 존재 확인
-> requireDeploymentCanStartDestroyPlan
-> 같은 project에 RUNNING deployment가 없는지 확인
-> markDeploymentPlanRunning
-> startDeploymentDestroyPlanJob
-> 202 응답
```

`requireDeploymentCanStartDestroyPlan`에서 확인하는 것은 아래와 같다.

1. `RUNNING`이면 거절한다.
2. `stateObjectKey`가 없으면 거절한다.
3. `SUCCESS`면 허용한다.
4. `FAILED/apply`면 허용한다.
5. `FAILED/destroy`면 허용한다.
6. 그 외 상태는 거절한다.

route는 background job을 시작할 때 원래 상태를 같이 넘긴다.

```text
startedFromStatus
startedFromFailureStage
startedFromErrorSummary
```

이 값이 중요한 이유는 `markDeploymentPlanRunning`이 실행 중 상태로 바꾸는 동안 기존 `FAILED/apply` 정보를 잃지 않기 위해서다.

Destroy Plan service는 작업이 끝날 때 이 값을 사용해 원래 상태를 복원한다.

### 6.2 Destroy Apply route

`POST /api/deployments/:deploymentId/destroy`

route의 순서는 아래와 같다.

```text
params 검증
body가 빈 객체인지 검증
-> accessContext, repository 준비
-> deployment 조회
-> Terraform artifact 존재 확인
-> requireDeploymentCanStartDestroy
-> 같은 project에 RUNNING deployment가 없는지 확인
-> markDeploymentDestroyRunning
-> startDeploymentDestroyJob
-> 202 응답
```

`requireDeploymentCanStartDestroy`는 destroy plan 조건을 먼저 다시 확인한 뒤, 아래 조건을 추가로 확인한다.

1. `approvedAt`과 `approvedPlanArtifactId`가 있어야 한다.
2. `isBlocked`가 false여야 한다.
3. `currentPlanArtifactId`가 있어야 한다.
4. current plan artifact의 `operation`이 반드시 `"destroy"`여야 한다.

즉, apply용 plan을 승인한 상태로 destroy를 실행할 수 없다.

## 7. Deployment 상태와 DB 필드

Destroy 구현에서 추가되거나 중요해진 필드는 아래와 같다.

| 필드 | 위치 | 의미 |
| --- | --- | --- |
| `DeploymentStatus = "DESTROYED"` | [packages/types/src/index.ts](../../packages/types/src/index.ts) | destroy 성공 후 terminal status |
| `DeploymentStage = "destroy"` | [packages/types/src/index.ts](../../packages/types/src/index.ts) | destroy apply 실행 stage |
| `DeploymentFailureStage = "destroy"` | [packages/types/src/index.ts](../../packages/types/src/index.ts) | destroy apply 실패 stage |
| `deployment_plan_artifacts.operation` | [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) | plan artifact가 apply용인지 destroy용인지 구분 |
| `deployments.stateObjectKey` | `deployments` row | destroy 대상 state의 S3 object key |
| `deployments.currentPlanArtifactId` | `deployments` row | 현재 승인 후보 plan artifact |
| approval snapshot fields | `deployments` row | 승인 당시 artifact, plan, AWS account/region hash |

`deployment_plan_artifacts.operation`은 destroy 안전성에서 매우 중요하다.

현재 destroy apply는 `operation === "destroy"`인 plan artifact만 허용한다.

## 8. Apply 실패 시 partial state 저장

Apply 실패 cleanup의 핵심은 partial state다.

관련 코드는 [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)의 `uploadPartialStateAfterFailedApply`다.

Partial state 저장은 아래 경우에만 시도된다.

1. `terraform apply tfplan`이 실제로 시작되었다.
2. 그 apply가 cancelled 되었거나 exit code가 0이 아니다.
3. workspace 안에 `terraform.tfstate`가 있을 수 있으므로 업로드를 시도한다.

흐름은 아래와 같다.

```text
runTerraformApply
-> cancelled 또는 exitCode !== 0
-> uploadPartialStateAfterFailedApply
-> uploadDeploymentState({
     deploymentId,
     stateFilePath: workspace/terraform.tfstate
   })
-> 성공하면 stateObjectKey 저장
-> warning log 저장
-> failDeployment(... failureStage: "apply")
```

저장되는 S3 key 형식은 아래와 같다.

```text
deployments/{deploymentId}/state/terraform.tfstate
```

Partial state 업로드가 성공하면 warning summary는 아래 의미를 가진다.

```text
Partial Terraform state was saved after failed apply for explicit cleanup destroy.
```

Partial state 업로드가 실패하면 Deployment는 여전히 `FAILED/apply`가 되지만 `stateObjectKey`는 null이다.

이 경우 destroy cleanup은 막힌다.

Terraform state 없이 destroy를 실행하면 삭제 대상이 불명확해지기 때문이다.

## 9. Destroy Plan service 상세 흐름

Destroy plan의 실제 실행은 [deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts)의 `runDeploymentDestroyPlan`에서 일어난다.

큰 흐름은 아래와 같다.

Deployment 조회 ([deployment-destroy-plan-service.ts:L125-L131](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L125-L131))<br>
-> 원래 status/failureStage 확보 ([deployment-destroy-plan-service.ts:L133-L135](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L133-L135))<br>
-> destroy plan 시작 가능 상태 검증 ([호출부 L137](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L137), [검증 함수 L373-L394](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L373-L394))<br>
-> Terraform artifact 조회 ([호출부 L139](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L139), [조회 함수 L425-L443](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L425-L443))<br>
-> current plan artifact 조회 ([deployment-destroy-plan-service.ts:L140-L142](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L140-L142))<br>
-> AWS connection 조회 ([호출부 L143-L147](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L143-L147), [조회 함수 L445-L464](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L445-L464))<br>
-> Terraform workspace 준비 ([deployment-destroy-plan-service.ts:L148-L151](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L148-L151))<br>
-> Terraform artifact 파일 읽기 ([deployment-destroy-plan-service.ts:L153](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L153))<br>
-> artifact 안전성 검사 ([deployment-destroy-plan-service.ts:L154](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L154))<br>
-> artifact sha256 계산 ([deployment-destroy-plan-service.ts:L155](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L155))<br>
-> failed cleanup이면 artifact drift 검사 ([호출부 L157-L163](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L157-L163), [검증 함수 L396-L423](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L396-L423))<br>
-> state 다운로드 ([deployment-destroy-plan-service.ts:L165-L168](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L165-L168))<br>
-> workspace/terraform.tfstate 쓰기 ([deployment-destroy-plan-service.ts:L169](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L169))<br>
-> AWS credential 준비 ([호출부 L171-L179](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L171-L179), [준비 함수 L466-L488](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L466-L488))<br>
-> 필요하면 markDeploymentPlanRunning ([deployment-destroy-plan-service.ts:L180-L189](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L180-L189))<br>
-> terraform init ([deployment-destroy-plan-service.ts:L193-L204](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L193-L204))<br>
-> terraform plan -destroy ([deployment-destroy-plan-service.ts:L224-L236](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L224-L236))<br>
-> terraform show -json ([deployment-destroy-plan-service.ts:L256-L268](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L256-L268))<br>
-> summary 생성 ([호출부 L288-L294](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L288-L294), [생성 함수 L548-L572](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L548-L572))<br>
-> block 상태 생성 ([호출부 L295](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L295), [생성 함수 L574-L592](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L574-L592))<br>
-> tfplan S3 업로드 ([deployment-destroy-plan-service.ts:L301-L306](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L301-L306))<br>
-> deployment_plan_artifacts 저장 ([호출부 L308-L320](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L308-L320), [저장 구현 L579-L582](../../apps/api/src/deployments/deployment-service.ts#L579-L582))<br>
-> deployments.currentPlanArtifactId 갱신 ([deployment-service.ts:L584-L588](../../apps/api/src/deployments/deployment-service.ts#L584-L588))<br>
-> 승인 대기 상태로 저장 ([호출부 L321-L328](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L321-L328), [저장 구현 L589-L596](../../apps/api/src/deployments/deployment-service.ts#L589-L596))<br>
-> workspace cleanup ([deployment-destroy-plan-service.ts:L368-L370](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L368-L370))

### 9.1 원래 상태 보존

Destroy Plan route는 background job 시작 전에 Deployment를 `RUNNING/plan`으로 바꾼다.

하지만 cleanup 대상이 원래 `FAILED/apply`였는지 `FAILED/destroy`였는지 기억해야 한다.

그래서 route가 아래 값을 service에 넘긴다.

```text
startedFromStatus
startedFromFailureStage
startedFromErrorSummary
```

service는 이 값을 `sourceStatus`, `sourceFailureStage`, `sourceErrorSummary`로 사용한다.

Destroy plan 저장이 끝나면 아래처럼 terminal status를 정한다.

| source status | destroy plan 저장 후 status |
| --- | --- |
| `SUCCESS` | `SUCCESS` |
| `FAILED` | `FAILED` |

실패 cleanup인 경우 `failureStage`와 `errorSummary`도 보존한다.

즉, `FAILED/apply` deployment에 destroy plan을 생성해도 status가 `SUCCESS`로 바뀌지 않는다.

### 9.2 Terraform artifact 안전 검사

workspace에 Terraform artifact를 복원한 뒤 아래 검사를 다시 수행한다.

```text
assertTerraformArtifactIsSafe(terraformArtifactContent)
```

이 검사는 apply 때와 같은 계열의 안전장치다.

Destroy는 실제 삭제로 이어질 수 있으므로, 기존 artifact라도 실행 직전에 다시 안전성을 확인한다.

### 9.3 Failed cleanup artifact drift 검사

`FAILED/apply` 또는 `FAILED/destroy` cleanup에서는 artifact drift를 막는다.

관련 함수는 `assertDestroyCleanupArtifactHasNotDrifted`다.

검사 내용은 아래와 같다.

1. cleanup 대상이 `FAILED/apply` 또는 `FAILED/destroy`가 아니면 검사를 건너뛴다.
2. current plan artifact가 없으면 거절한다.
3. current plan artifact의 `terraformArtifactSha256`이 없으면 거절한다.
4. 현재 Terraform artifact hash가 기존 plan artifact의 hash와 다르면 거절한다.

이 검사는 실패한 배포를 cleanup할 때 다른 Terraform 파일로 바꿔치기한 뒤 destroy하는 상황을 막는다.

### 9.4 State 복원

Destroy plan은 반드시 기존 state를 workspace에 복원한다.

```text
downloadDeploymentState({
  deploymentId,
  objectKey: deployment.stateObjectKey
})
-> write workspace/terraform.tfstate
```

이 state가 있어야 `terraform plan -destroy`가 삭제 대상을 계산할 수 있다.

### 9.5 Terraform 명령 순서

Destroy Plan service에서 실행되는 Terraform 명령은 아래 순서다.

```text
terraform init
terraform plan -destroy -input=false -no-color -out=tfplan
terraform show -json tfplan
```

`terraform plan -destroy`는 [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)의 `runTerraformDestroyPlan`이 실행한다.

명령 인자는 아래와 같다.

```text
["plan", "-destroy", "-input=false", "-no-color", "-out=tfplan"]
```

### 9.6 Destroy plan artifact 저장

Destroy plan이 성공하면 생성된 `tfplan`을 S3에 업로드한다.

그 뒤 `deployment_plan_artifacts`에 metadata를 저장한다.

중요한 값은 아래와 같다.

```text
operation: "destroy"
terraformArtifactSha256
tfplan sha256
accountId
region
objectKey
```

`operation: "destroy"`가 있기 때문에 나중에 destroy apply에서 apply용 plan과 destroy용 plan을 구분할 수 있다.

## 10. Destroy Plan summary와 block

Destroy Plan service는 `terraform show -json` 결과를 기존 plan summary parser로 읽는다.

그 뒤 destroy 전용 보정을 추가한다.

관련 함수는 `createDestroyPlanSummary`와 `createDestroyPlanBlock`이다.

### 10.1 Summary는 항상 승인 대기 또는 위험 분석 대기

Destroy plan summary는 항상 `blocked: true`로 저장된다.

두 가지 경우가 있다.

| 조건 | blockedBy | 의미 |
| --- | --- | --- |
| unsupported resource type 있음 | `risk_analysis` | MVP live destroy 허용 범위를 벗어나므로 사용자가 승인할 수 없다. |
| unsupported resource type 없음 | `missing_approval` | 사용자의 명시적 승인이 필요하다. |

`missing_approval` 상태만 승인 가능하다.

`risk_analysis`는 승인 API에서 막힌다.

### 10.2 삭제할 리소스가 없는 plan

Destroy plan의 delete count와 replace count가 모두 0이면 warning이 추가된다.

```text
Terraform destroy plan has no resources to delete
```

이 경우도 unsupported resource type이 없다면 `missing_approval`로 저장된다.

즉, 삭제할 리소스가 없는 plan도 사용자가 확인하고 승인할 수는 있다.

## 11. Destroy 승인 흐름

Destroy도 apply와 같은 approval endpoint를 사용한다.

```text
POST /api/deployments/:deploymentId/approve
```

Approval service는 current plan artifact의 `operation`을 보고 apply 승인인지 destroy 승인인지 구분한다.

관련 파일은 [deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts)다.

### 11.1 Apply 승인과 Destroy 승인 차이

| operation | 승인 가능한 Deployment status | 승인 후 status |
| --- | --- | --- |
| `"apply"` | `PENDING` | `PENDING` |
| `"destroy"` | `SUCCESS` | `SUCCESS` |
| `"destroy"` | `FAILED` | `FAILED` |

Destroy approval은 실패 cleanup 상태를 성공으로 바꾸지 않는다.

`FAILED/apply` cleanup이라면 승인 후에도 `FAILED/apply`가 유지된다.

### 11.2 승인 snapshot

승인 시점에는 아래 값들이 Deployment row에 저장된다.

```text
approvedTerraformArtifactId
approvedPlanArtifactId
approvedTerraformArtifactHash
approvedTfplanHash
approvedAwsAccountId
approvedAwsRegion
approvedByUserId
approvedAt
```

이 snapshot은 사용자가 승인한 대상이 destroy apply 직전에 그대로인지 확인하기 위해 사용된다.

## 12. Destroy Apply service 상세 흐름

실제 AWS 삭제는 [deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts)의 `runDeploymentDestroy`에서 일어난다.

큰 흐름은 아래와 같다.

Deployment 조회 ([deployment-destroy-service.ts:L103-L109](../../apps/api/src/deployments/deployment-destroy-service.ts#L103-L109))<br>
-> 원래 status/failureStage 확보 ([deployment-destroy-service.ts:L111-L112](../../apps/api/src/deployments/deployment-destroy-service.ts#L111-L112))<br>
-> destroy 가능한 source status인지 확인 ([호출부 L114-L116](../../apps/api/src/deployments/deployment-destroy-service.ts#L114-L116), [검증 함수 L277-L286](../../apps/api/src/deployments/deployment-destroy-service.ts#L277-L286))<br>
-> Terraform artifact 조회 ([호출부 L118](../../apps/api/src/deployments/deployment-destroy-service.ts#L118), [조회 함수 L288-L306](../../apps/api/src/deployments/deployment-destroy-service.ts#L288-L306))<br>
-> current destroy plan artifact 조회 ([호출부 L119](../../apps/api/src/deployments/deployment-destroy-service.ts#L119), [조회 함수 L308-L329](../../apps/api/src/deployments/deployment-destroy-service.ts#L308-L329))<br>
-> AWS connection 조회 ([호출부 L120-L124](../../apps/api/src/deployments/deployment-destroy-service.ts#L120-L124), [조회 함수 L331-L353](../../apps/api/src/deployments/deployment-destroy-service.ts#L331-L353))<br>
-> 승인된 tfplan 다운로드 ([deployment-destroy-service.ts:L125-L129](../../apps/api/src/deployments/deployment-destroy-service.ts#L125-L129))<br>
-> Terraform workspace 준비 ([deployment-destroy-service.ts:L131-L134](../../apps/api/src/deployments/deployment-destroy-service.ts#L131-L134))<br>
-> Terraform artifact 파일 읽기 ([deployment-destroy-service.ts:L136](../../apps/api/src/deployments/deployment-destroy-service.ts#L136))<br>
-> artifact 안전성 검사 ([deployment-destroy-service.ts:L137](../../apps/api/src/deployments/deployment-destroy-service.ts#L137))<br>
-> 현재 Terraform artifact hash 계산 ([deployment-destroy-service.ts:L138](../../apps/api/src/deployments/deployment-destroy-service.ts#L138))<br>
-> tfplan hash 계산 ([deployment-destroy-service.ts:L139](../../apps/api/src/deployments/deployment-destroy-service.ts#L139))<br>
-> approval snapshot 재검증 ([호출부 L141-L149](../../apps/api/src/deployments/deployment-destroy-service.ts#L141-L149), [검증 함수 L189-L249](../../apps/api/src/deployments/deployment-approval-service.ts#L189-L249))<br>
-> state 다운로드 ([deployment-destroy-service.ts:L151-L154](../../apps/api/src/deployments/deployment-destroy-service.ts#L151-L154))<br>
-> workspace/terraform.tfstate 쓰기 ([deployment-destroy-service.ts:L155](../../apps/api/src/deployments/deployment-destroy-service.ts#L155))<br>
-> AWS credential 준비 ([호출부 L157-L165](../../apps/api/src/deployments/deployment-destroy-service.ts#L157-L165), [준비 함수 L355-L377](../../apps/api/src/deployments/deployment-destroy-service.ts#L355-L377))<br>
-> 필요하면 markDeploymentDestroyRunning ([deployment-destroy-service.ts:L166-L175](../../apps/api/src/deployments/deployment-destroy-service.ts#L166-L175))<br>
-> workspace/tfplan 쓰기 ([deployment-destroy-service.ts:L177](../../apps/api/src/deployments/deployment-destroy-service.ts#L177))<br>
-> terraform init ([deployment-destroy-service.ts:L181-L191](../../apps/api/src/deployments/deployment-destroy-service.ts#L181-L191))<br>
-> terraform apply tfplan ([deployment-destroy-service.ts:L212-L223](../../apps/api/src/deployments/deployment-destroy-service.ts#L212-L223))<br>
-> 성공하면 completeDeploymentDestroy ([호출부 L244-L251](../../apps/api/src/deployments/deployment-destroy-service.ts#L244-L251), [저장 구현 L677-L692](../../apps/api/src/deployments/deployment-service.ts#L677-L692))<br>
-> workspace cleanup ([deployment-destroy-service.ts:L272-L274](../../apps/api/src/deployments/deployment-destroy-service.ts#L272-L274))

Destroy Apply service는 새로운 plan을 만들지 않는다.

이미 승인된 destroy plan artifact를 S3에서 내려받아 그대로 적용한다.

## 13. Destroy apply 직전 precondition

Destroy apply 직전에는 `assertDeploymentDestroyPreconditions`가 실행된다.

이 함수는 approval 이후 변경이 있었는지 최종 확인한다.

검사 내용은 아래와 같다.

1. approval snapshot이 존재해야 한다.
2. current plan artifact의 `operation`이 `"destroy"`여야 한다.
3. source status가 `SUCCESS`, `FAILED/apply`, `FAILED/destroy` 중 하나여야 한다.
4. Deployment가 blocked 상태면 안 된다.
5. `stateObjectKey`가 있어야 한다.
6. 승인된 Terraform artifact id가 현재 deployment의 artifact id와 같아야 한다.
7. 승인된 plan artifact id가 current plan artifact id와 같아야 한다.
8. current plan artifact가 현재 deployment에 속해야 한다.
9. 승인된 Terraform artifact hash와 현재 artifact hash가 같아야 한다.
10. AWS connection에 account id가 있어야 한다.
11. 승인된 AWS account id와 현재 AWS connection account id가 같아야 한다.
12. 승인된 AWS region과 현재 AWS connection region이 같아야 한다.
13. 승인된 tfplan hash와 S3에서 내려받은 tfplan hash가 같아야 한다.

이 중 하나라도 바뀌면 destroy apply는 실행되지 않는다.

## 14. 실제 AWS 삭제 지점

실제 삭제는 아래 호출에서 일어난다.

```ts
terraform.destroy = await runTerraformApply(workspace.workdir, {
  env: awsCredentials.env,
  planFileName: defaultPlanFileName,
  signal: input.abortSignal
});
```

여기서 적용하는 `tfplan`은 destroy plan service가 만든 plan이다.

즉 Terraform CLI 관점에서는 아래와 같은 흐름이다.

```text
terraform plan -destroy -out=tfplan
terraform apply tfplan
```

`terraform apply` 명령 자체에는 `-destroy`를 붙이지 않는다.

삭제 의도는 이미 `tfplan` 안에 들어 있다.

## 15. Destroy 성공 후 상태 정리

Destroy가 성공하면 repository의 `completeDeploymentDestroy`가 실행된다.

이 함수는 하나의 transaction에서 아래 작업을 한다.

1. `deployed_resources`에서 해당 deployment의 리소스 결과를 삭제한다.
2. `terraform_outputs`에서 해당 deployment의 output 결과를 삭제한다.
3. Deployment status를 `DESTROYED`로 바꾼다.
4. `currentPlanArtifactId`를 null로 바꾼다.
5. `stateObjectKey`를 null로 바꾼다.
6. approval snapshot fields를 비운다.
7. `failureStage`와 `errorSummary`를 비운다.
8. 실패 cleanup으로 destroy가 성공했다면 warning summary를 저장한다.

성공 후 Deployment는 아래 의미를 가진다.

```text
status = DESTROYED
activeStage = null
currentPlanArtifactId = null
stateObjectKey = null
approvedPlanArtifactId = null
failureStage = null
errorSummary = null
```

주의할 점은 S3 artifact 자체를 즉시 삭제하는 정책은 현재 문서의 범위 밖이라는 점이다.

현재 구현은 Deployment row에서 `stateObjectKey`를 비우고 RDS 결과를 정리한다.

S3 보존/삭제 정책은 후속 운영 정책으로 다룬다.

## 16. 실패와 취소 흐름

Destroy는 실패 위치에 따라 상태가 다르게 남는다.

### 16.1 Destroy Plan 중 취소

Destroy plan 중 취소되면 `cancelDeploymentDestroyPlanRun`이 실행된다.

결과는 `CANCELLED`다.

```text
terraform init 중 취소
-> status = CANCELLED
-> errorSummary = "Terraform destroy plan was cancelled during init before AWS resources were changed"
```

```text
terraform plan -destroy 중 취소
-> status = CANCELLED
-> errorSummary = "Terraform destroy plan was cancelled before destroy"
```

```text
terraform show -json 중 취소
-> status = CANCELLED
-> errorSummary = "Terraform destroy plan inspection was cancelled before destroy"
```

현재 route guard는 `CANCELLED` 상태에서 destroy plan 재시작을 허용하지 않는다.

이 정책은 후속으로 재검토할 수 있다.

### 16.2 Destroy Plan 중 실패

Destroy plan 중 실패하면 `failureStage = "plan"`으로 저장된다.

예시는 아래와 같다.

```text
terraform init 실패
-> status = FAILED
-> failureStage = plan
```

```text
terraform plan -destroy 실패
-> status = FAILED
-> failureStage = plan
```

```text
terraform show -json 실패
-> status = FAILED
-> failureStage = plan
```

현재 cleanup destroy 허용 조건은 `FAILED/apply` 또는 `FAILED/destroy`이므로, `FAILED/plan`은 destroy 대상에서 제외된다.

Plan 실패는 AWS 리소스 삭제가 실행되기 전 단계로 보기 때문이다.

### 16.3 AWS credential 준비 실패

AWS credential 준비 실패는 `failureStage = "aws_connection"`으로 저장된다.

이 경우도 실제 Terraform 삭제가 실행되지 않았으므로 destroy 대상에서 제외된다.

### 16.4 Destroy Apply 중 취소

Destroy apply 중 취소되면 `failureStage = "destroy"`로 저장된다.

```text
terraform apply tfplan 중 취소
-> status = FAILED
-> failureStage = destroy
-> errorSummary = Terraform destroy was cancelled...
```

이 상태는 재시도 대상이다.

다만 바로 재실행하지 않고, 새 destroy plan을 만들고 다시 승인해야 한다.

### 16.5 Destroy Apply 중 실패

Destroy apply가 exit code 0이 아니면 `failureStage = "destroy"`로 저장된다.

```text
terraform apply tfplan 실패
-> status = FAILED
-> failureStage = destroy
-> 기존 stateObjectKey 유지
-> approval snapshot clear
-> 사용자는 새 destroy plan부터 다시 실행
```

기존 `deployed_resources`와 `terraform_outputs`는 destroy 성공 전까지 삭제하지 않는다.

부분 삭제가 일어났을 수 있으므로, 다음 plan에서 Terraform state와 실제 AWS 상태를 다시 기준으로 계산해야 한다.

## 17. Storage 경계

Destroy 흐름에서 RDS와 S3의 책임은 아래와 같다.

| 저장소 | 저장하는 것 |
| --- | --- |
| RDS `deployments` | status, activeStage, failureStage, stateObjectKey, currentPlanArtifactId, approval snapshot, block 상태 |
| RDS `deployment_plan_artifacts` | apply/destroy plan artifact metadata, operation, sha256, account, region |
| RDS `deployment_logs` | Terraform stdout/stderr line logs |
| RDS `deployed_resources` | apply 성공 후 리소스 결과, destroy 성공 시 삭제 |
| RDS `terraform_outputs` | apply 성공 후 outputs, destroy 성공 시 삭제 |
| S3 Terraform artifact | 원본 `.tf` artifact |
| S3 plan artifact | apply 또는 destroy `tfplan` binary |
| S3 state artifact | `terraform.tfstate` |

저장하지 않는 것은 아래와 같다.

1. AWS secret access key 원문
2. AssumeRole temporary credential 원문
3. raw `terraform show -json` 전체
4. secret으로 판단되는 Terraform output 값

## 18. 로그와 masking

Destroy Plan service의 로그 stage는 아래처럼 저장된다.

| Terraform 명령 | 로그 stage |
| --- | --- |
| `terraform init` | `init` |
| `terraform plan -destroy` | `plan` |
| `terraform show -json` | `plan` |

Destroy Apply service의 로그 stage는 아래처럼 저장된다.

| Terraform 명령 | 로그 stage |
| --- | --- |
| `terraform init` | `destroy` |
| `terraform apply tfplan` | `destroy` |

stdout은 `INFO`로 저장된다.

stderr는 exit code가 0이면 `WARN`, 실패면 `ERROR`로 저장된다.

각 line은 저장 전에 `maskDeploymentMessage`를 거친다.

따라서 secret으로 보이는 값은 로그에 그대로 남기지 않는다.

## 19. 안전장치 체크리스트

Destroy가 실제 AWS 삭제로 이어지기 전에 아래 조건들이 겹겹이 걸린다.

- `stateObjectKey`가 없으면 destroy plan을 만들 수 없다.
- `SUCCESS`, `FAILED/apply`, `FAILED/destroy` 상태가 아니면 destroy plan을 만들 수 없다.
- 같은 project에 다른 `RUNNING` deployment가 있으면 시작할 수 없다.
- Terraform artifact가 deployment의 project/architecture와 맞아야 한다.
- Terraform artifact content 안전 검사를 통과해야 한다.
- Failed cleanup에서는 Terraform artifact hash drift를 막는다.
- Destroy plan artifact에는 `operation: "destroy"`가 저장된다.
- Destroy summary는 기본적으로 blocked 상태로 저장된다.
- `risk_analysis`로 막힌 destroy plan은 승인할 수 없다.
- 승인 snapshot에는 artifact hash, tfplan hash, AWS account, AWS region이 저장된다.
- Destroy apply 직전에 승인 snapshot과 현재 값이 다시 비교된다.
- 승인된 tfplan hash와 다운로드한 tfplan hash가 다르면 실행하지 않는다.
- AWS account나 region이 바뀌면 실행하지 않는다.
- Destroy 성공 전에는 resources/outputs 결과를 삭제하지 않는다.

## 20. 프론트엔드 현재 범위

현재 `apps/web`의 Deployment 패널에는 cleanup destroy 흐름이 연결되어 있다.

프론트엔드는 Terraform이나 AWS SDK를 직접 실행하지 않고, backend Deployment API만 호출한다.

사용자가 화면에서 누르는 버튼 흐름은 아래와 같다.

```text
SUCCESS 또는 FAILED/apply 또는 FAILED/destroy deployment 표시
-> stateObjectKey가 있는 경우 cleanup 가능 표시
-> Cleanup Destroy Plan 실행 버튼
-> destroy plan summary 표시
-> blockedBy === missing_approval이면 승인 버튼 표시
-> 승인 후 Destroy 실행 버튼 표시
-> Destroy 확인 박스에서 실제 AWS 리소스 삭제 버튼 클릭
-> SSE logs 표시
-> DESTROYED 결과 표시
```

프론트엔드 액션 조건은 `currentPlanOperation`을 기준으로 apply plan과 destroy plan을 구분한다.

따라서 Apply 성공 후 남아 있는 apply 승인 정보를 destroy 승인으로 착각하지 않는다.

## 21. 관련 테스트 정리

Destroy 구현과 관련된 테스트는 아래 관점으로 나뉜다.

| 테스트 파일 | 확인하는 내용 |
| --- | --- |
| [terraform-runner.test.ts](../../apps/api/src/deployments/terraform-runner.test.ts) | `runTerraformDestroyPlan`이 `terraform plan -destroy -out=...` 명령을 사용하는지 확인 |
| [deployment-apply-service.test.ts](../../apps/api/src/deployments/deployment-apply-service.test.ts) | apply 실패/취소 시 partial state 저장과 warning 기록 확인 |
| [deployment-destroy-plan-service.test.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.test.ts) | state 복원, destroy plan artifact 저장, `operation: "destroy"`, 부적절한 상태 차단 확인 |
| [deployment-approval-service.test.ts](../../apps/api/src/deployments/deployment-approval-service.test.ts) | destroy approval이 실패 cleanup 상태를 보존하고 snapshot/precondition을 검증하는지 확인 |
| [deployment-destroy-service.test.ts](../../apps/api/src/deployments/deployment-destroy-service.test.ts) | 승인된 destroy plan 적용, 성공 시 결과 정리, 실패 시 `FAILED/destroy` 처리 확인 |
| route tests | destroy plan/destroy route guard, 승인 필요 조건, project running lock 확인 |
| schema/type tests 또는 typecheck | `DESTROYED`, `destroy`, plan `operation` 계약이 깨지지 않는지 확인 |

핵심 테스트 시나리오는 아래와 같이 정리할 수 있다.

- [ ] `runTerraformDestroyPlan`은 `terraform plan -destroy -input=false -no-color -out=tfplan`을 실행한다.
- [ ] Apply가 `terraform apply` 도중 실패하면 partial `terraform.tfstate` 업로드를 시도하고, 성공 시 `stateObjectKey`를 저장한다.
- [ ] `stateObjectKey`가 없는 Deployment는 destroy plan을 시작할 수 없다.
- [ ] `SUCCESS`, `FAILED/apply`, `FAILED/destroy`만 destroy plan을 시작할 수 있다.
- [ ] Destroy plan artifact는 `operation: "destroy"`로 저장되고, 승인 전에는 `blockedBy: "missing_approval"`이다.
- [ ] Destroy apply는 승인된 destroy plan hash, Terraform artifact hash, AWS account/region이 그대로일 때만 실행된다.
- [ ] Destroy 성공 시 Deployment는 `DESTROYED`가 되고 resources, outputs, state key, approval snapshot이 정리된다.

## 22. 코드 읽는 순서

Destroy 흐름을 처음 읽는다면 아래 순서가 좋다.

1. [packages/types/src/index.ts](../../packages/types/src/index.ts)
   - `DeploymentStatus`, `DeploymentStage`, `DeploymentFailureStage`, `DeploymentPlanArtifact.operation`
2. [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts)
   - `deployment_plan_operation`, `deployment_plan_artifacts.operation`, status/stage enum
3. [apps/api/src/deployments/terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts)
   - `runTerraformDestroyPlan`, `runTerraformApply`
4. [apps/api/src/deployments/deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)
   - `uploadPartialStateAfterFailedApply`
5. [apps/api/src/routes/deployments.ts](../../apps/api/src/routes/deployments.ts)
   - `/destroy/plan`, `/destroy`, route guard
6. [apps/api/src/deployments/deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts)
   - `runDeploymentDestroyPlan`
7. [apps/api/src/deployments/deployment-approval-service.ts](../../apps/api/src/deployments/deployment-approval-service.ts)
   - `approveDeploymentPlan`, `assertDeploymentDestroyPreconditions`
8. [apps/api/src/deployments/deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts)
   - `runDeploymentDestroy`
9. [apps/api/src/deployments/deployment-service.ts](../../apps/api/src/deployments/deployment-service.ts)
   - `markDeploymentDestroyRunning`, `completeDeploymentDestroy`, `failDeployment`
10. destroy 관련 test files
   - 정상, 실패, guard, approval snapshot 시나리오 확인

## 23. 현재 범위와 후속 정책

현재 구현에 포함된 범위는 아래와 같다.

1. 성공한 Deployment에 대한 명시적 cleanup destroy
2. Apply 중간 실패 후 partial state가 저장된 Deployment에 대한 명시적 cleanup destroy
3. Destroy 실패 후 새 destroy plan/approval 기반 재시도
4. `terraform plan -destroy -> 승인 -> terraform apply tfplan` 분리
5. Destroy plan artifact의 `operation` 구분
6. Approval snapshot 기반 hash/account/region 검증
7. Destroy 성공 시 RDS 결과 정리와 `DESTROYED` 상태 전환

후속 정책으로 남겨둔 범위는 아래와 같다.

1. `CANCELLED` 상태 deployment의 cleanup 재개 정책
2. Destroy plan 실패 후 재시도 정책
3. S3 state/plan artifact 보존 기간과 삭제 정책
4. 프론트엔드 cleanup 버튼과 UX 연결
5. 운영자가 AWS 콘솔에서 수동으로 바꾼 drift를 사용자에게 보여주는 상세 UX
6. Destroy 결과를 리소스별로 더 세밀하게 검증하는 후속 검증 단계

## 24. 핵심 요약

현재 destroy 구현의 핵심은 아래 한 줄이다.

```text
state가 있는 SUCCESS 또는 FAILED cleanup 대상만, destroy plan을 새로 만들고, 사용자가 승인한 뒤, 그 승인된 tfplan만 apply한다.
```

조금 더 풀면 아래와 같다.

1. Destroy는 자동 cleanup이 아니다.
2. 사용자가 명시적으로 cleanup을 실행해야 한다.
3. Destroy는 항상 `terraform plan -destroy`를 먼저 만든다.
4. Destroy plan은 항상 blocked 상태로 저장된다.
5. 사용자가 승인해야 실제 `terraform apply tfplan`이 실행된다.
6. Apply 실패 cleanup은 partial state가 저장된 경우에만 가능하다.
7. Destroy 실패 후에는 기존 승인을 재사용하지 않고 새 plan과 새 승인을 요구한다.
8. Destroy 성공 후에는 Deployment를 `DESTROYED`로 만들고 RDS 결과와 approval/state pointer를 정리한다.
