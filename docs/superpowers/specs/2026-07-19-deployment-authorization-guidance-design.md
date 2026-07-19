# 배포·AWS 승인 안내 정확성 설계

## 목적

사용자가 실제 실행 단계와 AWS에서 선택해야 할 CodeConnection을 화면만 보고 정확히 알 수 있게 한다. 권한 승인 방식, Repository checkout 검증, Plan 승인, Apply 실행의 안전 경계는 바꾸지 않는다.

## 현장 재현 결과

- `preflight` 단계에서 제목은 `Terraform Plan 생성 중`이지만 설명이 `승인된 변경사항을 클라우드에 적용하고 있습니다.`로 표시됐다.
- Terraform Apply가 끝나고 `application_release` 단계로 전환된 뒤 제목이 다시 `Terraform Plan 생성 중`으로 표시됐다.
- 설정 화면의 `GitHub 승인 필요` 상태는 AWS Connections 목록을 열지만, 여러 행 중 어떤 Pending 연결을 골라야 하는지 알려주지 않았다.
- 실제 대상 연결 이름은 API가 쓰는 규칙 `sketchcatch-${awsConnectionId에서 하이픈 제거 후 앞 8자}-github`으로 결정된다.

## 선택한 접근

진행률 표현은 `operationHint` 하나에 의존하지 않고 현재 `DeploymentStage`를 우선해 제목과 설명을 정한다. `preflight`, `application_release`, `rollback`에는 명시적인 문구를 제공하고, `apply`와 `destroy`의 리소스 완료 수 표시는 그대로 유지한다.

AWS 승인 대기 화면에는 대상 CodeConnection 이름과 AWS 콘솔에서 수행할 동작을 함께 표시한다. 임의의 AWS Console deep link를 만들거나 연결 모델을 확장하지 않고, 기존 `setupUrl`과 `awsConnectionId`만 사용한다.

## 화면 문구

- `preflight`: `배포 전 안전 검사 중` / `배포 전 안전 검사와 Repository 실행 조건을 확인하고 있습니다.`
- `application_release`: `애플리케이션 릴리즈 중` / `애플리케이션 Artifact를 만들고 배포 상태를 확인하고 있습니다.`
- `rollback`: `배포 롤백 중` / `실패한 변경을 이전 상태로 되돌리고 있습니다.`
- AWS 승인 대기: `AWS에서 {connectionName} Pending 연결을 선택한 뒤 Update pending connection을 눌러 주세요.`

## 검증

- 순수 함수 단위 테스트에서 각 특수 단계의 제목과 설명을 검증한다.
- CodeConnection 이름 생성 규칙과 승인 안내 문구의 입력값을 단위 테스트로 고정한다.
- 관련 테스트, lint, typecheck, build, harness check를 실행한다.
