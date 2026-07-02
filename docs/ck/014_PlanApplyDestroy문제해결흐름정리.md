# Plan/Apply/Destroy 문제 해결 흐름 정리

이 문서는 [013_PlanApplyDestroy실행속도개선정리.md](./013_PlanApplyDestroy실행속도개선정리.md)를 발표 흐름에 맞게 다시 풀어쓴 정리본이다.

핵심은 단순하다. 이번 작업은 AWS가 EC2나 VPC를 더 빨리 만들도록 바꾼 작업이 아니다. 느리게 보이던 Deployment 흐름을 구간별로 나누고, SketchCatch가 줄일 수 있는 대기부터 줄인 작업이다.

## 1. 문제 배경

사용자 입장에서는 `Terraform Plan`, `Apply`, `Destroy Plan`, `Destroy Apply`가 모두 느리게 느껴졌다. 버튼을 누르면 Deployment가 `RUNNING` 상태가 되고, 결과가 바뀔 때까지 기다려야 했기 때문이다.

처음에는 이 대기 시간이 하나의 덩어리처럼 보였다. 하지만 실제로는 `terraform init`, `terraform plan`, `terraform apply`, S3 저장, DB 저장, workspace 준비가 한 흐름 안에 섞여 있었다. 그래서 어떤 구간을 먼저 줄여야 하는지 판단하기 어려웠다.

중요한 전제도 있었다. 실제 AWS 리소스 생성/삭제 시간은 SketchCatch API 코드만으로 크게 줄일 수 없다. EC2 생성, VPC 생성, network detach, EC2 termination 같은 작업은 AWS와 Terraform provider가 처리하는 시간이기 때문이다.

따라서 목표는 AWS 처리 시간을 억지로 줄이는 것이 아니었다. 안전한 Deployment 흐름은 유지하면서, 내부에서 줄일 수 있는 반복 비용과 순차 대기를 먼저 제거하는 것이 목표였다.

## 2. 1차 문제 해결

1차에서는 서버 준비 구간의 불필요한 순차 대기를 줄였다. 기존 흐름에는 서로 의존하지 않는 작업도 순서대로 기다리는 구간이 있었다.

예를 들어 Apply에서는 Terraform artifact 조회, current plan artifact 조회, AWS connection 조회, `tfplan` S3 다운로드, Terraform workspace 준비가 이어서 실행됐다. 하지만 metadata 조회끼리는 서로 의존하지 않았고, S3 다운로드와 workspace 준비도 동시에 진행할 수 있었다.

그래서 안전한 범위 안에서 `Promise.all`을 적용했다. 승인된 plan 검증, hash 비교, apply 실행 순서처럼 안전성과 관련된 순서는 건드리지 않았다. 병렬화한 것은 결과 의존성이 없는 준비 작업뿐이었다.

## 3. 1차 해결 결과

1차 이후에는 먼저 1차 개선 전 기준선을 잡았다. 013 문서 기준으로 Plan부터 Destroy 완료까지 사용자가 기다린 실행 구간은 총 168.054초였고, 그중 `terraform init`만 70.3초였다.

1차에서 줄인 것은 준비 구간의 순차 대기였고, 아래 초 단위 병목은 아직 그대로 남아 있었다. 그래서 이 표는 1차의 최종 단축 효과라기보다, 2차 개선으로 넘어가게 만든 기준선이다.

| 기준 | 1차 개선 전 | 1차 개선 후 | 변화 |
| --- | ---: | ---: | --- |
| 사용자 실행 구간 합계 | 168.054s | 168.054s | 초 단위 병목은 아직 남음 |
| 사용자 실행 구간 init 합계 | 70.3s | 70.3s | 전체의 약 41.8%가 반복 init 비용 |
| init 제외 실행 구간 | 97.754s | 97.754s | AWS 처리, plan/apply/show, 저장 작업 등이 섞인 나머지 시간 |

이 기준선을 놓고 보니 1차에서 준비 구간을 병렬화한 것만으로는 전체 체감 시간을 크게 줄이기 어렵다는 점이 분명해졌다. 실제 AWS 리소스 생성/삭제 시간은 그대로 남아 있었고, 전체 대기 중 큰 비중을 차지한 것은 반복되는 `terraform init` 비용이었다.

그래서 1차의 결론은 "준비 구간의 불필요한 순차 대기는 줄였다"였지만, 다음으로 풀어야 할 핵심 문제는 `terraform init` 반복 비용으로 좁혀졌다.

## 4. 2차 문제 원인

1차 개선 후 실제 Deployment 실행을 보니 더 큰 반복 비용이 남아 있었다. `terraform init`가 매 단계마다 17~20초 정도 걸리고 있었다.

수정 전 init 시간은 Apply Plan 18.0초, Apply 17.3초, Destroy Plan 18.8초, Destroy Apply 20.1초였다. Plan에서 provider를 한 번 결정했는데도, 이후 단계에서 다시 provider 탐색과 설치 비용을 내고 있었다.

원인은 임시 workspace 구조였다. SketchCatch는 안전을 위해 Deployment 실행마다 격리된 Terraform workspace를 만들고 실행 후 cleanup한다. 이 구조 자체는 맞는 방향이었다. Deployment 간 state나 plan이 섞이는 것을 막을 수 있기 때문이다.

하지만 이 방식에는 비용이 있었다. `terraform init`가 만든 `.terraform.lock.hcl`이 다음 단계로 이어지지 않았다. 그래서 Apply, Destroy Plan, Destroy Apply에서도 같은 provider 준비 과정을 다시 수행했다.

## 5. 2차 해결

2차에서는 반복되는 `terraform init` 비용을 줄이기 위해 `.terraform.lock.hcl`을 재사용했다.

`terraform init`이 성공하면 workspace에 생긴 `.terraform.lock.hcl`을 S3에 저장했다. 다음 plan/apply/destroy 실행 전에는 같은 Deployment scope의 lock file을 workspace에 복원했다.

저장 위치는 Deployment 단위로 고정했다.

```text
deployments/{deploymentId}/terraform/.terraform.lock.hcl
```

이 lock file은 성능 최적화용 artifact로 다뤘다. 다운로드나 업로드에 실패해도 Deployment 자체를 실패시키지 않았다. 실패하면 Terraform이 기존 흐름대로 init을 다시 수행하도록 했다.

이 방식은 Terraform 실행의 정합성을 바꾸지 않는다. 승인된 `tfplan`만 apply하고, 임시 workspace 격리와 cleanup 구조도 그대로 유지했다.

## 6. 2차 해결 결과

2차 개선 후 Apply 이후 단계에서는 lock file과 shared cache를 재사용했다. 첫 Apply Plan은 해당 Deployment의 첫 실행이라 효과를 받지 못했지만, 이후 단계의 init 시간은 크게 줄었다.

| 흐름 | 수정 전 init | 수정 후 init | 변화 |
| --- | ---: | ---: | ---: |
| Apply Plan | 18.0s | 20.9s | 2.9s 증가 |
| Apply | 17.3s | 4.5s | 12.8s 감소 |
| Destroy Plan | 18.8s | 5.3s | 13.5s 감소 |
| Destroy Apply | 20.1s | 6.4s | 13.7s 감소 |

합계로 보면 init 반복 비용 감소가 더 뚜렷하다.

| 기준 | 2차 개선 전 | 2차 개선 후 | 변화 |
| --- | ---: | ---: | --- |
| Apply 이후 init 합계 | 56.2s | 16.2s | 40.0s 감소, 약 71.2% 개선 |
| 전체 init 합계 | 74.2s | 37.1s | 37.1s 감소, 약 50.0% 개선 |
| 전체 Terraform command 합계 | 182.2s | 155.8s | 26.4s 감소, 약 14.5% 개선 |
| init 제외 command 합계 | 108.0s | 118.7s | 10.7s 증가 |

다만 init 감소분이 그대로 전체 시간 감소분이 되지는 않았다. 실제 AWS 리소스 생성/삭제 시간은 실행마다 변동성이 있었고, 그 시간이 여전히 큰 비중을 차지했기 때문이다.

## 7. 3차 문제 원인

2차 개선 뒤에도 첫 Apply Plan은 여전히 느렸다. 이유는 단순했다. 첫 Plan을 누르기 전에는 아직 해당 Deployment의 `.terraform.lock.hcl`이 없었다.

즉, 첫 Plan의 `terraform init`은 여전히 provider version 탐색과 lock file 생성을 수행했다. Apply 이후 단계는 빨라졌지만, 사용자가 처음 누르는 Plan 앞에는 차가운 init 비용이 남아 있었다.

또 하나 확인해야 할 부분은 Terraform command 밖의 시간이었다. `terraform plan artifact upload`, `deployment plan save`, `terraform state upload`, `deployment apply result save`, `deployment destroy result save` 같은 S3/DB 작업이 실제 병목인지 분리해서 볼 필요가 있었다.

3차 문제는 이렇게 정리할 수 있다. 첫 Plan에는 아직 차가운 init 비용이 남아 있었고, S3/DB 저장 구간이 병목인지도 별도로 확인해야 했다.

## 8. 3차 해결

3차에서는 Deployment 생성 직후 `/deployments/:deploymentId/init`을 호출하도록 했다. 이 init은 AWS 리소스를 생성하지 않는다. Terraform provider 준비와 lock file 생성만 수행한다.

prewarm은 best-effort로 동작하게 했다. Deployment 생성이 성공하면 init prewarm을 요청하고, 성공하면 lock file을 저장한다. 실패하더라도 Deployment 생성은 실패시키지 않았다.

이 방식으로 사용자가 Apply Plan 버튼을 누르기 전에 provider 준비를 먼저 끝낼 수 있게 했다. 이후 Plan은 저장된 lock file과 shared cache를 재사용한다.

하지만 이 해결책에는 중요한 전제가 있다. prewarm이 사용자 대기 시간 밖에서 끝나야 한다는 점이다.

사용자가 Deployment를 만들어 두고 나중에 Plan을 누르는 흐름이라면 효과가 있다. 반대로 Deployment 생성 버튼을 누른 뒤 곧바로 Plan 완료를 기다리는 흐름이라면 prewarm 시간도 사실상 사용자 대기 시간에 포함된다.

## 9. 3차 해결 결과와 한계

3차 개선 후 live Deployment를 다시 실행했다. 실행 대상은 full-stack demo Terraform artifact였고, create plan은 `8 to add`, destroy plan은 `8 to destroy`였다.

대상 리소스는 `aws_vpc`, `aws_subnet`, `aws_internet_gateway`, `aws_route_table`, `aws_route_table_association`, `aws_security_group`, `aws_instance`, `aws_s3_bucket`이었다.

prewarm 자체는 첫 실행이라 `terraform init`에 17.9초가 걸렸다. 사용자가 실제 Apply Plan을 실행할 때는 lock file과 shared cache를 재사용해서 init이 4.4초로 줄었다.

숫자만 보면 첫 Plan의 init은 크게 줄었다. 그러나 prewarm까지 합치면 init 총량은 거의 줄지 않았다.

| 기준 | 3차 개선 전 | 3차 개선 후 | 해석 |
| --- | ---: | ---: | --- |
| 첫 사용자 Apply Plan init | 20.9s | 4.4s | prewarm이 먼저 끝나 있으면 16.5s 감소 |
| 사용자 실행 구간 init 합계 | 37.1s | 19.5s | prewarm을 사용자 대기에서 제외하면 17.6s 감소 |
| prewarm 포함 init 합계 | 37.1s | 37.4s | 실제 init 총량은 거의 줄지 않음 |

이후 Apply init은 4.3초, Destroy Plan init은 5.4초, Destroy init도 5.4초였다. 사용자 실행 구간의 init 합계는 19.5초였다.

S3/DB 저장 작업은 대부분 ms 단위였다. `terraform plan artifact upload`는 93ms, `deployment plan save`는 10ms, `terraform state upload`는 85ms, `deployment apply result save`는 15ms였다.

Destroy 관련 저장 작업도 10~91ms 수준이었다. 따라서 S3/DB 저장은 현재 병목이 아니었다.

3차의 결론은 “prewarm으로 해결했다”가 아니다. 더 정확히는 “prewarm은 UX 조건이 맞을 때만 체감 효과가 있고, 현재 흐름에서는 핵심 해결책이 아니다”에 가깝다.

## 10. 최종 결과 재해석

기존 최종 수치는 prewarm을 사용자 실행 구간 밖으로 둘 수 있다는 가정에서 의미가 있다.

| 기준 | 1차 개선 전 | 3차 개선 후 | 변화 |
| --- | ---: | ---: | ---: |
| 사용자 실행 구간 합계 | 168.054s | 127.970s | 40.084s 감소, 약 23.8% 개선 |
| prewarm 포함 총합 | 168.054s | 145.950s | 22.104s 감소, 약 13.2% 개선 |
| 사용자 실행 구간 init 합계 | 70.3s | 19.5s | 50.8s 감소, 약 72.3% 개선 |
| prewarm 포함 init 합계 | 70.3s | 37.4s | 32.9s 감소, 약 46.8% 개선 |

다만 현재 UX를 “Deployment 생성 버튼을 누르면 Plan을 기다린다”로 보면, prewarm은 사용자 대기 시간에서 완전히 빠지지 않는다.

따라서 발표에서는 이 결과를 다르게 설명하는 편이 정확하다. 1차와 2차는 실제 병목을 줄였고, 3차는 병목을 사용자 대기 밖으로 옮기려 했지만 UX 전제 때문에 한계가 있었다.

최종 병목도 명확해졌다. `terraform init`은 사용자 실행 구간에서 4.3~5.4초대로 줄었고, S3/DB/lock 저장은 대부분 5~309ms라 병목이 아니었다.

반면 `terraform apply tfplan` create는 39.1초, destroy는 45.7초가 걸렸다. Apply에서는 `aws_vpc.main`, `aws_subnet.public`, `aws_instance.web`가 각각 11~12초 정도 걸렸다.

Destroy에서는 `aws_instance.web`와 `aws_internet_gateway.igw`가 각각 40초, 38초 걸렸다. 이 구간은 SketchCatch 내부 DB/S3 저장 시간이 아니라 AWS가 실제 EC2 termination, network detach/delete를 처리하는 시간이다.

## 11. 최종 결과

이번 작업으로 줄인 것은 두 가지다.

첫째, 불필요한 순차 준비 대기를 줄였다. 둘째, 반복 `terraform init` 비용을 줄였다.

prewarm은 조건부 개선이다. Deployment 생성 직후 바로 Plan을 기다리는 흐름이라면 prewarm도 사용자 대기에 포함될 수 있다.

남은 병목은 더 명확하다.

| 남은 병목 | 의미 |
| --- | --- |
| `terraform plan` AWS refresh/API 조회 | 실제 AWS 상태를 읽어 plan을 계산하는 시간 |
| `terraform apply tfplan` create | EC2, VPC, Subnet, S3 등 실제 AWS 생성 시간 |
| `terraform apply tfplan` destroy | EC2 termination, IGW detach/delete 등 실제 AWS 삭제 시간 |
| Destroy Plan `show-json` | cleanup 승인 화면에 아직 남은 plan inspection 시간 |

따라서 발표에서의 결론은 이렇게 잡는 것이 좋다.

```text
Terraform 실행 속도 개선은 Terraform 자체를 빠르게 만드는 문제가 아니었다.
줄일 수 있는 반복/준비 대기와 AWS가 처리하는 실제 생성/삭제 대기를 분리하는 문제였다.
```
