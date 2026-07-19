# Template Resource 표시 이름 단순화 설계

## 문제

Template으로 Architecture Board를 만들면 `default`, `snet1`, `iam-cluster`,
`IAM role policy attachment Registry`처럼 원본 또는 Terraform 중심 이름이 그대로 보인다.
Resource의 종류와 역할을 한눈에 알기 어렵고, Board·Resource 패널·Template 미리보기와 사용자
설명에서 같은 대상을 이해하는 데 불필요한 해석이 필요하다.

## 목표

적용 가능한 Template 29개에 포함된 모든 Resource의 기존 `label`을 한 줄짜리 사용자 표시
이름으로 정리한다. 직접 제작 Template 6개와 원본 수집에 성공한 Brainboard Template 23개가
대상이다. 원본 수집에 실패해 적용할 Resource가 없는 Brainboard 기록 1개는 제외한다.

이 작업은 이름만 바꾼다. Resource 수, 관계, 설정, 위치, 내부 ID, Terraform 주소, provider-side
name과 배포 결과는 바꾸지 않는다.

## 이름 규칙

1. Resource 표시 이름은 Template 전체에서 고유한 한 줄 이름이어야 한다.
2. 주요 Resource는 AWS 공식 유형 또는 널리 쓰이는 약어를 이름에 유지한다.
3. `Public`, `Private`, `NAT`, `AZ`, `Worker Node`처럼 AWS에서 익숙한 역할어는 영어를 유지한다.
4. 애플리케이션·데이터베이스처럼 Template 안의 업무 역할은 짧은 한국어로 표현한다.
5. 기술적인 보조 Resource는 정확한 provider 유형보다 사용 목적을 먼저 보여준다.
   예: `ECR 읽기 권한 연결`, `Public Route 연결 A`.
6. 같은 유형은 역할, 위치, 번호 순으로 구분한다. 번호는 다른 구분값이 없을 때만 사용한다.
7. 역할을 근거로 판단할 수 없으면 추측하지 않고 공식 유형과 위치 또는 번호로 구분한다.
8. Region, AZ, network zone 같은 비 Resource 영역 제목도 짧은 한 줄로 정리한다. 영역 계층과
   기존 중복 처리 방식은 유지하며 Resource 이름처럼 보드 전체 고유성을 새로 강제하지 않는다.
9. Template 적용 후 사용자가 직접 편집한 이름에는 이 규칙을 강제하거나 자동 보정하지 않는다.

정확한 Terraform 유형과 IaC Identity는 Resource 상세, 복사 동작과 진단에서 보조 정보로
제공한다. 보드의 기본 이름을 대체하지 않는다.

## 데이터와 표시 경계

기존 Template Resource의 `label`을 직접 수정한다. 별도 `displayName` 필드, 이름 목록, 런타임
이름 생성기 또는 자동 변환 계층을 추가하지 않는다. Brainboard 원본 수집 JSON과 원본 이름은
수집 증거이므로 변경하지 않는다.

Architecture Board, 오른쪽 Resource 목록·상세, Template 미리보기, AI/Compiler 사용자 설명은
동일한 materialized Resource `label`을 사용한다. 특정 화면이 Terraform 주소나 원본 label을
별도로 표시하고 있다면 새 이름 데이터를 복제하지 않고 materialized `label`을 사용하도록
표시 경계만 바로잡는다.

Resource를 숨기거나 합치거나 접지 않는다. Route Table Association과 IAM Policy Attachment 같은
보조 Resource도 실제 배포 구성을 이해할 수 있도록 계속 보드에 표시한다.

## 승인된 파일럿: AWS onboarding

`AWS onboarding`의 22개 표시 이름을 다음과 같이 정리한다. 이 파일럿의 이름 형식은 사용자에게
승인받았으며 나머지 28개 Template에 같은 기준을 적용한다.

| 현재 label | 새 표시 이름 |
| --- | --- |
| `US East (N. Virginia)` | `US East (N. Virginia)` |
| `default` | `EKS VPC` |
| `cluster-sg` | `EKS Cluster SG` |
| `us-east-1a` | `AZ us-east-1a` |
| `us-east-1b` | `AZ us-east-1b` |
| `snet1` | `Public Subnet A` |
| `snet2` | `Public Subnet B` |
| `IAM role policy attachment Registry` | `ECR 읽기 권한 연결` |
| `iam-cluster` | `EKS Cluster IAM Role` |
| `IAM role policy attachment CNI policy` | `CNI 권한 연결` |
| `default-iam` | `Worker Node IAM Role` |
| `IAM role policy attachment WN` | `Worker Node 권한 연결` |
| `IAM role policy attachment RC` | `VPC Controller 권한 연결` |
| `IAM role policy attachment CP` | `EKS Cluster 권한 연결` |
| `Internet gateway` | `Internet Gateway` |
| `Route table` | `Public Route Table` |
| `EKS cluster` | `EKS Cluster` |
| `EKS node group` | `EKS Node Group` |
| `SG rule` | `Cluster API HTTPS 허용` |
| 첫 번째 `Route table association` | `Public Route 연결 A` |
| 두 번째 `Route table association` | `Public Route 연결 B` |
| `Internet` | `Internet` |

## 적용 순서

1. 승인된 `AWS onboarding` 파일럿의 기존 `label`을 수정하고 실제 Board에서 한 줄 표시와 전체
   사용자 화면의 이름 일치를 확인한다.
2. 나머지 28개 Template을 하나씩 읽어 Resource 유형, 설정과 관계를 근거로 이름을 정리한다.
3. 각 Template 안에서 Resource 이름 중복과 줄바꿈이 없는지 사람이 확인한다.
4. 적용 가능한 29개 Template을 모두 실제 Board로 열어 Board, Resource 목록·상세와 사용자 설명을
   검수한다.
5. 29개 Board를 기존 캡처 계약에 따라 `1280 × 720`, WebP로 다시 캡처한다.
6. 직접 제작 6개와 Brainboard 23개의 versioned thumbnail asset 및 현재 Diagram의
   `diagramHash`를 함께 갱신한다.
7. Dashboard와 Workspace Template 화면에서 카드 및 큰 미리보기를 모두 확인한다.

## 검증

새로운 이름 생성기나 이름 규칙 전용 자동 테스트는 추가하지 않는다. 현재 29개 Template을
직접 검토하는 일회성 정리이며 다음 증거를 남긴다.

- 29개 Template의 실제 Board에서 모든 이름이 한 줄로 보이는지 확인
- Template별 Resource 이름이 중복되지 않는지 확인
- 영역 제목, Resource 목록·상세, Template 미리보기와 사용자 설명의 이름 일치 확인
- Terraform Preview의 Resource 주소와 참조가 이름 변경 전과 동일한지 비교
- 29개 WebP asset과 Manifest `diagramHash`의 현재 Diagram 일치 확인
- 기존 Template materialization·Terraform 변환 회귀와 `pnpm harness:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm build` 실행

미리보기 캡처가 실패하면 기존 asset과 hash를 짝이 맞지 않는 상태로 일부만 갱신하지 않는다.
해당 Template의 이름과 Board를 다시 확인한 뒤 asset과 hash를 함께 반영한다.

## 제외 범위

- Template 제목 또는 설명 변경
- Brainboard 원본 수집 JSON과 실패 기록 변경
- Resource 추가·삭제·그룹화·숨김
- 관계, 설정, 위치 또는 Terraform 주소 변경
- provider-side name이나 AWS `Name` tag 변경
- 사용자 편집 이름에 대한 검증 또는 자동 보정
- 전역 이름 생성기, 새 `displayName` 계약 또는 이름 규칙 전용 자동 테스트 추가
