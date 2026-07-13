# 배포·CI/CD 콘솔 분리 설계

## 1. 목표

현재 하나의 배포 콘솔 탭에 섞여 있는 Direct Deployment와 Git/CI/CD 기능을 같은 전체화면 콘솔 안의 두 독립 화면으로 분리한다. 각 화면은 자신의 현재 실행, 기록, 로그, 결과 URL을 소유한다.

CI/CD 화면은 프로젝트 저장소별 감시 기준을 명시하고, 커밋 감지부터 빌드·배포·검증까지의 실제 실행 상태를 커밋별로 보여준다. 사용자는 Terraform output이나 GitHub Actions 페이지를 찾아다니지 않고도 진행 상태, 완료 여부, 실패 원인, 최종 엔트리 포인트를 확인할 수 있어야 한다.

## 2. 승인된 제품 결정

- 별도 URL route를 만들지 않고 현재 전체화면 콘솔 안에서 `배포`와 `CI/CD`를 최상위 독립 화면으로 전환한다.
- CI/CD는 새 저장소 연결 시 기본 활성화한다.
- 감시 설정은 handoff별 입력이 아니라 프로젝트의 활성 Source Repository별 기본 설정으로 유지한다.
- 감시 브랜치와 앱·인프라 경로를 각각 명시해야 CI/CD handoff와 자동 실행을 시작할 수 있다.
- Direct Deployment 기록은 배포 화면에, 커밋별 Pipeline Run은 CI/CD 화면에만 표시한다.
- 완료·실패는 콘솔, 앱 전역 알림, 허용된 브라우저 Notification으로 알린다.
- CI/CD 로그와 배포 후 Runtime Log는 서로 다른 관측 영역으로 유지한다.

## 3. 정보 구조

### 3.1 공통 콘솔 셸

전체화면 콘솔 상단은 `배포`와 `CI/CD` 전환, 닫기, 프로젝트 이름, 현재 진행 상태만 공유한다. 선택한 화면은 콘솔을 닫았다 다시 열 때 복원한다. 하위 탭과 실행 선택 상태는 화면별로 독립 관리한다.

### 3.2 배포 화면

배포 화면은 다음 순서와 정보를 소유한다.

1. 현재 Architecture Board와 Terraform artifact 기준 저장
2. Pre-Deployment Check
3. Terraform Plan 검토와 사용자 승인
4. Terraform Apply 진행 상태와 Deployment Log
5. Direct Deployment 기록
6. 완료 Output과 대표 엔트리 포인트

현재 `DeploymentPanel`의 Direct Deployment 단계와 Direct 기록을 이 화면으로 이동한다. Git/CI/CD 설정이나 handoff 기록은 렌더링하지 않는다.

### 3.3 CI/CD 화면

CI/CD 화면은 다음 네 하위 보기를 제공한다.

- `Overview`: 활성화 상태, 저장소, 감시 브랜치, 앱 경로, 인프라 경로, 현재 Pipeline Run, 대표 Output
- `Activity`: 현재 실행과 커밋별 과거 실행, 커밋 정보, 시작·종료 시각, 성공·실패 상태
- `Logs`: 선택한 실행의 단계별 상태와 시간순 CI/CD 로그
- `Settings`: CI/CD 활성화, 감시 브랜치, 앱 경로, 인프라 경로 검증과 저장

저장소 연결과 GitHub App/OAuth 권한 확장은 기존 프로젝트 GitHub 설정으로 연결한다. CI/CD 화면은 프로젝트 설정을 대체하지 않고 실행에 필요한 감시 설정과 상태를 담당한다.

## 4. 감시 설정 계약

활성 Source Repository에 프로젝트별 `GitCicdMonitoringConfig`를 연결한다.

```ts
type GitCicdMonitoringConfig = {
  sourceRepositoryId: string;
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  validationStatus: "required" | "valid" | "invalid";
  validatedAt: string | null;
  updatedAt: string;
};

type GitCicdMonitoredPath = {
  mode: "repository_root" | "subdirectory";
  path: string;
};
```

`repository_root`의 정규화된 `path`는 `.`이다. `subdirectory`는 선행 슬래시와 `..`를 허용하지 않는 저장소 상대 경로다. 앱과 인프라가 같은 루트를 감시하는 것은 허용한다.

새 저장소 연결은 `enabled: true`, `monitorBranch: sourceRepository.defaultBranch`로 초기화한다. 앱·인프라 경로는 사용자가 각각 `repository_root` 또는 실제 하위 폴더를 확인할 때까지 `validationStatus: required`로 둔다. 기존 저장소도 자동 실행하지 않고 `required`로 마이그레이션한다.

활성화된 설정은 다음 조건을 모두 만족해야 저장 및 handoff 생성이 가능하다.

- GitHub에서 감시 브랜치가 존재한다.
- 앱·인프라 경로가 해당 브랜치에서 디렉터리로 존재하거나 `repository_root`로 명시됐다.
- 현재 GitHub 연결에 브랜치와 경로를 확인할 읽기 권한이 있다.

비활성화하면 신규 커밋 기반 실행만 중단한다. 기존 handoff, Pipeline Run, 로그, Output은 보존한다.

## 5. Handoff와 Pipeline Run 경계

`GitCicdHandoff`는 사용자가 승인한 Terraform/Git 변경, PR, repository settings, AWS Role 연결을 나타내는 기존 계약으로 유지한다. 커밋마다 반복되는 빌드·배포 실행을 handoff에 덮어쓰지 않는다.

별도 `GitCicdPipelineRun`이 Source Repository의 커밋별 실행을 나타낸다.

```ts
type GitCicdPipelineRun = {
  id: string;
  projectId: string;
  sourceRepositoryId: string;
  handoffId: string | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  changeScope: "app" | "infra" | "app_and_infra";
  status: "detected" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
  statusMessage: string | null;
  pipelineRunUrl: string | null;
  appUrl: string | null;
  apiUrl: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastRefreshedAt: string;
  createdAt: string;
};

type GitCicdPipelineStage = {
  id: string;
  pipelineRunId: string;
  kind: "detect" | "app_build" | "infra_plan" | "infra_apply" | "app_deploy" | "verify";
  status: "not_started" | "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";
  runUrl: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

type GitCicdPipelineLog = {
  id: string;
  pipelineRunId: string;
  stageId: string | null;
  sequence: number;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: string;
};
```

동일 Source Repository와 `commitSha` 조합에는 하나의 Pipeline Run만 생성해 중복 감지와 중복 알림을 막는다. 단계와 로그는 실행 안에서 순서를 보존한다.

변경 경로 분류는 GitHub가 제공하는 커밋 변경 파일 목록을 감시 설정과 비교한다.

- 앱 경로만 일치: 앱 빌드·배포·검증 단계 실행, 인프라 단계는 `skipped`
- 인프라 경로만 일치: 인프라 Plan·Apply·검증 단계 실행, 앱 단계는 `skipped`
- 두 경로 모두 일치: 앱과 인프라 단계를 모두 추적
- 어느 경로에도 일치하지 않음: Pipeline Run을 만들지 않고 감지 활동만 진단 로그에 남김

실제 Git 변경, PR, AWS Role 연결, Terraform Apply는 기존 사용자 승인과 안전 게이트를 우회하지 않는다.

## 6. 상태 갱신과 알림

이번 범위는 새 SSE/WebSocket 인프라를 도입하지 않는다. 기존 GitHub Actions 상태 조회 경계를 확장해 Pipeline Run, 단계, 로그를 주기적으로 동기화한다.

- 실행 중인 Pipeline Run이 있으면 5초 간격으로 갱신한다.
- 실행 중인 항목이 없으면 30초 간격으로 새 커밋과 실행을 확인한다.
- GitHub API 오류는 Pipeline Run을 `failed`로 바꾸지 않는다. 마지막 상태를 유지하고 `lastRefreshedAt`을 기준으로 `상태 갱신 지연`을 표시한다.
- 동일 실행의 동일 종료 상태 알림은 한 번만 발송한다.

알림은 다음 계층으로 제공한다.

1. 현재 화면의 진행/완료/실패 배너
2. Workspace 전역 토스트와 세션 내 알림 목록
3. 사용자가 권한을 허용한 경우 Web Notification API

브라우저 Notification은 SketchCatch 탭이 열려 있거나 백그라운드에 살아 있을 때만 보장한다. 브라우저가 완전히 종료된 상태의 Push Notification은 이번 범위에 포함하지 않는다. 권한 거부와 미지원 환경은 앱 내부 알림으로 대체한다.

## 7. Output 접근성

Direct Deployment와 CI/CD 화면은 동일한 표시 규칙을 사용한다.

- `http://` 또는 `https://` URL만 클릭 가능한 Output 후보로 취급한다.
- 민감한 Terraform output은 표시와 복사 후보에서 제외한다.
- `staticSiteUrl` 또는 앱 URL을 대표 `Web entry point`로 우선한다.
- API URL은 별도 `API endpoint`로 표시한다.
- 대표 URL은 `사이트 열기`와 `URL 복사` 동작을 제공하고 복사 성공을 `aria-live` 피드백으로 알린다.
- 대표 URL을 판별할 수 없으면 전체 비민감 Output 목록을 유지하되 임의 URL을 엔트리 포인트로 단정하지 않는다.

## 8. 오류 처리

- 브랜치 없음: 설정의 브랜치 필드 오류로 표시하고 저장을 막는다.
- 경로 없음 또는 파일 경로 입력: 앱/인프라 해당 필드 오류로 표시하고 저장을 막는다.
- GitHub 권한 부족: 필요한 권한을 설명하고 프로젝트 GitHub 설정 링크를 제공한다.
- GitHub 상태 조회 지연: 마지막 정상 상태와 갱신 시각을 유지하며 실행 실패로 오인하지 않는다.
- Pipeline 실패: 실패 단계와 마지막 오류 로그를 강조하고 GitHub Actions 실행 링크를 제공한다.
- 로그 조회 실패: 실행 상태 카드는 유지하고 Logs 보기에 재시도 동작을 제공한다.
- 브라우저 알림 권한 거부: 오류로 취급하지 않고 앱 내부 알림만 사용한다.
- Runtime Log 오류: CI/CD 상태를 변경하지 않고 Live Observation에서 별도로 다룬다.

## 9. API 방향

기존 Git/CI/CD route/service 경계를 확장한다.

- `GET /projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring`
- `PUT /projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring`
- `GET /projects/:projectId/git-cicd-pipeline-runs`
- `GET /git-cicd-pipeline-runs/:pipelineRunId`
- `GET /git-cicd-pipeline-runs/:pipelineRunId/logs?sinceSequence=`
- `POST /git-cicd-pipeline-runs/:pipelineRunId/refresh`

설정 저장 API는 GitHub 검증 결과까지 반영한 `GitCicdMonitoringConfig`를 반환한다. 실행 목록은 최신 생성 순이며 페이지네이션을 지원한다. 실행 상세는 단계 목록을 포함하고, 로그 API는 기존 Deployment Log처럼 sequence 기반 증분 조회를 제공한다.

## 10. 프론트엔드 책임 분리

현재 대형 `DeploymentPanel`을 공통 콘솔 셸과 두 기능 화면으로 분해한다.

- 공통 셸: 전체화면 portal, 상단 화면 전환, 닫기, 마지막 화면 복원
- Deployment 화면: Direct Deployment 상태·행동·기록·Output
- CI/CD 화면: Overview·Activity·Logs·Settings, 실행 폴링, 알림 요청
- 공통 Output 표시: URL 분류, 열기, 복사, 접근성 피드백
- Workspace 알림 호스트: 전역 토스트, 세션 알림 목록, Web Notification 권한과 중복 방지

프론트엔드는 GitHub SDK, AWS SDK, Terraform 실행을 직접 호출하지 않는다. 모든 외부 상태 확인과 변경은 API의 승인·권한 경계를 통과한다.

## 11. 테스트와 완료 기준

### 화면 분리

- `배포`와 `CI/CD` 전환이 각 화면의 선택 상태를 유지한다.
- 콘솔을 닫았다 열면 마지막 최상위 화면을 복원한다.
- Direct 기록은 배포 화면에만, Pipeline Run은 CI/CD 화면에만 나타난다.

### 감시 설정

- 새 저장소는 활성화와 기본 브랜치가 초기화된다.
- 앱·인프라 경로 확인 전 handoff와 자동 실행을 막는다.
- 브랜치 없음, 경로 없음, 권한 부족을 서로 다른 오류로 반환하고 표시한다.
- 비활성화 후 신규 실행은 만들지 않고 기존 기록은 보존한다.

### 실행과 로그

- 앱, 인프라, 양쪽 변경이 올바른 `changeScope`와 단계 상태를 만든다.
- 동일 커밋의 중복 실행을 만들지 않는다.
- 현재 실행과 과거 실행, 커밋, 시작·종료 시각, 단계, 로그가 새로고침 후 유지된다.
- GitHub API 일시 실패 시 마지막 상태를 보존하고 갱신 지연으로 표시한다.
- CI/CD 로그와 Runtime Log가 서로 다른 화면으로 연결된다.

### 알림과 Output

- 진행·완료·실패 상태를 콘솔과 Workspace 전역에 표시한다.
- 브라우저 권한 허용 시 실행당 완료 또는 실패 Notification을 한 번만 보낸다.
- 권한 거부와 미지원 환경은 앱 내부 알림으로 대체한다.
- 비민감 HTTP(S) Output만 링크와 복사 대상으로 노출한다.
- 대표 Web/API URL의 열기·복사와 접근성 피드백을 검증한다.

### 대표 데모

1. `main`의 앱 감시 경로에 준비된 문구 변경을 커밋한다.
2. CI/CD 화면에서 커밋 감지, Build, Deploy, Verify 활동을 확인한다.
3. 완료 알림을 확인한다.
4. Output의 `사이트 열기`를 통해 변경된 문구가 반영된 사이트를 확인한다.
5. CI/CD Logs와 Runtime Log가 분리되어 있음을 확인한다.

### 필수 검증

- shared type, Zod DTO, repository/service, GitHub provider 단위 테스트
- DB migration과 기존 `GitCicdHandoff` 호환성 테스트
- 프론트엔드 화면 분리, 상태 폴링, 알림 중복 방지, Output 접근성 테스트
- GitHub Actions 연동 통합 테스트
- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## 12. 범위 밖

- 별도 Next.js route로 배포와 CI/CD를 분리하는 작업
- 브라우저가 완전히 종료된 상태에서도 동작하는 Web Push와 Service Worker
- CI/CD 로그를 Runtime Log로 재해석하거나 Runtime 오류로 CI 상태를 변경하는 동작
- 여러 include/exclude glob을 직접 편집하는 고급 monorepo 규칙
- 사용자 승인 없이 Git 변경, Terraform Apply, AWS 배포를 실행하는 동작
