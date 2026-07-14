# 프로젝트 소스 저장소 전용 화면 설계

## 목적

이 변경은 프로젝트가 사용할 GitHub repository를 선택하고 분석하는 기능을 프로젝트 설정에서 분리해, 별도의 `소스 저장소` 화면으로 이동한다.

GitHub App 설치와 repository 접근 권한은 사용자 계정 전체에 적용되므로 전역 설정에서 관리한다. 반면 실제 repository 선택과 분석 결과는 특정 프로젝트에 속하므로 프로젝트별 전용 화면에서 관리한다.

새 화면은 GitHub App을 설치하거나 Git 파일을 변경하거나 배포를 실행하지 않는다. 사용자가 선택한 repository를 프로젝트의 활성 `SourceRepository`로 연결하고, 정적 분석을 요청하고, 저장된 분석 결과를 보여주는 역할만 담당한다.

## 결정

- 프로젝트별 전용 경로를 추가한다.
  - `/dashboard/projects/:projectId/repository`
- `/dashboard/projects/:projectId/settings`에서는 GitHub repository 연결 섹션을 완전히 제거한다.
- GitHub App 설치와 권한 관리는 `/dashboard/settings`의 `GitHub 계정 연결` 섹션에 유지한다.
- 프로젝트 설정은 배포 타깃과 CI/CD 모니터링 같은 프로젝트 운영 설정만 담당한다.
- 기존 `settings?tab=github` 주소는 새 소스 저장소 화면으로 리다이렉트한다.

## 검토한 대안

### 선택안: 프로젝트별 전용 소스 저장소 화면

Repository가 아키텍처 생성 입력과 Git/CI/CD 소스를 모두 담당한다는 사실을 가장 명확하게 표현한다. CI/CD를 사용하지 않는 프로젝트도 동일한 화면을 사용할 수 있다.

### 대안: Workspace CI/CD 화면에 포함

Git/CI/CD 사용자는 쉽게 찾을 수 있지만, repository를 아키텍처 입력으로만 사용하는 사용자는 기능을 발견하기 어렵다. Repository를 CI/CD 하위 기능으로 오해하게 만든다.

### 대안: 기존 `/workspace/repository` 시작 화면 재사용

새 프로젝트를 repository에서 시작하는 흐름에는 적합하지만, 이미 존재하는 프로젝트의 연결 상태를 관리하는 화면으로 사용하면 시작과 관리 책임이 섞인다.

## 정보 구조와 진입 경로

### 프로젝트 상세

프로젝트 상세 헤더는 목적이 다른 세 행동을 구분한다.

- `소스 저장소`: `/dashboard/projects/:projectId/repository`
- `프로젝트 설정`: `/dashboard/projects/:projectId/settings`
- `Architecture Board 열기`: 현재 Workspace 경로

기존 `Repository 설정` 버튼은 실제 목적과 맞게 `프로젝트 설정`으로 이름을 변경한다. `소스 저장소`는 별도 버튼으로 추가한다.

### Workspace CI/CD

CI/CD 화면은 연결 상태에 따라 다음 경로를 안내한다.

- GitHub App 설치가 없음: `/dashboard/settings`
- GitHub App 설치는 있으나 프로젝트의 활성 repository가 없음: `/dashboard/projects/:projectId/repository`
- 활성 repository가 있음: 기존 Pipeline Run 화면 유지

### 기존 URL 호환성

`/dashboard/projects/:projectId/settings?tab=github` 요청은 `/dashboard/projects/:projectId/repository`로 리다이렉트한다. 기존 링크와 북마크를 새 책임 경계에 맞게 보존한다.

## 화면 구성

### 페이지 헤더

- 제목: `소스 저장소`
- 설명: 이 프로젝트의 아키텍처 분석과 Git/CI/CD에 사용할 repository를 선택한다는 점을 짧게 안내한다.
- 프로젝트 설정이나 계정 설정이라는 표현을 사용하지 않는다.

### GitHub 계정 미연결 상태

- Repository 후보 API를 호출하지 않는다.
- GitHub App 권한이 먼저 필요하다는 빈 상태를 표시한다.
- `GitHub 계정 연결` 버튼은 `/dashboard/settings`로 이동한다.

### 계정 연결됨, 프로젝트 repository 없음

- GitHub App이 접근 가능한 repository 후보를 불러오는 행동을 제공한다.
- 각 후보는 owner/name, 기본 branch, 공개 여부, archived 여부처럼 선택에 필요한 정보만 표시한다.
- Archived repository는 선택할 수 없고 이유를 표시한다.
- 사용자가 하나를 명시적으로 선택했을 때만 프로젝트 `SourceRepository`를 생성하거나 활성화한다.

### 활성 repository 있음

- 현재 repository의 owner/name, 기본 branch, 연결 상태를 우선 표시한다.
- `Repository 분석`으로 정적 분석을 요청한다.
- 저장된 분석 결과와 추천 결과를 기존 표현 컴포넌트로 보여준다.
- 후보 목록은 기본적으로 접어 두고, `저장소 변경`을 눌렀을 때만 표시한다.

### Repository 변경

기존 활성 repository가 있을 때 다른 후보를 선택하면 즉시 변경하지 않는다. 확인 대화상자는 다음 영향을 설명한다.

- 프로젝트의 활성 source repository가 바뀐다.
- 이후 repository 분석과 Git/CI/CD는 새 repository를 기준으로 동작한다.
- GitHub의 파일, branch, 권한 자체는 변경하지 않는다.

사용자가 확인해야만 기존 repository를 비활성화하고 새 repository를 활성화한다.

## 컴포넌트 책임

### 프로젝트 소스 저장소 페이지

새 Dashboard route는 `projectId`를 받아 전용 클라이언트 컴포넌트를 렌더링한다. 페이지는 프로젝트 설정 컴포넌트를 import하지 않는다.

### 소스 저장소 클라이언트

기존 `ProjectGitHubSettingsClient`의 repository 연결과 분석 책임을 전용 컴포넌트로 이동하고 이름도 책임에 맞게 변경한다. 다음 상태를 독립적으로 관리한다.

- 프로젝트 및 현재 repository 조회
- GitHub 계정 설치 여부 조회
- Repository 후보 조회
- Repository 연결 또는 변경
- Repository 분석

### 재사용 컴포넌트

- Repository 후보 표현과 선택 UI
- 저장된 repository 분석 결과
- API client와 프로젝트 repository 상태 helper

전용 페이지 이동 때문에 API나 데이터베이스 계약은 변경하지 않는다. 기존 account-scoped GitHub App API와 project-scoped `SourceRepository` API를 그대로 사용한다.

## 데이터 흐름

1. 페이지가 프로젝트와 활성 `SourceRepository`를 조회한다.
2. GitHub App installation 목록으로 사용자 계정 연결 여부를 확인한다.
3. 계정이 연결된 경우에만 사용자의 명시적 요청으로 repository 후보를 조회한다.
4. 사용자가 후보를 선택한다.
5. 활성 repository가 이미 있으면 변경 확인을 요청한다.
6. 확인 후 기존 project-scoped 연결 API로 선택한 repository를 활성화한다.
7. 사용자가 분석을 실행하면 기존 분석 API가 결과를 저장한다.
8. 화면은 반환된 결과와 이후 재조회된 저장 결과를 동일하게 표시한다.

## 오류와 로딩 처리

오류는 전체 페이지를 하나의 실패 상태로 만들지 않고 발생 영역에 표시한다.

- 프로젝트 조회 실패: 페이지 본문에서 프로젝트를 열 수 없음을 표시한다.
- GitHub 계정 상태 조회 실패: 계정 연결 영역에 재시도 가능한 오류를 표시한다.
- 후보 조회 실패: 현재 활성 repository와 기존 분석 결과는 유지한다.
- 연결 실패: 선택을 유지하고 오류를 표시해 다시 시도할 수 있게 한다.
- 분석 실패: repository 연결 상태는 유지하고 분석 영역에만 오류를 표시한다.

중복 요청을 막기 위해 후보 조회, 연결, 분석 버튼은 각 요청이 진행 중일 때 비활성화한다.

## 접근성

- 페이지와 repository 영역은 고유한 제목으로 연결한다.
- 로딩 완료와 성공 메시지는 `role="status"`, 실패는 `role="alert"`로 알린다.
- Repository 변경 대화상자는 제목, 설명, 취소, 확인 행동과 키보드 포커스 복귀를 제공한다.
- Archived repository의 비활성 이유를 색상만으로 전달하지 않는다.

## 테스트 기준

### Route와 정보 구조

- 새 프로젝트 repository route가 전용 클라이언트를 렌더링한다.
- 프로젝트 설정 route가 GitHub repository 컴포넌트를 렌더링하지 않는다.
- `tab=github` 기존 URL이 새 route로 리다이렉트된다.
- 프로젝트 상세에 `소스 저장소`, `프로젝트 설정`, `Architecture Board` 진입점이 각각 존재한다.

### 상태별 동작

- GitHub 계정 미연결 상태에서는 후보 API를 호출하지 않고 전역 설정 CTA를 표시한다.
- 계정 연결 후 후보 목록을 조회하고 repository를 연결할 수 있다.
- 활성 repository가 있으면 현재 정보와 분석 행동을 표시한다.
- Repository 변경은 확인 전에는 API를 호출하지 않는다.
- 확인 후에만 새 repository를 활성화한다.

### CI/CD 연결

- 계정 미연결 CI/CD 빈 상태는 전역 설정으로 이동한다.
- 계정 연결됨 + repository 없음 상태는 새 소스 저장소 화면으로 이동한다.
- 활성 repository가 있는 CI/CD 화면은 기존 동작을 유지한다.

### 회귀 검증

- Repository 분석 결과와 Architecture Draft handoff가 기존 계약대로 복원된다.
- 전역 GitHub 계정 설정은 project-scoped repository 연결을 수행하지 않는다.
- 프로젝트 설정의 배포 타깃과 CI/CD 모니터링 기능은 그대로 유지된다.

## 범위 밖

- GitHub App 설치 방식 또는 권한 모델 변경
- SourceRepository 데이터 모델이나 DB migration 변경
- Repository 분석 알고리즘 변경
- Git branch, 파일, Pull Request 변경
- Git/CI/CD handoff 또는 Deployment 자동 실행
- `/workspace/repository`의 새 프로젝트 시작 흐름 재설계
