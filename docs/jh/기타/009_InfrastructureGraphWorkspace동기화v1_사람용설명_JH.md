# InfrastructureGraph 중심 Workspace 동기화 v1 사람용 설명

## 한 줄 요약

다이어그램, 오른쪽 파라미터 패널, Terraform Preview, Terraform editor가 서로 다른 기준으로 움직이지 않도록 가운데에 `InfrastructureGraph`라는 공통 해석 단계를 두는 작업이다.

## 지금 문제가 무엇인가

현재 사용자는 다이어그램에 아이콘을 올리고, 오른쪽 패널에서 파라미터를 넣고, Terraform Preview에서 코드를 볼 수 있다.

하지만 세 영역이 완전히 같은 기준으로 움직인다고 보기 어렵다.

- 다이어그램은 화면 배치와 아이콘 중심이다.
- 파라미터 패널은 `parameters.values` 중심이다.
- Terraform Preview는 그 값을 읽어서 HCL 문자열을 만든다.
- Terraform editor에서 코드를 직접 수정하면 그 변경을 다시 다이어그램으로 가져오는 기준이 약하다.

그래서 지금은 “보이는 리소스”, “파라미터에 저장된 값”, “Terraform code에 있는 리소스”가 서로 어긋날 수 있다.

## InfrastructureGraph를 왜 쓰는가

`InfrastructureGraph`는 사용자가 직접 보는 새 화면이 아니다.

쉽게 말하면, 다이어그램과 Terraform 사이에 두는 번역용 중간 장부다.

다이어그램에는 위치, 크기, 아이콘, 색, 잠금 상태처럼 화면용 정보가 많다. Terraform에는 이런 정보가 필요 없다. Terraform이 필요한 것은 대략 다음 정보다.

- 이 block이 `resource`인지 `data`인지
- Terraform resource type이 무엇인지
- Terraform resource name이 무엇인지
- 실제 HCL body에 들어갈 값이 무엇인지

`InfrastructureGraph`는 이 정보만 골라서 Terraform이 읽기 좋은 형태로 정리한다.

## 무엇이 좋아지는가

첫째, Terraform Preview가 안정된다.

같은 다이어그램을 넣으면 같은 Terraform code가 반복해서 나와야 한다. 중간에 `InfrastructureGraph`를 두면 화면용 데이터와 Terraform용 데이터를 섞어서 읽는 일이 줄어든다.

둘째, Terraform code에서 들어온 변경을 더 안전하게 다룰 수 있다.

Terraform editor에서 사용자가 코드를 직접 추가했을 때, 바로 다이어그램을 바꾸면 위험하다. 대신 “이 리소스를 다이어그램에 추가할까요?” 같은 proposal로 보여주고, 사용자가 승인한 것만 반영한다.

셋째, 리소스를 식별하는 기준이 명확해진다.

이번 작업에서는 Terraform 리소스를 아래 세 값으로 식별한다.

```txt
terraformBlockType + resourceType + resourceName
```

예를 들면 아래 둘은 이름이 같아도 서로 다른 대상이다.

```txt
resource.aws_ami.ubuntu
data.aws_ami.ubuntu
```

반대로 `fileName`은 identity가 아니다. 파일이 달라졌다고 다른 리소스가 되는 것은 아니고, 어느 파일에서 왔는지 알려주는 위치 정보에 가깝다.

## 이번에 사용자가 보게 되는 변화

오른쪽 파라미터 패널에서 **Advanced Parameters 영역이 사라진다.**

이유는 단순하다. 아직 어떤 optional parameter를 어떤 기준으로 고급 파라미터로 보여줄지 내부 정책이 정해지지 않았다. 정책이 없는 상태에서 optional 값을 많이 노출하면, 사용자는 무엇을 넣어야 하는지 더 헷갈릴 수 있다.

대신 이번에는 Metadata와 Main parameters 중심으로 유지한다.

중요한 점은 Advanced Parameters UI만 제거한다는 것이다. 이미 저장된 optional 값이 있다면 그 값을 일부러 지우지는 않는다. Terraform Preview가 읽을 수 있는 값이면 계속 보존된다.

## Terraform editor에서 코드가 바뀌면 어떻게 되는가

앞으로는 Terraform code를 다이어그램으로 되돌릴 때 세 가지 종류의 제안이 생긴다.

| 상황 | 처리 |
| --- | --- |
| Terraform code에만 새 리소스가 있음 | `create_candidate`로 제안 |
| 다이어그램에는 있는데 Terraform code에는 없음 | `delete_candidate`로 제안 |
| 같은 타입에서 이름만 바뀐 것이 명확함 | `rename_candidate`로 제안 |

이 제안들은 자동 적용되지 않는다.

사용자가 승인해야 실제 다이어그램에 반영된다. 이 원칙은 SketchCatch의 기본 방향과도 맞다. AI나 코드 분석은 제안할 수 있지만, Practice Architecture 변경은 사용자가 받아들여야 한다.

## 이번 v1에서 지원하는 리소스

이번 범위는 AWS 전체가 아니다. MVP에서 먼저 안정화할 리소스만 다룬다.

Terraform Preview는 기존에 이미 다루던 VPC/EC2/S3 계열 렌더링을 유지한다.

- `resource.aws_vpc`
- `resource.aws_subnet`
- `resource.aws_internet_gateway`
- `resource.aws_route_table`
- `resource.aws_route_table_association`
- `resource.aws_security_group`
- `resource.aws_security_group_rule`
- `resource.aws_instance`
- `resource.aws_s3_bucket`
- `data.aws_ami`

다만 Terraform editor에서 새 리소스를 발견했을 때 다이어그램 생성/삭제/이름 변경 proposal로 제안하는 범위는 더 좁게 시작한다.

- `resource.aws_vpc`
- `resource.aws_subnet`
- `resource.aws_security_group`
- `resource.aws_instance`
- `resource.aws_s3_bucket`
- `data.aws_ami`

이 proposal 목록 밖의 새 리소스 구조 변경은 나중에 확장한다.

## 이번 작업에 포함되지 않는 것

이번 작업은 Terraform을 실제로 실행하는 작업이 아니다.

포함하지 않는 것:

- 실제 `terraform apply`
- 실제 `terraform destroy`
- 실제 cloud resource 생성/삭제
- Git/CI/CD handoff 실행
- 전체 AWS resource catalog 지원
- Advanced Parameters 정책 설계
- Terraform code를 보고 자동 edge 생성
- `InfrastructureGraph`를 DB 저장 원본으로 변경

## 구현은 어떻게 나눠서 가는가

커밋은 작게 나눈다.

대략 아래 순서다.

1. shared type에 proposal 계약을 추가한다.
2. Terraform block identity helper를 만든다.
3. `DiagramJson`을 `InfrastructureGraph`로 바꾸는 helper를 만든다.
4. Terraform Preview 생성기를 graph 기준으로 바꾼다.
5. `data.aws_ami`의 `filter` 구조를 parser와 renderer에서 맞춘다.
6. 기본 parameter skeleton 정책을 테스트로 고정한다.
7. Advanced Parameters UI를 제거한다.
8. Terraform sync API가 여러 파일 입력을 받을 수 있게 한다.
9. parser가 source file 정보를 보존하게 한다.
10. 기존 리소스 값 동기화를 안정화한다.
11. 새 리소스 생성 proposal을 만든다.
12. 삭제/이름 변경 proposal을 만든다.
13. frontend에서 proposal 적용 helper를 만든다.
14. Terraform panel에 사용자 승인 흐름을 연결한다.
15. 최종 문서와 검증 기록을 정리한다.

이렇게 나누면 커밋 수는 늘어나지만, 각 커밋의 책임이 분명해진다. 문제가 생겼을 때 어느 단계가 원인인지 찾기도 쉬워진다.

## 완료되었다고 볼 수 있는 기준

- 같은 다이어그램에서 같은 Terraform Preview가 반복 생성된다.
- Advanced Parameters UI가 보이지 않는다.
- 기존 optional 값은 임의로 삭제되지 않는다.
- Terraform code에 추가된 지원 리소스가 proposal로 나타난다.
- proposal 승인 전에는 다이어그램이 자동으로 바뀌지 않는다.
- 삭제와 이름 변경도 자동 반영이 아니라 proposal로 처리된다.
- 오류가 있는 Terraform code는 다이어그램을 조용히 바꾸지 않는다.
