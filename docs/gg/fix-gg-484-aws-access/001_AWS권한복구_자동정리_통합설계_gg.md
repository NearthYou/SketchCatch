# AWS 가져오기 권한 복구와 Board 자동 정리 통합 설계

- 상태: 사용자 승인 완료
- 기준일: 2026-07-19
- 기준 브랜치: `fix/gg/aws-access`
- 관련 이슈: #484

## 1. 목적

이 작업은 서로 이어지는 두 문제를 해결한다.

1. 오래된 AWS 연결이 일부 서비스만 읽을 수 있을 때 기존 연결과 배포 권한을 보존하면서 가져오기 읽기 권한만 안전하게 보완한다.
2. Reverse Engineering으로 가져온 원본을 먼저 보여준 뒤, 사용자가 요청할 때만 Board 자동 정리 후보를 만들고 비교·승인하게 한다.

사용자가 승인하기 전에는 AWS 권한, Project, Board, Terraform을 바꾸지 않는다. 일부 조회가 실패해도 이미 읽은 Resource와 관계는 버리지 않는다.

## 2. 이슈 #484와 후속 결정의 관계

이 문서는 그릴링 중 사용자가 확정한 후속 결정을 최종 기준으로 삼는다. 이슈 #484의 초기 문구와 충돌하면 다음 규칙을 우선한다.

- 원래 AWS 연결 Stack, 연결 Role, 배포 Policy, connection ID는 그대로 둔다.
- 대신 각 연결에 `Import Access Manager Stack`과 `Import Access Policy Stack`을 새로 만든다.
- 자동 정리는 위치와 연결선뿐 아니라 제한된 크기 변경과 장식용 표시 프레임도 다룰 수 있다.
- 단, Resource·관계·설정·실제 소속·Terraform 의미는 절대 바꾸지 않는다.
- Reverse Engineering 직후 자동 정리를 실행하지 않는다. 원본을 먼저 보여주고 사용자가 요청할 때만 실행한다.

## 3. 공통 용어

### AWS 연결

SketchCatch가 하나의 AWS account·region·Role을 사용하기 위한 연결 기록이다. 배포와 Reverse Engineering이 같은 connection ID와 Role을 계속 사용한다.

### 가져오기 준비 상태

Reverse Engineering에 필요한 읽기 요청을 실제로 수행할 수 있는지를 나타내는 상태다. 배포 연결의 `verified`와 별개다.

### Import Access Manager Stack

한 AWS 연결의 가져오기 권한을 관리하는 기반 Stack이다. CloudFormation 전용 service Role, 기존 연결 Role에 붙는 최소 제어 Policy, 정리 완료를 확인하기 위한 읽기 전용 확인 Policy를 소유한다.

### Import Access Policy Stack

Reverse Engineering 읽기 Managed Policy만 소유하는 Stack이다. 기존 연결 Role에 Policy를 붙이지만 그 Role 자체를 만들거나 소유하지 않는다.

### 표시 프레임

Board 요소를 시각적으로 묶어 보이게 하는 제목과 배경이다. Resource의 부모·소속·관계나 AWS 영역을 뜻하지 않는다.

### 안전한 정리 후보

Resource·관계·설정·containment·Terraform 의미는 원본과 같고, 허용된 시각 정보만 다른 Board 후보다.

## 4. 범위와 제외 범위

### 포함

- 기존 AWS 연결의 가져오기 읽기 권한 추가·갱신·확인·정리
- 환경설정에서 사용자 승인과 진행 상태 표시
- Reverse Engineering의 부분 성공 유지와 환경설정 안내
- 가져오기 원본 우선 표시
- 사용자가 요청한 뒤 최대 3개의 안전한 자동 정리 후보 제공
- 데스크톱·모바일 비교 UI
- 쉬운 변경 설명과 안전 안내

### 제외

- 임의 이름 AWS Role 지원
- 기존 연결 Stack이나 배포 Policy 최신화
- Reverse Engineering 전용 두 번째 연결 Role 도입
- Resource Explorer Index나 View 자동 생성
- 지원 AWS Resource 종류 자체의 확대
- AWS Console 승인 없는 Manager Stack 생성·삭제
- 사용자를 대신한 Policy Stack 자동 삭제
- Board Resource·관계·설정·containment 자동 수정
- 내부 Compiler 점수나 AWS 원문 오류의 사용자 노출

## 5. AWS 권한 복구 설계

### 5.1 유지해야 하는 것

권한 복구 전후에 다음 값은 같다.

- `AwsConnection`의 ID
- AWS account와 region
- 기존 연결 Role ARN
- 원래 CloudFormation Stack
- 기존 Terraform 배포 Policy
- 배포용 `verified` 상태
- 기존 Deployment의 `awsConnectionId`

이번 범위가 지원하는 Role 이름은 현재 검증 규칙과 같은 `SketchCatchTerraformExecutionRole`과 `SketchCatchTerraformExecutionRole-...`이다. 이름 규칙만 맞으면 CloudFormation이 만든 Role과 사용자가 직접 만든 Role을 같은 방식으로 다룬다. 임의 이름 Role은 허용하지 않는다.

### 5.2 Stack pair 소유 경계

각 연결은 다른 연결과 공유하지 않는 Stack pair를 가진다.

#### Manager Stack

- `cloudformation.amazonaws.com`만 맡을 수 있는 service Role 소유
- 기존 연결 Role이 자기 연결의 정확한 Policy Stack만 제어하도록 제한한 Policy 소유
- 정확한 service Role만 CloudFormation에 전달할 수 있도록 제한
- Manager·Policy Stack과 소유 IAM Resource만 읽을 수 있는 정리 확인 Policy 소유
- 일반 AWS Resource를 생성·수정·삭제하는 권한 없음

#### Policy Stack

- Reverse Engineering용 읽기 Managed Policy만 소유
- 기존 연결 Role에 읽기 Policy 연결
- 기존 Role Resource, 원래 Stack, 배포 Policy는 소유하지 않음

Stack·Role·Policy 이름은 connection ID 기반 prefix로 결정한다. ownership tag와 Stack output에도 connection ID, 대상 Role, Template contract version을 기록한다. 이름만 같다는 이유로 Stack을 신뢰하지 않는다.

기존 연결 Role의 CloudFormation 권한은 다음 조건을 모두 만족하는 요청만 허용한다.

- 정확한 Policy Stack 이름과 ARN
- 정확한 service Role ARN과 `cloudformation.amazonaws.com` 전달 조건
- API가 `ResourceTypes` parameter로 명시한 `AWS::IAM::ManagedPolicy`만 허용하는 Resource type 제한
- connection ID ownership tag와 허용된 tag key
- 서버만 쓸 수 있는 connection별 immutable Template URL 경로

`TemplateBody`를 직접 보내거나 다른 Template URL을 사용하는 요청은 허용하지 않는다. service Role도 connection 전용 읽기 Managed Policy ARN과 target Role attachment만 관리할 수 있다. 강한 Policy 내용이나 다른 Role을 넣은 임의 Template이 같은 경로를 사용할 수 없게 한다.

정리 확인 Policy는 Manager Stack 자체와 Policy Stack, service Role, 두 Stack이 소유한 Policy만 읽을 수 있다. Manager Stack의 다른 Resource가 이 확인 Policy에 의존하도록 만들어 삭제 시 확인 Policy가 마지막에 제거되게 한다. 삭제 도중 문제가 생기면 확인 권한이 남아 정확히 어떤 소유 Resource가 남았는지 다시 확인할 수 있어야 한다.

AWS는 `CreateStack`과 `UpdateStack`에서 service Role, Template URL, Resource type, request tag를 제한하는 condition key를 제공한다. 구현은 AWS 공식 [CloudFormation 권한 조건 문서](https://docs.aws.amazon.com/service-authorization/latest/reference/list_awscloudformation.html)와 [CloudFormation IAM 제어 안내](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/control-access-with-iam.html)를 기준으로 한다. service Role의 수명주기는 [CloudFormation service Role 안내](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html)를 따른다.

### 5.3 최초 준비 흐름

1. 환경설정이 유지되는 항목과 새로 추가되는 읽기 범위를 쉬운 문장으로 보여준다.
2. 사용자가 `AWS에서 준비`를 누른다.
3. 정확한 Manager Stack Quick Create 화면을 새 탭으로 연다.
4. 사용자가 필요하면 SSO로 로그인하고 AWS Console에서 Stack 생성을 검토·승인한다.
5. 사용자가 SketchCatch로 돌아온다.
6. API가 Manager Stack의 상태, 실제 Template 내용 식별값, ownership tag, target Role, service Role output을 확인한다.
7. 환경설정이 추가할 읽기 범위를 다시 보여준다.
8. 사용자가 `가져오기 권한 추가`를 누른다.
9. API가 기존 연결 Role을 맡아 CloudFormation을 호출하고, Manager Stack의 service Role ARN을 지정해 정확한 Policy Stack을 만든다.
10. Stack 완료 뒤 제한된 실제 읽기 확인을 실행한다.

Manager Stack은 사용자가 AWS Console에서 승인하기 전에는 생성하지 않는다. Policy Stack은 환경설정의 명시적 승인 전에는 생성하지 않는다.

Manager Stack Quick Create에는 해당 connection 전용 Template과 Stack 이름만 들어 있는 짧은 수명의 URL을 사용한다. URL이 만료되면 같은 입력으로 새 URL을 발급한다. 바로가기를 만들 수 없을 때만 동일 Template 다운로드와 짧은 수동 안내를 제공한다.

새 AWS 연결도 환경설정의 한 wizard 안에서 같은 구조를 준비한다. 먼저 기존 연결 Role을 만드는 원래 Stack을 승인·검증하고, 이어서 그 Role을 대상으로 Manager Stack과 Policy Stack을 순서대로 준비한다. 이미 검증된 연결을 복구할 때는 원래 Stack 단계로 돌아가지 않는다.

Manager Stack 검증은 tag와 output만 믿지 않는다. 저장된 contract version과 Template hash, service Role trust, service Role 권한, 제어 Policy 문서, 정리 확인 Policy 문서, target Role attachment를 모두 기대값과 비교한다. Policy Stack을 처음 만들기 전에는 결정론적으로 계산한 예상 Stack 이름·ARN과 Stack 부재를 승인 대상에 묶고, 생성 완료 뒤 AWS가 반환한 실제 Stack ID를 저장한다.

Manager contract version이 바뀌면 Settings API가 대신 갱신하지 않는다. 환경설정이 정확한 Manager Stack과 새 immutable Template을 보여주고, 사용자가 AWS Console에서 명시적으로 업데이트한 뒤 같은 전체 검증을 다시 통과해야 한다. 검증 전에는 새 Policy contract를 적용하지 않는다.

### 5.4 Policy 갱신 흐름

읽기 범위가 바뀌었을 때는 Policy Stack만 갱신한다.

1. 환경설정이 새로 읽게 되는 정보와 유지되는 항목을 보여준다.
2. 사용자가 `가져오기 권한 업데이트`를 한 번 누른다.
3. API가 승인 대상과 현재 AWS 상태가 같은지 다시 확인한다.
4. 맞으면 service Role을 지정해 Policy Stack을 바로 갱신한다.
5. 완료 뒤 실제 읽기 확인을 다시 실행한다.

CloudFormation Change Set을 별도로 보여주거나 AWS Console에서 같은 변경을 두 번 승인하게 하지 않는다.

승인은 다음 값에 묶인 10분 수명의 일회성 확인값으로 전달한다.

- connection ID
- Manager Stack과 Policy Stack 식별자
- 기존 Role ARN
- service Role ARN
- 현재·목표 Template contract version
- 현재·목표 Policy 내용 식별값

서버가 승인 preview 때 `approvalId`와 `operationId`를 만들고, 실행 요청은 두 값을 함께 보낸다. `approvalId`는 성공·실패와 관계없이 첫 실행 시도 뒤 재사용할 수 없다. 실행 직전에 값이나 Stack 상태가 달라졌으면 갱신하지 않고 새 확인을 요구한다. connection별 작업 lease로 동시에 하나의 Stack 작업만 허용한다. 같은 `operationId`와 목표를 반복 요청하면 진행 중이거나 완료된 같은 결과를 반환하고 두 번째 작업을 만들지 않는다.

### 5.5 읽기 Policy의 단일 기준

Reverse Engineering gateway가 실제로 호출하는 AWS reader와 읽기 Policy가 같은 action catalog를 사용한다. 새 reader를 추가할 때는 다음 세 항목을 함께 변경해야 한다.

- 실제 조회 구현
- 읽기 Policy 생성기
- 준비 상태 probe와 계약 테스트

읽기 Policy에는 Resource 생성·수정·삭제 권한을 넣지 않는다. 배포 Policy는 이 catalog를 사용하지 않으며 이번 작업에서 변경하지 않는다.

### 5.6 가져오기 준비 상태

준비 여부는 Role 접속이나 Stack 완료만으로 판단하지 않는다. 같은 Role로 Resource를 바꾸지 않는 제한된 읽기 요청을 실제 실행한다.

#### 주요 조회

- VPC, Subnet, Internet Gateway, Route Table, Security Group, Instance
- S3
- RDS
- Load Balancer
- ECS
- CloudFront

#### 확장 조회

- Resource Explorer
- Resource Groups Tagging API
- IAM
- KMS
- CloudWatch와 Logs
- API Gateway
- Lambda
- AMI

#### 사용자 상태

- 주요·확장 조회 성공: `가져오기 준비됨`
- 주요 조회 성공, 확장 조회 일부 실패 또는 미설정: `가져오기 가능 · 일부 확장 정보 제한`
- 주요 조회 권한 부족: `가져오기 권한 업데이트 필요`
- 일시적인 AWS 오류: `잠시 후 다시 확인`
- Role 접속 실패: `AWS 연결 확인 필요`
- 정리가 끝나지 않음: `AWS 권한 정리 필요`

빈 목록은 정상적인 읽기 성공이다. Resource가 없다는 이유로 권한 실패 처리하지 않는다. Resource Explorer 미설정은 권한 부족과 별도로 분류한다.

Resource Explorer는 기본 View 존재 확인, 해당 View 읽기 확인, 검색 순서로 probe한다. 기본 View가 없으면 설정 필요로 분류하고, View 또는 검색 권한이 없으면 권한 부족으로 분류한다. 검색 실패 하나만 보고 미설정이라고 추측하지 않는다.

이 순서는 AWS 공식 [GetDefaultView](https://docs.aws.amazon.com/resource-explorer/latest/apireference/API_GetDefaultView.html), [GetView](https://docs.aws.amazon.com/resource-explorer/latest/apireference/API_GetView.html), [Search](https://docs.aws.amazon.com/resource-explorer/latest/apireference/API_Search.html) 계약을 따른다.

### 5.7 Reverse Engineering과의 연결

Reverse Engineering은 권한을 변경하지 않는다.

- 가능한 reader는 계속 실행한다.
- 성공한 Resource와 관계는 유지한다.
- 여러 페이지를 읽다가 뒤쪽 페이지가 실패해도 앞에서 읽은 결과는 유지한다.
- 현재 지원하는 Resource가 관계 없이 단독으로 발견돼도 원본 결과에서 조용히 버리지 않는다.
- 실패는 AWS 서비스 단위로 중복 없이 묶는다.
- 사용자에게는 서비스 이름과 짧은 해결 방법만 보여준다.
- ARN, AWS action, Request ID, SDK message, 내부 stage를 보여주지 않는다.
- 권한 부족이면 `환경설정에서 권한 보완` 버튼을 제공한다.
- 환경설정에서 돌아오면 같은 connection ID로 다시 가져온다.
- 권한 복구 중에도 기존 부분 결과는 사용자가 버리기 전까지 유지한다.

### 5.8 정리 흐름

연결 삭제 과정에서 권한 Stack을 조용히 남기지 않는다.

1. 환경설정이 삭제할 Policy Stack·Manager Stack과 보존할 원래 Role·Stack·배포 Policy를 구분해 보여준다.
2. API가 두 Stack ID, 읽기 Managed Policy ARN, service Role ARN, 제어·확인 Policy ARN과 현재 Template hash를 다시 검증해 정리 대상을 고정한다.
3. 사용자가 AWS Console에서 Policy Stack을 먼저 삭제한다.
4. Manager Stack의 읽기 전용 확인 권한으로 정확한 Policy Stack 부재와 읽기 Managed Policy의 분리·삭제를 확인한다.
5. 제한된 read probe도 다시 실행해 결과를 정리 기록에 남긴다. 다른 Policy가 같은 읽기 권한을 주더라도 정확한 소유 artifact가 제거됐으면 Policy Stack 정리를 막지 않는다.
6. Policy Stack 소유 artifact가 제거됐을 때만 Manager Stack 삭제를 안내한다.
7. 사용자가 AWS Console에서 Manager Stack을 삭제한다.
8. 기존 Role 접속은 계속 성공해야 한다. 정리 확인 Policy가 남아 있으면 정확한 Manager Stack·service Role·제어 Policy의 부재를 직접 확인하고, 확인 Policy가 계획대로 마지막에 제거돼 해당 제한 조회가 AccessDenied가 되면 그 사실을 삭제 완료 신호로 사용한다.
9. 소유 artifact 제거를 확인하면 가져오기 권한 metadata 정리를 완료한다.

정리 확인 Policy는 삭제 전에 전체 contract와 attachment를 검증한 경우에만 마지막 AccessDenied를 완료 신호로 사용할 수 있다. 예상하지 못한 권한 문서 변경, 일시 오류, Role 접속 실패, 일부 소유 artifact 잔존은 성공으로 처리하지 않는다. 판단할 수 없으면 연결을 비활성 `AWS 권한 정리 필요` 상태로 유지하고 같은 단계에서 재시도한다.

SketchCatch 서버는 `DeleteStack`을 호출하지 않는다. Manager Stack을 Policy Stack보다 먼저 삭제하도록 안내하지 않는다.

### 5.9 저장 모델

배포 연결 상태와 분리된 connection별 가져오기 권한 기록을 둔다. 기존 `aws_connections.status`에는 새 의미를 섞지 않는다.

상태 흐름은 다음 두 줄로 분리한다.

```text
확인 필요 → Manager 승인 필요 → Manager 검증 중 → Policy 승인 필요 → Policy 작업 중 → 읽기 확인 중 → 준비됨 | 일부 제한 | 권한 보완 필요 | 재시도 필요
정리 시작 → Policy 삭제 확인 중 → Manager 삭제 필요 → Manager 삭제 확인 중 → 정리 완료 | AWS 권한 정리 필요
```

새 기록은 다음 정보를 가진다.

- connection ID를 가리키는 유일한 키
- 가져오기 준비 상태
- Manager Stack 식별자와 contract version
- Policy Stack 식별자와 contract version
- target Role ARN과 service Role ARN
- 현재 Policy 내용 식별값
- 사용자 승인에 사용한 대상 식별값
- 생성·갱신·삭제의 현재 단계
- 주요·확장 조회 결과의 안전한 요약
- 마지막 확인 시각
- 정리 시작 시각과 안전한 오류 요약
- 현재 operation ID와 connection별 lease 만료 시각

원문 AWS 오류, Request ID, 전체 Policy JSON은 이 상태 기록에 저장하지 않는다. 기존 연결은 가져오기 상태 `확인 필요`로 시작하며 자동으로 AWS를 변경하지 않는다.

정리가 끝나기 전에는 기존 `aws_connections` row를 물리적으로 삭제하지 않는다. 새 배포나 Reverse Engineering 선택 목록에서는 숨기되 기존 Deployment 참조와 정리 재시도에 필요한 연결 정보는 유지한다. Stack pair 정리가 끝난 뒤에만 import access 기록을 정리하고, 기존 연결 삭제의 참조 검사까지 통과해야 원 연결 row를 삭제할 수 있다. FK는 진행 중인 정리 기록이 cascade로 사라지지 않게 한다.

이를 위해 DB migration이 필요하다. 구현 직전에 저장소의 최신 migration과 팀 작업을 확인하고 다음 사용 가능한 번호를 예약한다. 이 설계 문서에서는 충돌을 막기 위해 번호를 미리 고정하지 않는다.

### 5.10 API와 모듈 경계

#### API

- AWS connection service: 기존 연결·Role·소유권 확인
- import access policy: 실제 reader와 공유하는 읽기 Policy 생성
- import access manager template: Manager Stack Template 생성
- import access policy template: Policy Stack Template 생성
- import access service: 승인 검증, Stack 작업 직렬화, 상태 전이
- import access probe: 주요·확장 읽기 확인과 안전한 결과 분류
- import access repository: connection별 상태 저장
- reverse engineering gateway: 부분 성공 Resource와 내부 진단 수집
- reverse engineering presentation contract: 사용자에게 공개할 안전한 서비스 단위 결과 생성

#### Web

- 환경설정 AWS 연결: 준비·승인·확인·갱신·정리 wizard 소유
- Reverse Engineering: 조회, 부분 결과 보존, 환경설정 이동만 소유
- Workspace API client: 안전한 상태와 명령만 전달

공개 API는 상태 조회, Manager 준비·검증, Policy 승인 preview·실행, 읽기 재확인, 정리 준비·단계 확인을 connection ID 아래의 분리된 명령으로 제공한다. 모든 mutation 응답은 `operationId`, 현재 단계, 사용자가 할 다음 행동을 반환한다. 공개 DTO에는 Template 본문, Policy JSON, AWS 원문 오류를 넣지 않는다. AWS Console 이동에 꼭 필요한 짧은 수명의 URL과 연결 소유권을 확인하는 데 필요한 최소 식별값만 해당 준비 응답에서 전달한다.

```text
GET  /api/aws/connections/:connectionId/import-access
POST /api/aws/connections/:connectionId/import-access/manager/prepare
POST /api/aws/connections/:connectionId/import-access/manager/check
POST /api/aws/connections/:connectionId/import-access/policy/preview
POST /api/aws/connections/:connectionId/import-access/policy/apply
POST /api/aws/connections/:connectionId/import-access/check
POST /api/aws/connections/:connectionId/import-access/cleanup/prepare
POST /api/aws/connections/:connectionId/import-access/cleanup/check
```

환경설정은 내부 Stack 논리 ID, Policy JSON, action 개수를 주요 정보로 보여주지 않는다. 사용자가 이해할 수 있는 조회 범위와 보존되는 권한을 먼저 보여준다.

## 6. Board 자동 정리 설계

### 6.1 Reverse Engineering 진입 순서

1. AWS 조회가 끝나면 가져온 원본 구조를 먼저 보여준다.
2. 부분 실패가 있으면 성공한 원본과 짧은 제한 안내를 함께 보여준다.
3. 이 시점에는 자동 정리 Compiler를 실행하지 않는다.
4. 사용자가 `자동 정리 해보기`를 선택하면 그때 정리 후보를 만든다.
5. 사용자는 원본을 유지하거나 후보를 비교한 뒤 하나를 적용한다.

원본을 보는 것만으로 Project, Board, Terraform, draft, snapshot을 저장하지 않는다. 최종 적용 행동만 기존 저장 흐름으로 이어진다.

가져온 원본은 Reverse Engineering 전용 source-exact 변환으로 만든다. 일반 AI 설계 변환을 거치지 않으며 Region·AZ, 기본 설정, 요약 edge, containment 또는 Terraform 이름을 새로 추론하지 않는다. 현재 지원하는 Resource와 관계를 그대로 표현하는 데 필요한 결정론적 최초 좌표만 계산한다.

### 6.2 허용되는 변경

- Resource와 기존 영역의 위치
- 기존 영역, Resource 카드, Design 요소의 제한된 크기
- 연결선 route와 control point
- Resource 간 간격과 정렬
- 자동 생성 표시 프레임의 생성·이동·크기 변경·병합·삭제
- 사용자 작성 Design Group의 위치와 크기 제안

잠긴 요소는 위치와 크기를 유지한다. 잠긴 자동 표시 프레임도 이동·크기 변경·병합·삭제하지 않는다. 좌표와 크기는 유한한 값이어야 하며 기존 Editor의 최소·최대 크기와 Board 범위를 지켜야 한다.

### 6.3 절대 유지되는 의미

- Resource ID, 종류, 개수, 이름
- Resource 설정과 provider metadata
- edge ID, 양 끝 Resource, 방향, 의미, label
- VPC·AZ·Subnet 등 실제 parent와 containment
- Terraform variable, reference, address와 생성 결과
- 사용자 작성 Design 요소의 ID, 종류, 제목, 스타일
- locked 상태

안전 Adapter는 후보를 그대로 신뢰하지 않는다. 먼저 후보에서 허용된 시각값만 추출하고 원본 의미 정보 위에 다시 조립한다. 조립 결과의 의미 fingerprint가 원본과 다르거나 시각값이 유효하지 않으면 그 후보 전체를 폐기한다.

### 6.4 표시 프레임 계약

자동 생성 표시 프레임은 기존 Diagram 형식으로 저장한다.

```text
kind: design
type: design_group
metadata.presentationCatalogItemId: design-group
id prefix: board-auto-frame:
```

- 프레임 자신과 주변 Resource에 membership 목록을 저장하지 않는다.
- `parentAreaNodeId`나 Terraform parameter를 추가하지 않는다.
- 실제 AWS area의 drop parent 후보가 되지 않는다.
- 낮은 화면 층에 렌더링해 Resource 클릭과 드래그를 가리지 않는다.
- `kind`, `type`, catalog ID, `board-auto-frame:` ID prefix가 모두 맞을 때만 자동 생성 프레임으로 취급한다. prefix 하나만 보고 사용자 요소를 삭제하지 않는다.
- full tuple이 맞는 자동 프레임만 다음 자동 정리에서 병합·삭제할 수 있다.
- 사용자 작성 Design Group은 위치·크기 후보를 받을 수 있지만 자동 소유로 바꾸거나 병합·삭제하지 않는다.
- 자동 프레임을 area drop parent, containment 추론 대상, Resource parent 후보, 실제 area 자동 크기 계산에서 제외한다.
- 과거 Board에 이미 저장된 parent 값은 자동 프레임 기능을 추가하면서 조용히 지우지 않는다.
- 잠긴 자동 프레임은 일반 locked 요소와 같이 그대로 보존한다.
- 사용자가 Resource를 옮겨도 프레임이 자동으로 따라가지 않는다.
- 다음 자동 정리 요청에서 현재 Board를 기준으로 자동 프레임을 다시 계산한다.

표시 프레임은 Terraform, provider graph, 비용·보안 검사, 배포, Reverse Engineering 원본에서 무시한다.

### 6.5 후보 생성과 안전 필터

1. 현재 Board fingerprint를 기록한다. 선택 상태와 viewport 같은 일시적인 UI 값은 제외하고 Resource 의미와 저장되는 시각 정보를 포함한다.
2. 서로 다른 layout 전략에서 시각 후보를 받는다.
3. 후보에서 허용된 geometry와 edge route만 추출한다.
4. 원본 의미를 기준으로 후보를 다시 조립한다.
5. 자동 표시 프레임을 현재 geometry에 맞게 정리한다.
6. 조립 결과의 의미 동일성과 시각값 유효성을 검사해 안전하지 않은 후보를 버린다.
7. 위치·크기·edge route·표시 프레임이 사실상 같은 후보를 하나로 합친다.
8. 안전한 변경 후보끼리 근거를 사용해 순서를 정한다.
9. 서로 다른 후보를 최대 3개 반환한다.

원본은 후보 점수 경쟁에 넣지 않고 비교 기준으로만 둔다. 내부 품질 측정은 순서와 설명에만 사용한다. 측정상 같거나 일부 항목이 나빠진 안전한 후보도 숨기거나 적용을 막지 않는다. 단, 값이 유효하지 않거나 화면 계약을 위반하는 후보는 품질 문제가 아니라 안전하지 않은 결과이므로 제외한다.

안전한 시각 diff가 없으면 미리보기를 열지 않고 `바꿀 배치가 없습니다.`라고 안내한다. 가짜 후보를 만들지 않는다.

현재 단일 후보 Compiler 응답과 Preview session은 다중 후보 계약으로 확장한다. 공개 후보는 후보별 Diagram, visual diff, 사용자용 finding, 원본 fingerprint를 가진다. 선택 상태는 후보 ID만 가리키며 후보 전환으로 Diagram을 적용하지 않는다. apply 명령은 session ID와 선택한 후보 ID를 함께 받아 그 후보 하나만 사용한다. 자동 프레임 추가·변경·삭제는 일반 node 의미 변경과 분리된 visual diff 종류로 다룬다.

### 6.6 설명 계약

각 후보는 실제 diff와 품질 finding에서 사용자가 확인할 문장을 최대 3개 만든다.

- 사용자가 화면에서 보는 Resource 이름 사용
- 무엇이 바뀌었는지와 화면에 미치는 영향 설명
- 나빠진 항목을 좋아진 항목보다 먼저 표시
- 확인되지 않은 개선을 단정하지 않음
- 더 많은 변경은 `그 외 N곳 정리`로만 보조 표시
- 항상 `Resource, 설정, 연결 관계는 바뀌지 않았습니다.` 표시

예시:

- `Lambda를 API Gateway 가까이 옮겼습니다.`
- `Subnet을 VPC 영역 안으로 정리했습니다.`
- `Resource를 가리던 연결선을 정리했습니다.`
- `연결선 교차가 1곳 늘었습니다. 원본과 비교해 주세요.`

내부 점수, 후보 ID, Compiler version, Template ID는 보여주지 않는다.

### 6.7 데스크톱 UI

- 상단에 최대 3개의 전체 Board thumbnail 표시
- `정리안 A`, `정리안 B`, `정리안 C`와 대표 변경 한 줄 표시
- 선택한 thumbnail의 상태를 분명히 표시
- 아래 큰 영역에서 원본과 선택한 정리안을 나란히 비교
- 선택한 후보의 상세 설명과 `이 정리 사용` 제공

thumbnail을 바꾸는 행동은 Board를 저장하지 않는다.

### 6.8 모바일 UI

- 상단의 가로 thumbnail 갤러리에서 최대 3개 후보 표시
- 갤러리만 가로로 스크롤하고 페이지 전체는 옆으로 밀리지 않음
- 선택한 후보에 테두리와 `선택됨` 상태 표시
- 아래 `원본`·`정리안` 전환으로 한 번에 Board 하나 표시
- 전환할 때 같은 viewport와 zoom 유지
- 상세 설명과 `이 정리 사용` 제공

좁은 화면에서 원본과 정리안을 억지로 나란히 축소하지 않는다.

### 6.9 적용과 오래된 후보 차단

후보 선택, 원본 전환, modal 닫기는 Board를 바꾸지 않는다. `이 정리 사용`만 선택한 후보 하나를 기존 History·저장 흐름에 반영한다.

적용 직전에 현재 Board fingerprint와 후보 생성 당시 fingerprint를 비교한다. 저장된 ProjectDraft가 있는 Board는 후보 생성 당시 draft revision도 함께 보낸다. 서버는 expected revision을 조건으로 한 번만 저장하고 revision이 다르면 conflict를 반환한다. 저장 전 클라이언트 검사와 서버의 revision compare-and-swap을 모두 통과해야 단일 History write를 만든다. Board가 달라졌으면 적용하지 않고 `보드가 변경되었습니다. 다시 정리해 주세요.`라고 안내한다. 후보가 만들어진 뒤 다른 편집을 덮어쓰지 않는다.

### 6.10 모듈 경계

- candidate provider: 서로 다른 시각 후보 제공
- visual-only constraint adapter: 원본 의미 보존과 허용 geometry 복사
- visual diff: 위치·크기·edge route·표시 프레임 차이 계산
- presentation frame reconciler: 자동 프레임만 생성·병합·삭제
- candidate selector: 중복 제거, 근거 순서, 최대 3개 제한
- explanation builder: 실제 변경과 finding을 쉬운 문장으로 변환
- preview session: 원본, 후보 목록, 선택 상태, fingerprint 보관
- desktop/mobile preview UI: 비교와 단일 적용 승인

Reverse Engineering은 Compiler를 직접 호출하지 않고 같은 visual-only 자동 정리 경계를 사용한다. AI 설계와 Template의 구조 생성 자체를 visual-only로 제한하지는 않는다. 각 기능에서 사용자가 별도로 실행하는 `자동 정리` 단계만 같은 안전 Adapter를 거친다.

## 7. 오류 처리 원칙

### AWS

- 한 AWS 서비스 실패가 전체 성공 결과를 지우지 않음
- 같은 서비스의 여러 reader 실패는 사용자 화면에서 한 항목으로 표시
- 원문 오류는 서버 내부 진단으로만 사용하고 공개 응답·저장 로그·UI에서는 안전한 분류로 변환
- Policy Stack 작업 실패 시 기존 연결과 배포 상태 보존
- 소유권·version·승인값 불일치는 자동 수정하지 않고 새 확인 요청
- 일시 오류는 영구 권한 실패로 저장하지 않음
- 정리 결과가 불확실하면 성공으로 간주하지 않음

### 자동 정리

- 안전 검사 실패 후보만 제외하고 다른 안전 후보는 유지
- 후보 생성 일부 실패가 원본 Board를 변경하지 않음
- 모든 후보가 없으면 결과 없음 안내
- 적용 시 fingerprint 불일치는 재정리 안내
- Preview 렌더링 오류가 Project나 Board 저장으로 이어지지 않음

## 8. 보안과 승인 경계

- Manager Stack 생성과 두 Stack 삭제는 AWS Console에서 사용자가 직접 승인
- Policy Stack 생성·갱신은 환경설정에서 읽기 범위를 확인한 사용자의 한 번 명시적 승인 필요
- 승인값은 connection·Stack pair·Role·service Role·version·Policy 내용에 묶음
- connection 소유자와 인증된 사용자만 명령 실행 가능
- 한 연결의 service Role과 제어 Policy로 다른 연결을 변경할 수 없음
- AWS 원문 오류, ARN, Request ID, Policy JSON을 사용자용 응답에 포함하지 않음
- 자동 정리 Preview는 읽기 전용이며 적용 전 Project·Board·Terraform 무변경

## 9. 검증 기준

### AWS 계약

- 같은 connection ID, account, region, Role 유지
- 원래 Stack과 배포 Policy의 내용·권한 불변
- 지원 이름 밖의 Role 거부
- Manager Stack과 Policy Stack의 connection별 소유권 검증
- Manager Template hash, service Role trust, 제어·확인 Policy drift 검증
- service Role trust가 CloudFormation으로 한정됨
- 제어 Policy가 정확한 Stack, immutable Template URL, Resource type, tag, service Role로 제한됨
- 임의 TemplateBody와 다른 connection Template URL 차단
- 읽기 Policy에 write action이 없음
- reader·Policy·probe action catalog 일치
- 사용자 승인 전 AWS mutation 없음
- 오래된 승인, 중복 요청, 병렬 Stack 작업 차단
- probe 실패가 배포용 `verified`를 바꾸지 않음
- 빈 AWS 계정의 빈 목록을 성공으로 처리
- 주요·확장·Resource Explorer 미설정·일시 오류 분류
- 부분 성공 Resource와 관계 보존
- raw ARN·action·Request ID·SDK message 미노출
- Policy Stack 다음 Manager Stack 정리 순서
- 정확한 Stack·Managed Policy·service Role·제어·확인 Policy 제거 확인
- 정리 불확실 시 `AWS 권한 정리 필요` 유지
- 정리 중 connection row 물리 삭제 차단

### 자동 정리 계약

- Reverse Engineering 원본 표시 전 Compiler 미실행
- 사용자가 요청하기 전 자동 정리 미실행
- Resource ID·종류·개수·이름·설정 동일
- edge ID·양 끝·방향·의미·label 동일
- parent·containment·Terraform fingerprint 동일
- 위치·허용 크기·edge route·자동 표시 프레임만 변경
- locked 요소 geometry 유지
- locked 자동 프레임 이동·병합·삭제 없음
- 자동 프레임에 membership·parent·Terraform 정보 없음
- full tuple이 맞는 자동 프레임만 자동 소유로 판단
- 사용자 Design Group 자동 병합·삭제 없음
- 표시 프레임이 Resource drop parent·containment 추론·실제 area auto-size 대상이 아님
- 후보 geometry 중복 제거와 최대 3개 제한
- 원본이 후보를 숨기는 점수 경쟁에 참여하지 않음
- 측정상 개선이 없는 안전 후보도 비교·적용 가능
- 실제 시각 diff가 없을 때 결과 없음 안내
- 쉬운 변경 설명, 악화 우선, 내부 점수 미노출
- 후보 전환 무변경, `이 정리 사용`만 저장
- fingerprint와 ProjectDraft revision으로 오래된 후보 적용 차단
- 데스크톱 좌우 비교와 모바일 단일 Board 전환 동작

## 10. 구현 순서 원칙

구현 계획은 이 문서 승인 뒤 별도로 작성한다. 한꺼번에 섞어 수정하지 않고 다음 세 개의 독립 검토 가능한 마일스톤과 커밋 경계로 나눈다. 같은 브랜치와 PR에서 진행할 수 있지만 각 마일스톤의 검증을 통과하기 전 다음 통합 단계로 넘어가지 않는다.

1. AWS 가져오기 상태·Policy·probe·Settings 승인·정리
2. Board visual-only 후보·표시 프레임·설명·반응형 비교 UI
3. Reverse Engineering 원본 우선·부분 성공·환경설정 왕복·자동 정리 명시 실행 통합

각 마일스톤은 사용자 승인 전 무변경과 기존 배포 기능 보존을 먼저 검증한다. DB migration 번호는 구현 시작 직전에만 예약한다.

## 11. 최종 완료 조건

- 오래된 AWS 연결에서 성공한 Resource를 잃지 않고 부족한 읽기 권한만 보완할 수 있음
- 기존 연결 Role·Stack·배포 Policy·Deployment 참조가 유지됨
- 사용자가 AWS와 SketchCatch에서 언제 무엇을 승인하는지 알 수 있음
- 실패 원인을 쉬운 서비스 단위 안내로 이해할 수 있음
- Reverse Engineering 원본이 자동 정리보다 먼저 표시됨
- 자동 정리를 실행할지 사용자가 직접 결정함
- 최대 3개의 안전한 정리안을 데스크톱·모바일에서 비교할 수 있음
- 내부 점수 대신 실제 변경과 영향으로 선택할 수 있음
- `이 정리 사용` 전까지 Project·Board·Terraform이 바뀌지 않음
