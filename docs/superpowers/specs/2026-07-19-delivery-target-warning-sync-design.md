# 배포 타깃 경고 동기화 설계

## 목적

CI/CD 화면에서 프로젝트 배포 타깃을 저장하면 Direct Deployment가 그 사실을 즉시 반영하고, 이전의 `전체 스택 선행 설정 필요` 경고를 더 이상 현재 상태처럼 보여주지 않게 한다. 배포 타깃 검증과 저장은 계속 fail-closed로 동작하며, 이 변경은 Terraform 실행이나 AWS Resource 변경을 시작하지 않는다.

## 현재 문제

- Direct Deployment는 검증을 실행할 때 최신 `ProjectDeploymentTarget`을 조회하지만, 한번 만든 선행 설정 경고를 CI/CD 화면 왕복이나 배포 타깃 저장 시 무효화하지 않는다.
- 경고의 `Repository와 배포 타깃 설정` 버튼은 설정을 저장하지 않고 CI/CD 화면으로만 이동하지만, 문구만으로는 이 경계를 알기 어렵다.
- 편집기는 `필수 확인 2개 항목`이라고 안내하면서 자동 입력이 실패한 고급 필드도 저장 차단 조건에 포함한다. 누락 값은 영문 필드 목록으로만 표시되어 사용자가 다음 행동을 판단하기 어렵다.

## 검토한 접근

### A. 상위 콘솔에 저장 완료 신호 전달 — 채택

`ProjectDeploymentTargetEditor`의 기존 `onSaved`를 `DeliveryCenterPanel`에서 받아, `DeploymentConsoleShell`까지 저장 revision을 전달한다. 상위 콘솔은 저장 revision이 바뀌면 Direct Deployment의 오래된 prerequisite 경고를 지우고, 필요할 때 최신 target을 다시 조회하게 한다.

- 장점: 현재 컴포넌트 책임과 API 경계를 유지하며 변경 범위가 작다.
- 단점: 상태 신호를 몇 단계 전달해야 한다.

### B. `ProjectDeliveryProfile`을 콘솔 상위 공통 상태로 승격

Direct와 CI/CD가 하나의 profile 객체를 공유하고 저장 성공 시 해당 객체를 교체한다.

- 장점: 두 화면이 같은 snapshot을 명시적으로 사용한다.
- 단점: Direct Deployment가 현재 소유한 개별 조회와 polling까지 재배치해야 해 이번 결함보다 변경 범위가 크다.

### C. 공통 query cache 도입

배포 타깃과 Delivery profile을 query key로 관리하고 저장 성공 시 관련 key를 invalidate한다.

- 장점: 향후 여러 화면의 서버 상태 동기화에 유리하다.
- 단점: 이 한 가지 문제를 해결하기 위해 상태관리 방식과 의존 범위를 넓히므로 현재는 과하다.

## 상세 설계

### 상태 흐름

1. 사용자가 CI/CD 화면의 `배포 타깃 저장`을 누른다.
2. API가 검증된 배포 타깃을 DB에 저장하고 저장된 target을 반환한다.
3. `ProjectDeploymentTargetEditor`가 기존 `onSaved`를 호출한다.
4. `DeliveryCenterPanel`은 자체 profile을 다시 읽는 동시에 상위 콘솔에 저장 완료를 알린다.
5. `DeploymentConsoleShell`이 target revision을 증가시켜 `DirectDeploymentScreen`에 전달한다.
6. Direct Deployment는 revision 변경 시 오래된 prerequisite 경고를 제거한다.
7. 사용자가 `저장 후 검증 실행`을 누르면 기존처럼 API에서 최신 target을 다시 읽고 안전 조건을 판정한다.

저장 성공 신호는 검증 통과를 의미하지 않는다. 경고 표시만 오래된 상태에서 벗어나며, 실제 Plan 준비 전에는 기존 최신 target 조회와 AWS 연결 일치 검사가 그대로 실행된다.

### 사용자 안내

- 경고 버튼은 실제 동작에 맞게 `CI/CD 설정으로 이동`으로 표시한다.
- 배포 타깃 설정 영역으로 이동한 사용자는 기존 편집기에서 저장한다.
- 자동 입력 필드가 누락되면 `필수 확인 2개 항목`만 강조하지 않는다. 누락 안내는 사용자가 확인할 영역과 해결 행동을 설명하고, 고급 설정 disclosure를 자동으로 열어 누락된 필드를 바로 볼 수 있게 한다.
- 정상적으로 자동 입력된 경우 고급 설정은 계속 접힌 상태를 유지한다.

### 오류 처리와 안전 경계

- target PUT 실패 시 상위 저장 revision을 변경하지 않고 기존 오류를 편집기에 표시한다.
- profile 새로고침 실패가 target 저장 성공을 되돌리지는 않는다. 편집기는 저장 성공 상태를 유지하고 Delivery panel은 재시도 가능한 조회 오류를 표시한다.
- 경고를 지우는 동작은 Terraform artifact 생성, Plan, Apply, Git 변경, PR 생성, AWS SDK 호출을 실행하지 않는다.
- Direct Deployment의 최신 target 조회, confirmed build config 확인, AWS connection 일치 검사는 유지한다.

## 테스트

1. 경고 발생 후 CI/CD로 이동해 target 저장 완료 신호가 오면 Direct prerequisite 경고가 제거된다.
2. target 저장 실패 시 저장 완료 신호가 발생하지 않고 경고가 유지된다.
3. 저장 후 다시 검증하면 최신 target을 조회하고 기존 안전 검사를 수행한다.
4. 경고 버튼 문구가 `CI/CD 설정으로 이동`이며 화면 전환만 수행한다.
5. 자동 입력 필드가 누락되면 고급 설정이 열리고 누락 안내가 표시된다.
6. 모든 필드가 채워지면 고급 설정은 기본적으로 닫혀 있다.

## 제외 범위

- 배포 타깃 API 또는 DB schema 변경
- ProjectDeliveryProfile 전역 상태관리 리팩터링
- React Query 도입 또는 query cache 전환
- Terraform Plan/Apply/Destroy, Git/CI/CD handoff, AWS Resource 변경
- 사용자가 확인하지 않은 배포 타깃의 자동 저장
