# Repository 분석부터 Delivery까지 기능 구현 단위

## 1. 문서 목적

이 문서는 `GitHub 전역 연결·Repository Analysis·Delivery Center 통합 계획`을 실제 코드와 테스트로 옮길 수 있는 작은 구현 단위로 나눈다. 각 단위는 사용자에게 확인 가능한 행동 하나와 그 행동을 지탱하는 저장·API 계약 하나를 함께 완성한다.

기준 계획은 `002_GitHub전역연결과_Repository분석_Delivery통합계획_JH.md`다. 이 문서와 기준 계획이 충돌하면 다음 원칙을 적용한다.

1. 공개 Repository 분석과 Board 생성에는 GitHub 연결을 요구하지 않는다.
2. Repository를 변경하거나 PR·Pipeline을 실행할 때만 검증된 `SourceRepository`를 요구한다.
3. Board를 만든 Repository 정보는 RDS의 `RepositoryAnalysisRecord`에 저장한다.
4. commit SHA 차이는 최신성 안내일 뿐 Architecture Board 변경이나 CI/CD 차단 조건이 아니다.
5. 이번 범위에서 여러 active GitHub installation 선택과 Repository 변경에 따른 Architecture 재설계는 지원하지 않는다.

## 2. 완료 후 사용자 흐름

```text
Repository URL 입력
→ 공개 조회와 분석
→ Template·질문 확인
→ Board 생성 + RepositoryAnalysisRecord 저장
→ Workspace Delivery 탭에서 저장된 Repository 정보 확인
→ 필요할 때 GitHub 연결 또는 권한 추가
→ exact Repository를 SourceRepository로 연결
→ monitoring·배포 타깃 설정
→ readiness 확인
→ 사용자 승인 뒤 Git/CI/CD handoff
```

공개 조회에 실패하면 다음 흐름을 사용한다.

```text
Repository 확인 실패
→ URL 오류 또는 비공개 가능성을 중립적으로 안내
→ GitHub 미연결: GitHub 연결하기
→ installation 1개 + 접근 불가: Repository 권한 추가
→ exact Repository 접근 가능: 이 Repository 연결하고 분석
→ active SourceRepository exact match: 연결된 Repository 분석
```

## 3. 핵심 모듈과 인터페이스

### 3.1 Repository Analysis Record 모듈

이 모듈은 현재 Board가 어떤 Repository 분석 결과로 만들어졌는지 프로젝트별로 한 건 저장하고 읽는다. GitHub 권한을 부여하거나 Repository를 변경하지 않는다.

공개 인터페이스:

```ts
type RepositoryAnalysisRecordRepository = {
  findCurrentByProject(input): Promise<RepositoryAnalysisRecord | null>;
  replaceCurrent(input): Promise<RepositoryAnalysisRecord>;
};
```

exact `SourceRepository` 연결과 record attach는 기존 Source Repository 연결 서비스가 하나의 연결 작업으로 처리한다.

저장 규칙:

- `project_id`는 unique다.
- Board 저장이 성공한 뒤 같은 사용자 동작 안에서 현재 record를 upsert한다.
- 새 Repository의 Board를 확정하면 기존 record를 교체하고 `sourceRepositoryId`를 `null`로 초기화한다.
- `analysisResult`에는 구조화된 결과만 저장한다.
- 프로젝트 삭제 시 cascade 삭제한다.
- exact owner/name이 일치하는 active `SourceRepository`만 연결한다.

### 3.2 Repository Access Recovery 모듈

이 모듈은 공개 조회 실패와 GitHub 연결 상태를 받아 사용자에게 보여줄 복구 동작을 결정한다. GitHub App 연결이나 권한 변경을 자동 실행하지 않는다.

```ts
type RepositoryRecoveryAction =
  | { kind: "connect_github" }
  | { kind: "add_repository_permission"; installationId: string; managementUrl: string }
  | { kind: "connect_exact_repository"; installationId: string; githubRepositoryId: string }
  | { kind: "analyze_connected_repository"; sourceRepositoryId: string }
  | { kind: "resolve_multiple_installations" }
  | { kind: "retry_only" };
```

결정 함수는 URL의 normalized owner/name과 GitHub 목록의 exact owner/name만 비교한다. 첫 항목이나 유사 이름으로 fallback하지 않는다.

### 3.3 Project Delivery Profile 모듈

이 모듈은 이미 저장된 GitHub installation, 분석 record, Source Repository, monitoring, 배포 타깃과 readiness를 한 번에 읽어 Workspace에 반환한다. 설정을 변경하거나 배포를 실행하지 않는다.

```ts
type ProjectDeliveryProfile = {
  githubInstallations: GitHubInstallationConnection[];
  repositoryAnalysisTarget: RepositoryAnalysisRecord | null;
  sourceRepository: SourceRepository | null;
  monitoringConfig: GitCicdMonitoringConfig | null;
  deploymentTarget: ProjectDeploymentTarget | null;
  environmentName: string | null;
  readiness: GitCicdReadinessSnapshot;
};
```

기존 하위 모듈이 소유한 mutation API는 유지한다. Delivery Profile은 조회 전용 composition interface다.

## 4. 기능 구현 단위

### U01. Repository Analysis Record 계약과 RDS 저장

사용자 결과:

- Board를 다시 열거나 Delivery로 이동해도 어떤 Repository, branch, revision으로 Board를 만들었는지 확인할 수 있다.

변경 범위:

- `packages/types`: `RepositoryAnalysisRecord`, 저장 request/response 타입
- `apps/api/src/db/schema.ts`: `repository_analysis_records` table
- `apps/api/drizzle/0049_*.sql`과 migration journal
- `apps/api`: repository interface와 PostgreSQL adapter
- `GET /projects/:projectId/repository-analysis-record`
- `PUT /projects/:projectId/repository-analysis-record`

입력 검증:

- 프로젝트 UUID
- GitHub Repository URL과 normalized owner/name
- branch와 40자리 commit SHA
- `analysisResult.repositoryUrl/defaultBranch/repositoryRevision`이 상위 필드와 일치
- `selectedTemplateId`는 지원 목록 중 하나

TDD 순서:

1. 동일 프로젝트 PUT 두 번이 한 건을 교체하고 두 번째 값만 반환하는 route/service test를 실패시킨다.
2. 다른 사용자의 project에는 404 또는 기존 접근 거부 계약을 반환하는 test를 실패시킨다.
3. PostgreSQL SQL shape와 0049 migration 제약 test를 실패시킨다.
4. 최소 shared contract, repository, route, schema, migration을 구현한다.

완료 조건:

- 프로젝트당 record가 최대 한 건이다.
- 새 Repository로 교체할 때 이전 `sourceRepositoryId`가 남지 않는다.
- secret과 원본 Repository 파일은 저장·응답하지 않는다.

### U02. Board 생성과 공개 Repository 분석 저장 연결

사용자 결과:

- 공개 Repository는 GitHub를 연결하지 않아도 Board를 생성할 수 있다.
- Board 생성이 완료되면 Repository 분석 정보가 프로젝트에 저장된다.

변경 범위:

- `repository-draft-readiness.ts`: CI/CD 연결을 Board 생성 blocking issue에서 제거
- `repository-start-client.tsx`: Draft 저장 성공 뒤 analysis record 저장
- Web API client와 상태 test

트랜잭션 경계:

- 현재 Web의 Board 저장 API와 analysis record API가 분리되어 있으므로 Board 저장을 먼저 수행한다.
- analysis record 저장 실패 시 Board 생성 성공을 숨기지 않고 `Repository 정보 저장 재시도` 오류를 표시하며 Workspace 이동을 보류한다.
- 재시도는 동일 PUT으로 idempotent하게 처리한다.

TDD 순서:

1. `hasConnectedRepository=false`여도 공개 분석·질문 완료 시 readiness가 통과하는 test를 실패시킨다.
2. Board 저장 성공 후 analysis record PUT을 호출하는 client boundary test를 실패시킨다.
3. record 저장 실패 시 재시도 가능 상태가 유지되는 test를 실패시킨다.

완료 조건:

- 공개 Repository Board 생성 경로에 GitHub 연결 guard가 없다.
- 연결되지 않은 record의 `sourceRepositoryId`는 `null`이다.

### U03. Public Repository 오류 분류

사용자 결과:

- 잘못된 URL·미확인 Repository, rate limit, GitHub 일시 장애, branch 문제를 서로 다른 문구와 재시도 동작으로 본다.

변경 범위:

- public GitHub fetch adapter
- API error code와 status mapping
- Web API error parser

오류 계약:

| code | HTTP | 의미 |
| --- | ---: | --- |
| `PUBLIC_REPOSITORY_INPUT_INVALID` | 400 | 지원하지 않는 URL 또는 입력 |
| `PUBLIC_REPOSITORY_UNAVAILABLE` | 404 | public 조회로 Repository를 확인할 수 없음 |
| `PUBLIC_REPOSITORY_BRANCH_UNAVAILABLE` | 422 | Repository는 확인했지만 branch/revision 없음 |
| `PUBLIC_REPOSITORY_RATE_LIMITED` | 429 | GitHub rate limit |
| `PUBLIC_REPOSITORY_PROVIDER_UNAVAILABLE` | 502/503 | timeout, network, GitHub 5xx |

완료 조건:

- 404만으로 `비공개 Repository입니다`라고 단정하지 않는다.
- rate limit과 provider 장애에 GitHub 연결을 유일한 해결책으로 표시하지 않는다.

### U04. GitHub 전역 연결 상태별 복구 CTA

사용자 결과:

- 분석 실패 상태에서도 현재 연결 상태에 맞는 다음 행동을 볼 수 있다.

변경 범위:

- account-scoped installation 조회 재사용
- normalized Repository identity helper
- pure recovery action selector
- Repository 시작 화면의 실패 panel

TDD 순서:

1. installation 0개 → `connect_github`
2. installation 1개, exact 접근 없음 → `add_repository_permission`
3. exact candidate 있음 → `connect_exact_repository`
4. active SourceRepository exact match → `analyze_connected_repository`
5. installation 2개 이상 → `resolve_multiple_installations`

완료 조건:

- CTA는 `publicAnalysis` 성공 여부와 독립적으로 렌더링된다.
- 여러 installation 중 하나를 임의 선택하지 않는다.

### U05. GitHub 연결·권한 추가 뒤 원래 분석 계속하기

사용자 결과:

- GitHub 연결을 마친 뒤 입력 URL, branch, Template과 답변을 잃지 않고 원래 화면으로 돌아온다.
- 권한 추가 tab에서 돌아오면 현재 화면이 exact Repository 접근 여부를 다시 확인한다.

변경 범위:

- 기존 signed state와 `repository-analysis-resume` 확장
- callback 복귀 검증
- 권한 관리 URL 새 tab 열기
- `focus` event와 수동 `권한 다시 확인`

완료 조건:

- resume 데이터에 credential과 원본 파일이 없다.
- 현재 사용자, project, resume key와 target owner/name을 검증한다.
- exact match가 없으면 자동으로 다른 Repository를 연결하지 않는다.

### U06. Exact SourceRepository 연결과 analysis record 연결

사용자 결과:

- GitHub에서 접근 가능한 정확한 Repository를 선택하면 프로젝트 Source Repository로 연결되고 Delivery가 같은 Repository를 사용한다.

변경 범위:

- 기존 SourceRepository connection service의 exact identity guard
- 연결 성공 뒤 `RepositoryAnalysisRecord.sourceRepositoryId` attach
- mismatch conflict response

완료 조건:

- 분석 record와 owner/name이 다른 Repository는 연결할 수 없다.
- 새 Board record는 이전 SourceRepository 연결을 이어받지 않는다.
- 마지막 인증 분석 SHA가 Board 분석 SHA와 다르면 최신성 경고만 반환하며 현재 GitHub head라고 단정하지 않는다.

### U07. Project Delivery Profile 조회 API

사용자 결과:

- Workspace Delivery 진입 한 번으로 GitHub, Repository, monitoring, 배포 타깃과 readiness 상태를 본다.

변경 범위:

- shared `ProjectDeliveryProfile`
- API composition service
- `GET /projects/:projectId/delivery-profile`
- 접근 제어와 partial-null mapping test

완료 조건:

- 조회 중 GitHub 변경, PR 생성, Pipeline 실행, cloud 변경이 일어나지 않는다.
- secret이 응답에 없다.
- 하위 설정이 없어도 전체 API가 500이 아니라 nullable 상태와 readiness action을 반환한다.

### U08. Workspace 독립 Delivery 탭

사용자 결과:

- Workspace를 벗어나지 않고 Delivery 설정과 상태를 확인한다.

화면 구역:

1. GitHub 연결
2. Source Repository
3. 배포 설정
4. readiness와 실행

변경 범위:

- Workspace navigation에 `Delivery` 추가
- profile loading/error/empty state
- 기존 Repository·monitoring·deployment target editor의 공통 컴포넌트 재사용
- readiness action을 Workspace 내부 panel로 연결

완료 조건:

- 계정 설정은 GitHub installation 관리만 담당한다.
- Delivery는 프로젝트 Source Repository를 명시적으로 선택하게 한다.
- 설정 저장이 곧 PR 또는 Deployment 실행을 의미하지 않는다.

### U09. 배포 modal과 기존 설정 중복 제거

사용자 결과:

- 배포 modal에서는 CI/CD 요약과 최근 결과만 보고, 상세 수정은 `Delivery 열기`로 이동한다.

변경 범위:

- 배포 modal CI/CD 상세 editor 제거
- readiness summary, recent run, `Delivery 열기` 유지
- 기존 설정 URL은 Delivery redirect 또는 공통 editor 렌더링

완료 조건:

- 같은 설정을 서로 다른 화면에서 별도 state로 수정하지 않는다.
- 기존 bookmark가 깨지지 않는다.

### U10. 최신성 안내와 비범위 보호

사용자 결과:

- Board 생성 때의 SHA와 마지막 인증 분석 SHA가 다르면 두 분석 결과가 다르다는 사실과 다시 분석 선택지를 본다.
- 다시 분석해도 기존 Board는 자동 변경되지 않는다.

변경 범위:

- revision comparison pure helper
- Delivery freshness banner
- optional reanalysis entry point

완료 조건:

- SHA mismatch만으로 readiness를 차단하지 않는다.
- 리소스 추가·변경·제거를 자동 추론하지 않는다.
- 자동 Board 재생성 또는 자동 덮어쓰기가 없다.

## 5. 구현 순서와 의존성

```text
U01 저장 계약
 └─ U02 공개 Board 생성
U03 오류 계약
 └─ U04 복구 CTA
     └─ U05 외부 왕복
         └─ U06 exact SourceRepository 연결
U01 + U06 + 기존 설정 API
 └─ U07 Delivery Profile
     └─ U08 Delivery 탭
         └─ U09 modal·설정 중복 제거
U01 + U06 + U08
 └─ U10 최신성 안내
```

각 단위는 실패 test 하나를 먼저 추가하고 해당 test만 통과시키는 최소 구현을 만든다. 단위가 끝날 때 관련 package typecheck를 실행한다. 전체 완료 전에는 API·Web 전체 test, lint, typecheck, build와 harness check를 수행한다.

## 6. 공통 검증 시나리오

1. GitHub 미연결 사용자가 공개 Repository로 Board를 만든다.
2. 새로고침 후 Delivery에서 동일 URL, branch, SHA를 본다.
3. 존재하지 않는 URL을 입력하면 중립 안내와 `GitHub 연결하기`를 본다.
4. installation이 있지만 exact Repository 권한이 없으면 `Repository 권한 추가`를 본다.
5. 권한 추가 후 focus 복귀에서 exact Repository를 찾아 연결한다.
6. 분석 record와 다른 Repository 연결 시도가 거부된다.
7. SourceRepository 연결 후 SHA가 달라도 readiness는 SHA만으로 차단되지 않는다.
8. 여러 installation이 있으면 자동 선택하지 않는다.
9. 배포 modal에서 설정을 중복 편집하지 않고 Delivery로 이동한다.
10. 다른 사용자는 프로젝트의 analysis record와 Delivery Profile을 읽거나 수정할 수 없다.

## 7. 문서와 운영 반영

구현과 함께 다음 canonical 문서를 갱신한다.

- `docs/product.md`: 공개 분석, 전역 GitHub 연결, Delivery 사용자 흐름과 비범위
- `docs/data-models.md`: `RepositoryAnalysisRecord`, `ProjectDeliveryProfile`, API DTO
- `docs/architecture.md`: RDS table, composition read model, GitHub 권한 경계
- 필요 시 `docs/development.md`: migration 충돌 조정 결과

Migration 생성 직전 최신 번호를 다시 확인한다. 현재 계획 번호는 `0049`지만 다른 branch에서 같은 번호가 생기면 충돌을 먼저 조정한다.

## 8. 최종 완료 기준

- U01부터 U10까지 사용자 결과와 완료 조건이 모두 충족된다.
- 공개 Repository Board 생성이 GitHub 연결에 의존하지 않는다.
- Board Repository provenance가 RDS에 남고 Delivery에서 재사용된다.
- 비공개·잘못된 URL·권한 없음·provider 장애를 과도하게 단정하지 않는다.
- Workspace Delivery가 프로젝트 Delivery 상태의 기본 관리 위치다.
- Git 변경과 cloud 변경은 기존 사용자 승인·plan·logging·secret masking 안전 게이트를 유지한다.
- 관련 회귀 test와 전체 필수 검증이 통과한다.
