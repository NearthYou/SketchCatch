# GitHub 전역 연결·Repository Analysis·Delivery Center 통합 계획

## 1. 목적

이 작업은 GitHub 계정 연결, Repository Analysis, 프로젝트 Source Repository 선택, Git/CI/CD 설정과 실행 상태가 여러 화면에 흩어진 문제를 정리한다. 사용자는 공개 Repository라면 GitHub 계정을 연결하지 않고 분석과 Architecture Board 생성을 진행하고, 비공개 Repository 또는 Git/CI/CD 작업이 필요할 때만 GitHub 연결과 Repository 권한을 추가한다.

프로젝트 Workspace에는 `Delivery Center`를 두어 Repository, branch, 배포 타깃, 배포 환경, Git/CI/CD 준비 상태, PR, Pipeline Run과 로그를 한곳에서 확인하고 수정한다. Dashboard 환경설정은 사용자 계정 단위 GitHub App installation을 관리하는 전역 관리 화면으로 유지한다.

이 작업은 다음을 하지 않는다.

- 공개 Repository 분석만으로 GitHub Repository를 변경하지 않는다.
- GitHub 계정 연결만으로 모든 프로젝트에 Source Repository를 자동 지정하지 않는다.
- Git/CI/CD 설정 확인만으로 PR, commit, Pipeline 또는 cloud Deployment를 실행하지 않는다.
- 권한 없는 Repository를 비공개 Repository라고 단정하지 않는다.
- GitHub access token, installation token, private key 또는 credential을 브라우저나 RDS 응답에 노출하지 않는다.

## 2. 현재 문제

### 2.1 사용자 흐름이 세 위치로 나뉜다

1. Repository 시작 화면에는 공개 URL 분석과 프로젝트 CI/CD 연결이 함께 있다.
2. Workspace의 배포 modal에는 CI/CD readiness, PR, Pipeline Run과 로그가 있다.
3. Dashboard 환경설정에는 GitHub App installation 연결이 있다.
4. readiness 오류의 수정 동작은 Workspace를 벗어나 프로젝트 설정, Repository 설정 또는 계정 설정으로 이동한다.

이 구조에서는 사용자가 GitHub 계정 연결, 프로젝트 Repository 연결, CI/CD 설정과 CI/CD 실행을 같은 종류의 작업으로 오해하기 쉽다.

### 2.2 공개 분석과 인증된 분석이 자동으로 이어지지 않는다

현재 공개 URL 분석은 GitHub App installation을 사용하지 않는 public GitHub API 경로다. 비공개 Repository, 잘못된 URL, 접근 권한 부족, 삭제된 Repository를 입력하면 branch와 commit SHA를 얻지 못하고 분석이 실패한다.

환경설정에 GitHub installation이 이미 연결되어 있어도 URL 분석 실패 후 인증된 Repository Analysis로 자동 전환하지 않는다. 분석 성공 결과가 없으면 같은 화면의 GitHub 연결 영역도 표시되지 않아, 안내 문구와 실제 복구 동작이 일치하지 않는다.

### 2.3 실패 원인을 과도하게 단정할 수 있다

연결 전 public GitHub API만으로는 다음 상태를 구분할 수 없다.

- 비공개 Repository
- 존재하지 않거나 삭제된 Repository
- owner 또는 Repository 이름 오타
- GitHub App installation 권한이 없는 Repository

또한 rate limit, timeout, GitHub 5xx는 사용자 입력이나 Repository 공개 범위 문제와 분리해야 한다.

### 2.4 Board 생성과 Git/CI/CD 연결 경계가 섞여 있다

현재 공개 Repository는 계정 연결 없이 분석할 수 있지만 Architecture Board 생성 전에 active `SourceRepository` 연결을 요구한다. 설계를 만들기 위해 공개 코드를 읽는 행위와 Repository에 PR을 만들거나 Pipeline을 실행하는 행위가 같은 승인 경계로 묶여 있다.

## 3. 목표 원칙

1. **공개 분석과 변경 권한을 분리한다.** 공개 Repository 분석과 Board 생성은 GitHub 계정 연결 없이 가능하다.
2. **비공개 접근은 인증 뒤에만 판단한다.** public 조회 실패만으로 비공개라고 단정하지 않는다.
3. **GitHub installation은 사용자 단위로 재사용한다.** 환경설정에서 연결한 installation은 모든 프로젝트에서 연결 가능 상태로 조회한다.
4. **Source Repository 선택은 프로젝트마다 명시적으로 확정한다.** 전역 GitHub 연결이 프로젝트 Repository를 자동 변경하지 않는다.
5. **설정과 실행을 같은 화면에서 보되 책임은 분리한다.** Delivery Center가 상태를 조합해 보여주지만 기존 계정, Repository, monitoring, deployment target, handoff 계약을 하나의 DB row로 합치지 않는다.
6. **외부 왕복 뒤 원래 작업으로 돌아온다.** GitHub 연결 또는 권한 추가 후 project, Repository URL, branch, 분석 단계와 사용자 입력을 복원한다.
7. **기존 안전 게이트를 유지한다.** Git 변경, PR 생성, Deployment는 각각 기존 `UserAcceptedChange`와 승인 절차를 거친다.

이번 MVP 흐름은 사용자에게 active GitHub installation이 하나인 상태만 지원한다. 개인 계정과 여러 organization installation 사이의 자동 선택 또는 선택 UI는 후속 범위다. 여러 active installation이 감지되면 임의의 installation을 선택하지 않고 전역 GitHub 연결 정리가 필요하다는 안내만 표시한다.

## 4. 용어와 소유권

| 개념 | 범위 | 의미 |
| --- | --- | --- |
| GitHub Installation Connection | 사용자 계정 | 현재 SketchCatch 사용자가 사용할 수 있는 GitHub App installation |
| Repository Analysis Target | 프로젝트 분석 단계 | 사용자가 입력한 Repository URL, 선택 branch와 분석 revision. provider 권한이 확인된 Source Repository를 의미하지 않는다. |
| Source Repository | 프로젝트 | GitHub App으로 identity와 접근 권한을 검증하고 프로젝트에 명시적으로 연결한 Repository |
| Delivery Configuration | 프로젝트 | Source Repository, monitoring branch/path, 배포 환경과 Project Deployment Target의 조합 |
| Delivery Activity | 프로젝트/실행 | Git/CI/CD handoff, PR, Pipeline Run, 로그, 오류와 재시도 상태 |

`Repository Analysis Target`은 공개 분석용 참조다. Git 변경이나 Git/CI/CD handoff는 검증된 `SourceRepository.id`만 사용한다.

## 5. 목표 사용자 흐름

### 5.1 공개 Repository

```text
프로젝트 생성
→ Repository URL 입력
→ public GitHub API로 Repository와 branch 확인
→ Repository Analysis
→ Template 선택과 추가 질문
→ Architecture Board 생성
→ 필요할 때 Delivery Center에서 GitHub와 Source Repository 연결
→ 승인된 Git/CI/CD handoff
```

- GitHub 계정이 연결되지 않아도 Board 생성까지 진행한다.
- 화면에는 `GitHub 연결 없이 공개 Repository를 분석 중`이라는 경계를 표시한다.
- Board 생성은 GitHub 연결, PR 생성 또는 CI/CD 실행을 의미하지 않는다.

### 5.2 공개 조회 실패

공개 조회가 Repository 미확인 상태로 끝나면 다음 안내를 표시한다.

> Repository를 확인할 수 없습니다. URL이 잘못되었거나 비공개 Repository일 수 있습니다.

공통 보조 동작은 `URL 다시 확인`이다. 주요 동작은 GitHub 전역 연결 상태와 Repository 접근 가능 여부에 따라 달라진다.

| 상태 | 주요 버튼 | 동작 |
| --- | --- | --- |
| active GitHub installation 없음 | `GitHub 연결하기` | account scope GitHub App 연결을 시작하고 완료 후 원래 분석 화면으로 복귀 |
| installation은 있으나 입력 Repository 접근 불가 | `Repository 권한 추가` | 별도 SketchCatch 안내 화면 없이 해당 installation의 GitHub 권한 관리로 바로 이동하고 복귀 후 exact owner/name을 다시 확인 |
| installation에서 입력 Repository 접근 가능 | `이 Repository 연결하고 분석` | 프로젝트 Source Repository로 명시 연결한 뒤 인증된 Repository Analysis 실행 |
| 프로젝트 active Source Repository와 일치 | `연결된 Repository 분석` | 현재 연결 identity를 다시 검증하고 분석 실행 |

Repository 접근 불가 상태에서도 `URL이 잘못되었을 수 있음`을 함께 유지한다. 권한 추가만을 정답처럼 강제하지 않는다.

### 5.3 비공개 Repository

1. public 조회 실패 뒤 중립적인 미확인 안내를 표시한다.
2. GitHub installation이 없으면 `GitHub 연결하기`를 제공한다.
3. installation이 있으면 입력 owner/name과 접근 가능한 Repository 목록을 정확히 대조한다.
4. 접근 가능하면 project scope Source Repository 연결을 사용자에게 확인받는다.
5. 연결된 Repository ID로 인증된 Repository Analysis를 실행한다.
6. 다른 Repository로 fallback하지 않는다.

### 5.4 GitHub 외부 왕복

GitHub 연결과 권한 추가 전에 다음 UI 상태를 안전한 resume record에 보존한다.

- project ID와 표시 이름
- 입력 Repository URL
- 선택 branch
- 공개 분석 결과가 있으면 repository revision과 구조화된 analysis
- 선택 Template, 배포 방식과 추가 질문 답변
- 현재 화면 단계

callback은 서명된 state, 현재 SketchCatch 사용자, installation 소유권, exact target Repository를 검증한다. 성공 후 `returnTo`로 원래 Repository Analysis 또는 Delivery Center에 복귀한다. credential과 원본 Repository 파일 내용은 resume record에 저장하지 않는다.

## 6. Delivery Center

### 6.1 위치와 역할

프로젝트 Workspace 안에 독립된 `Delivery` tab을 추가한다. Repository와 GitHub 권한, 배포 설정, PR, Pipeline Run과 로그처럼 지속적으로 확인하고 수정해야 하는 정보를 modal에 넣지 않는다. `Delivery` tab은 설정과 실행 상태를 다음 네 구역으로 분리한다.

```text
Delivery
├─ GitHub 연결
│  ├─ installation/account 상태
│  └─ Repository 권한 관리
├─ Source Repository
│  ├─ owner/name
│  ├─ default branch와 monitoring branch
│  └─ app/infra path
├─ 배포 설정
│  ├─ 배포 환경
│  ├─ AWS connection과 region
│  └─ runtime/build/output 설정
└─ 실행
   ├─ readiness
   ├─ PR과 handoff
   ├─ Pipeline Run
   └─ 로그, 오류와 재시도
```

### 6.2 화면별 책임 변경

#### Repository Analysis 화면

- URL, branch, 분석 결과, Template과 Board 생성을 담당한다.
- GitHub가 필요한 상태에서는 전역 연결 상태에 맞는 CTA를 표시한다.
- CI/CD monitoring, AWS target, PR과 Pipeline 로그를 직접 편집하지 않는다.

#### Delivery Center

- Workspace의 독립 `Delivery` tab으로 제공한다.
- 프로젝트의 GitHub, Source Repository, monitoring, deployment target과 readiness를 조합해 보여준다.
- 설정이 부족하면 Workspace 내부 drawer 또는 panel에서 수정한다.
- 외부 GitHub 권한 관리가 필요할 때만 안전한 `returnTo`를 포함해 이동한다.
- PR 생성, Pipeline Run과 로그는 실행 구역에서 관리한다.

#### Dashboard 환경설정

- 사용자 계정 단위 GitHub installation 목록, 연결, 해제와 권한 관리 URL을 제공한다.
- 프로젝트 Source Repository를 자동 지정하지 않는다.
- Workspace에서 시작한 연결이 완료되면 환경설정에 머무르지 않고 원래 프로젝트로 복귀한다.

#### Repository 권한 추가 외부 이동

- `Repository 권한 추가`는 별도 SketchCatch 중간 안내 화면을 만들지 않고 GitHub App installation 권한 관리 화면을 바로 연다.
- 버튼 옆에는 `GitHub에서 권한을 추가한 뒤 이 화면에서 다시 확인합니다.`라고 안내한다.
- GitHub 연결 callback처럼 provider가 자동 redirect를 보장하지 않는 권한 수정 화면은 새 tab으로 열어 현재 Repository Analysis 또는 Delivery Center 상태를 유지한다.
- 원래 tab이 다시 focus되면 installation repository 목록을 자동 갱신한다.
- 자동 갱신이 실패하거나 사용자가 같은 tab에서 이동한 경우를 위해 `권한 다시 확인` 버튼을 제공한다.
- 갱신 후에도 입력한 normalized owner/name과 exact match하지 않으면 자동으로 다른 Repository를 선택하지 않는다.

#### 기존 프로젝트 설정과 배포 modal

- 프로젝트 설정의 Repository, monitoring, deployment target editor는 Delivery Center가 재사용 가능한 공통 컴포넌트로 이동한다.
- 기존 URL은 bookmark와 이전 링크 호환을 위해 유지할 수 있지만 Delivery Center로 redirect하거나 동일 editor를 렌더링한다.
- 배포 modal의 CI/CD 영역은 중복 설정 UI를 제거한다.
- 배포 modal에는 현재 CI/CD 준비 상태, 최근 실행 결과와 `Delivery 열기` 진입점만 유지한다.
- 상세 설정, PR 생성, 전체 Pipeline Run과 로그는 독립 `Delivery` tab에서 관리한다.

## 7. 상태 조회와 API 경계

### 7.1 Project Delivery Profile

Web이 여러 API를 제각각 호출해 부분 상태를 조합하지 않도록 프로젝트 Delivery 상태를 한 번에 읽는 read model을 둔다.

```ts
type ProjectDeliveryProfile = {
  githubInstallations: GitHubInstallationConnection[];
  repositoryAnalysisTarget: RepositoryAnalysisTarget | null;
  sourceRepository: SourceRepository | null;
  monitoringConfig: GitCicdMonitoringConfig | null;
  deploymentTarget: ProjectDeploymentTarget | null;
  environmentName: string | null;
  readiness: GitCicdReadinessSnapshot;
};
```

- 이 타입은 조회 편의를 위한 조합 결과이며 하나의 DB table을 의미하지 않는다.
- GitHub installation token이나 secret은 포함하지 않는다.
- `readiness`는 설정 또는 배포를 실행하지 않고 현재 저장된 증거만 읽는다.
- mutation은 기존 계정 연결, Source Repository 연결, monitoring, deployment target, handoff API 경계를 유지한다.

### 7.2 Repository 분석 오류 계약

public Repository Analysis API는 최소한 다음 오류를 구분한다.

| 오류 | 의미 | UI 처리 |
| --- | --- | --- |
| `PUBLIC_REPOSITORY_UNAVAILABLE` | 404 등으로 Repository를 확인할 수 없음 | URL 오류 또는 비공개 가능성 안내와 GitHub CTA |
| `PUBLIC_REPOSITORY_RATE_LIMITED` | GitHub rate limit | 재시도 시각 또는 GitHub 연결 선택지 안내 |
| `PUBLIC_REPOSITORY_PROVIDER_UNAVAILABLE` | timeout, network 또는 GitHub 5xx | 일시 오류와 다시 시도 표시 |
| `PUBLIC_REPOSITORY_BRANCH_UNAVAILABLE` | Repository는 확인했지만 branch/revision 없음 | branch 선택 또는 URL 확인 |
| `PUBLIC_REPOSITORY_INPUT_INVALID` | 지원하지 않는 URL 형식 | 입력값 수정 |

### 7.3 인증된 Repository 연결

- 입력 URL의 normalized owner/name과 installation repository 목록의 owner/name이 정확히 일치해야 한다.
- 설치 목록에서 첫 Repository 또는 유사 이름 Repository로 fallback하지 않는다.
- 현재 `RepositoryAnalysisRecord`의 normalized owner/name과 다른 Repository는 프로젝트 CI/CD Source Repository로 바로 연결하지 않는다.
- 다른 Repository로 교체하는 시나리오는 이번 범위에서 지원하지 않고 연결을 거부한다.
- Source Repository에 저장된 마지막 인증 분석 SHA와 공개 분석 revision이 다르면 두 분석 결과가 다르다는 비차단 안내를 표시한다.
- 이 값은 현재 GitHub head를 자동 조회한 결과라고 표현하지 않는다.
- commit SHA 차이만으로 Architecture Resource 추가·변경·제거를 추론하거나 CI/CD를 차단하지 않는다.
- 사용자가 원하면 최신 Repository Analysis를 다시 실행할 수 있지만, 재분석 결과가 기존 Architecture Board를 자동 변경하지 않는다.
- Git/CI/CD handoff는 계속 `sourceRepositoryId`만 받고 identity는 RDS의 active row에서 읽는다.

## 8. 공개 분석 결과 보존 계약

공개 Repository로 Architecture Board를 만든 뒤 다시 접속해도 Delivery Center가 원래 Repository URL, branch와 분석 revision을 자동 입력할 수 있도록 분석 provenance를 RDS에 영구 저장한다. `sessionStorage`와 Runtime Cache는 외부 왕복과 짧은 재사용만 담당하며 영구 source of truth가 아니다.

Project Draft metadata에 provenance를 섞지 않고 provider-neutral한 별도 `RepositoryAnalysisRecord` 계약을 둔다. 이 record는 공개 URL 분석 사실을 저장할 뿐, provider 권한이 검증된 `SourceRepository`를 대신하지 않는다.

```ts
type RepositoryAnalysisRecord = {
  id: string;
  projectId: string;
  provider: "github";
  repositoryUrl: string;
  owner: string;
  name: string;
  branch: string;
  repositoryRevision: string;
  analysisResult: SourceRepositoryAnalysisResult;
  selectedTemplateId: RepositoryAnalysisTemplateId | null;
  sourceRepositoryId: string | null;
  analyzedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

### 저장 규칙

- public Repository Analysis가 성공해도 즉시 Git/CI/CD 권한이 생기지 않는다.
- 사용자가 해당 분석 결과로 Board 생성을 확정할 때 project와 연결된 record를 저장한다.
- 프로젝트마다 현재 Architecture Board를 만든 Repository 분석 record 하나만 유지한다.
- 같은 프로젝트에서 다른 Repository 분석 결과로 Board 생성을 확정하면 기존 record를 새 분석 정보로 교체한다.
- 이전 Repository 분석 provenance 이력은 이번 범위에서 보관하지 않는다. 향후 Design Version별 출처 이력이 필요하면 Design Version과 분석 record를 연결하는 별도 계약으로 확장한다.
- Repository URL은 normalized owner/name과 함께 저장하고 branch와 commit SHA를 분리해 보존한다.
- `analysisResult`에는 구조화된 분석 결과만 저장하고 원본 Repository 파일 내용은 저장하지 않는다.
- GitHub 연결 전 `sourceRepositoryId`는 `null`이다.
- 나중에 exact owner/name을 GitHub App으로 검증하고 프로젝트 Source Repository로 연결하면 `sourceRepositoryId`를 채운다.
- 마지막 인증 분석 SHA가 저장된 `repositoryRevision`과 다르면 Delivery Center에 최신성 안내와 선택적 `다시 분석` 동작을 표시한다.
- 프로젝트 삭제 시 분석 record도 함께 삭제한다.
- RDS는 `project_id` unique 제약으로 프로젝트당 현재 record 하나만 허용한다.

### 조회 규칙

- Repository Analysis 화면은 저장된 record가 있으면 이전 URL, branch와 분석 시각을 표시할 수 있다.
- Delivery Center는 record를 읽어 Repository와 monitoring branch 입력을 미리 채운다.
- `sourceRepositoryId`가 없으면 `연결 필요`로 표시하고 PR 생성과 Git/CI/CD handoff를 차단한다.
- `sourceRepositoryId`가 있어도 provider identity와 현재 권한을 다시 검증한 뒤 변경 작업을 수행한다.
- 이 계약은 새 RDS schema와 Drizzle migration이 필요하다. migration 번호는 구현 착수 시 최신 번호와 다른 active branch를 다시 확인한 뒤 선택한다.

## 9. 구현 단계

### Phase 1: 오류 분류와 복구 CTA

- public GitHub 응답의 404, rate limit, timeout/5xx, branch/revision 실패를 구분한다.
- Repository 미확인 안내를 중립 문구로 교체한다.
- 전역 installation 상태에 따라 `GitHub 연결하기`, `Repository 권한 추가`, `이 Repository 연결하고 분석`을 표시한다.
- 분석 실패 상태에서도 CTA가 항상 렌더링되게 한다.

### Phase 2: 공개 Repository Board 생성 분리

- 공개 분석 성공 시 active Source Repository가 없어도 Template 확인과 Board 생성을 허용한다.
- `usesCiCd`를 공개 분석의 무조건 `true` 계약에서 사용자가 실제 Delivery를 선택한 상태로 분리한다.
- Board 생성이 Git 연결이나 배포 실행을 의미하지 않는다는 안내를 추가한다.

### Phase 3: 전역 installation 재사용과 private 분석 continuation

- account scope installation 목록을 프로젝트 Workspace에서 조회한다.
- 입력 URL과 접근 가능한 Repository를 exact match한다.
- project scope Source Repository 연결을 사용자에게 확인받는다.
- GitHub 외부 왕복 뒤 원래 Repository Analysis 상태로 복귀한다.
- 마지막 인증 분석 revision이 기존 공개 revision과 다르면 최신성 안내만 표시한다.
- revision 차이만으로 Board 변경이나 CI/CD 차단을 수행하지 않는다.

### Phase 4: Delivery Center read model과 UI

- `ProjectDeliveryProfile` 조회 계약을 추가한다.
- Workspace에 독립 `Delivery` tab을 추가하고 GitHub 연결, Source Repository, monitoring, deployment target, readiness와 Activity를 배치한다.
- readiness action이 Dashboard 설정으로 이동하지 않고 Workspace editor를 연다.
- GitHub provider 권한 관리만 외부 왕복을 사용한다.

### Phase 5: 중복 화면 정리와 호환 경로

- 기존 프로젝트 설정 editor를 공통 컴포넌트로 추출한다.
- 배포 modal의 CI/CD 설정 중복을 제거한다.
- 기존 설정 URL의 redirect 또는 compatibility rendering을 추가한다.
- 오래된 안내 문구와 더 이상 유효하지 않은 테스트를 정리한다.

### Phase 6: canonical 문서와 운영 검증

- 확정 제품 흐름을 `docs/product.md`에 반영한다.
- 새 DTO와 persistence 결정을 `docs/data-models.md`에 반영한다.
- API와 UI 경계를 `docs/architecture.md`에 반영한다.
- GitHub App callback과 운영 설정은 `docs/deployment.md`와 일치시킨다.

## 10. 주요 변경 예상 파일

- `packages/types/src/index.ts`
- `apps/api/src/routes/ai.ts`
- `apps/api/src/routes/source-repositories.ts`
- `apps/api/src/source-repositories/source-repository-service.ts`
- GitHub installation과 project Delivery profile 관련 API service/route
- `apps/web/app/workspace/repository/repository-start-client.tsx`
- `apps/web/app/workspace/repository/repository-analysis-resume.ts`
- `apps/web/features/workspace/CicdConsoleScreen.tsx`
- `apps/web/features/workspace/cicd-handoff.ts`
- `apps/web/features/workspace/DeploymentConsoleShell.tsx`
- `apps/web/app/projects/[projectId]/settings/*`
- `apps/web/app/dashboard/settings/*`
- `docs/product.md`
- `docs/data-models.md`
- `docs/architecture.md`
- `docs/deployment.md`

공개 분석 결과를 위한 RDS record, Drizzle schema와 migration이 구현 범위에 포함된다. 현재 확인한 최신 migration은 `0048_repair_github_installation_connections.sql`이며, 실제 구현 착수 시 최신 번호와 다른 active branch를 다시 확인한 뒤 번호 충돌을 조정한다.

## 11. 테스트 계획

### Repository Analysis

- GitHub 미연결 사용자가 공개 Repository를 분석하고 Board를 생성한다.
- 같은 프로젝트에서 다른 Repository로 Board를 다시 만들면 현재 분석 record가 새 Repository, branch와 revision으로 교체된다.
- 이전 Repository 분석 record가 별도 이력으로 남지 않는다.
- 공개 조회 실패 시 분석 결과가 없어도 GitHub CTA가 표시된다.
- 404, rate limit, provider timeout과 branch 오류가 서로 다른 UI로 표시된다.
- GitHub 연결 전에는 Repository가 비공개라고 단정하지 않는다.

### GitHub 연결과 권한

- installation이 없으면 `GitHub 연결하기`가 표시된다.
- active installation이 하나일 때만 Repository 접근 가능 여부를 자동 확인한다.
- 여러 active installation이 있으면 임의로 선택하지 않고 현재 범위에서 지원하지 않는 상태임을 표시한다.
- installation은 있지만 exact Repository 접근 권한이 없으면 `Repository 권한 추가`가 표시된다.
- `Repository 권한 추가`가 GitHub installation 관리 화면을 직접 열고 원래 화면을 유지한다.
- 원래 화면 focus 또는 `권한 다시 확인`으로 Repository 목록을 갱신한다.
- 접근 가능한 Repository면 `이 Repository 연결하고 분석`이 표시된다.
- callback이 다른 Repository로 fallback하지 않는다.
- 외부 왕복 뒤 project, URL, branch와 분석 단계가 복원된다.
- token과 secret이 응답, browser storage와 로그에 포함되지 않는다.

### Delivery Center

- Workspace의 독립 `Delivery` tab에서 전체 설정과 Activity를 확인한다.
- 배포 modal은 상태 요약과 `Delivery 열기`만 제공한다.
- GitHub, Repository, monitoring, deployment target과 readiness 상태를 한 화면에서 확인한다.
- 프로젝트 설정이 필요한 readiness action이 Workspace editor를 연다.
- 설정 저장 뒤 Delivery Center가 최신 readiness를 다시 읽는다.
- PR 생성과 Deployment는 기존 승인 조건이 없으면 계속 차단된다.

### Revision과 연결 안전성

- 공개 분석 URL과 연결하려는 Repository identity가 다르면 연결을 거부한다.
- 다른 Repository로 바꾸는 흐름은 이번 범위에서 지원하지 않는다.
- 공개 분석 revision과 마지막 인증 분석 revision이 다르면 두 분석 결과가 다르다는 안내를 표시한다.
- revision 차이만으로 Resource 변경을 추론하거나 CI/CD를 차단하지 않는다.
- CI/CD readiness는 Repository 접근, branch/path, build evidence, deployment target, 승인된 Plan처럼 deterministic하게 검증 가능한 조건만 차단 기준으로 사용한다.
- 전역 installation 연결이 다른 프로젝트의 active Source Repository를 자동 변경하지 않는다.

## 12. 완료 조건

1. 공개 Repository 사용자는 GitHub 계정 연결 없이 분석과 Architecture Board 생성을 완료한다.
2. Repository를 확인할 수 없을 때 URL 오류와 비공개 가능성을 정확히 안내한다.
3. GitHub 상태에 따라 연결, 권한 추가, Repository 연결 버튼이 구분된다.
4. account scope GitHub 연결을 여러 프로젝트가 재사용하되 Source Repository는 프로젝트마다 명시적으로 확정한다.
5. 비공개 Repository는 인증된 project Source Repository 경로로 분석된다.
6. 현재 Board를 만든 Repository와 다른 Repository는 직접 CI/CD에 연결할 수 없다.
7. 다른 Repository는 재분석과 새 Board 확정 뒤에만 Delivery Source Repository가 된다.
8. GitHub 외부 왕복 뒤 사용자는 원래 분석 또는 Delivery 작업으로 돌아온다.
9. Workspace Delivery Center에서 프로젝트 Delivery 설정과 실행 상태를 확인하고 수정한다.
10. Git 변경, PR, Pipeline과 cloud Deployment의 기존 사용자 승인 경계가 유지된다.
11. 관련 집중 테스트와 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm harness:check`가 통과한다. 기존 실패가 있으면 이번 변경과의 관련성을 분리해 기록한다.

## 13. 롤백·중단 기준

- 공개 분석 허용 때문에 인증되지 않은 Repository가 Git/CI/CD handoff에 사용되면 배포하지 않는다.
- GitHub 연결 후 exact target 대신 다른 Repository가 연결될 수 있으면 배포하지 않는다.
- 전역 installation 재사용이 다른 사용자의 installation 또는 credential 접근을 허용하면 즉시 중단한다.
- callback 실패 시 사용자의 Repository Analysis 상태가 복구되지 않거나 무한 redirect가 발생하면 배포하지 않는다.
- Repository Analysis 추론만으로 Resource를 자동 추가·변경·제거하거나 실제 cloud 변경을 수행하면 배포하지 않는다.
- commit SHA 차이만으로 Architecture 불일치를 확정하거나 정상 CI/CD를 차단하면 배포하지 않는다.
- Delivery Center가 기존 Apply Plan 승인, PR 생성 승인 또는 Deployment Safety Gate를 우회하면 배포하지 않는다.

## 14. `grill-me` 확정 결정

1. 공개 Repository 분석 provenance는 별도 RDS `RepositoryAnalysisRecord`로 영구 저장한다.
2. 프로젝트마다 현재 Board를 만든 분석 record 하나만 유지하고 이전 Repository 분석 이력은 보관하지 않는다.
3. 구현 착수 시 최신 migration이 계속 `0048`이면 새 record migration은 `0049`를 사용한다. 다른 branch가 먼저 번호를 사용하면 최신 번호를 다시 확인한다.
4. 여러 GitHub user/organization installation 선택은 이번 범위에서 지원하지 않는다. 여러 active installation을 감지하면 임의 선택하지 않는다.
5. `Repository 권한 추가`는 GitHub installation 권한 관리 화면을 새 tab으로 바로 열고, 원래 화면 focus 시 권한을 다시 확인한다.
6. commit SHA 차이는 Repository 변경 안내에만 사용하고 Architecture 변경 추론이나 CI/CD 차단 근거로 사용하지 않는다.
7. Delivery Center는 배포 modal 내부가 아니라 Workspace의 독립 `Delivery` tab으로 제공한다.
8. CI/CD Source Repository는 현재 Board를 만든 Repository identity와 정확히 일치해야 한다. 다른 Repository는 재분석과 새 Board 확정 뒤 연결한다.

## 15. 후속 범위

- 한 사용자가 여러 GitHub user 또는 organization installation을 동시에 연결했을 때 Repository owner와 권한 범위를 기준으로 자동 선택하는 정책
- 여러 installation이 같은 Repository에 접근할 수 있을 때 사용자가 installation을 선택하는 UI
- installation별 기본값, 최근 사용 기록과 프로젝트별 선호 installation 저장
- Repository의 코드 변경을 근거로 Architecture Resource 추가·변경·제거를 판정하는 semantic drift 분석
- 분석 근거 신뢰도, 지원 framework별 coverage와 오탐·미탐 기준을 충족한 뒤 제공하는 Architecture 변경 제안
