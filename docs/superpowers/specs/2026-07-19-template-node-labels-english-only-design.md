# Template Node Labels English-Only Design

## Goal

사용 가능한 29개 Template에서 Architecture Board와 Template 미리보기에 표시되는 모든 node 이름을 자연스러운 영어로 통일한다. 범위는 배포 가능한 Resource 199개와 사용자, 환경, 계정, 그룹 같은 presentation node 16개다.

## Scope

- 직접 제작 Template 6개와 수집에 성공한 Brainboard Template 23개를 변경한다.
- `DiagramNode.label`에 한국어가 포함된 Resource 및 presentation node를 모두 영어로 바꾼다.
- Template 제목, 설명, 태그와 일반 UI 문구는 변경하지 않는다.
- 수집에 실패한 `brainboard-aws-instance-db-multiple-networks`는 표시할 Board가 없으므로 제외한다.

## Naming Rules

- AWS와 Kubernetes의 공식 Resource 명칭 및 약어를 유지한다. 예: VPC, IAM, EKS, ECS, ALB, S3, Lambda.
- 역할과 위치를 짧고 자연스러운 영어로 표현한다. 예: `Application Private Subnet A`, `Lambda Execution IAM Role`, `Static Website S3 Bucket`.
- 긴 보조 Resource는 Resource type과 목적을 함께 표시한다. 예: `Security Group Rule - ALB HTTPS Ingress`, `Route Table Association - Public A`.
- 직역으로 어색한 표현은 피하고 실제 AWS 문서와 Console에서 익숙한 용어를 사용한다.
- 각 Template 안의 기존 이름 구분과 고유성을 유지한다.
- presentation node도 `Web User`, `Production Environment`, `AWS Account`, `Approved User`처럼 영어로 바꾼다.

## Identity and Behavior Boundaries

변경 대상은 node `label`뿐이다. 다음 값과 동작은 그대로 유지한다.

- Resource 수와 관계
- Terraform block type, resource type, local name과 address
- AWS-side name 및 provider 설정
- parameter 값과 Terraform 파일
- node id, 위치, 크기, containment와 edge routing
- Template 적용, Compiler, Terraform preview와 sync 동작

## Source Strategy

별도의 런타임 번역 맵이나 자동 이름 생성기를 추가하지 않는다. 직접 제작 Template 정의와 Brainboard source의 기존 authored label을 사람이 검토한 영어 이름으로 직접 교체한다. Materializer는 현재처럼 authored label을 그대로 전달한다.

## Verification

1. 먼저 사용 가능한 29개 Template의 모든 node label에 한글이 없음을 검증하는 테스트를 추가하고, 현재 215개 label 때문에 실패하는 것을 확인한다.
2. label만 수정해 해당 테스트를 통과시킨다.
3. Template별 label 공백, 줄바꿈, 중복 여부와 Resource identity projection이 변경되지 않았음을 확인한다.
4. 기존 Template, Compiler, Terraform sync, layout 계약 테스트를 실행한다.
5. 29개 Template의 `terraform init` 및 `terraform validate` 결과가 기존과 동일하게 통과하는지 확인한다.
6. 실제 Board 기반 WebP 29장을 다시 캡처하고 materialized `DiagramJson` 해시, Compiler knowledge와 evidence artifact를 갱신한다.
7. 미리보기에서 한국어 node 이름이 없고 영어 이름이 영역 밖으로 벗어나지 않는지 확인한다.

## Non-Goals

- Template 설명이나 제품 UI 전체의 영문화
- 사용자가 Template 적용 후 직접 수정한 이름의 제한 또는 자동 번역
- 전역 번역 사전, 영어 이름 생성기 또는 Resource catalog 이름 변경
- Terraform 및 AWS Resource 이름 변경
