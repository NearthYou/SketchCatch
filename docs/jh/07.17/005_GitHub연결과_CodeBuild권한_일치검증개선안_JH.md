# GitHub 연결과 CodeBuild 권한 일치 검증 개선 계획

## 1. 문서 목적

이 문서는 Dashboard 설정의 `GitHub App 연결`과 `GitHub 빌드 연결`이 서로 다른 GitHub 계정·organization·Repository 권한으로 완료될 수 있는 문제를 해결하기 위한 UX와 검증 계획이다.

이 개선은 사용자가 두 연결을 모두 완료한 뒤 첫 Plan 또는 실제 build 단계에서야 Repository checkout 실패를 발견하는 일을 막는다. 전역 설정에서는 연결의 선행 조건과 승인 범위를 정확히 안내하고, 프로젝트에서는 선택한 exact Repository를 AWS CodeBuild가 실제로 읽을 수 있다는 증거가 생긴 뒤에만 `빌드 준비 완료`로 표시한다.

기준 문서는 다음과 같다.

- `002_GitHub전역연결과_Repository분석_Delivery통합계획_JH.md`
- `003_Repository분석부터_Delivery까지_기능구현단위_JH.md`
- `004_Delivery배포타깃_폼개선계획_JH.md`
- `docs/product.md`
- `docs/data-models.md`
- `docs/architecture.md`
- `docs/deployment.md`

이 문서는 담당자별 구현 계획이다. 공통 DTO, 상태값, DB 계약 또는 실행 정책을 확정할 때는 canonical 문서와 `packages/types`를 함께 갱신한다.

## 2. 한 문장 결론

`GitHub App 연결`은 SketchCatch가 사용할 Repository를 확인하고, `AWS GitHub 승인`은 AWS CodeBuild가 GitHub 소스를 checkout할 권한을 준비하며, `빌드 준비 완료`는 두 연결을 조합해 exact Repository와 commit checkout을 검증한 뒤에만 표시한다.

## 3. 현재 동작과 문제

### 3.1 현재 두 연결의 실제 책임

| 현재 화면 이름 | 실제로 하는 일 | 현재 저장 정보 | 하지 않는 일 |
| --- | --- | --- | --- |
| GitHub App 연결 | SketchCatch GitHub App installation과 Repository 접근 범위를 사용자 계정에 연결 | installation ID, account ID/login/type, Repository 선택 범위와 개수 | AWS CodeBuild 권한을 만들지 않음 |
| GitHub 빌드 연결 | 선택한 AWS 계정에 `ProviderType=GitHub`인 AWS CodeConnections를 생성하고 AWS Connector 승인을 받음 | AWS connection ID, Connection ARN, provider, 상태 | 프로젝트 Repository를 선택하거나 checkout 가능 여부를 검증하지 않음 |
| Source Repository 연결 | 프로젝트가 사용할 exact GitHub Repository를 선택하고 active row로 저장 | GitHub installation/repository ID, owner/name, branch, URL | AWS CodeConnection이 이 Repository를 읽을 수 있음을 보장하지 않음 |

세 연결은 현재 서로 다른 row와 서비스에서 관리된다. 이 분리는 책임 경계로는 맞지만, UI가 연결 간 일치 여부를 확인하지 않고 각각을 독립적인 성공으로 표시하는 것이 문제다.

### 3.2 재현 가능한 실패 흐름

```text
사용자가 AWS 계정 연결 완료
→ GitHub 빌드 연결에서 GitHub 계정 또는 organization A 승인
→ 화면에 “GitHub 빌드 연결 완료” 표시
→ GitHub App 연결에서 계정 또는 organization B 연결
→ 프로젝트 Source Repository로 B/repository 선택
→ 두 설정이 모두 성공 상태로 보임
→ 첫 Plan 또는 application build에서 B/repository checkout 시도
→ AWS CodeConnection에 접근 권한이 없어 실패
```

사용자는 모든 설정이 완료됐다고 안내받았지만 실제로는 사용할 수 없는 조합을 만들 수 있다. 이는 단순 문구 문제가 아니라 error prevention과 완료 상태 계약 문제다.

### 3.3 현재 UI 순서도 실제 의존성과 반대다

현재 Dashboard 설정의 주요 배치는 다음 순서다.

```text
AWS 계정 연결
→ GitHub 빌드 연결
→ 연결된 AWS 계정
→ GitHub App 연결
```

하지만 실제 안전한 의존 순서는 다음과 같다.

```text
GitHub App installation 확인
→ 프로젝트 Source Repository 선택
→ AWS 계정 선택
→ AWS GitHub 승인
→ exact Repository checkout 검증
```

downstream 권한인 AWS GitHub 승인을 upstream Repository identity보다 먼저 요청하면, 사용자가 어떤 GitHub 계정이나 organization을 승인해야 하는지 알 수 없다.

### 3.4 현재 완료 판정이 과도하다

현재 `AVAILABLE`은 AWS CodeConnection handshake가 완료됐다는 뜻이다. 다음 항목은 증명하지 않는다.

- 어떤 GitHub 사용자나 organization이 승인됐는지
- 어떤 Repository 범위를 승인했는지
- 프로젝트의 active Source Repository를 읽을 수 있는지
- confirmed commit SHA를 checkout할 수 있는지

따라서 `AVAILABLE`만으로 `GitHub 빌드 연결 완료`라고 표시하면 사용자가 실제 build readiness로 오해한다.

## 4. 반드시 지킬 경계

### 4.1 두 GitHub App 승인을 자동 재사용하지 않는다

SketchCatch GitHub App과 `AWS Connector for GitHub`는 서로 다른 GitHub App이다. SketchCatch installation token이나 사용자 OAuth token을 AWS CodeConnection에 주입해 승인을 대신하지 않는다.

따라서 다음 방식은 사용하지 않는다.

- SketchCatch GitHub App 승인을 AWS 승인으로 자동 복사
- SketchCatch installation token을 AWS나 CodeBuild에 전달
- GitHub access token을 브라우저, RDS, 로그 또는 API 응답에 저장
- AWS 외부 승인 화면에서 특정 GitHub 로그인을 강제로 선택했다고 가정

전역 GitHub 연결을 먼저 요구하는 이유는 승인을 재사용하기 위해서가 아니다. 사용자가 사용할 GitHub account login과 Repository 범위를 먼저 확인하고, AWS 승인 화면에서 기대하는 대상을 명확히 안내하기 위해서다.

### 4.2 account login 일치만으로 성공 처리하지 않는다

개인 GitHub 사용자가 organization Repository 권한을 승인하는 정상 흐름이 있으므로 `GitHub 로그인 이름 === Repository owner` 같은 비교는 올바른 검증이 아니다.

최종 성공 조건은 계정 이름이 아니라 다음 exact evidence다.

```text
선택한 SourceRepository.owner/name
+ confirmed branch/commit SHA
+ 선택한 AWS CodeConnection ARN
→ CodeBuild source checkout 성공
→ resolved source version이 confirmed commit SHA와 일치
```

### 4.3 연결과 실행을 분리한다

- GitHub App 설치는 Repository를 변경하지 않는다.
- AWS GitHub 승인은 CodeBuild를 실행하지 않는다.
- Repository 접근 검증은 user service Resource를 배포하지 않는다.
- `빌드 준비 완료`는 실제 Deployment 성공을 의미하지 않는다.
- Terraform Apply, ECS/ECR/S3/CloudFront mutation은 기존 Plan·승인·실행 게이트를 유지한다.

## 5. 목표 사용자 흐름

### 5.1 전역 설정 흐름

```text
GitHub App 연결
→ 연결된 account login과 Repository 범위 확인
→ AWS 계정 연결
→ “AWS CodeBuild용 GitHub 권한 연결” 시작
→ 사용할 GitHub account/organization 안내 확인
→ AWS Console에서 AWS Connector 승인
→ CodeConnection AVAILABLE 확인
→ “AWS GitHub 승인 완료 · Repository 검증 전” 표시
```

전역 설정은 사용자와 AWS 계정 수준의 권한 준비까지만 담당한다. 전역 설정에서 특정 프로젝트가 `빌드 준비 완료`라고 판단하지 않는다.

### 5.2 GitHub App 연결이 없는 상태

`GitHub App 연결`이 하나도 없으면 빌드 권한 연결 버튼을 바로 실행하지 않는다.

```text
AWS CodeBuild용 GitHub 권한 연결
└─ 비활성 또는 prerequisite 안내
   ├─ 설명: “먼저 SketchCatch에서 사용할 GitHub account와 Repository 권한을 연결해 주세요.”
   └─ 주요 동작: “GitHub App 연결하기”
```

단순히 disabled button만 보여주지 않고 차단 이유와 다음 동작을 함께 제공한다.

### 5.3 active installation이 하나인 상태

MVP는 `002` 계획에 따라 active GitHub installation 하나를 기본 지원한다.

- 빌드 권한 연결 영역에 `accountLogin`, account type, Repository 선택 범위와 개수를 표시한다.
- AWS Console 이동 전에 `AWS 승인 화면에서도 이 account 또는 이 Repository에 접근 가능한 organization을 선택해야 합니다.`라고 안내한다.
- AWS 승인 뒤에도 Repository checkout 전에는 `빌드 준비 완료`라고 표시하지 않는다.

### 5.4 active installation이 여러 개인 상태

현재 MVP에서는 installation을 임의로 선택하지 않는다.

- `GitHub 연결 정리 필요` 상태를 표시한다.
- `GitHub 권한 관리`로 이동할 수 있게 한다.
- 어떤 installation을 AWS CodeConnection에 자동 대응시키지 않는다.
- multi-installation 지원을 확정하기 전에는 첫 installation 또는 최근 installation을 fallback으로 사용하지 않는다.

### 5.5 프로젝트 Delivery 흐름

```text
Delivery > GitHub 연결
→ active Source Repository 확인
→ Delivery > 배포 설정에서 AWS connection 확인
→ 연결된 AWS CodeConnection 상태 확인
→ Repository build 권한 상태가 미검증이면 “빌드 권한 확인” 제공
→ project build-only CodeBuild 환경 준비
→ exact Repository와 confirmed commit checkout 검증
→ 성공 시 “빌드 준비 완료”
→ 실패 시 expected Repository와 복구 동작 표시
```

검증이 실패해도 Terraform Apply, ECR publish, ECS update, 서비스 S3 upload 또는 CloudFront invalidation을 실행하지 않는다.

## 6. 화면 정보 구조와 문구

### 6.1 Dashboard 설정 순서

목표 순서는 다음과 같다.

```text
설정
├─ GitHub App 연결
│  ├─ 연결된 account/organization
│  ├─ Repository 범위
│  └─ GitHub 권한 관리
├─ AWS 계정 연결
│  ├─ account ID
│  ├─ Region
│  └─ Role 검증 상태
└─ AWS CodeBuild용 GitHub 권한
   ├─ 예상 GitHub 대상
   ├─ 사용할 AWS 계정
   ├─ AWS 승인 상태
   └─ 프로젝트 Repository 검증 안내
```

`GitHub 빌드 연결`은 다음 중 하나로 이름을 바꾼다.

- 권장: `AWS CodeBuild용 GitHub 권한`
- 짧은 대안: `AWS GitHub 승인`

`GitHub App 연결`과 단어만 비슷한 `GitHub 빌드 연결`을 나란히 사용하지 않는다.

### 6.2 상태 문구

| 내부 상태 | 사용자 표시 | 의미 |
| --- | --- | --- |
| GitHub installation 없음 | `GitHub App 연결 필요` | SketchCatch가 사용할 GitHub 범위를 먼저 확인해야 함 |
| AWS connection 없음 | `AWS 계정 연결 필요` | CodeConnection을 만들 AWS account/Region이 없음 |
| CodeConnection `CREATING` | `AWS GitHub 연결 생성 중` | AWS 리소스를 생성하는 중 |
| CodeConnection `PENDING` | `AWS에서 GitHub 승인 필요` | AWS Console handshake가 필요함 |
| CodeConnection `AVAILABLE` | `AWS GitHub 승인 완료` | AWS handshake만 완료, Repository 검증 전일 수 있음 |
| Repository verification 없음 | `Repository 빌드 권한 확인 필요` | exact checkout evidence 없음 |
| Repository verification 성공 | `빌드 준비 완료` | exact Repository와 commit checkout 검증 완료 |
| Repository verification 실패 | `Repository 접근 권한 불일치` | 현재 CodeConnection으로 exact Repository를 읽지 못함 |

### 6.3 불일치 오류 표시

모호한 `빌드 환경 준비 실패` 대신 expected target과 다음 행동을 보여준다.

```text
Repository 접근 권한을 확인하지 못했습니다.

확인 대상
- Repository: NearthYou/example-service
- Branch: main
- Commit: abc1234…
- AWS account: 123456789012
- Region: ap-northeast-2

AWS Connector for GitHub가 이 Repository에 접근할 수 있는지 확인해 주세요.
```

복구 동작:

1. `GitHub Repository 권한 확인`
2. `AWS GitHub 권한 다시 연결`
3. `Repository 빌드 권한 다시 확인`

secret, token, private key, 전체 ARN 또는 credential 원문은 오류 화면과 로그에 표시하지 않는다.

## 7. 상태와 판정 계약

### 7.1 계정 수준 상태와 프로젝트 수준 상태를 분리한다

```ts
type AwsGitHubAuthorizationStatus =
  | "not_configured"
  | "creating"
  | "approval_required"
  | "available"
  | "error";

type RepositoryBuildAccessStatus =
  | "not_checked"
  | "checking"
  | "verified"
  | "mismatch"
  | "error";
```

위 이름은 계획용 제안이다. 구현 시 `docs/data-models.md`와 shared type을 먼저 확정한다.

두 상태를 하나의 `connected: boolean`으로 합치지 않는다.

```text
AWS GitHub authorization = available
Repository build access = not_checked
```

위 조합은 정상적인 중간 상태이며 최종 성공이 아니다.

### 7.2 `빌드 준비 완료` 판정

다음 조건을 모두 만족해야 한다.

1. active GitHub Source Repository가 있다.
2. verified AWS connection이 프로젝트 배포 타깃에 선택되어 있다.
3. 해당 AWS connection의 CodeConnection이 `AVAILABLE`이다.
4. confirmed build configuration이 있다.
5. 검증한 Repository owner/name이 현재 active Source Repository와 일치한다.
6. 검증한 branch와 resolved commit이 현재 confirmed revision과 일치한다.
7. 검증 evidence가 현재 CodeConnection ARN과 project build environment fingerprint에 묶여 있다.

Repository, commit, AWS connection, Region, CodeConnection 또는 build configuration이 바뀌면 기존 verification을 무효화한다.

### 7.3 fail-closed 원칙

- AWS가 승인 GitHub identity를 반환하지 않으면 같은 계정이라고 추측하지 않는다.
- DB에 이전 성공 record가 있어도 fingerprint가 다르면 재검증한다.
- provider 조회나 checkout 검증이 실패하면 성공 상태를 유지하지 않는다.
- public Repository라는 이유로 CodeConnection 검증을 생략하지 않는다. 현재 제품의 build-only CodeBuild 경로는 같은 계약을 사용한다.

## 8. API와 서비스 경계

### 8.1 계정 수준 조회

Dashboard 설정은 다음 read model을 조합해 표시한다.

```ts
type AwsGitHubBuildAuthorizationView = {
  awsConnectionId: string;
  awsAccountId: string;
  region: string;
  codeConnectionStatus: AwsCodeConnectionStatus | null;
  githubInstallations: GitHubInstallationConnection[];
  prerequisite:
    | "github_installation_required"
    | "multiple_installations_unsupported"
    | "aws_connection_required"
    | "ready_to_authorize"
    | null;
};
```

이 타입은 조회 편의를 위한 composition 결과이며 하나의 DB table을 의미하지 않는다.

### 8.2 CodeConnection 생성 API

현재 CodeConnection 생성 API에는 다음 server-side prerequisite를 추가한다.

1. 현재 사용자에게 active GitHub installation이 하나 있는지 확인한다.
2. verified AWS connection 소유권을 확인한다.
3. 여러 installation이면 임의 선택하지 않고 conflict를 반환한다.
4. 조건을 만족하면 기존 create/reservation/idempotency 흐름을 사용한다.

예상 오류 코드는 구현 전 canonical 계약에서 확정한다.

```text
GITHUB_INSTALLATION_REQUIRED
MULTIPLE_GITHUB_INSTALLATIONS_UNSUPPORTED
AWS_CONNECTION_REQUIRED
```

Web 차단만 두지 않고 API도 같은 prerequisite를 검증한다.

### 8.3 Repository 접근 검증 API

프로젝트 Delivery는 다음 책임의 명시적 mutation을 사용한다.

```text
POST /projects/:projectId/build-environment/verify-repository-access
```

요청은 project ID만 받고 Repository URL, commit SHA, AWS account와 CodeConnection ARN을 클라이언트 입력으로 신뢰하지 않는다. 서버가 active Source Repository, Project Deployment Target, verified AWS connection, CodeConnection과 confirmed build config를 RDS에서 다시 읽는다.

이 mutation은 다음만 수행한다.

1. project build-only CodeBuild environment를 create/reconcile한다.
2. trusted verification buildspec으로 exact source checkout을 시작한다.
3. resolved source version과 confirmed commit SHA를 비교한다.
4. secret-shaped log와 provider credential을 저장하지 않는다.
5. 검증 결과와 fingerprint를 저장한다.

이 mutation은 Terraform Apply, runtime rollout, ECR release publish, ECS update, 서비스 S3 upload 또는 CloudFront invalidation을 수행하지 않는다. CodeBuild 실행 비용과 로그가 발생할 수 있으므로 UI에 `Repository 소스 접근만 확인하며 배포는 실행하지 않습니다.`라고 표시한다.

API 경로와 DTO 이름은 구현 시 기존 `project-build-environments` route naming과 충돌하지 않게 확정한다.

### 8.4 첫 Plan과의 관계

사용자가 별도 `빌드 권한 확인`을 실행하지 않고 첫 Plan을 요청하면 다음 중 하나를 제품 결정으로 고정한다.

- 권장: Plan 준비 단계가 같은 Repository access verification을 실행하고, 실패하면 Plan 생성 전에 exact mismatch 오류를 반환한다.
- 대안: Plan을 차단하고 Delivery에서 `빌드 권한 확인`을 먼저 요구한다.

권장안은 기존 lazy create 방향을 유지하면서 별도 설정 단계를 강제하지 않는다. 다만 UI는 Plan 진행 중 `Repository 소스 접근 확인` 단계를 명시해야 한다.

## 9. 데이터 모델 영향

### 9.1 현재 계약에서 유지할 것

- `github_installation_connections`: SketchCatch GitHub App installation identity
- `source_repositories`: project exact Repository identity
- `aws_code_connections`: AWS account별 CodeConnection ARN과 AWS 상태
- `project_build_environments`: project별 CodeBuild project와 source Repository URL

서로 다른 책임의 row를 하나로 합치지 않는다.

### 9.2 추가 evidence 계약

Repository access verification에는 최소한 다음 정보가 필요하다.

```ts
type RepositoryBuildAccessVerification = {
  projectId: string;
  sourceRepositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  branch: string;
  commitSha: string;
  awsConnectionId: string;
  codeConnectionArnFingerprint: string;
  buildEnvironmentFingerprint: string;
  status: "verified" | "mismatch" | "error";
  verifiedAt: IsoDateTimeString | null;
  statusReason: string | null;
};
```

보안상 다음 값은 저장하지 않는다.

- GitHub installation token
- AWS Connector token
- user OAuth token
- GitHub App private key
- AWS credential
- secret-shaped CodeBuild output

이 evidence를 `project_build_environments`에 확장할지 별도 table로 둘지는 구현 착수 시 조회 수명과 무효화 조건을 비교해 결정한다. 현재 문서에서는 migration 번호나 table 구조를 확정하지 않는다.

### 9.3 multi-installation 확장

현재 `aws_code_connections`는 AWS connection당 하나의 CodeConnection만 가진다. 여러 GitHub organization을 한 AWS 계정으로 배포해야 한다면 향후 다음 단위를 검토한다.

```text
(awsConnectionId, githubInstallationIdentity)
→ CodeConnection
```

그러나 AWS CodeConnection 응답에서 GitHub installation identity를 신뢰할 수 있는 방식으로 확인할 수 있는지 먼저 조사해야 한다. capability evidence 없이 account login 문자열만 저장해 대응시키지 않는다.

이번 MVP 개선은 single active installation, exact Repository checkout verification과 명확한 상태 분리까지를 범위로 한다.

## 10. 구현 단계

### B01. 문구와 상태 의미 수정

- `GitHub 빌드 연결`을 `AWS CodeBuild용 GitHub 권한`으로 변경한다.
- `AVAILABLE` 표시를 `AWS GitHub 승인 완료`로 변경한다.
- Repository 검증 전 `빌드 준비 완료` 문구를 사용하지 않는다.
- CodeConnections 용어를 사용자 설명의 주어로 사용하지 않는다.

완료 조건:

- 사용자가 이 설정이 Repository 선택이나 build 실행이 아니라 AWS의 GitHub 승인임을 알 수 있다.

### B02. 설정 순서와 prerequisite 개선

- Dashboard에서 GitHub App 연결을 AWS GitHub 권한보다 먼저 배치한다.
- GitHub installation이 없으면 API 호출 전에 prerequisite 안내를 표시한다.
- `GitHub App 연결하기`를 직접 제공한다.
- 여러 active installation을 임의 선택하지 않는다.

완료 조건:

- GitHub App installation 0개인 사용자가 AWS GitHub 승인을 먼저 시작할 수 없다.
- Web 요청을 우회해도 API가 같은 조건으로 차단한다.

### B03. 승인 전 expected target 안내

- active installation의 account login, type, Repository 범위와 개수를 표시한다.
- AWS Console 이동 전에 다른 GitHub 대상 승인 시 Repository 검증이 실패할 수 있음을 설명한다.
- 외부 이동 뒤 원래 설정 화면으로 돌아와 상태를 갱신할 수 있게 한다.

완료 조건:

- 사용자가 AWS 화면에서 어떤 account 또는 organization을 확인해야 하는지 알 수 있다.
- UI가 AWS 승인 identity를 실제로 확인했다고 거짓 표시하지 않는다.

### B04. 프로젝트 Repository access verification

- active Source Repository와 confirmed commit을 서버에서 다시 읽는다.
- project build-only CodeBuild environment를 준비한다.
- trusted buildspec으로 source checkout과 resolved commit을 검증한다.
- 결과를 Repository, AWS connection, CodeConnection과 build fingerprint에 묶는다.

완료 조건:

- 다른 GitHub 권한을 승인한 경우 실제 release build 전에 mismatch를 발견한다.
- 검증이 user service cloud Resource를 변경하지 않는다.

### B05. Delivery readiness 통합

- `ProjectDeliveryProfile` 또는 동등한 read model에 계정 승인 상태와 Repository 검증 상태를 분리해 제공한다.
- Delivery readiness가 `AWS 승인 완료`와 `빌드 준비 완료`를 별도 조건으로 표시한다.
- Repository 또는 target 변경 시 기존 검증을 무효화한다.

완료 조건:

- readiness가 DB의 `AVAILABLE`만으로 build-ready를 반환하지 않는다.
- 사용자가 실패 위치와 복구 동작을 같은 Delivery 화면에서 확인한다.

### B06. 기존 연결 호환

기존 `AVAILABLE` CodeConnection은 삭제하거나 자동 재승인하지 않는다.

- 전역 설정에는 `AWS GitHub 승인 완료`로 표시한다.
- 프로젝트별 Repository access 상태는 `확인 필요`로 시작한다.
- 첫 Plan 또는 명시적 확인에서 exact checkout을 검증한다.
- 성공하면 evidence를 저장하고 이후 같은 fingerprint에서 재사용한다.
- 실패하면 기존 ARN을 성공 evidence로 취급하지 않고 재연결 경로를 제공한다.

완료 조건:

- 기존 사용자가 불필요하게 AWS 승인을 반복하지 않는다.
- 과거 승인 이력만으로 현재 Repository 접근을 성공 처리하지 않는다.

## 11. 테스트 계획

### 11.1 Web 상태 테스트

- GitHub installation 0개면 AWS GitHub 권한 버튼 대신 prerequisite CTA를 표시한다.
- installation 1개면 account login과 Repository 범위를 표시한다.
- installation 2개 이상이면 임의 선택 없이 정리 안내를 표시한다.
- CodeConnection `AVAILABLE`은 `AWS GitHub 승인 완료`로 표시한다.
- Repository verification 전에는 `빌드 준비 완료`를 표시하지 않는다.
- mismatch에는 expected Repository와 세 가지 복구 동작을 표시한다.
- 설정 순서가 GitHub App → AWS 계정 → AWS GitHub 권한 순서다.

### 11.2 API prerequisite 테스트

- GitHub installation 없이 CodeConnection 생성을 요청하면 conflict를 반환한다.
- 다른 사용자의 installation이나 AWS connection을 사용할 수 없다.
- 여러 installation을 첫 항목으로 fallback하지 않는다.
- 기존 CodeConnection reservation/idempotency와 cleanup 계약을 유지한다.
- 응답에 token, private key, credential과 secret이 없다.

### 11.3 Repository verification 테스트

- 같은 Repository와 exact commit checkout 성공 시 `verified`가 된다.
- Repository owner/name mismatch는 `mismatch`가 된다.
- resolved commit mismatch는 성공 처리하지 않는다.
- CodeConnection, AWS connection, Region, Repository 또는 build config 변경 시 기존 evidence를 재사용하지 않는다.
- provider timeout과 권한 거부를 구분해 안전한 `statusReason`으로 변환한다.
- secret-shaped CodeBuild output을 저장하거나 응답하지 않는다.
- verification 중 Terraform Apply와 runtime mutation gateway가 호출되지 않는다.

### 11.4 기존 연결 회귀 테스트

- 기존 `AVAILABLE` ARN은 전역 승인 상태로 재사용한다.
- 기존 프로젝트는 Repository verification `not_checked`로 안전하게 시작한다.
- 첫 Plan에서 validation을 통과하면 정상 Plan 흐름을 계속한다.
- validation 실패 시 Plan 또는 release build 전에 차단한다.
- 다른 프로젝트의 verification evidence를 재사용하지 않는다.

### 11.5 접근성·복구 테스트

- prerequisite, pending, available, mismatch와 error 상태가 `role=status` 또는 `role=alert`로 전달된다.
- 외부 AWS Console 이동 링크에 새 창 안내가 있다.
- 키보드만으로 연결, 상태 확인, 재연결과 Repository 검증을 수행할 수 있다.
- 색상만으로 상태를 구분하지 않는다.
- 외부 이동 뒤 refresh 또는 focus 복귀로 상태를 다시 조회할 수 있다.

## 12. 완료 조건

1. GitHub App installation 없이 AWS GitHub 권한 연결을 시작할 수 없다.
2. 설정 화면이 GitHub App, AWS 계정, AWS GitHub 권한의 실제 의존 순서로 배치된다.
3. AWS CodeConnection `AVAILABLE`은 Repository build readiness로 표시되지 않는다.
4. SketchCatch GitHub App 승인을 AWS Connector 승인으로 자동 재사용하지 않는다.
5. 계정 login 문자열이 아니라 exact Repository와 commit checkout evidence로 성공을 판단한다.
6. 서로 다른 GitHub 권한을 연결하면 actual release build 전에 mismatch를 발견한다.
7. 기존 `AVAILABLE` CodeConnection은 삭제하지 않고 프로젝트별 검증 전 상태로 안전하게 전환한다.
8. 검증 결과는 Repository, AWS connection, CodeConnection과 build fingerprint 변경 시 무효화된다.
9. Repository 접근 검증은 user service cloud Resource를 배포하거나 변경하지 않는다.
10. 실패 화면은 expected Repository와 재승인·재검증 동작을 구체적으로 제공한다.

## 13. 범위 밖

- 여러 GitHub installation 중 하나를 자동 선택하는 기능
- SketchCatch GitHub App token을 AWS CodeConnection에 전달하는 기능
- GitHub 또는 AWS 외부 승인 화면을 우회하거나 자동 조작하는 기능
- account login 문자열만으로 AWS 승인 identity를 확정하는 기능
- CodeConnection 생성만으로 Terraform Plan, Apply 또는 application release를 시작하는 기능
- Azure, GCP 등 다른 Provider의 source connection 구현

## 14. 구현 전 확인 사항

1. AWS CodeConnection이 GitHub installation 또는 Repository scope를 신뢰 가능한 API 필드로 제공하는지 공식 문서와 실제 응답으로 확인한다.
2. 현재 trusted CodeBuild buildspec을 Repository access verification에 재사용할 수 있는지 검토한다.
3. verification evidence의 수명과 무효화 기준을 `docs/data-models.md`에 먼저 확정한다.
4. project build environment 생성 비용, 검증 build 비용과 cleanup 책임을 `docs/deployment.md`에 반영한다.
5. DB 변경이 필요하다고 확정하는 시점에는 migration coordination 규칙에 따라 번호 충돌을 먼저 알린다.

## 15. 요약

현재 문제는 GitHub 연결이 두 개라서가 아니라, 서로 다른 책임의 연결을 독립적으로 성공 처리하면서 exact Repository 접근 가능 여부를 확인하지 않는 데 있다.

개선 후 사용자는 먼저 SketchCatch GitHub App으로 사용할 Repository 범위를 연결하고, AWS에는 별도의 AWS Connector 권한을 승인한다. 제품은 이 두 승인을 같다고 가정하지 않고, 선택한 Repository와 confirmed commit을 CodeBuild가 실제 checkout한 증거가 있을 때만 `빌드 준비 완료`로 표시한다.

따라서 최소 UX 개선은 `GitHub App 연결 없는 빌드 권한 차단`이고, 최종 안전 조건은 `exact Repository checkout verification`이다.
