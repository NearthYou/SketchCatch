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

## 11. 변경 이력

이 아래부터는 기존 1차 속도 개선 내용과 섞지 않고, 이후에 추가로 진행한 성능 개선을 시간순으로 기록한다.

### 2026-06-29 2차 개선: Terraform init 반복 비용 줄이기

#### 문제

실제 Deployment 실행 로그에서 `terraform init`가 매 단계마다 17~20초 정도 걸리는 것이 확인됐다.

첨부 로그 기준 수정 전 `terraform init` 시간은 아래와 같았다.

| 흐름 | 수정 전 init 시간 |
| --- | ---: |
| Plan | 18.0s |
| Apply | 17.3s |
| Destroy Plan | 18.8s |
| Destroy Apply | 20.1s |

로그에는 아래 메시지가 반복해서 나타났다.

```text
Finding hashicorp/aws versions matching "~> 5.0"...
Installing hashicorp/aws v5.100.0...
Terraform has created a lock file .terraform.lock.hcl
```

즉, Plan에서 provider를 한 번 결정했는데도 Apply, Destroy Plan, Destroy Apply에서 다시 새 workspace를 만들고 같은 provider 설치/lock 생성 과정을 반복하고 있었다.

#### 원인

1. SketchCatch는 안전을 위해 Deployment 실행마다 임시 Terraform workspace를 만들고, 실행 후 cleanup한다.
2. 따라서 `terraform init`가 만든 `.terraform.lock.hcl`이 다음 단계로 이어지지 않았다.
3. `TF_PLUGIN_CACHE_DIR`가 있더라도 lock file이 없으면 Terraform이 provider version 선택과 lock 생성을 다시 수행한다.
4. 기존 `provider-warmup.tf`는 `hashicorp/aws` source만 지정하고 `~> 5.0` version 제약을 지정하지 않아, 실제 생성 Terraform artifact와 같은 provider major version warmup을 보장하지 못했다.

#### 수정 내용

`terraform init` 성공 직후 workspace의 `.terraform.lock.hcl`을 S3에 저장하고, 다음 plan/apply/destroy 실행 전에 같은 Deployment scope의 lock file을 workspace에 복원하도록 했다.

S3 object key는 Deployment 단위로 고정했다.

```text
deployments/{deploymentId}/terraform/.terraform.lock.hcl
```

이 lock file은 성능 최적화용 artifact다. 누락되거나 다운로드/업로드에 실패해도 Deployment 자체를 실패시키지 않고, Terraform이 기존처럼 init을 다시 수행하게 둔다.

#### 변경 파일

| 파일 | 변경 내용 |
| --- | --- |
| [terraform-lock-file-storage.ts](../../apps/api/src/deployments/terraform-lock-file-storage.ts) | `.terraform.lock.hcl` S3 업로드/다운로드 저장소 추가 |
| [terraform-lock-file-workspace.ts](../../apps/api/src/deployments/terraform-lock-file-workspace.ts) | workspace에 lock file을 복원하고 init 후 다시 업로드하는 helper 추가 |
| [deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts) | Plan init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | Apply init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts) | Destroy Plan init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts) | Destroy Apply init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-artifact-security.ts](../../apps/api/src/deployments/deployment-artifact-security.ts) | `terraform-lock` artifact kind와 object key 검증 추가 |
| [deployment-plan-artifact-storage.ts](../../apps/api/src/deployments/deployment-plan-artifact-storage.ts) | plan artifact storage에서 lock file storage capability 제공 |
| [deployment-apply-artifact-storage.ts](../../apps/api/src/deployments/deployment-apply-artifact-storage.ts) | apply artifact storage에서 lock file storage capability 제공 |
| [terraform-plugin-cache-warmup.ts](../../apps/api/src/deployments/terraform-plugin-cache-warmup.ts) | warmup provider 제약을 `hashicorp/aws` `~> 5.0`으로 정렬 |

#### 기대 효과

다음 실행부터는 아래 구간이 매 단계 반복되지 않는지 확인한다.

```text
Installing hashicorp/aws v5.100.0...
Terraform has created a lock file .terraform.lock.hcl
```

#### 실측 결과

지난번 로그를 수정 전 기준으로, 이번 로그를 수정 후 기준으로 놓고 비교했다.

수정 후 live Deployment를 다시 실행한 결과, 첫 Plan init은 여전히 provider를 설치했지만 Apply 이후 단계에서는 lock file과 shared cache를 재사용했다.

첫 Plan init 로그:

```text
Installing hashicorp/aws v5.100.0...
Terraform has created a lock file .terraform.lock.hcl
[duration] terraform init completed in 20.9s
```

Apply 이후 init 로그:

```text
Reusing previous version of hashicorp/aws from the dependency lock file
Using hashicorp/aws v5.100.0 from the shared cache directory
[duration] terraform init completed in 4.5s
```

Destroy Plan과 Destroy Apply에서도 같은 재사용 흐름이 확인됐다.

```text
Reusing previous version of hashicorp/aws from the dependency lock file
Using hashicorp/aws v5.100.0 from the shared cache directory
Using previously-installed hashicorp/aws v5.100.0
```

실측 init 시간 비교는 아래와 같다.

| 흐름 | 수정 전 init | 수정 후 init | 변화 |
| --- | ---: | ---: | ---: |
| Plan | 18.0s | 20.9s | 2.9s 증가 |
| Apply | 17.3s | 4.5s | 12.8s 감소 |
| Destroy Plan | 18.8s | 5.3s | 13.5s 감소 |
| Destroy Apply | 20.1s | 6.4s | 13.7s 감소 |

첫 Plan은 해당 Deployment의 첫 실행이라 lock/cache 효과를 받지 못했다. 대신 Apply 이후 세 단계의 init 합계는 아래처럼 줄었다.

```text
수정 전 Apply 이후 init 합계: 17.3s + 18.8s + 20.1s = 56.2s
수정 후 Apply 이후 init 합계: 4.5s + 5.3s + 6.4s = 16.2s
감소: 40.0s, 약 71.2%
```

첫 Plan까지 포함한 전체 init 합계도 줄었다.

```text
수정 전 전체 init 합계: 74.2s
수정 후 전체 init 합계: 37.1s
감소: 37.1s, 약 50.0%
```

전체 Terraform command 시간 비교는 아래와 같다.

| 단계 | 명령 | 수정 전 | 수정 후 | 변화 |
| --- | --- | ---: | ---: | ---: |
| Plan | `terraform init` | 18.0s | 20.9s | 2.9s 증가 |
| Plan | `terraform plan` | 5.2s | 5.2s | 변화 없음 |
| Plan | `terraform show -json` | 2.9s | 2.9s | 변화 없음 |
| Apply | `terraform init` | 17.3s | 4.5s | 12.8s 감소 |
| Apply | `terraform apply tfplan` | 38.9s | 39.1s | 0.2s 증가 |
| Apply | `terraform output -json` | 1.2s | 1.2s | 변화 없음 |
| Apply | `terraform show -json` | 4.0s | 4.3s | 0.3s 증가 |
| Destroy Plan | `terraform init` | 18.8s | 5.3s | 13.5s 감소 |
| Destroy Plan | `terraform plan -destroy` | 7.1s | 7.2s | 0.1s 증가 |
| Destroy Plan | `terraform show -json` | 3.0s | 3.0s | 변화 없음 |
| Destroy Apply | `terraform init` | 20.1s | 6.4s | 13.7s 감소 |
| Destroy Apply | `terraform apply tfplan` | 45.7s | 55.8s | 10.1s 증가 |

단계별 소계는 아래와 같다.

| 흐름 | 수정 전 | 수정 후 | 변화 |
| --- | ---: | ---: | ---: |
| Plan 전체 | 26.1s | 29.0s | 2.9s 증가 |
| Apply 전체 | 61.4s | 49.1s | 12.3s 감소 |
| Destroy Plan 전체 | 28.9s | 15.5s | 13.4s 감소 |
| Destroy Apply 전체 | 65.8s | 62.2s | 3.6s 감소 |

전체 Terraform command 합계는 아래처럼 줄었다.

```text
수정 전 전체 Terraform command 합계: 182.2s
수정 후 전체 Terraform command 합계: 155.8s
감소: 26.4s, 약 14.5%
```

init만 따로 보면 개선폭이 더 크다.

```text
수정 전 init 합계: 74.2s
수정 후 init 합계: 37.1s
감소: 37.1s, 약 50.0%
```

반대로 init 외 Terraform command 시간은 이번 로그에서 늘었다.

```text
수정 전 init 외 command 합계: 108.0s
수정 후 init 외 command 합계: 118.7s
증가: 10.7s
```

주된 이유는 `terraform apply tfplan`로 실행한 destroy apply가 지난번 45.7s에서 이번 55.8s로 10.1s 늘었기 때문이다.

따라서 이번 수정은 `terraform init` 반복 비용을 줄이는 데는 효과가 있었다. 전체 시간도 26.4s 줄었지만, 실제 AWS 리소스 생성/삭제 구간의 변동성이 있어서 init 감소분이 그대로 전체 감소분이 되지는 않았다.

#### 실행 중 주의할 점

이번 변경은 Terraform 실행의 정합성을 바꾸는 기능이 아니라, init 준비물을 재사용하는 성능 최적화다.

정상 케이스에서는 문제가 생길 가능성이 낮다. 이유는 아래와 같다.

1. `.terraform.lock.hcl` 복원/저장은 best-effort로 동작한다.
2. lock file 다운로드나 업로드가 실패해도 Deployment를 실패시키지 않는다.
3. lock file이 없으면 Terraform이 기존처럼 provider version을 다시 선택하고 init을 수행한다.
4. lock file object key는 `deploymentId` 단위로 고정되어 다른 Deployment와 섞이지 않는다.
5. 저장하는 lock file에는 provider version/checksum 정보만 있고 AWS credential이나 Terraform state 값은 들어가지 않는다.

다만 아래 상황에서는 실행 중 문제가 생기거나 기대한 성능 개선이 안 나올 수 있다.

| 주의 지점 | 영향 | 대응 |
| --- | --- | --- |
| `TF_PLUGIN_CACHE_DIR`가 없거나 API 프로세스가 쓸 수 없음 | shared cache를 못 써서 init이 다시 느려질 수 있음 | API 컨테이너에 writable volume으로 cache directory mount 확인 |
| S3 lock file 다운로드/업로드가 느림 | init 전에 작은 S3 I/O가 추가되어 약간의 대기 발생 | lock file은 작으므로 보통 작지만, S3 지연이 반복되면 별도 duration log 추가 검토 |
| 같은 Deployment에서 Terraform provider version 제약이 바뀜 | 기존 lock file이 새 constraint와 맞지 않아 `terraform init` 실패 가능 | provider constraint 변경 기능이 생기면 lock key를 Terraform artifact hash 단위로 분리하거나 init 재시도 정책 추가 |
| lock/cache 실패가 조용히 무시됨 | 실행은 계속되지만 왜 다시 느려졌는지 로그만으로 바로 알기 어려움 | 필요하면 lock restore/upload 실패를 WARN이 아닌 debug/metric으로 남기는 후속 개선 검토 |
| 첫 Plan 실행 | 아직 lock file이 없어서 provider 설치 시간이 그대로 발생 | 첫 실행은 warmup/cache 상태에 의존하고, 이후 단계부터 개선 확인 |

현재 실측 로그에서는 Apply, Destroy Plan, Destroy Apply에서 lock/cache 재사용이 확인됐으므로 이번 변경 자체는 의도대로 동작했다.

#### 검증 결과

| 검증 | 결과 |
| --- | --- |
| `apps/api` typecheck | 통과 |
| `apps/api` eslint | 통과 |
| lock file storage/workspace + deployment 관련 대상 테스트 30개 | 통과 |
| API 전체 테스트 364개 | 통과 |
| `apps/api` build | 통과 |
| `git diff --check` | 통과 |

#### 한계

이 방식은 반복 `terraform init` 비용을 줄이기 위한 최적화다. 아래 시간은 줄이지 못한다.

```text
첫 Deployment에서 provider를 처음 내려받는 시간
terraform plan의 AWS refresh/API 조회 시간
terraform apply tfplan의 실제 리소스 생성/삭제 시간
terraform show -json의 state parsing 시간
```

또한 서버의 `TF_PLUGIN_CACHE_DIR`가 컨테이너 재시작 뒤에도 유지되는 volume으로 mount되어 있지 않거나, API 프로세스가 cache directory에 쓸 권한이 없으면 효과가 작아진다.

Provider version 제약을 바꾸거나 Terraform artifact의 provider 구성이 바뀌는 경우에도 lock/cache 재사용 효과는 줄어든다.

### 2026-06-29 3차 개선: 첫 Plan prewarm과 비-Terraform duration 계측

#### 작업 범위

이번 단계에서는 이전에 검토했던 1순위 개선안은 제외했다.

진행한 작업은 아래 2개다.

1. Deployment 생성 직후 `terraform init` prewarm을 실행해서 첫 Plan 전에 `.terraform.lock.hcl`을 만들고 S3에 저장한다.
2. Terraform CLI 밖에서 발생하는 S3 업로드, DB 저장, 상태 저장 구간에도 duration log를 남긴다.

#### 문제

2차 개선에서는 Apply, Destroy Plan, Destroy Apply의 `terraform init` 반복 비용은 크게 줄었지만 첫 Plan은 여전히 느렸다.

첫 Plan을 누르기 전에는 아직 해당 Deployment의 `.terraform.lock.hcl`이 없다. 그래서 첫 Plan의 `terraform init`은 provider version 탐색과 lock file 생성을 그대로 수행했다.

또 다른 문제는 Terraform command 시간은 보이기 시작했지만, Terraform 밖의 시간이 여전히 불투명했다는 점이다.

예를 들면 아래 구간은 실제로 시간이 걸릴 수 있는데, 이전 로그만으로는 얼마나 걸리는지 알 수 없었다.

```text
terraform plan artifact upload
deployment plan save
terraform state upload
deployment apply result save
deployment destroy result save
```

#### 수정 내용

Deployment 생성 직후 frontend에서 `/deployments/:deploymentId/init`을 호출하도록 했다.

이 init은 AWS 리소스를 생성하지 않는다. Terraform provider 준비와 lock file 생성만 수행한다. 실패하더라도 Deployment 생성 자체는 유지되며, 이후 첫 Plan에서 기존 흐름대로 다시 init을 수행할 수 있다.

관련 코드:

- [DeploymentPanel.tsx](../../apps/web/features/workspace/DeploymentPanel.tsx)
- [deployment-init-service.ts](../../apps/api/src/deployments/deployment-init-service.ts)

`runDeploymentInit` 성공 시에는 workspace의 `.terraform.lock.hcl`을 S3에 저장한다.

```text
deployments/{deploymentId}/terraform/.terraform.lock.hcl
```

비-Terraform duration 계측은 공통 helper로 분리했다.

관련 코드:

- [deployment-duration-logs.ts](../../apps/api/src/deployments/deployment-duration-logs.ts)
- [deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts)
- [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts)
- [deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts)
- [deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts)

추가된 로그 예시는 아래와 같다.

```text
[duration] terraform lock file upload completed in 12ms
[duration] terraform plan artifact upload completed in 38ms
[duration] deployment plan save completed in 21ms
[duration] terraform state upload completed in 44ms
[duration] deployment apply result save completed in 18ms
[duration] deployment destroy result save completed in 15ms
```

#### 기대 효과

첫 Plan의 `terraform init`도 prewarm이 먼저 끝난 경우에는 lock file을 재사용할 수 있다.

기존에는 첫 Plan에서 아래 메시지가 나왔다.

```text
Finding hashicorp/aws versions matching "~> 5.0"...
Installing hashicorp/aws v5.100.0...
Terraform has created a lock file .terraform.lock.hcl
```

prewarm이 성공하면 첫 Plan에서도 아래 흐름으로 바뀔 수 있다.

```text
Reusing previous version of hashicorp/aws from the dependency lock file
Using hashicorp/aws v5.100.0 from the shared cache directory
```

다만 이 효과는 사용자가 Deployment 생성 직후 바로 Plan을 누르지 않고, init prewarm이 먼저 끝난 경우에 가장 잘 나타난다.

또한 이제 전체 시간을 아래처럼 나눠서 볼 수 있다.

```text
Terraform command 시간
S3 artifact/state upload 시간
DB 저장 시간
```

따라서 다음 병목이 `terraform apply tfplan`인지, S3인지, DB인지 로그만 보고 분리할 수 있다.

#### 한계와 주의점

이 방식은 AWS 리소스 생성/삭제 자체를 빠르게 만들지는 않는다.

`terraform apply tfplan`에서 EC2, VPC, Subnet, Route Table, Security Group, S3 Bucket을 실제로 만들거나 지우는 시간은 여전히 AWS와 Terraform provider가 결정한다.

prewarm도 best-effort다.

```text
Deployment 생성 성공
-> init prewarm 요청
-> init 성공 시 lock file 저장
-> init 실패 시 기존 첫 Plan 흐름으로 fallback
```

즉, prewarm 실패 때문에 Deployment 생성이 실패하지는 않는다. 대신 첫 Plan에서 다시 차가운 init 비용이 발생할 수 있다.

비-Terraform duration log도 성공한 작업만 기록한다.

S3 업로드나 DB 저장이 실패하면 기존 failure/warning 흐름으로 넘어가며, 실패 작업의 duration은 별도로 남기지 않는다. 실패 duration까지 필요하면 `runLoggedDeploymentOperation`에 실패 duration 기록 정책을 추가해야 한다.

#### 검증 결과

| 검증 | 결과 |
| --- | --- |
| `corepack pnpm --filter @sketchcatch/api typecheck` | 통과 |
| `corepack pnpm --filter @sketchcatch/web typecheck` | 통과 |
| deployment init/plan/apply/destroy service 테스트 25개 | 통과 |
| workspace api/deployment-actions 테스트 26개 | 통과 |

초기 문서 작성 시점에는 실제 AWS E2E 재측정을 하지 않았다. 이후 3차 개선 상태로 live Deployment를 다시 실행했고, 아래처럼 실측값을 추가로 확보했다.

다음 실제 측정에서는 아래 항목을 이전 2차 측정값과 비교하면 된다.

| 항목 | 확인할 로그 |
| --- | --- |
| 첫 Plan init 개선 여부 | `[duration] terraform init completed in ...` |
| lock upload 시간 | `[duration] terraform lock file upload completed in ...` |
| tfplan S3 업로드 시간 | `[duration] terraform plan artifact upload completed in ...` 또는 `[duration] terraform destroy plan artifact upload completed in ...` |
| DB plan 저장 시간 | `[duration] deployment plan save completed in ...` 또는 `[duration] deployment destroy plan save completed in ...` |
| state S3 업로드 시간 | `[duration] terraform state upload completed in ...` |
| 결과 DB 저장 시간 | `[duration] deployment apply result save completed in ...`, `[duration] deployment destroy result save completed in ...` |

#### 3차 개선 후 live AWS 재측정 결과

이 로그는 3차 개선까지 들어간 코드로 실행한 결과다. 따라서 이 값은 3차 개선 후 실제 병목을 확인하기 위한 기준선으로 본다.

실행 대상은 기존 full-stack demo Terraform artifact였고, create plan은 `8 to add`, destroy plan은 `8 to destroy`였다.

```text
aws_vpc
aws_subnet
aws_internet_gateway
aws_route_table
aws_route_table_association
aws_security_group
aws_instance
aws_s3_bucket
```

##### 전체 duration 요약

| 구간 | 주요 로그 | 시간 |
| --- | --- | ---: |
| Deployment 생성 직후 prewarm init | `[duration] terraform init completed in 19.0s` | 19.0s |
| Apply Plan init | `[duration] terraform init completed in 3.9s` | 3.9s |
| Apply Plan | `[duration] terraform plan completed in 5.1s` | 5.1s |
| Apply Plan show | `[duration] terraform show -json completed in 2.8s` | 2.8s |
| Apply init | `[duration] terraform init completed in 4.0s` | 4.0s |
| Apply 실행 | `[duration] terraform apply tfplan completed in 39.6s` | 39.6s |
| Apply output | `[duration] terraform output -json completed in 1.1s` | 1.1s |
| Apply state show | `[duration] terraform show -json completed in 3.7s` | 3.7s |
| Destroy Plan init | `[duration] terraform init completed in 5.4s` | 5.4s |
| Destroy Plan | `[duration] terraform plan -destroy completed in 6.8s` | 6.8s |
| Destroy Plan show | `[duration] terraform show -json completed in 2.6s` | 2.6s |
| Destroy init | `[duration] terraform init completed in 4.9s` | 4.9s |
| Destroy 실행 | `[duration] terraform apply tfplan completed in 60.0s` | 60.0s |

Plan/Apply/Destroy 사이의 작은 저장 작업은 모두 ms 단위였다.

| 작업 | 시간 |
| --- | ---: |
| `terraform lock file upload` after prewarm | 104ms |
| `deployment init status save` | 4ms |
| `terraform lock file upload` before apply plan | 52ms |
| `terraform plan artifact upload` | 87ms |
| `deployment plan save` | 10ms |
| `terraform lock file upload` before apply | 47ms |
| `terraform state upload` | 95ms |
| `deployment apply result save` | 17ms |
| `terraform lock file upload` before destroy plan | 109ms |
| `terraform destroy plan artifact upload` | 89ms |
| `deployment destroy plan save` | 8ms |
| `terraform lock file upload` before destroy | 45ms |

##### 3차 개선 효과 확인

prewarm 자체는 첫 실행이라 `terraform init`에 19.0초가 걸렸다. 하지만 사용자가 실제 Apply Plan을 실행할 때는 lock file과 shared cache를 재사용해서 init이 3.9초로 줄었다.

```text
Reusing previous version of hashicorp/aws from the dependency lock file
Using hashicorp/aws v5.100.0 from the shared cache directory
```

Apply, Destroy Plan, Destroy Apply에서도 init은 4~5초대로 유지됐다.

```text
Apply init: 4.0s
Destroy Plan init: 5.4s
Destroy Apply init: 4.9s
```

따라서 3차에서 의도한 `init prewarm + lock/cache 재사용`은 동작했다. 이제 병목은 init이 아니라 AWS 리소스 생성/삭제 구간이었다.

##### AWS 리소스 생성 병목

Apply 실행은 39.6초였다.

개별 리소스 로그를 보면 시간이 긴 작업은 아래였다.

| 리소스 | 완료 로그 | 관찰 시간 |
| --- | --- | ---: |
| `aws_vpc.main` | `Creation complete after 12s` | 12s |
| `aws_subnet.public` | `Creation complete after 11s` | 11s |
| `aws_instance.web` | `Creation complete after 13s` | 13s |
| `aws_security_group.web` | `Creation complete after 3s` | 3s |
| `aws_s3_bucket.demo` | `Creation complete after 2s` | 2s |
| `aws_internet_gateway.igw` | `Creation complete after 1s` | 1s |
| `aws_route_table.public` | `Creation complete after 1s` | 1s |
| `aws_route_table_association.public` | `Creation complete after 1s` | 1s |

Terraform은 일부 리소스를 병렬로 만들었지만, 의존 관계 때문에 완전히 동시에 끝나지는 않는다.

```text
VPC 생성
-> IGW/Subnet/Security Group 생성
-> Route Table/Association 생성
-> EC2 생성
```

그래서 EC2 자체가 13초여도 전체 Apply는 39.6초까지 늘어났다.

##### AWS 리소스 삭제 병목

Destroy 실행은 60.0초였다.

빠르게 삭제된 리소스도 있었다.

```text
aws_route_table_association.public: Destruction complete after 0s
aws_s3_bucket.demo: Destruction complete after 0s
aws_route_table.public: Destruction complete after 0s
```

하지만 `aws_instance.web`와 `aws_internet_gateway.igw`는 50초까지 계속 대기했다.

```text
aws_instance.web: Still destroying... 00m50s elapsed
aws_internet_gateway.igw: Still destroying... 00m50s elapsed
```

결국 Destroy 전체는 `terraform apply tfplan completed in 60.0s`로 끝났다. 이 구간은 SketchCatch 내부 DB/S3 저장 시간이 아니라 AWS가 실제 EC2 termination, network detach/delete를 처리하는 시간이다.

##### 결론

이 로그 기준으로 이제 줄여야 할 대상은 명확하다.

| 구분 | 판단 |
| --- | --- |
| `terraform init` | prewarm/lock/cache로 3.9~5.4초까지 줄어듦 |
| S3/DB 저장 | 대부분 4~109ms라 병목 아님 |
| `terraform plan`, `terraform show -json` | 각각 2.6~6.8초 수준 |
| `terraform apply tfplan` create | 39.6초, AWS 생성 대기 병목 |
| `terraform apply tfplan` destroy | 60.0초, AWS 삭제 대기 병목 |

따라서 VPC/Subnet/IGW/Route Table까지 매번 만들고 지우는 한, 해당 AWS 처리 시간은 반드시 기다려야 한다. 사용자가 체감하는 시간을 더 줄이려면 AWS가 처리할 리소스 수 자체를 줄여야 한다.
