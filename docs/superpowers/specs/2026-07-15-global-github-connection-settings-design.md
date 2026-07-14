# 전역 GitHub 연결 설정 분리 설계

## 목적

이 변경은 사용자가 GitHub App 설치와 repository 접근 권한을 전역 `설정` 화면에서 한 번 관리하고, 각 프로젝트에서는 그 권한으로 접근 가능한 repository만 선택하게 한다. AWS 계정과 GitHub 계정처럼 여러 프로젝트가 함께 사용하는 외부 연결은 `/dashboard/settings`에 모으고, 프로젝트별 source repository 선택·분석·CI/CD 설정은 프로젝트 설정에 남긴다.

GitHub 연결을 전역으로 바꾼다는 것은 모든 프로젝트가 같은 repository를 자동으로 사용한다는 뜻이 아니다. 사용자가 프로젝트에서 repository를 명시적으로 선택하기 전에는 `SourceRepository`를 만들거나 바꾸지 않는다.

## 사용자 흐름

1. 사용자는 Dashboard의 `설정` 탭을 연다.
2. `연결된 AWS 계정` 바로 아래의 `GitHub 계정 연결` 섹션에서 GitHub App 설치 상태와 권한을 확인한다.
3. 연결이 없으면 `GitHub App 설치`를 누르고 GitHub에서 계정 또는 조직과 repository 접근 범위를 승인한다.
4. 연결이 있으면 설치 계정, 권한 범위, 접근 가능한 repository 수를 확인하고 GitHub의 권한 관리 화면을 열 수 있다.
5. 프로젝트 설정에서는 전역 연결로 접근 가능한 repository 목록을 불러와 현재 프로젝트에 사용할 repository 하나를 선택한다.
6. repository가 선택된 뒤에만 기존 분석과 GitOps 감시 설정을 사용한다.

## 화면 구조

### 전역 설정

- `/dashboard/settings`의 `연결된 AWS 계정` 섹션 바로 아래에 `GitHub 계정 연결` 섹션을 추가한다.
- 이 섹션은 프로젝트 이름, 프로젝트별 연결 상태, Repository 분석 결과를 표시하지 않는다.
- GitHub App 설치가 없으면 빈 상태와 `GitHub App 설치` 버튼을 표시한다.
- 설치가 있으면 설치 계정 login, 계정 유형, repository 권한 범위, 접근 가능한 repository 수, GitHub 권한 관리 링크를 표시한다.
- 설치 추가 또는 권한 확대는 전역 설정에서만 시작한다.

### 프로젝트 설정

- 현재 `ProjectGitHubSettingsClient`를 프로젝트별 `Source Repository` 선택과 분석 화면으로 축소한다.
- `연결 가능한 repository 보기`는 전역 GitHub App 설치가 제공하는 repository 후보를 불러온다.
- `GitHub App 설치/권한 추가` 버튼은 제거하고, 전역 설정으로 이동하는 보조 링크를 제공한다.
- 현재 프로젝트의 활성 repository, 분석 결과, 분석 실행 동작은 유지한다.
- `ProjectDeploymentTargetSettingsClient`와 `ProjectCicdMonitoringSettingsClient`의 프로젝트 계약은 변경하지 않는다.

## 데이터와 API 경계

- GitHub App 설치는 사용자 GitHub identity와 GitHub가 반환하는 installation 목록으로 확인한다. 전역 설정을 위해 `SourceRepository` row를 만들지 않는다.
- 전역 설치 조회 API는 인증된 사용자가 소유한 installation만 반환한다. 다른 GitHub 사용자나 조직의 installation은 반환하지 않는다.
- 전역 설치 URL은 프로젝트 ID가 없는 account scope의 서명된 state를 사용한다.
- callback은 state와 `installation_id`를 서버에서 검증한 뒤 전역 설정으로 돌아간다. callback만으로 프로젝트 repository를 연결하지 않는다.
- 프로젝트 repository 연결 API는 기존처럼 `projectId`, `installationId`, `githubRepositoryId`, 서명된 project scope state를 받아 사용자가 선택한 repository만 `SourceRepository`에 저장한다.
- account scope와 project scope state는 서로 바꿔 사용할 수 없게 구분한다.
- GitHub installation access token과 App private key는 브라우저, 응답, 로그, RDS에 저장하거나 노출하지 않는다.
- 기존 `source_repositories` DB 구조는 유지하므로 이 변경에 DB migration은 필요하지 않다.

## 컴포넌트 경계

- 전역 GitHub 설정 컴포넌트는 설치 목록 조회, 설치 URL 열기, GitHub 권한 관리 링크 표시만 담당한다.
- 프로젝트 GitHub 설정 컴포넌트는 프로젝트 정보, repository 후보 조회·선택, 분석 상태만 담당한다.
- 설치 카드와 repository 후보 UI는 역할이 다르므로 하나의 상태ful 컴포넌트로 합치지 않는다.
- API client 함수와 shared response type은 account scope와 project scope를 이름으로 구분한다.

## 오류와 빈 상태

- GitHub OAuth identity가 없으면 GitHub 로그인이 필요하다는 안내를 표시하고 설치 목록을 빈 목록으로 오인하지 않는다.
- GitHub App 설정이 누락되거나 GitHub API 호출이 실패하면 AWS 설정과 독립적인 오류로 표시한다.
- 설치는 있지만 repository 접근 권한이 없으면 설치 성공 상태와 repository 0개 상태를 함께 보여준다.
- 프로젝트에서 전역 설치가 없으면 repository 선택을 비활성화하고 `/dashboard/settings` 이동 링크를 제공한다.
- callback state가 만료되거나 소유권 검증에 실패하면 연결 성공으로 표시하지 않고 전역 설정에서 다시 시작하게 한다.

## 기존 진입점 정리

- GitHub App 권한 관리 목적의 링크는 `/dashboard/settings`로 통일한다.
- 프로젝트 repository 선택 목적의 링크는 `/dashboard/projects/{projectId}/settings`를 유지한다.
- 기존 `?tab=github`는 실제 탭 상태를 제어하지 않으므로 새 링크에서 제거한다. 외부에 남은 기존 URL은 프로젝트 설정 화면을 계속 열 수 있어야 한다.
- GitHub callback의 권한 관리 문구도 전역 설정을 가리키도록 변경한다.

## 테스트와 완료 기준

- shared type과 API service 테스트에서 account scope state와 project scope state가 분리되고 상호 오용이 거부되는지 확인한다.
- API route 테스트에서 인증, 설치 소유권 필터링, 설치 없음, GitHub identity 없음, callback 만료·변조를 확인한다.
- Web 테스트에서 전역 GitHub 섹션이 `연결된 AWS 계정` 다음에 렌더링되고 프로젝트별 정보가 노출되지 않는지 확인한다.
- 프로젝트 설정 테스트에서 설치 버튼이 제거되고 전역 설정 링크, repository 선택, 분석 동작이 유지되는지 확인한다.
- GitHub callback과 Workspace의 권한 관리 링크가 전역 설정으로 이동하는지 확인한다.
- 관련 focused test와 전체 `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`를 실행한다.
- 실제 GitHub App 설치나 권한 변경은 테스트 중 자동 실행하지 않는다.

## 범위 밖

- GitHub organization 단위의 별도 SketchCatch 팀 권한 모델
- 여러 GitHub App을 사용자가 선택하는 기능
- project별 repository 자동 할당
- GitHub App 설치 해제 자동화
- Repository 분석 또는 Git/CI/CD 실행 로직 변경
