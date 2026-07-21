# CI/CD 필수 파라미터 보완 설계

## 목적

CI/CD PR 생성 전에 ECS 웹 빌드 설정을 완전하게 확정하고, RDS 사용 여부와 공개 URL을 승인된 프로젝트 기록에서 자동 계산한다. 사용자는 자동 계산값을 최종 검토 화면에서 확인하지만, 클라이언트가 임의로 배포 범위를 바꿀 수는 없다.

이번 변경은 실제 PR 생성, GitHub 설정 적용, AWS 변경 또는 DB migration을 수행하지 않는다.

## 검토한 접근

### 1. 서버가 계산하고 Delivery Profile에서 미리 제공한다 — 선택

- 승인된 Architecture와 확정 Deployment Target을 서버가 읽는다.
- 서버가 계산한 RDS와 URL preview를 Delivery Profile에 포함한다.
- Web은 같은 preview를 PR 생성 전 보여주고 요청에도 다시 보낸다.
- Handoff 생성 서버는 현재 기록으로 다시 계산하고, 클라이언트 값이 있으면 정확히 일치하는지 검사한다.

추가 조회와 DTO 변경은 필요하지만, 화면의 값과 실제 workflow 값이 같은 source of truth를 사용한다.

### 2. Web에서 Deployment와 Target만 보고 계산한다

추가 API 변경은 적지만 `liveProfile`은 RDS 존재 여부와 일치하지 않을 수 있고, 오래된 화면 상태나 변조된 요청을 서버가 구분하기 어렵다.

### 3. Handoff 생성 시 서버만 계산한다

배포 동작은 안전하지만 사용자가 PR 생성 전에 RDS와 URL을 확인할 수 없어 이번 UX 요구를 충족하지 못한다.

## 공유 계약

`GitCicdHandoffConfigurationPreview`를 추가한다.

```ts
type GitCicdHandoffConfigurationPreview = {
  rdsEnabled: boolean;
  staticSiteUrl: string | null;
  apiBaseUrl: string | null;
};
```

`ProjectDeliveryProfile`에는 현재 readiness가 선택한 Direct Deployment와 연결되는 preview를 nullable 필드로 제공한다. 승인된 Apply Deployment 또는 확정 Deployment Target이 없으면 `null`이다.

기존 `CreateGitCicdHandoffRequest`의 `rdsEnabled`, `staticSiteUrl`, `apiBaseUrl`은 호환성을 위해 optional로 유지한다. 서버는 요청값을 source of truth로 사용하지 않는다.

## RDS 자동 판정

RDS 사용 여부는 Handoff가 참조하는 승인된 `ArchitectureJson`에서 계산한다. 각 node의 `config.terraformResourceType`이 아래 타입 중 하나일 때만 `true`다.

- `aws_db_instance`
- `aws_rds_cluster`
- `aws_rds_cluster_instance`

`aws_db_subnet_group`, `aws_db_parameter_group`, `aws_db_option_group`, `aws_db_snapshot`처럼 DB를 직접 실행하지 않는 보조 리소스는 RDS 활성화 근거가 아니다. `Deployment.liveProfile`도 지원 가능 범위를 나타낼 뿐 실제 RDS 존재 여부가 아니므로 판정에 사용하지 않는다.

Handoff 생성 시 서버는 요청의 Architecture가 현재 사용자가 승인한 Apply Deployment와 일치하는지 기존 검증을 유지한다. 클라이언트가 `rdsEnabled`를 보냈는데 서버 계산값과 다르면 provider 호출 전에 409 conflict로 중단한다. 값이 생략되어도 서버 계산값으로 workflow와 Repository Variable을 만든다.

## Static Site URL과 API Base URL 자동 파생

URL은 확정된 `ProjectDeploymentTarget.runtimeConfig.outputUrl`에서 아래처럼 계산한다.

| Runtime | Static Site URL | API Base URL |
| --- | --- | --- |
| `static_site` | `outputUrl` | `null` |
| `lambda` | `null` | `outputUrl` |
| `ec2_asg` | `null` | `outputUrl` |
| `ecs_fargate` + `confirmedBuildConfig.ecsWeb` | `outputUrl` | `outputUrl` |
| legacy `ecs_fargate` without `ecsWeb` | `null` | `outputUrl` |

ECS 웹 프로젝트의 `outputUrl`은 공개 CloudFront URL이며 API도 같은 public base를 사용한다. 내부 ALB origin인 `apiOriginUrl`은 사용자 링크나 GitHub Repository Variable로 노출하지 않는다.

기존 Target 검증을 통과하지 못하거나 안전한 `outputUrl`이 없으면 readiness가 먼저 PR 생성을 차단한다. 클라이언트가 URL을 보냈는데 서버 계산값과 다르면 provider 호출 전에 409 conflict로 중단한다.

## Delivery Profile과 PR 검토 흐름

1. Delivery Profile은 readiness가 선택한 `sourceDeploymentId`의 Architecture를 읽는다.
2. 같은 응답에서 확정 Deployment Target을 사용해 RDS와 URL preview를 계산한다.
3. PR 생성 전 검토에는 아래 값을 평면 목록으로 표시한다.
   - RDS: `사용` 또는 `사용 안 함`
   - Static Site URL: 값 또는 `생성하지 않음`
   - API Base URL: 값 또는 `생성하지 않음`
4. Web은 표시한 preview를 Handoff 요청에 포함한다.
5. API는 현재 Architecture와 Target으로 다시 계산해 요청과 대조한 뒤, 계산값만 workflow preview, provider 입력, Handoff record에 전달한다.

Preview가 없거나 화면이 오래되어 서버값과 불일치하면 PR을 생성하지 않고 Delivery 상태를 새로고침하도록 안내한다.

## ECS 웹 빌드 설정

ECS/Fargate draft는 `ecsWeb`이 없거나 불완전하면 저장 준비 상태가 될 수 없다. 최상위 누락 key는 `ecs_web_build_config` 하나를 사용하고, 고급 설정 안에서 상세 누락 필드를 수정한다.

사용자가 수정할 값:

- API source root
- Dockerfile path
- container port
- Health Check path
- Frontend source root
- `package.json` path
- lockfile path
- package manager와 version
- frontend output path

자동 유지할 값:

- install preset과 build preset은 package manager에서 계산한다.
- `requiredRuntimeSecrets`는 Repository Analysis 결과를 보존하며 직접 입력받지 않는다.
- lockfile 이름이 `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` 중 하나면 package manager와 preset을 함께 갱신한다.

기존 공통 입력과 중첩 `ecsWeb.api`는 아래처럼 항상 동기화한다.

- `sourceRoot` ↔ `ecsWeb.api.sourceRoot`
- `evidencePath` ↔ `ecsWeb.api.dockerfilePath`
- `healthCheckPath` ↔ `ecsWeb.api.healthCheckPath`

요청 생성 시 Dockerfile, package manifest, frontend output evidence를 중첩 설정에서 일관되게 만든다. Lambda, EC2 Auto Scaling, Static Site는 `ecsWeb` 누락으로 차단하지 않는다.

검증 규칙은 서버 계약과 맞춘다.

- repository-relative safe path
- container port 정수 `1..65535`
- `/`로 시작하는 Health Check path
- 서버와 같은 SemVer 형식의 package manager version
- package manager와 install/build preset의 일치
- 필수 API/Frontend 경로의 존재

## 오류 처리

- ECS 설정 누락: 고급 설정을 자동으로 열고 `ECS 웹 빌드 설정`을 누락 항목으로 표시한다.
- 잘못된 ECS 값: 저장 버튼을 비활성화하고 해당 고급 설정 그룹에서 수정하게 한다.
- Handoff preview 불일치: GitHub provider 호출 전에 409로 중단하고 새로고침을 안내한다.
- 자동 파생 URL 없음: readiness의 기존 Output URL gate를 유지하며 빈 GitHub Variable로 조용히 진행하지 않는다.

## 테스트

### Web

- `ecsWeb: null`인 ECS draft가 `ecs_web_build_config`로 차단되는 RED/GREEN 테스트
- 각 필수 ECS 상세값, port, Health Check, package preset 검증 table test
- 공통 API 입력과 `ecsWeb.api`의 양방향 동기화 테스트
- lockfile 변경 시 package manager와 preset 갱신 테스트
- 완전한 draft가 일관된 evidence와 Handoff 요청을 만드는 테스트
- PR 검토에 RDS와 두 URL이 표시되는 source/component contract 테스트

### API

- Architecture의 실제 RDS Terraform 타입만 `rdsEnabled: true`로 만드는 테스트
- RDS 보조 리소스와 snapshot이 `false`인 테스트
- 네 Runtime과 legacy ECS의 URL 매핑 table test
- 요청값 생략 시 서버 계산값이 provider, Repository settings preview, Handoff record에 전달되는 테스트
- 요청값과 서버 계산값 불일치 시 provider 미호출 및 409 테스트
- Delivery Profile이 readiness의 exact source Deployment Architecture로 preview를 만드는 테스트

### 완료 검증

- 관련 Types/API/Web 집중 테스트
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

## 범위 밖

- GitHub Environment 이름 변경
- Terraform state/release bucket 사용자 입력
- DB schema 또는 migration
- 실제 PR 생성, Repository settings 적용, AWS Role 적용, Terraform Apply/Destroy
