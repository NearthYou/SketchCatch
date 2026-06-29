# Plan/Apply/Destroy 실행 속도 개선 정리

이 문서는 Terraform `plan`, `apply`, `destroy plan`, `destroy apply` 실행이 느리게 느껴졌던 문제를 어떤 관점에서 봤고, 어느 코드 구간이 병목 후보였고, 이번 수정에서 무엇을 바꿨는지 정리한다.

핵심 결론은 두 가지다.

1. 실제 AWS 리소스 생성/삭제 시간 자체는 SketchCatch API 코드만으로 크게 줄일 수 없다.
2. 대신 Terraform 실행 전후의 불필요한 순차 대기와 관측 불가능성을 줄였다.

즉 이번 작업은 "EC2가 12초 걸리는 것을 2초로 줄이는" 작업이 아니다.

이번 작업은 아래에 가깝다.

```text
불필요하게 순서대로 기다리던 DB/S3/workspace 준비
-> 의존 없는 작업은 동시에 실행

Terraform 명령이 얼마나 걸렸는지 알 수 없던 상태
-> Deployment logs에 명령별 duration을 남김
```

## 1. 문제가 무엇이었나

사용자 입장에서는 `Terraform Plan 실행`, `AWS 리소스 생성`, `Cleanup Destroy Plan 실행`, `AWS 리소스 삭제`가 모두 느리게 보였다.

특히 UI에서는 실행 버튼을 누른 뒤 Deployment가 `RUNNING` 상태가 되고, 결과가 바뀔 때까지 기다려야 한다.

문제는 두 종류였다.

| 문제 | 의미 |
| --- | --- |
| 실제 실행 시간이 김 | Terraform이 AWS API를 조회하거나 EC2/VPC/S3 같은 실제 리소스를 만들고 지우는 시간 |
| 어디서 느린지 알 수 없음 | `terraform init`, `plan`, `apply`, `show -json`, `output -json` 각각이 몇 초 걸렸는지 Deployment log에 남지 않음 |

기존에는 사용자가 느리다고 느껴도, 서버 로그나 Deployment log에서 아래 질문에 답하기 어려웠다.

```text
terraform init이 느린가?
terraform plan이 느린가?
terraform apply가 느린가?
S3에서 tfplan/state를 내려받는 시간이 느린가?
DB나 AWS connection 조회가 느린가?
```

그래서 첫 번째 문제는 속도 자체였고, 두 번째 문제는 속도 문제를 볼 수 없는 상태였다.

## 2. 어디에서 문제였나

주요 병목 후보는 네 구간이었다.

| 구간 | 코드 위치 | 성격 |
| --- | --- | --- |
| Terraform 명령 실행 | [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts) | 실제 Terraform CLI 실행 시간 |
| Deployment metadata 조회 | plan/apply/destroy service | DB 조회, AWS connection 조회 |
| S3 artifact/state 복원 | plan/apply/destroy service | Terraform artifact, `tfplan`, `terraform.tfstate` 다운로드 |
| workspace 파일 쓰기 | apply/destroy service | `workspace/tfplan`, `workspace/terraform.tfstate` 쓰기 |

Terraform 명령 자체는 아래 호출에서 실행된다.

| 흐름 | Terraform 명령 |
| --- | --- |
| Plan | `terraform init`, `terraform plan`, `terraform show -json tfplan` |
| Apply | `terraform init`, `terraform apply tfplan`, `terraform output -json`, `terraform show -json` |
| Destroy Plan | `terraform init`, `terraform plan -destroy`, `terraform show -json tfplan` |
| Destroy Apply | `terraform init`, `terraform apply tfplan` |

이번 수정 전에는 이 명령들이 끝난 뒤 stdout/stderr는 로그에 남겼지만, 명령별 소요 시간은 결과 타입에도 없고 Deployment log에도 없었다.

## 3. 수정 전 수치

수정 전 수치는 두 층으로 나눠야 한다.

### 3.1 실제 AWS E2E 실측치

수정 전 실제 AWS E2E 기준의 명령별 실측치는 없었다.

이유는 기존 `TerraformRunResult`에 `durationMs`가 없었고, Deployment log에도 duration log가 없었기 때문이다.

수정 전 관측 가능 수치는 아래와 같았다.

| 항목 | 수정 전 |
| --- | --- |
| Terraform command duration 필드 | 0개 |
| Deployment log의 duration line | 0개 |
| Plan/Apply/Destroy 명령별 시간 확인 가능 여부 | 불가능 |
| 사용자가 느린 구간을 구분할 수 있는 정도 | stdout/stderr를 눈으로 추정 |

따라서 "수정 전 plan이 정확히 몇 초였고 수정 후 몇 초가 됐다"는 AWS 실측 비교표는 아직 만들 수 없다.

이번 수정으로 이후 실행부터는 아래처럼 로그가 남기 때문에 다음 실측부터 비교가 가능해진다.

```text
[duration] terraform init completed in 1.2s
[duration] terraform plan -destroy completed in 3.8s
[duration] terraform apply tfplan completed in 14.1s
```

### 3.2 구조상 순차 대기 수치

수정 전에는 서로 의존하지 않는 작업도 순서대로 기다리는 구간이 있었다.

예를 들어 Apply에서는 아래 작업들이 순차였다.

```text
Terraform artifact 조회
-> current plan artifact 조회
-> AWS connection 조회
-> tfplan S3 다운로드
-> Terraform workspace 준비
```

하지만 이 중 일부는 서로 결과에 의존하지 않는다.

그래서 수정 전/후를 "독립 작업 대기 그룹 수"로 보면 아래처럼 줄었다.

| 흐름 | 수정 전 독립 대기 | 수정 후 병렬 그룹 | 감소율 |
| --- | ---: | ---: | ---: |
| Plan 준비 일부 | 4개 | 2개 | 50% 감소 |
| Apply 준비 일부 | 5개 | 2개 | 60% 감소 |
| Destroy Plan 준비 일부 | 5개 | 2개 | 60% 감소 |
| Destroy Apply 준비 일부 | 8개 | 3개 | 62.5% 감소 |

여기서 감소율은 전체 Deployment 실행 시간 감소율이 아니다.

이 수치는 "우리가 병렬화한 준비 구간" 안에서만 의미가 있다.

실제 전체 시간은 아래 식에 더 가깝다.

```text
전체 시간 =
  준비 구간
+ terraform init
+ terraform plan/apply/destroy
+ terraform show/output
+ S3 업로드
+ DB 저장
```

따라서 AWS가 실제로 EC2를 만드는 시간이 길면 전체 체감 개선폭은 작아질 수 있다.

## 4. 수정 과정

### 4.1 Terraform 명령 소요 시간 측정 추가

먼저 `terraform-runner.ts`에서 모든 Terraform command 실행 결과에 `durationMs`를 추가했다.

관련 코드:

- [TerraformRunResult.durationMs](../../apps/api/src/deployments/terraform-runner.ts#L19)
- [cancelled 결과 duration](../../apps/api/src/deployments/terraform-runner.ts#L145)
- [spawn error 결과 duration](../../apps/api/src/deployments/terraform-runner.ts#L226)
- [close 결과 duration](../../apps/api/src/deployments/terraform-runner.ts#L245)
- [elapsedSince](../../apps/api/src/deployments/terraform-runner.ts#L253)

수정 전:

```ts
export type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};
```

수정 후:

```ts
export type TerraformRunResult = {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  timedOut: boolean;
  cancelled?: boolean;
};
```

`performance.now()`를 사용해서 command 시작 시각을 잡고, command가 취소되거나 실패하거나 정상 종료될 때 모두 elapsed time을 기록한다.

### 4.2 Deployment log에 duration line 추가

Terraform 결과 타입에 시간이 생겨도 사용자와 운영자가 볼 수 없으면 의미가 없다.

그래서 공통 helper를 추가했다.

관련 코드:

- [deployment-duration-logs.ts](../../apps/api/src/deployments/deployment-duration-logs.ts)
- [appendTerraformDurationLog](../../apps/api/src/deployments/deployment-duration-logs.ts#L9)
- [formatDuration](../../apps/api/src/deployments/deployment-duration-logs.ts#L42)

이 helper는 Terraform stdout/stderr를 저장한 뒤, 이어서 duration line을 하나 더 저장한다.

예시:

```text
[duration] terraform init completed in 812ms
[duration] terraform apply tfplan completed in 12.4s
```

duration이 없는 fake result나 과거 테스트 fixture에서는 아무 로그도 추가하지 않고 기존 sequence를 그대로 반환한다.

이렇게 해서 테스트용 mock 결과가 깨지지 않도록 했다.

### 4.3 Plan 준비 구간 병렬화

Plan service에서는 Terraform artifact 조회와 AWS connection 조회가 서로 독립이다.

수정 전에는 순서대로 기다렸다.

```text
Terraform artifact 조회
-> AWS connection 조회
```

수정 후에는 병렬로 기다린다.

관련 코드:

- [artifact/awsConnection 병렬 조회](../../apps/api/src/deployments/deployment-plan-service.ts#L132-L135)

또한 architecture 조회와 Terraform workspace 준비도 서로 독립이다.

수정 전:

```text
Architecture 조회
-> Terraform workspace 준비
```

수정 후:

```text
Architecture 조회
Terraform workspace 준비
-> 둘 다 끝나면 다음 단계
```

관련 코드:

- [architecture/workspace 병렬 준비](../../apps/api/src/deployments/deployment-plan-service.ts#L152-L158)

Plan에서 duration log를 붙인 곳:

- [Plan stdout/stderr 이후 duration log](../../apps/api/src/deployments/deployment-plan-service.ts#L675-L684)
- [terraform show -json duration log](../../apps/api/src/deployments/deployment-plan-service.ts#L703-L712)

### 4.4 Apply 준비 구간 병렬화

Apply service에서는 다음 세 조회가 독립이다.

```text
Terraform artifact 조회
current plan artifact 조회
AWS connection 조회
```

수정 후 하나의 `Promise.all`로 묶었다.

관련 코드:

- [Apply metadata 병렬 조회](../../apps/api/src/deployments/deployment-apply-service.ts#L132-L136)

그리고 approved `tfplan` S3 다운로드와 Terraform workspace 준비도 서로 독립이다.

수정 전:

```text
tfplan S3 다운로드
-> Terraform workspace 준비
```

수정 후:

```text
tfplan S3 다운로드
Terraform workspace 준비
-> 둘 다 끝나면 precondition 검증
```

관련 코드:

- [tfplan 다운로드/workspace 병렬 준비](../../apps/api/src/deployments/deployment-apply-service.ts#L137-L147)

또 하나의 작은 개선으로, 이미 Buffer인 `planBuffer`를 다시 `Buffer.from(planBuffer)`로 복사하지 않게 했다.

관련 코드:

- [writePlanFile에 planBuffer 직접 전달](../../apps/api/src/deployments/deployment-apply-service.ts#L182)

Apply에서 duration log를 붙인 곳:

- [Apply stdout 이후 duration log](../../apps/api/src/deployments/deployment-apply-service.ts#L605-L614)
- [Apply stderr 이후 duration log](../../apps/api/src/deployments/deployment-apply-service.ts#L633-L642)

### 4.5 Destroy Plan 준비 구간 병렬화

Destroy Plan service에서도 다음 조회가 독립이다.

```text
Terraform artifact 조회
current plan artifact 조회
AWS connection 조회
```

수정 후 하나의 `Promise.all`로 묶었다.

관련 코드:

- [Destroy Plan metadata 병렬 조회](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L140-L145)

또한 Terraform workspace 준비와 기존 `terraform.tfstate` S3 다운로드도 독립이다.

수정 전:

```text
Terraform workspace 준비
-> state S3 다운로드
```

수정 후:

```text
Terraform workspace 준비
state S3 다운로드
-> 둘 다 끝나면 workspace/terraform.tfstate 쓰기
```

관련 코드:

- [workspace/state 병렬 준비](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L147-L156)

Destroy Plan에서 duration log를 붙인 곳:

- [Destroy Plan stdout/stderr 이후 duration log](../../apps/api/src/deployments/deployment-destroy-plan-service.ts#L628-L637)

### 4.6 Destroy Apply 준비 구간 병렬화

Destroy Apply service는 준비 작업이 가장 많았다.

수정 전에는 아래 작업들이 더 많이 순차로 묶여 있었다.

```text
Terraform artifact 조회
-> current destroy plan artifact 조회
-> AWS connection 조회
-> tfplan S3 다운로드
-> Terraform workspace 준비
-> state S3 다운로드
-> workspace/terraform.tfstate 쓰기
-> workspace/tfplan 쓰기
```

수정 후에는 세 그룹으로 줄였다.

```text
1. metadata 병렬 조회
   - Terraform artifact
   - current destroy plan artifact
   - AWS connection

2. artifact/state/workspace 병렬 준비
   - tfplan S3 다운로드
   - Terraform workspace 준비
   - state S3 다운로드

3. workspace 파일 병렬 쓰기
   - workspace/terraform.tfstate
   - workspace/tfplan
```

관련 코드:

- [Destroy metadata 병렬 조회](../../apps/api/src/deployments/deployment-destroy-service.ts#L119-L123)
- [tfplan/workspace/state 병렬 준비](../../apps/api/src/deployments/deployment-destroy-service.ts#L124-L137)
- [state/tfplan 병렬 쓰기](../../apps/api/src/deployments/deployment-destroy-service.ts#L156-L159)

Destroy Apply에서도 `planBuffer`를 다시 복사하지 않고 그대로 쓴다.

관련 코드:

- [writePlanFile에 planBuffer 직접 전달](../../apps/api/src/deployments/deployment-destroy-service.ts#L158)

Destroy Apply에서 duration log를 붙인 곳:

- [Destroy stdout/stderr 이후 duration log](../../apps/api/src/deployments/deployment-destroy-service.ts#L430-L439)

## 5. 무엇을 고쳤나

이번 수정에서 고친 것은 크게 네 가지다.

| 수정 | 내용 |
| --- | --- |
| 명령 시간 측정 | `TerraformRunResult.durationMs` 추가 |
| 사용자/운영자 가시성 | Deployment log에 `[duration] ... completed in ...` 저장 |
| 준비 구간 병렬화 | 독립 DB/S3/workspace 작업을 `Promise.all`로 병렬 실행 |
| 불필요한 메모리 복사 제거 | `Buffer.from(planBuffer)` 제거 |

## 6. 수치 개선 요약

### 6.1 관측 가능성 개선

| 항목 | 수정 전 | 수정 후 | 변화 |
| --- | ---: | ---: | ---: |
| Terraform command duration 결과 필드 | 0개 | 1개 `durationMs` | 추가 |
| Deployment flow의 Terraform command duration log | 0/12 | 12/12 | 0% -> 100% |
| 사용자가 명령별 소요시간을 확인 가능 | 불가능 | 가능 | 개선 |

여기서 12개는 Plan 3개, Apply 4개, Destroy Plan 3개, Destroy Apply 2개 명령을 합친 수다.

```text
Plan: init, plan, show-json
Apply: init, apply, output-json, show-state-json
Destroy Plan: init, plan-destroy, show-json
Destroy Apply: init, apply tfplan
```

### 6.2 서버 준비 구간 병렬화 개선

| 흐름 | 수정 전 | 수정 후 | 개선 의미 |
| --- | ---: | ---: | --- |
| Plan 준비 일부 | 4 independent waits | 2 parallel groups | 구조상 50% 감소 |
| Apply 준비 일부 | 5 independent waits | 2 parallel groups | 구조상 60% 감소 |
| Destroy Plan 준비 일부 | 5 independent waits | 2 parallel groups | 구조상 60% 감소 |
| Destroy Apply 준비 일부 | 8 independent waits | 3 parallel groups | 구조상 62.5% 감소 |

이 표는 전체 실행 시간 감소율이 아니라 "이번에 병렬화한 준비 구간"의 순차 대기 수 감소율이다.

실제 시간 효과는 각 작업의 시간이 얼마나 걸리는지에 따라 달라진다.

예를 들어 두 작업을 병렬화하면 아래처럼 바뀐다.

```text
수정 전: A + B
수정 후: max(A, B)
줄어드는 시간: min(A, B)
```

세 작업이면 아래처럼 바뀐다.

```text
수정 전: A + B + C
수정 후: max(A, B, C)
줄어드는 시간: A + B + C - max(A, B, C)
```

따라서 S3 다운로드가 300ms, workspace 준비가 500ms라면 해당 구간은 대략 아래처럼 줄 수 있다.

```text
수정 전: 300ms + 500ms = 800ms
수정 후: max(300ms, 500ms) = 500ms
개선: 300ms 감소
```

하지만 Terraform apply가 실제 AWS 리소스를 만드는 데 20초 걸린다면, 전체 체감 개선은 20초 중 일부 준비 시간만 줄어드는 수준이다.

## 7. 검증 결과

이번 변경 후 확인한 내용은 아래와 같다.

| 검증 | 결과 |
| --- | --- |
| `apps/api` typecheck | 통과 |
| `apps/api` eslint | 통과 |
| Deployment 관련 테스트 20개 | 통과 |
| `apps/api` build | 통과 |
| API 전체 테스트 357개 | 통과 |

테스트에서 추가로 확인한 부분:

- [terraform-runner.test.ts](../../apps/api/src/deployments/terraform-runner.test.ts#L67)에서 result에 `durationMs`가 생기는지 확인
- [terraform-runner.test.ts](../../apps/api/src/deployments/terraform-runner.test.ts#L92)에서 destroy plan 실행 결과에도 `durationMs`가 생기는지 확인

주의할 점은 API 전체 테스트의 ms 값은 fake repository, fake storage, fake Terraform runner가 섞인 단위/시나리오 테스트 시간이다.

따라서 "실제 AWS 배포가 몇 초 빨라졌다"는 수치로 쓰면 안 된다.

실제 배포 시간 개선은 다음 실제 Deployment 실행 후 `[duration]` 로그를 기준으로 비교해야 한다.

## 8. 이 방식의 한계

### 8.1 AWS 리소스 생성/삭제 시간은 줄이지 못한다

`terraform apply tfplan`이 EC2, VPC, Subnet, Internet Gateway, Route Table, Security Group, S3 Bucket을 실제로 생성하거나 삭제하는 시간은 AWS와 Terraform provider가 결정한다.

이번 수정은 그 시간을 직접 줄이지 않는다.

예를 들어 EC2 생성이 12초 걸리면, 서버 준비 구간을 500ms 줄여도 전체 체감은 여전히 10초 이상이다.

### 8.2 Terraform plan의 AWS refresh 시간은 그대로다

Terraform plan은 실제 AWS 상태를 조회할 수 있다.

provider plugin cache가 있더라도 AWS API 조회 시간은 줄어들지 않는다.

`-refresh=false` 같은 옵션을 쓰면 빨라질 수는 있지만, 실제 AWS 상태와 plan의 정확성이 떨어질 수 있다.

그래서 이번 수정에는 넣지 않았다.

### 8.3 workspace 재사용은 하지 않았다

속도만 보면 `.terraform` 디렉터리나 workspace를 재사용하고 싶을 수 있다.

하지만 현재 Deployment 실행은 격리된 임시 workspace를 만들고 실행 후 cleanup하는 구조다.

이 구조는 아래 장점이 있다.

1. deployment 간 파일 오염을 막는다.
2. 이전 실행의 state나 plan이 섞일 위험을 줄인다.
3. cleanup 실패를 제외하면 임시 파일이 오래 남지 않는다.

workspace 재사용은 성능에는 도움이 될 수 있지만, state/plan 격리와 보안 검증을 다시 설계해야 한다.

이번 수정에서는 안전한 범위의 병렬화만 적용했다.

### 8.4 S3 업로드/DB 저장 시간은 아직 명령별 duration처럼 분리해 남기지 않는다

이번 duration log는 Terraform command 중심이다.

아직 아래 단계는 별도 duration log로 남기지 않는다.

```text
S3 tfplan upload
S3 state upload
repository.saveDeploymentPlan
repository.completeDeploymentApply
repository.completeDeploymentDestroy
AWS STS AssumeRole 준비
```

정확한 병목 분석을 더 하려면 이 단계에도 duration log를 추가해야 한다.

### 8.5 병렬화는 의존성이 없는 작업에만 가능하다

모든 작업을 병렬로 만들 수는 없다.

예를 들어 아래 작업은 순서가 중요하다.

```text
tfplan 다운로드
-> tfplan hash 계산
-> approval snapshot과 hash 비교
-> 승인된 plan만 apply
```

또 아래 작업도 순서가 중요하다.

```text
terraform apply 성공
-> terraform output -json
-> terraform show -json
-> state upload
-> completeDeploymentApply
```

이 순서를 무리하게 섞으면 속도는 빨라질 수 있어도 안전성이 깨진다.

## 9. 앞으로 실제 수치를 쌓는 방법

이번 수정 후부터는 실제 Deployment log에서 Terraform 명령별 시간이 보인다.

실제 배포를 한 번 실행한 뒤 아래 항목을 기록하면 된다.

| 항목 | 확인할 로그 |
| --- | --- |
| init 시간 | `[duration] terraform init completed in ...` |
| plan 시간 | `[duration] terraform plan completed in ...` |
| destroy plan 시간 | `[duration] terraform plan -destroy completed in ...` |
| apply 시간 | `[duration] terraform apply tfplan completed in ...` |
| output 수집 시간 | `[duration] terraform output -json completed in ...` |
| state inspection 시간 | `[duration] terraform show -json completed in ...` |

이 로그를 기준으로 다음 결정을 할 수 있다.

| 로그 결과 | 다음 판단 |
| --- | --- |
| `terraform init`이 계속 느림 | provider cache/warm-up 상태 확인 |
| `terraform plan`이 느림 | AWS refresh/API 조회 비용 의심 |
| `terraform apply tfplan`이 느림 | 실제 AWS 리소스 생성 시간으로 봐야 함 |
| `terraform show -json`이 느림 | state 크기 또는 provider/state parsing 비용 확인 |
| Terraform 명령은 빠른데 전체 UI가 느림 | S3 업로드/DB 저장/프론트 polling 또는 SSE 확인 |

## 10. 요약

이번 수정은 Plan/Apply/Destroy의 전체 실행 시간을 마법처럼 줄인 작업이 아니다.

대신 아래 두 가지를 해결했다.

```text
1. 불필요하게 순서대로 기다리던 준비 작업을 병렬화했다.
2. Terraform 명령별 소요 시간을 Deployment log에서 볼 수 있게 했다.
```

수치로 보면 아래와 같다.

```text
Terraform command duration 관측: 0/12 -> 12/12
Plan 준비 일부 순차 대기: 4 -> 2
Apply 준비 일부 순차 대기: 5 -> 2
Destroy Plan 준비 일부 순차 대기: 5 -> 2
Destroy Apply 준비 일부 순차 대기: 8 -> 3
```

실제 AWS 기준의 초 단위 개선폭은 다음 live Deployment 실행 후 `[duration]` 로그를 모아야 확정할 수 있다.

이번 변경은 그 실측을 가능하게 만드는 기반 작업이기도 하다.
