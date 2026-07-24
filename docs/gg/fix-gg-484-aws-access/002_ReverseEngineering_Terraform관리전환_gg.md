# Reverse Engineering Terraform 관리 전환

## 목적

Reverse Engineering은 기존 AWS 리소스를 목록으로 보여주는 기능이 아니다. 기존 인프라의 리소스, 설정, 관계를 보드에 복원하고, 사용자가 보드에서 수정한 뒤 승인된 변경을 기존 AWS에 반영하는 기능이다.

## 완료 흐름

1. AWS의 기존 인프라를 읽는다.
2. 발견한 리소스를 실제 서비스 타입, 설정, 관계와 함께 보드에 복원한다.
3. 사용자가 후보를 프로젝트로 적용한다.
4. 적용한 리소스별 Terraform 설정과 import 대상을 만든다.
5. 첫 plan에 Terraform import를 포함해 기존 리소스를 새로 만들지 않는다.
6. 사용자가 import와 변경 내용을 함께 확인하고 승인한다.
7. apply가 기존 리소스를 Terraform state에 연결하고 승인된 변경만 반영한다.
8. 이후 보드 수정은 같은 state를 사용해 plan, 승인, apply 순서로 반영한다.

## 관리 경계

- 사용자가 만든 AWS 워크로드 리소스는 Terraform 관리 대상으로 전환한다.
- AWS service-linked Role, AWS-managed IAM Policy와 KMS Key는 AWS가 소유하므로 수정하지 않는다.
- SketchCatch 연결, 가져오기 권한, CodeBuild 연결을 유지하는 Role, Policy, CloudFormation Stack은 프로젝트 Terraform이 소유하지 않는다.
- 보호 리소스도 구조 파악을 위해 보드에 표시할 수 있지만 `AWS 관리` 또는 `SketchCatch 연결용`으로 이유를 밝힌다.
- 리소스 종류만 안다고 배포 가능 처리하지 않는다. 전용 조회 결과, 생성에 필요한 설정, 안정적인 import ID, Terraform 검증을 모두 통과해야 한다.

## 안전 규칙

- import 없이 기존 리소스와 같은 Terraform resource를 plan하지 않는다.
- 최초 import plan에서 replace와 delete는 기본 차단한다.
- import 대상과 Terraform block 주소는 서버의 저장된 scan 결과로 검증한다.
- 브라우저가 보낸 ARN이나 import 명령을 신뢰하지 않는다.
- 보드에서 사용자가 바꿀 수 있는 값과 AWS 원본 추적값을 분리한다.
- 실제 apply는 기존 배포 위자드의 plan 승인 절차를 그대로 사용한다.

## 구현 순서

1. 리소스 소유권과 Terraform 전환 준비 상태 계약
2. 프로젝트 적용 시 scan과 Terraform node 연결 보존
3. Terraform import block artifact 생성
4. 최초 import plan의 replace/delete 차단과 사용자 승인
5. 지원 리소스별 전용 조회와 Terraform 설정 정규화
6. 실제 AWS fixture로 import 후 zero-change plan 검증

## 완료 기준

- 기존 AWS 리소스를 프로젝트로 적용한 첫 plan이 신규 생성이 아니라 import로 표시됨
- import apply 후 같은 보드로 다시 plan했을 때 의도하지 않은 변경이 없음
- 보드에서 지원 설정을 수정하면 해당 리소스의 update만 plan에 표시됨
- AWS 및 SketchCatch 소유 리소스는 수정·삭제 plan에 포함되지 않음
- 사용자 승인 전에는 Terraform state와 AWS가 바뀌지 않음
