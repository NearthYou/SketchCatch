# CI/CD readiness 단계 책임 분리 설계

## 목적

CI/CD 2단계 `AWS 배포 대상`은 사용자가 저장하고 확인할 수 있는 설정만 판정한다. Terraform Plan, CodeBuild 환경, Repository checkout 검증, 최초 앱 배포와 공개 URL처럼 배포 실행 중 생성되는 증거는 3단계 `PR 준비`에서 확인한다.

이 설계는 CI/CD가 직접 Plan, Apply, 애플리케이션 배포 또는 Git 변경을 실행하지 않는 기존 안전 경계를 유지하면서 다음 문제를 해결한다.

- 화면의 AWS 연결·Region·실행 방식·빌드 설정은 모두 `완료`인데 단계는 2단계에 머무는 불일치
- 배포 탭에서 나중에 생성할 증거를 2단계 완료 조건으로 먼저 요구하는 순환 의존
- 자동 생성 전 상태를 사용자 입력 누락처럼 표시하는 잘못된 안내
- 실제 미완료 판정과 체크리스트 행이 서로 다른 기준을 사용하는 문제

## 확인된 현재 상태

로컬 프로젝트 `5a317d93-b60d-44d6-85c4-ce88662df4cb`을 읽기 전용으로 확인했을 때 다음 상태였다.

- `ProjectDeploymentTarget.connectionId`가 저장되어 있다.
- 해당 AWS 연결은 `verified`이고 Region은 `ap-northeast-2`로 일치한다.
- `confirmedBuildConfig`와 confirmed commit SHA가 저장되어 있다.
- `ProjectBuildEnvironment`는 아직 생성되지 않았다.
- 프로젝트 Deployment와 승인된 Apply Plan은 아직 없다.
- readiness의 `deployment_target`은 `aws_connection`, `build_config`, `output_url`을 누락으로 반환한다.

현재 서버는 Deployment에서 얻는 AWS 연결 증거가 없으면 저장된 verified target과 관계없이 `aws_connection`을 누락으로 처리한다. 또한 첫 Plan 요청에서 lazy create할 `ProjectBuildEnvironment`가 없으면 `build_config`를 누락으로 처리한다. 배포 후 생성될 `output_url`도 같은 항목에 포함한다. 이 세 조건 때문에 사용자는 Plan 단계로 이동하지 못하지만, Plan 요청 전용 로직만이 Build Environment와 checkout 증거를 만들 수 있다.

## 선택한 접근법

### 채택: 설정 readiness와 실행 evidence 분리

서버의 `deployment_target` 항목은 Phase 2의 사용자 설정 readiness만 나타낸다. 배포 실행이 생성하는 evidence는 기존 `approved_apply_plan`, `initial_application_release`와 배포 결과에서 판정하고 Phase 3에 표시한다.

이 접근법은 각 단계가 사용자가 현재 수행할 수 있는 작업만 요구하므로 순환 의존이 없고, UI와 서버가 같은 판정값을 사용할 수 있다.

### 제외: Web 프레젠테이션에서 누락 키만 무시

`isUserConfiguredTarget`에서 `aws_connection`과 `build_config`를 무조건 무시하면 화면은 3단계로 이동할 수 있다. 그러나 서버의 `deployment_target`은 계속 `action_required`이고 전체 readiness도 거짓이므로 API와 UI가 더 크게 어긋난다. 이 방식은 채택하지 않는다.

### 제외: Phase 2 저장과 동시에 CodeBuild 환경 생성

배포 대상 저장 직후 CodeBuild project와 IAM Role을 생성하고 checkout build를 실행하면 Phase 2에서 모든 증거를 만들 수 있다. 하지만 설정 저장이 AWS 리소스 생성과 비용 발생으로 이어지고, 사용자의 명시적 Plan 행동 전에 외부 상태를 변경한다. SketchCatch의 승인 경계와 맞지 않으므로 채택하지 않는다.

## 단계별 책임

### Phase 1: 저장소 및 변경 감지

사용자가 CI/CD에서 사용할 Source Repository, 기본 Branch, 변경 감지 Branch와 경로를 확정한다. GitHub App 계정 연결만으로 프로젝트 Repository가 자동 선택됐다고 간주하지 않는다.

### Phase 2: AWS 배포 대상

다음 사용자 설정만 완료 조건으로 사용한다.

- `AWS 연결`: `ProjectDeploymentTarget.connectionId`가 현재 사용자 소유의 verified AWS connection을 가리킨다.
- `Region`: target Region과 verified connection Region이 일치한다.
- `실행 방식`: 지원하는 `runtimeTargetKind`가 저장되어 있다.
- `빌드 설정`: 현재 Source Repository와 연결된 `confirmedBuildConfig`가 구조 검증을 통과한다.

다음 값은 Phase 2 완료 조건으로 사용하지 않는다.

- Deployment 또는 승인된 Apply Plan의 존재
- `ProjectBuildEnvironment` 존재 여부
- CodeBuild Repository checkout 성공 증거
- 배포 후 Runtime 좌표
- Static Site URL 또는 API Base URL
- 최초 애플리케이션 릴리즈

네 사용자 설정이 완료되면 Delivery Profile을 새로 조회하고 Phase 2를 `완료`로 바꾸며 Phase 3을 현재 단계로 연다.

### Phase 3: PR 준비

Phase 3은 배포를 직접 실행하지 않고 Direct Deployment Path의 결과를 확인한다. 작업 순서는 다음과 같다.

1. `Apply Plan`: 없으면 `승인 필요`로 표시하고 `배포에서 Plan 검토하기`를 제공한다.
2. `Repository 빌드 검증`: Plan 준비 과정에서 자동 실행된 CodeBuild 환경 준비와 exact Repository/commit checkout 결과를 표시한다.
3. `최초 앱 배포`: 적용 대상이면 Plan 승인·Apply 뒤 Direct Deployment에서 실행하도록 안내한다.
4. `배포 결과`: Static Site URL과 API Base URL을 배포 후 자동 확인 결과로 표시한다.
5. `배포 PR`: 앞선 evidence가 모두 준비된 경우에만 PR 생성 검토를 연다.

`배포에서 Plan 검토하기`는 Deployment console의 Direct Deployment 화면으로 이동할 뿐 Plan을 자동 생성하거나 승인하지 않는다.

### Phase 4: Pipeline

사용자가 승인한 PR이 생성된 뒤에만 GitHub Pipeline 실행 상태, 로그, 실패와 재시도를 표시한다. Phase 2 또는 Phase 3 판정 변경은 기존 Handoff와 무관한 Pipeline run을 현재 run으로 선택하지 않는다.

## 서버 판정 변경

`createReadinessItems`의 `deployment_target` 판정은 Deployment evidence가 아니라 저장된 target과 verified connection을 직접 비교한다.

- `aws_connection` 누락: target connection이 없거나, 연결이 verified가 아니거나, 사용자 소유가 아니거나, target Region과 다를 때만 추가한다.
- `build_config` 누락: `confirmedBuildConfig`가 없거나 현재 Repository 기준 구조 검증에 실패할 때만 추가한다.
- `runtime_config`와 `output_url`: `deployment_target.missingKeys`와 Phase 2 완료 계산에서 제외한다.

`ProjectBuildEnvironment` 준비와 checkout 검증은 `prepareEcsBuildEnvironmentForPlan` 경계를 유지한다. Plan 요청은 사용자의 명시적 Deployment 행동이며, 이 경계에서만 AWS CodeBuild 관련 리소스를 create/reconcile하고 confirmed commit checkout을 검증한다.

공유 계약은 다음과 같이 확정한다.

- `GitCicdDeploymentTargetReadinessKey`는 `aws_connection | build_config`만 허용한다.
- `inspect_runtime_outputs`와 `inspect_output_url` action은 target 설정 action에서 제거한다.
- `ProjectDeliveryProfile`에 secret-safe `buildVerification` projection을 추가한다.
- `buildVerification.status`는 `not_started | preparing | verified | failed` 중 하나다.
- projection은 requested/resolved commit SHA, 검증 시각과 안전하게 정제된 실패 요약만 제공한다. Build ARN, Role ARN, credential 또는 provider token은 Web에 전달하지 않는다.
- Runtime 좌표와 Static Site URL/API Base URL은 별도 readiness key를 만들지 않고 기존 confirmed target과 `handoffConfigurationPreview`에서 Phase 3 자동 확인 결과로 표시한다.

이 계약 변경은 같은 모노레포의 shared type, API DTO와 Web 소비자를 한 번에 변경한다. DB schema와 migration은 필요하지 않으며 canonical 계약은 구현 시 `docs/data-models.md`에 함께 반영한다.

## Web 표시 변경

Phase 2의 네 행은 각 필드 존재 여부를 독립적으로 재계산하지 않는다. 서버 `deployment_target.missingKeys`와 저장된 target을 함께 사용해 동일한 판정을 표시한다.

- 서버가 `aws_connection`을 누락으로 반환하면 `AWS 연결` 또는 `Region`을 완료로 표시하지 않는다.
- 서버가 `build_config`를 누락으로 반환하면 `빌드 설정`을 완료로 표시하지 않고 설정 드로어의 검증 오류를 연결한다.
- 서버가 Phase 2를 ready로 반환하면 네 행과 Phase 상태를 모두 완료로 표시한다.
- `buildVerification.status`가 `not_started`이면 Phase 2 오류가 아니라 Phase 3에 `Plan 생성 시 자동 준비`로 표시한다.
- `buildVerification.status`가 `preparing`, `verified`, `failed`이면 Phase 3에 각각 `검증 중`, `검증 완료`, `검증 실패`로 표시한다.
- Output URL이 아직 없으면 `미설정`이나 `오류`가 아니라 `배포 후 자동 확인`으로 표시한다.

상단 `다음 작업`, 단계 표시, 아코디언 자동 열림과 유일한 주요 CTA는 같은 `currentTask/currentPhase` 결과를 계속 사용한다.

## 데이터 흐름

1. 사용자가 Phase 2 드로어에서 target을 저장한다.
2. Web은 저장 성공 뒤 Delivery Profile을 다시 조회한다.
3. API는 verified connection과 confirmed build configuration만으로 Phase 2 readiness를 계산한다.
4. Web은 Phase 2를 완료하고 Phase 3을 현재 단계로 연다.
5. 사용자가 `배포에서 Plan 검토하기`를 눌러 Direct Deployment 화면으로 이동한다.
6. 사용자가 Plan 생성을 요청하면 API가 Build Environment를 lazy create/reconcile하고 Repository checkout을 검증한다.
7. Delivery Profile의 `buildVerification`은 DB에 저장된 검증 상태를 secret-safe projection으로 반환한다.
8. 검증이 성공해야 Plan을 생성한다. 사용자가 Plan을 검토·승인한 뒤 Apply와 최초 앱 배포를 실행한다.
9. Apply와 릴리즈가 저장한 Runtime 좌표, Static Site URL과 API Base URL을 Delivery Profile이 다시 계산한다.
10. CI/CD로 돌아오거나 상태를 새로고침하면 Phase 3 evidence가 갱신되고 PR 생성 조건을 다시 판정한다.

## 오류 처리

- verified connection이 해제되거나 Region이 달라지면 Phase 2로 되돌리고 해당 행에 실제 원인을 표시한다.
- confirmed build configuration이 현재 Repository와 맞지 않으면 Phase 2의 `빌드 설정`만 미완료로 표시한다.
- Build Environment 생성이나 checkout 검증이 실패하면 Phase 2를 미완료로 되돌리지 않는다. Phase 3은 `buildVerification`의 실패 상태와 안전하게 정제된 원인을 표시하고 Deployment 재시도 동작을 제공한다.
- Plan, Apply 또는 최초 앱 배포가 실패하면 Phase 3에 저장된 Deployment 실패 요약을 표시한다. 성공 evidence를 만들지 않는다.
- Output URL이 배포 전 null인 상태는 오류가 아니다. Apply 또는 최초 앱 배포가 성공했는데도 안전한 HTTPS URL을 확인하지 못한 경우에만 Phase 3의 배포 결과를 실패로 표시한다.
- 새로고침 실패 시 기존 마지막 성공 snapshot을 유지하되 `새로고침 실패`를 명시하고 완료 상태를 새로 추정하지 않는다.

## 테스트 설계

### API 및 서비스

- verified target connection과 유효한 confirmed build configuration이 있으면 Deployment, Apply Plan과 Build Environment가 없어도 `deployment_target`은 ready다.
- verified target connection이 없거나 Region이 다르면 `aws_connection`이 누락이다.
- confirmed build configuration이 없거나 구조 검증에 실패하면 `build_config`가 누락이다.
- Build Environment 없음, checkout 미실행과 Output URL null은 Phase 2를 막지 않는다.
- Delivery Profile은 Build Environment 없음, 준비 중, 검증 성공과 실패를 `buildVerification`으로 구분하고 secret-shaped provider metadata를 반환하지 않는다.
- ECS Plan 요청은 기존대로 Build Environment를 준비하고 exact commit checkout을 검증한 뒤에만 Plan을 만든다.
- checkout 실패는 Plan 생성을 중단하고 안전한 실패 사유를 저장한다.
- Apply와 최초 앱 배포 전에는 Static Site URL/API Base URL이 없을 수 있고, 성공 후에는 서버가 확정 target과 architecture에서 다시 계산한다.

### Web 프레젠테이션

- Phase 2의 네 사용자 설정이 완료되면 현재 단계는 `pr`, 현재 작업은 `approve_apply_plan`이다.
- `runtime_config` 또는 `output_url`이 아직 없어도 Phase 2에 머물지 않는다.
- 서버가 반환한 `aws_connection` 또는 `build_config` 누락은 관련 행과 Phase 상태에 동일하게 반영된다.
- `배포에서 Plan 검토하기`는 Direct Deployment 화면만 열며 자동 승인이나 배포 API를 호출하지 않는다.
- Plan, checkout 검증, 최초 앱 배포와 URL 상태는 Phase 3에서 순서대로 표시된다.
- 저장 후 Delivery Profile 새로고침이 끝나면 Phase 2 아코디언은 완료되고 Phase 3이 자동으로 열린다.

### 통합 회귀

- Repository 연결부터 target 저장까지 완료한 신규 프로젝트가 순환 의존 없이 Phase 3으로 이동한다.
- Phase 3에서 Deployment로 이동해 Plan·Apply·최초 앱 배포를 완료하고 돌아오면 URL과 PR 생성 조건이 갱신된다.
- GitHub 계정 연결, Source Repository 연결, AWS 연결, Build Environment와 Deployment evidence가 서로 다른 범위로 유지된다.

## 비범위

- CI/CD 화면에서 Terraform Plan, Apply 또는 최초 앱 배포를 직접 실행하는 기능
- Phase 2 저장과 동시에 AWS CodeBuild, IAM 또는 CodeConnections 리소스를 생성하는 기능
- 사용자 승인 없이 PR을 생성하거나 Repository 설정을 변경하는 기능
- 기존 Direct Deployment 안전 게이트, plan artifact 검증 또는 secret masking 완화
- DB schema와 Drizzle migration 변경

## 완료 기준

- Phase 2의 UI 완료 상태와 서버 `deployment_target` readiness가 일치한다.
- 현재 프로젝트처럼 verified target과 confirmed build configuration은 있지만 Deployment와 Build Environment가 없는 상태에서 Phase 3으로 이동한다.
- CodeBuild 환경과 checkout 증거는 Deployment Plan 요청에서만 생성된다.
- Output URL은 배포 전 자동 확인 예정으로 표시되고 Phase 2를 차단하지 않는다.
- Plan·Apply·최초 앱 배포·URL·PR 생성 조건은 Phase 3에서 실제 evidence에 따라 갱신된다.
- 관련 shared type, API service, Web presentation과 통합 회귀 테스트가 통과한다.
