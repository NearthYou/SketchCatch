# Terraform 동기화 코어 코드리뷰

## 문서 목적

이번 브랜치의 핵심은 `DiagramJson`, `InfrastructureGraph`, Terraform Preview, Terraform editor sync가 같은 리소스 식별 기준을 쓰게 만드는 것이다.

이 문서는 backend/shared type 중심 변경을 코드리뷰하듯 설명한다. 리뷰어는 이 문서를 먼저 읽고 다음 파일을 보면 전체 의도를 빠르게 잡을 수 있다.

- `packages/types/src/index.ts`
- `apps/api/src/services/terraform/infrastructure-graph.ts`
- `apps/api/src/services/terraform/diagram-to-terraform.ts`
- `apps/api/src/services/terraform/terraform-to-diagram.ts`
- `apps/api/src/routes/terraform.ts`
- `apps/web/features/workspace/terraform-sync-proposals.ts`

## 큰 설계 판단

### 1. `DiagramJson`은 저장 원본이고, `InfrastructureGraph`는 변환용 projection이다

`InfrastructureGraph`를 새 DB 원본으로 만든 것이 아니다.

리뷰 포인트:

- 화면 배치, 아이콘, 크기, viewport 같은 UI 데이터는 `DiagramJson`에 남는다.
- Terraform 생성에 필요한 identity, provider resource type, resource name, values만 graph로 투영한다.
- 같은 `DiagramJson` 입력이면 같은 Terraform Preview가 반복 생성되어야 한다.

이 판단이 중요한 이유는, 화면 상태와 배포 가능한 IaC 상태를 섞어 읽으면 작은 UI 변경이 Terraform 결과를 흔들 수 있기 때문이다.

### 2. Terraform identity는 `blockType + resourceType + resourceName`이다

리소스 식별 기준은 다음 세 값이다.

```txt
terraformBlockType + resourceType + resourceName
```

예시:

```txt
resource.aws_instance.web
data.aws_ami.ubuntu
```

`fileName`은 identity가 아니다. 어느 파일에서 왔는지 알려주는 source metadata일 뿐이다.

리뷰 포인트:

- `resource.aws_ami.ubuntu`와 `data.aws_ami.ubuntu`는 서로 다른 identity다.
- `main.tf`에서 `network.tf`로 옮겨져도 같은 block이면 같은 리소스다.
- rename 판단은 identity 변화로 판단하고, 파일 이동은 rename으로 보지 않는다.

## Shared Type 리뷰

`packages/types/src/index.ts`에는 Terraform sync contract가 추가되었다.

주요 계약:

- `TerraformBlockIdentity`
- `TerraformSyncFileInput`
- `TerraformSyncToDiagramRequest`
- `TerraformSyncToDiagramResponse`
- `TerraformDiagramChangeProposal`
- `TerraformDiagnostic.sourceFileName`

리뷰 포인트:

- 요청은 기존 `terraformCode` 단일 문자열을 유지하면서 `terraformFiles`를 optional로 받는다.
- 응답은 `diagramJson`, `diagnostics`, `proposals`를 분리한다.
- diagnostic은 `line`만이 아니라 `sourceFileName`을 가질 수 있다.
- proposal은 create/delete/rename을 명시적으로 구분한다.

좋은 점:

- 기존 단일 파일 호출부와 호환된다.
- multi-file Terraform으로 확장할 수 있다.
- frontend가 현재 파일 기준으로만 빨간줄을 표시할 수 있다.

주의할 점:

- proposal 타입이 늘어나면 `terraform-sync-proposals.ts`와 API 테스트를 같이 업데이트해야 한다.
- `sourceFileName`은 사용자에게 표시될 수 있으므로 secret path나 로컬 절대 경로를 넣지 않아야 한다.

## `InfrastructureGraph` projection 리뷰

`apps/api/src/services/terraform/infrastructure-graph.ts`는 `DiagramJson`을 Terraform 생성에 필요한 그래프로 바꾼다.

리뷰 포인트:

- resource node만 graph 대상으로 삼는다.
- unsupported resource는 조용히 graph에서 제외하거나 diagnostics로 올리는 정책이 테스트와 맞아야 한다.
- invalid parameter가 있어도 Preview skeleton을 유지해야 하는 리소스는 누락시키지 않는다.
- node metadata에서 Terraform identity를 읽는 방식이 frontend 생성 규칙과 맞아야 한다.

왜 필요한가:

- `diagram-to-terraform.ts`가 화면 구조를 직접 뒤지는 일을 줄인다.
- Terraform renderer가 UI 전용 필드를 알 필요가 없어진다.
- provider adapter가 늘어날 때 중간 모델을 확장하기 쉽다.

리뷰 중 확인할 질문:

- VPC, Subnet, Security Group, EC2, S3, AMI data source가 graph에 일관되게 들어가는가?
- Terraform에 필요 없는 canvas position, size, icon 정보가 renderer로 새지 않는가?
- graph node 정렬 순서가 Preview 반복 생성 안정성을 해치지 않는가?

## Terraform Preview 생성 리뷰

`apps/api/src/services/terraform/diagram-to-terraform.ts`는 `DiagramJson -> InfrastructureGraph -> Terraform` 흐름으로 정리되었다.

리뷰 포인트:

- renderer가 `InfrastructureGraph`를 기준으로 HCL block을 만든다.
- `data.aws_ami.filter` nested block을 parser와 같은 구조로 다룬다.
- identifier 검증 없이 HCL label이나 attribute key를 문자열로 넣지 않는다.
- 지원 범위 밖 resource를 무리하게 HCL로 만들지 않는다.

중요한 보안성:

- `resourceType`, `resourceName`, attribute/block key는 Terraform identifier 형식으로 검증한다.
- 이 검증은 HCL injection을 막기 위한 최소 안전장치다.

리뷰 중 확인할 질문:

- 문자열 값은 quote escaping이 되는가?
- reference 값과 literal string 값이 구분되는가?
- 빈 값 또는 missing required value가 preview를 완전히 깨뜨리지는 않는가?

## Terraform -> Diagram sync 리뷰

`apps/api/src/services/terraform/terraform-to-diagram.ts`는 editor code를 다시 `DiagramJson`에 반영할 때의 안전판이다.

주요 동작:

- parser error는 diagnostic으로 반환한다.
- duplicate block identity는 diagnostic으로 반환한다.
- existing identity의 값 변경은 가능한 경우 `diagramJson`에 반영한다.
- Terraform-only block은 `create_candidate` proposal이 된다.
- Diagram-only node는 `delete_candidate` proposal이 된다.
- 명확한 이름 변경은 `rename_candidate` proposal이 된다.
- 빈 Terraform 입력은 전체 삭제 의도로 해석할 수 있다.

리뷰 포인트:

- parser가 file별 line/source metadata를 보존하는가?
- `terraformFiles`가 있으면 diagnostic line이 해당 파일 기준으로 계산되는가?
- unsupported resource를 자동으로 diagram에 만들지 않는가?
- create proposal은 catalog icon/size를 frontend에서 적용할 수 있는 최소 metadata를 제공하는가?

중요한 정책 변화:

처음 계획은 proposal을 별도 확인 UI로 보여주는 것이었다. 이후 사용자 피드백에 따라 변경 제안 확인 UI는 제거되었다.

최종 정책:

- Terraform editor에서 사용자가 명시적으로 저장하거나 배포 준비 action을 누르는 순간을 User-Accepted Change로 본다.
- create/delete/rename proposal은 그 명시 action 안에서 자동 반영된다.
- 저장 전 자동 반영은 하지 않는다.

리뷰 중 확인할 질문:

- 저장 버튼을 누르기 전에는 diagram이 바뀌지 않는가?
- 저장 실패 diagnostic이 있으면 diagram이 조용히 바뀌지 않는가?
- delete proposal이 edge까지 같이 제거하는가?
- rename proposal이 `parameters.fileName` 같은 source metadata를 잃지 않는가?

## Frontend proposal 적용 helper 리뷰

`apps/web/features/workspace/terraform-sync-proposals.ts`는 backend proposal을 실제 `DiagramJson` 변경으로 바꾸는 frontend helper다.

리뷰 포인트:

- create proposal은 resource catalog의 icon/size를 사용한다.
- unknown resource fallback은 compact size를 사용한다.
- parameter values는 deep clone한다.
- delete proposal은 node와 연결 edge를 같이 제거한다.
- rename proposal은 Terraform identity와 label을 함께 갱신한다.

주의할 점:

- create proposal은 자동 edge를 만들지 않는다.
- Terraform code만 보고 네트워크 연결을 추론하는 것은 이번 범위가 아니다.
- catalog에 없는 resource가 계속 늘어나면 fallback UI가 많아지므로 catalog 보강이 필요하다.

## 테스트 리뷰

중요 테스트 축:

- `apps/api/src/services/terraform/infrastructure-graph.test.ts`
- `apps/api/src/services/terraform/diagram-to-terraform.test.ts`
- `apps/api/src/services/terraform/terraform-to-diagram.test.ts`
- `apps/api/src/routes/terraform.test.ts`
- `apps/web/features/workspace/terraform-sync-proposals.test.ts`
- `apps/web/features/workspace/terraform-panel-utils.test.ts`

테스트가 잡는 위험:

- 같은 diagram에서 Preview가 반복 생성되는지
- AMI data source filter가 깨지지 않는지
- unsupported/duplicate/parser error가 자동 반영되지 않는지
- empty Terraform 저장이 삭제 의도로 처리되는지
- create/delete/rename proposal이 실제 diagram에 안전하게 적용되는지

## 리뷰어가 마지막에 보면 좋은 체크리스트

- `fileName`을 identity로 착각한 코드가 없는가?
- parser error가 있는데 diagram 변경이 적용되는 경로가 없는가?
- unsupported resource를 자동 생성하는 경로가 없는가?
- HCL label/key 검증 없이 문자열을 HCL에 쓰는 경로가 없는가?
- `DiagramJson -> InfrastructureGraph -> Terraform` 흐름을 우회하는 새 renderer가 없는가?
- 실제 Terraform apply/destroy 또는 AWS SDK 호출이 frontend에 들어오지 않았는가?

