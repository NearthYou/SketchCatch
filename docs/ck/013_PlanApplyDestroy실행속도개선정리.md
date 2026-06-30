# Plan/Apply/Destroy 실행 속도 개선 정리

이 문서는 Terraform `plan`, `apply`, `destroy plan`, `destroy apply` 실행 속도 개선 작업을 최종 상태 기준으로 다시 정리한다.

초기 문서는 1차 개선 내용을 먼저 적은 뒤 2차, 3차 내용을 뒤에 덧붙인 형태였다. 그 결과 앞부분에는 "아직 실측치가 없다"는 내용이 남아 있는데, 뒷부분에는 실제 AWS 재측정 결과가 들어 있어 문서 흐름이 맞지 않았다.

이 버전은 개선 단계를 같은 형식으로 맞추고, 현재 기준의 결론을 먼저 보여준다.

## 1. 최종 결론

이번 작업의 핵심은 "AWS가 EC2를 만드는 시간을 직접 줄인 것"이 아니다.

SketchCatch가 줄일 수 있는 대기와 줄일 수 없는 대기를 분리했고, 줄일 수 있는 대기부터 제거했다.

| 구분 | 결론 |
| --- | --- |
| `terraform init` | prewarm, lock file, plugin cache 재사용으로 사용자 실행 구간에서 크게 감소 |
| DB/S3/workspace 준비 | 의존 없는 작업을 병렬화해 순차 대기 감소 |
| S3/DB 저장 | duration log로 확인한 결과 대부분 ms 단위라 병목 아님 |
| `terraform apply tfplan` | 실제 AWS 리소스 생성/삭제 구간이라 API 코드만으로 크게 줄이기 어려움 |
| 관측 가능성 | Terraform command와 일부 비-Terraform 작업 duration을 Deployment log에 남김 |

3차 실측 기준으로 사용자 실행 구간은 아래처럼 줄었다.

| 기준 | 1차 개선 전 | 3차 개선 후 | 변화 |
| --- | ---: | ---: | ---: |
| 사용자 실행 구간 합계 | 168.054s | 127.970s | 40.084s 감소, 약 23.8% 개선 |
| prewarm 포함 총합 | 168.054s | 145.950s | 22.104s 감소, 약 13.2% 개선 |
| 사용자 실행 구간 init 합계 | 70.3s | 19.5s | 50.8s 감소, 약 72.3% 개선 |
| prewarm 포함 init 합계 | 70.3s | 37.4s | 32.9s 감소, 약 46.8% 개선 |

prewarm은 Deployment 생성 직후 먼저 실행되는 작업이다. 사용자가 Apply Plan 버튼을 누른 뒤의 체감 시간에서는 제외하는 것이 더 자연스럽다.

이 기준으로 보면 Plan부터 Destroy 완료까지의 사용자 대기 시간은 `168.054s`에서 `127.970s`로 줄었다.

## 2. 문제 정의

사용자 입장에서는 `Terraform Plan 실행`, `AWS 리소스 생성`, `Cleanup Destroy Plan 실행`, `AWS 리소스 삭제`가 모두 느리게 보였다.

UI에서는 실행 버튼을 누른 뒤 Deployment가 `RUNNING` 상태가 되고, 결과가 바뀔 때까지 기다려야 한다.

초기 문제는 두 가지였다.

| 문제 | 의미 |
| --- | --- |
| 실제 실행 시간이 김 | Terraform이 AWS API를 조회하거나 EC2, VPC, S3 같은 실제 리소스를 만들고 지우는 시간 |
| 어디서 느린지 알 수 없음 | `terraform init`, `plan`, `apply`, `show -json`, S3/DB 저장 시간이 로그에 분리되지 않음 |

기존 로그만으로는 아래 질문에 답하기 어려웠다.

```text
terraform init이 느린가?
terraform plan이 느린가?
terraform apply가 느린가?
S3에서 tfplan/state를 내려받는 시간이 느린가?
DB나 AWS connection 조회가 느린가?
```

따라서 첫 번째 목표는 속도 개선이었고, 두 번째 목표는 병목을 볼 수 있게 만드는 것이었다.

## 3. 개선 원칙

Deployment 실행은 실제 AWS 리소스를 만들고 지우는 작업이다. 그래서 속도만 보고 안전 장치를 약화하지 않았다.

이번 작업에서 지킨 원칙은 아래와 같다.

| 원칙 | 이유 |
| --- | --- |
| 승인된 `tfplan`만 apply | 사용자가 승인한 계획과 실제 실행 계획이 달라지는 것을 막기 위해 |
| 임시 workspace 격리 유지 | Deployment 간 state, plan, provider 파일 오염을 막기 위해 |
| `-refresh=false` 미적용 | 실제 AWS 상태와 plan 정확성이 떨어질 수 있기 때문에 |
| lock/prewarm은 best-effort | 성능 최적화 실패가 Deployment 실패로 이어지지 않게 하기 위해 |
| secrets 출력 금지 | AWS credential, token, sensitive output이 로그에 남지 않게 하기 위해 |

즉, 이번 개선은 Terraform 실행 정합성을 바꾸는 작업이 아니다.

안전한 Deployment 경계를 유지하면서 반복 비용과 불필요한 순차 대기를 줄이는 작업이다.

## 4. 전체 실행 구간

Plan/Apply/Destroy 흐름에서 실행되는 Terraform command는 아래와 같다.

| 흐름 | Terraform command |
| --- | --- |
| Apply Plan | `terraform init`, `terraform plan`, `terraform show -json tfplan` |
| Apply | `terraform init`, `terraform apply tfplan`, `terraform output -json`, `terraform show -json` |
| Destroy Plan | `terraform init`, `terraform plan -destroy`, `terraform show -json tfplan` |
| Destroy Apply | `terraform init`, `terraform apply tfplan` |

초기 병목 후보는 네 구간이었다.

| 구간 | 코드 위치 | 성격 |
| --- | --- | --- |
| Terraform command 실행 | [terraform-runner.ts](../../apps/api/src/deployments/terraform-runner.ts) | 실제 Terraform CLI 실행 시간 |
| Deployment metadata 조회 | plan/apply/destroy service | DB 조회, AWS connection 조회 |
| S3 artifact/state 복원 | plan/apply/destroy service | Terraform artifact, `tfplan`, `terraform.tfstate` 다운로드 |
| workspace 파일 쓰기 | apply/destroy service | `workspace/tfplan`, `workspace/terraform.tfstate` 쓰기 |

최종적으로는 Terraform command, S3 업로드, DB 저장 일부까지 duration log를 남기도록 확장했다.

## 5. 개선 단계 요약

| 단계 | 핵심 작업 | 목적 |
| --- | --- | --- |
| 1차 개선 | duration 계측, 준비 구간 병렬화 | 어디가 느린지 보이게 하고 순차 대기를 줄임 |
| 2차 개선 | `.terraform.lock.hcl` 저장/복원 | 반복 `terraform init` 비용을 줄임 |
| 3차 개선 | 첫 Plan prewarm, 비-Terraform duration 계측 | 첫 Plan 체감 대기와 S3/DB 불투명성을 줄임 |

아래부터는 각 개선 단계를 같은 형식으로 정리한다.

## 6. 1차 개선: duration 계측과 준비 구간 병렬화

### 6.1 문제

1차 개선 전에는 Terraform command가 끝난 뒤 stdout/stderr는 남았지만, 명령별 소요 시간은 남지 않았다.

또한 DB 조회, S3 다운로드, workspace 준비 중 서로 의존하지 않는 작업도 일부 순서대로 기다렸다.

예를 들어 Apply에서는 아래 작업이 순차로 묶여 있었다.

```text
Terraform artifact 조회
-> current plan artifact 조회
-> AWS connection 조회
-> tfplan S3 다운로드
-> Terraform workspace 준비
```

이 중 metadata 조회끼리, S3 다운로드와 workspace 준비는 서로 독립적으로 실행할 수 있었다.

### 6.2 접근

먼저 측정할 수 있게 만들고, 그다음 안전하게 병렬화할 수 있는 준비 작업만 병렬화했다.

1차 개선에서는 실제 AWS E2E 초 단위 비교표를 바로 만들 수 없었다. 개선 전 로그에 command duration이 없었기 때문이다.

따라서 1차 개선의 목적은 "최종 성능 수치를 증명"하는 것이 아니라 "다음 실측을 가능하게 만드는 기반"이었다.

### 6.3 변경 내용

`TerraformRunResult`에 `durationMs`를 추가했다.

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

`performance.now()`로 command 시작 시각을 잡고, 취소, 실패, 정상 종료 시점 모두에서 elapsed time을 기록했다.

Deployment log에는 아래 형식의 duration line을 추가했다.

```text
[duration] terraform init completed in 812ms
[duration] terraform apply tfplan completed in 12.4s
```

공통 helper는 [deployment-duration-logs.ts](../../apps/api/src/deployments/deployment-duration-logs.ts)에 두었다.

준비 구간은 의존성이 없는 작업만 `Promise.all`로 묶었다.

| 흐름 | 병렬화한 구간 |
| --- | --- |
| Apply Plan | Terraform artifact 조회와 AWS connection 조회 |
| Apply Plan | Architecture 조회와 Terraform workspace 준비 |
| Apply | Terraform artifact, current plan artifact, AWS connection 조회 |
| Apply | `tfplan` S3 다운로드와 Terraform workspace 준비 |
| Destroy Plan | Terraform artifact, current plan artifact, AWS connection 조회 |
| Destroy Plan | Terraform workspace 준비와 state S3 다운로드 |
| Destroy Apply | metadata 조회, artifact/state/workspace 준비, state/tfplan 파일 쓰기 |

Apply와 Destroy Apply에서는 이미 Buffer인 `planBuffer`를 다시 `Buffer.from(planBuffer)`로 복사하지 않게 했다.

### 6.4 수치

1차 개선으로 관측 가능성이 아래처럼 바뀌었다.

| 항목 | 개선 전 | 개선 후 |
| --- | ---: | ---: |
| Terraform command duration 결과 필드 | 0개 | 1개 `durationMs` |
| Deployment flow의 Terraform command duration log | 0/12 | 12/12 |
| 사용자의 명령별 소요 시간 확인 | 불가능 | 가능 |

여기서 12개는 아래 명령을 합친 수다.

```text
Apply Plan: init, plan, show-json
Apply: init, apply, output-json, show-state-json
Destroy Plan: init, plan-destroy, show-json
Destroy Apply: init, apply tfplan
```

서버 준비 구간의 순차 대기 구조도 줄었다.

| 흐름 | 개선 전 | 개선 후 | 의미 |
| --- | ---: | ---: | --- |
| Apply Plan 준비 일부 | 4 independent waits | 2 parallel groups | 구조상 50% 감소 |
| Apply 준비 일부 | 5 independent waits | 2 parallel groups | 구조상 60% 감소 |
| Destroy Plan 준비 일부 | 5 independent waits | 2 parallel groups | 구조상 60% 감소 |
| Destroy Apply 준비 일부 | 8 independent waits | 3 parallel groups | 구조상 62.5% 감소 |

이 수치는 전체 Deployment 시간 감소율이 아니다.

이번에 병렬화한 준비 구간 안에서 순차 대기 수가 줄었다는 의미다.

### 6.5 검증

1차 개선 후 확인한 내용은 아래와 같다.

| 검증 | 결과 |
| --- | --- |
| `apps/api` typecheck | 통과 |
| `apps/api` eslint | 통과 |
| Deployment 관련 테스트 20개 | 통과 |
| `apps/api` build | 통과 |
| API 전체 테스트 357개 | 통과 |

테스트에서는 `terraform-runner.test.ts`에서 result에 `durationMs`가 생기는지 확인했다.

### 6.6 한계

1차 개선만으로는 실제 AWS 리소스 생성/삭제 시간을 줄이지 못한다.

또한 당시에는 S3 업로드, DB 저장, lock file 저장 같은 비-Terraform 작업 duration이 아직 분리되지 않았다.

## 7. 2차 개선: Terraform init 반복 비용 줄이기

### 7.1 문제

1차 개선 후 실제 Deployment log를 보니 `terraform init`가 매 단계마다 17~20초 정도 걸렸다.

수정 전 init 시간은 아래와 같았다.

| 흐름 | 수정 전 init 시간 |
| --- | ---: |
| Apply Plan | 18.0s |
| Apply | 17.3s |
| Destroy Plan | 18.8s |
| Destroy Apply | 20.1s |

로그에는 provider 탐색과 설치가 반복해서 나타났다.

```text
Finding hashicorp/aws versions matching "~> 5.0"...
Installing hashicorp/aws v5.100.0...
Terraform has created a lock file .terraform.lock.hcl
```

Plan에서 provider를 한 번 결정했는데도 Apply, Destroy Plan, Destroy Apply에서 같은 준비 비용을 다시 내고 있었다.

### 7.2 원인

SketchCatch는 안전을 위해 Deployment 실행마다 임시 Terraform workspace를 만들고 실행 후 cleanup한다.

이 구조에서는 `terraform init`가 만든 `.terraform.lock.hcl`이 다음 단계로 이어지지 않는다.

`TF_PLUGIN_CACHE_DIR`가 있더라도 lock file이 없으면 Terraform은 provider version 선택과 lock 생성을 다시 수행할 수 있다.

기존 `provider-warmup.tf`도 실제 생성 Terraform artifact와 같은 provider major version warmup을 보장하지 못했다.

### 7.3 변경 내용

`terraform init` 성공 직후 workspace의 `.terraform.lock.hcl`을 S3에 저장했다.

다음 plan/apply/destroy 실행 전에는 같은 Deployment scope의 lock file을 workspace에 복원했다.

S3 object key는 Deployment 단위로 고정했다.

```text
deployments/{deploymentId}/terraform/.terraform.lock.hcl
```

lock file은 성능 최적화용 artifact다.

누락되거나 다운로드/업로드에 실패해도 Deployment 자체를 실패시키지 않는다. 이 경우 Terraform이 기존처럼 init을 다시 수행한다.

변경 파일은 아래와 같다.

| 파일 | 변경 내용 |
| --- | --- |
| [terraform-lock-file-storage.ts](../../apps/api/src/deployments/terraform-lock-file-storage.ts) | `.terraform.lock.hcl` S3 업로드/다운로드 저장소 추가 |
| [terraform-lock-file-workspace.ts](../../apps/api/src/deployments/terraform-lock-file-workspace.ts) | workspace lock file 복원/저장 helper 추가 |
| [deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts) | Plan init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | Apply init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts) | Destroy Plan init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts) | Destroy Apply init 전 lock 복원, init 성공 후 lock 저장 |
| [deployment-artifact-security.ts](../../apps/api/src/deployments/deployment-artifact-security.ts) | `terraform-lock` artifact kind와 object key 검증 추가 |
| [terraform-plugin-cache-warmup.ts](../../apps/api/src/deployments/terraform-plugin-cache-warmup.ts) | warmup provider 제약을 `hashicorp/aws` `~> 5.0`으로 정렬 |

### 7.4 실측 결과

첫 Apply Plan init은 여전히 provider를 설치했다. 그러나 Apply 이후 단계에서는 lock file과 shared cache를 재사용했다.

Apply 이후 init 로그는 아래 흐름으로 바뀌었다.

```text
Reusing previous version of hashicorp/aws from the dependency lock file
Using hashicorp/aws v5.100.0 from the shared cache directory
[duration] terraform init completed in 4.5s
```

init 시간 비교는 아래와 같다.

| 흐름 | 수정 전 init | 수정 후 init | 변화 |
| --- | ---: | ---: | ---: |
| Apply Plan | 18.0s | 20.9s | 2.9s 증가 |
| Apply | 17.3s | 4.5s | 12.8s 감소 |
| Destroy Plan | 18.8s | 5.3s | 13.5s 감소 |
| Destroy Apply | 20.1s | 6.4s | 13.7s 감소 |

첫 Apply Plan은 해당 Deployment의 첫 실행이라 lock/cache 효과를 받지 못했다.

대신 Apply 이후 세 단계의 init 합계는 크게 줄었다.

```text
수정 전 Apply 이후 init 합계: 17.3s + 18.8s + 20.1s = 56.2s
수정 후 Apply 이후 init 합계: 4.5s + 5.3s + 6.4s = 16.2s
감소: 40.0s, 약 71.2%
```

전체 Terraform command 합계도 줄었다.

```text
수정 전 전체 Terraform command 합계: 182.2s
수정 후 전체 Terraform command 합계: 155.8s
감소: 26.4s, 약 14.5%
```

init만 따로 보면 개선폭은 더 컸다.

```text
수정 전 init 합계: 74.2s
수정 후 init 합계: 37.1s
감소: 37.1s, 약 50.0%
```

반대로 init 외 Terraform command 시간은 이번 로그에서 늘었다.

주된 이유는 destroy apply가 지난번 45.7s에서 이번 55.8s로 10.1s 늘었기 때문이다.

따라서 2차 개선은 반복 `terraform init` 비용에는 효과가 있었지만, 실제 AWS 리소스 생성/삭제 구간의 변동성까지 통제하지는 못했다.

### 7.5 검증

2차 개선 후 확인한 내용은 아래와 같다.

| 검증 | 결과 |
| --- | --- |
| `apps/api` typecheck | 통과 |
| `apps/api` eslint | 통과 |
| lock file storage/workspace + deployment 관련 대상 테스트 30개 | 통과 |
| API 전체 테스트 364개 | 통과 |
| `apps/api` build | 통과 |
| `git diff --check` | 통과 |

### 7.6 한계와 주의점

lock file 복원/저장은 best-effort로 동작한다.

lock file이 없거나 복원에 실패하면 Terraform이 기존처럼 provider version을 다시 선택하고 init을 수행한다.

저장하는 lock file에는 provider version/checksum 정보만 있고 AWS credential이나 Terraform state 값은 들어가지 않는다.

다만 아래 상황에서는 기대한 성능 개선이 줄어들 수 있다.

| 주의 지점 | 영향 | 대응 |
| --- | --- | --- |
| `TF_PLUGIN_CACHE_DIR`가 없거나 API 프로세스가 쓸 수 없음 | shared cache를 못 써서 init이 다시 느려질 수 있음 | API 컨테이너에 writable volume으로 cache directory mount 확인 |
| S3 lock file 다운로드/업로드가 느림 | init 전에 작은 S3 I/O가 추가됨 | 반복 지연 시 별도 duration log와 metric 검토 |
| provider version 제약이 바뀜 | 기존 lock file이 constraint와 맞지 않아 init 실패 가능 | lock key를 Terraform artifact hash 단위로 분리하거나 init 재시도 정책 추가 |
| 첫 Apply Plan 실행 | 아직 lock file이 없어 provider 설치 시간이 그대로 발생 | 3차 prewarm으로 보완 |

## 8. 3차 개선: 첫 Plan prewarm과 비-Terraform duration 계측

### 8.1 문제

2차 개선에서는 Apply, Destroy Plan, Destroy Apply의 반복 `terraform init` 비용은 크게 줄었다.

하지만 첫 Apply Plan은 여전히 느렸다. 첫 Plan을 누르기 전에는 해당 Deployment의 `.terraform.lock.hcl`이 아직 없었기 때문이다.

또 다른 문제는 Terraform command 밖의 시간이 여전히 불투명했다는 점이다.

예를 들면 아래 구간은 실제로 시간이 걸릴 수 있는데, 이전 로그만으로는 얼마나 걸리는지 알 수 없었다.

```text
terraform plan artifact upload
deployment plan save
terraform state upload
deployment apply result save
deployment destroy result save
```

### 8.2 변경 내용

Deployment 생성 직후 frontend에서 `/deployments/:deploymentId/init`을 호출하도록 했다.

이 init은 AWS 리소스를 생성하지 않는다. Terraform provider 준비와 lock file 생성만 수행한다.

실패하더라도 Deployment 생성 자체는 유지되며, 이후 첫 Plan에서 기존 흐름대로 다시 init을 수행할 수 있다.

관련 코드는 아래와 같다.

| 파일 | 변경 내용 |
| --- | --- |
| [DeploymentPanel.tsx](../../apps/web/features/workspace/DeploymentPanel.tsx) | Deployment 생성 직후 init prewarm 호출 |
| [deployment-init-service.ts](../../apps/api/src/deployments/deployment-init-service.ts) | prewarm init 실행과 lock file 저장 |
| [deployment-duration-logs.ts](../../apps/api/src/deployments/deployment-duration-logs.ts) | 비-Terraform 작업 duration log helper |
| [deployment-plan-service.ts](../../apps/api/src/deployments/deployment-plan-service.ts) | plan artifact upload, plan save duration 기록 |
| [deployment-apply-service.ts](../../apps/api/src/deployments/deployment-apply-service.ts) | state upload, apply result save duration 기록 |
| [deployment-destroy-plan-service.ts](../../apps/api/src/deployments/deployment-destroy-plan-service.ts) | destroy plan artifact upload, save duration 기록 |
| [deployment-destroy-service.ts](../../apps/api/src/deployments/deployment-destroy-service.ts) | destroy result save duration 기록 |

비-Terraform duration log 예시는 아래와 같다.

```text
[duration] terraform lock file upload completed in 12ms
[duration] terraform plan artifact upload completed in 38ms
[duration] deployment plan save completed in 21ms
[duration] terraform state upload completed in 44ms
[duration] deployment apply result save completed in 18ms
[duration] deployment destroy result save completed in 15ms
```

### 8.3 기대 효과

prewarm이 먼저 끝나면 첫 Apply Plan에서도 lock file과 shared cache를 재사용할 수 있다.

기존 첫 Plan 로그는 아래 흐름이었다.

```text
Finding hashicorp/aws versions matching "~> 5.0"...
Installing hashicorp/aws v5.100.0...
Terraform has created a lock file .terraform.lock.hcl
```

prewarm 성공 후에는 아래 흐름을 기대할 수 있다.

```text
Reusing previous version of hashicorp/aws from the dependency lock file
Using hashicorp/aws v5.100.0 from the shared cache directory
```

또한 이제 전체 시간을 아래처럼 분리해서 볼 수 있다.

```text
Terraform command 시간
S3 artifact/state upload 시간
DB 저장 시간
```

### 8.4 실측 결과

3차 개선 후 live Deployment를 다시 실행했다.

실행 대상은 기존 full-stack demo Terraform artifact였고, create plan은 `8 to add`, destroy plan은 `8 to destroy`였다.

대상 리소스는 아래와 같았다.

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

전체 duration 요약은 아래와 같다.

| 구간 | 주요 로그 | 시간 |
| --- | --- | ---: |
| Deployment 생성 직후 prewarm init | `[duration] terraform init completed in 17.9s` | 17.9s |
| Apply Plan init | `[duration] terraform init completed in 4.4s` | 4.4s |
| Apply Plan | `[duration] terraform plan completed in 5.0s` | 5.0s |
| Apply Plan show | `[duration] terraform show -json completed in 3.0s` | 3.0s |
| Apply init | `[duration] terraform init completed in 4.3s` | 4.3s |
| Apply 실행 | `[duration] terraform apply tfplan completed in 39.1s` | 39.1s |
| Apply output | `[duration] terraform output -json completed in 1.2s` | 1.2s |
| Apply state show | `[duration] terraform show -json completed in 3.9s` | 3.9s |
| Destroy Plan init | `[duration] terraform init completed in 5.4s` | 5.4s |
| Destroy Plan | `[duration] terraform plan -destroy completed in 6.8s` | 6.8s |
| Destroy Plan show | `[duration] terraform show -json completed in 3.0s` | 3.0s |
| Destroy init | `[duration] terraform init completed in 5.4s` | 5.4s |
| Destroy 실행 | `[duration] terraform apply tfplan completed in 45.7s` | 45.7s |

prewarm 자체는 첫 실행이라 `terraform init`에 17.9초가 걸렸다.

하지만 사용자가 실제 Apply Plan을 실행할 때는 lock file과 shared cache를 재사용해서 init이 4.4초로 줄었다.

사용자 실행 구간의 init 합계는 아래와 같다.

```text
4.4s + 4.3s + 5.4s + 5.4s = 19.5s
```

1차 개선 전에는 같은 구간에서 init만 `70.3s`였다.

prewarm을 사용자 대기 시간 밖으로 빼면 init 대기만 `50.8s` 줄었다.

### 8.5 S3/DB duration 확인

Plan/Apply/Destroy 사이의 저장 작업은 모두 ms 단위였다.

| 작업 | 시간 |
| --- | ---: |
| `terraform lock file upload` after prewarm | 75ms |
| `deployment init status save` | 5ms |
| `terraform lock file upload` before apply plan | 63ms |
| `terraform plan artifact upload` | 93ms |
| `deployment plan save` | 10ms |
| `terraform lock file upload` before apply | 48ms |
| `terraform state upload` | 85ms |
| `deployment apply result save` | 15ms |
| `terraform lock file upload` before destroy plan | 309ms |
| `terraform destroy plan artifact upload` | 91ms |
| `deployment destroy plan save` | 10ms |
| `terraform lock file upload` before destroy | 36ms |
| `deployment destroy result save` | 10ms |

이 결과로 보면 현재 병목은 S3/DB 저장이 아니다.

### 8.6 구간별 합계

| 구간 | 계산 | 합계 |
| --- | --- | ---: |
| Deployment 생성 직후 prewarm | `17.9s + 75ms + 5ms` | 17.980s |
| Apply Plan 전체 | `4.4s + 63ms + 5.0s + 3.0s + 93ms + 10ms` | 12.566s |
| Apply 전체 | `4.3s + 48ms + 39.1s + 1.2s + 3.9s + 85ms + 15ms` | 48.648s |
| Destroy Plan 전체 | `5.4s + 309ms + 6.8s + 3.0s + 91ms + 10ms` | 15.610s |
| Destroy 전체 | `5.4s + 36ms + 45.7s + 10ms` | 51.146s |
| 사용자 실행 구간 합계 | `Apply Plan + Apply + Destroy Plan + Destroy` | 127.970s |
| prewarm 포함 총합 | `prewarm + 사용자 실행 구간 합계` | 145.950s |

### 8.7 검증

3차 개선 후 확인한 내용은 아래와 같다.

| 검증 | 결과 |
| --- | --- |
| `corepack pnpm --filter @sketchcatch/api typecheck` | 통과 |
| `corepack pnpm --filter @sketchcatch/web typecheck` | 통과 |
| deployment init/plan/apply/destroy service 테스트 25개 | 통과 |
| workspace api/deployment-actions 테스트 26개 | 통과 |

### 8.8 한계와 주의점

prewarm은 best-effort다.

```text
Deployment 생성 성공
-> init prewarm 요청
-> init 성공 시 lock file 저장
-> init 실패 시 기존 첫 Plan 흐름으로 fallback
```

prewarm 실패 때문에 Deployment 생성이 실패하지는 않는다.

대신 첫 Plan에서 다시 차가운 init 비용이 발생할 수 있다.

비-Terraform duration log는 성공한 작업만 기록한다.

S3 업로드나 DB 저장이 실패하면 기존 failure/warning 흐름으로 넘어가며, 실패 작업의 duration은 별도로 남기지 않는다.

## 9. 최종 병목 분석

EC2가 포함된 full-stack demo 기준으로 3차 개선 후 병목은 더 명확해졌다.

| 구분 | 판단 |
| --- | --- |
| `terraform init` | prewarm/lock/cache로 사용자 실행 구간에서는 4.3~5.4초대로 감소 |
| S3/DB/lock 저장 | 대부분 5~309ms라 병목 아님 |
| `terraform plan`, `terraform show -json` | 각각 3.0~6.8초 수준 |
| `terraform apply tfplan` create | 39.1초, AWS 생성 대기 병목 |
| `terraform apply tfplan` destroy | 45.7초, AWS 삭제 대기 병목 |

Apply 실행은 39.1초였다.

개별 리소스 생성 로그에서 시간이 긴 작업은 아래였다.

| 리소스 | 완료 로그 | 관찰 시간 |
| --- | --- | ---: |
| `aws_vpc.main` | `Creation complete after 12s` | 12s |
| `aws_subnet.public` | `Creation complete after 11s` | 11s |
| `aws_instance.web` | `Creation complete after 12s` | 12s |
| `aws_security_group.web` | `Creation complete after 2s` | 2s |
| `aws_s3_bucket.demo` | `Creation complete after 2s` | 2s |
| `aws_internet_gateway.igw` | `Creation complete after 0s` | 0s |
| `aws_route_table.public` | `Creation complete after 1s` | 1s |
| `aws_route_table_association.public` | `Creation complete after 0s` | 0s |

Terraform은 일부 리소스를 병렬로 만들지만, 의존 관계 때문에 완전히 동시에 끝나지는 않는다.

```text
VPC 생성
-> IGW/Subnet/Security Group 생성
-> Route Table/Association 생성
-> EC2 생성
```

EC2 자체가 12초여도 전체 Apply는 39.1초까지 늘어났다.

Destroy 실행은 45.7초였다.

빠르게 삭제된 리소스도 있었지만, `aws_instance.web`와 `aws_internet_gateway.igw`가 각각 40초, 38초 걸렸다.

```text
aws_internet_gateway.igw: Destruction complete after 38s
aws_instance.web: Destruction complete after 40s
```

이 구간은 SketchCatch 내부 DB/S3 저장 시간이 아니다.

AWS가 실제 EC2 termination, network detach/delete를 처리하는 시간이다.

## 10. 남은 한계와 다음 방향

현재 구조에서 아래 시간은 API 코드만으로 크게 줄이기 어렵다.

```text
첫 Deployment에서 provider를 처음 내려받는 시간
terraform plan의 AWS refresh/API 조회 시간
terraform apply tfplan의 실제 리소스 생성/삭제 시간
terraform show -json 후처리 시간
```

사용자 체감 시간을 더 줄이려면 AWS가 처리할 리소스 수 자체를 줄이는 방향을 검토해야 한다.

가능한 방향은 아래와 같다.

| 방향 | 설명 |
| --- | --- |
| 데모 리소스 축소 | VPC/Subnet/IGW/Route Table을 매번 만들지 않는 더 작은 live apply 시나리오 검토 |
| 리소스 재사용 설계 | 공용 network 기반 위에 EC2/S3만 생성하는 흐름 검토. 단, 격리와 cleanup 정책 재설계 필요 |
| 사용자 피드백 강화 | AWS 처리 대기 중인 리소스와 진행 로그를 UI에서 더 명확히 보여주기 |
| 실패 duration 계측 | S3/DB 실패 시에도 duration을 남기도록 `runLoggedDeploymentOperation` 확장 |
| 장기 metric 저장 | Deployment log뿐 아니라 command duration을 분석 가능한 metric으로 저장 |

다만 리소스 재사용은 보안과 정합성 검토가 필요하다.

현재 MVP에서는 격리된 workspace와 명시적 cleanup을 유지하는 쪽이 더 안전하다.

## 11. 발표용 요약

기술적 챌린지는 "Terraform 실행을 빠르게 만들기"가 아니라 "실제 AWS Deployment에서 어떤 대기는 줄일 수 있고 어떤 대기는 줄일 수 없는지 분리하는 것"이었다.

처음에는 Plan/Apply/Destroy가 모두 느리게만 보였고, `terraform init`, AWS apply, S3/DB 저장 중 무엇이 병목인지 알 수 없었다.

1차에서는 command duration과 Deployment log를 추가해 관측 가능성을 만들고, 의존 없는 준비 작업을 병렬화했다.

2차에서는 `.terraform.lock.hcl`을 S3에 저장/복원해서 반복 `terraform init` 비용을 줄였다.

3차에서는 Deployment 생성 직후 init prewarm을 실행하고, S3/DB 저장 duration까지 계측했다.

결과적으로 사용자 실행 구간의 `terraform init` 합계는 `70.3s`에서 `19.5s`로 줄었다. Plan부터 Destroy 완료까지의 대기 시간은 3차 실측 기준 `168.054s`에서 `127.970s`로 줄었다.

남은 병목은 SketchCatch 내부 저장이 아니라 실제 AWS 리소스 생성/삭제 시간이다.

따라서 다음 최적화는 코드 레벨 대기 제거보다, 데모에서 실제로 생성하는 AWS 리소스 범위를 줄이거나 사용자에게 AWS 처리 상태를 더 잘 보여주는 방향이 맞다.
