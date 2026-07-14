# Repository CI/CD 연결 복귀와 ECS Fargate 기본값 설계

## 목적

이 변경은 사용자가 이미 분석한 GitHub Repository를 CI/CD에 연결할 때 같은 Repository를 다시 선택하고 다시 분석하는 중복 단계를 제거한다. 사용자는 Repository 분석 결과에서 GitHub App 권한을 연결한 뒤 `프로젝트 배포 타깃`과 `GitOps 감시 설정`을 저장하고 기존 분석 결과로 돌아간다. 초기 제품 검증 기간에는 추천 Template 선택과 무관하게 callback의 배포 타깃을 항상 `ECS Fargate`로 채우는 임시 정책을 사용한다.

이 흐름은 GitHub App 권한을 임의의 다른 Repository에 연결하지 않는다. 분석한 owner/name과 GitHub installation이 실제로 접근할 수 있는 Repository가 정확히 일치할 때만 프로젝트의 active `SourceRepository`를 만든다. 또한 이 단계는 Terraform Apply, AWS 리소스 생성, Git commit 또는 GitHub PR 생성을 실행하지 않는다.

## 현재 문제

현재 공개 Repository 분석 결과는 `RepositoryStartClient`의 메모리에만 있다. GitHub App 설치를 시작하면 API가 발급하는 서명된 `state`에는 사용자와 `projectId`만 들어가며 분석한 Repository identity와 복귀 정보는 포함되지 않는다.

GitHub callback은 어떤 Repository를 연결해야 하는지 알 수 없으므로 installation이 접근 가능한 목록을 다시 표시한다. 사용자가 하나를 고르면 새 active `SourceRepository`가 만들어지지만 앞서 수행한 공개 Repository 분석 상태는 이미 사라졌기 때문에 연결된 Repository를 다시 분석해야 한다.

## 선택한 접근

다음 세 가지 접근을 비교했다.

1. **분석 evidence와 ECS 템플릿을 결합한 결정적 기본값**: 분석한 Repository identity를 서명된 GitHub state에 묶고, 같은 탭의 짧은 resume 상태로 분석 화면을 복원한다. 배포 이름은 project slug에서 결정적으로 만들고 분석 evidence로 경로와 commit을 채운다.
2. **ECS 템플릿의 고정 이름 복사**: `fargate-app`, `fargate-cluster` 같은 값을 모든 프로젝트에 사용한다. 구현은 단순하지만 같은 AWS account/region에서 프로젝트 간 이름이 충돌한다.
3. **AI가 배포 이름과 경로 생성**: Repository마다 유연하지만 동일 입력에도 결과가 바뀔 수 있고 저장 전 안전 검증이 어려워 운영 설정 기본값으로 부적합하다.

1번을 사용한다. 자동 입력은 사용자가 검토하고 저장하는 초안이며, 저장 버튼이 기존의 명시적 사용자 수락 경계를 유지한다.

## 사용자 흐름

1. 사용자가 공개 GitHub Repository URL과 branch를 분석한다.
2. 분석 응답은 선택한 branch의 실제 head commit SHA를 함께 반환한다.
3. 사용자가 추천 Template 중 하나를 선택한다.
4. 사용자가 `GitHub 연결`을 누르면 Web은 현재 분석 결과와 선택 상태를 `sessionStorage`의 일회성 resume record로 저장한다.
5. Web은 분석한 Repository URL과 resume key를 프로젝트 GitHub install URL API에 보낸다.
6. API는 Repository owner/name을 정규화하고 `projectId`, target owner/name, resume key를 서명된 GitHub App `state`에 넣는다.
7. GitHub callback은 installation repository 목록에서 target owner/name과 정확히 일치하는 항목만 찾는다.
8. 일치한 Repository를 프로젝트 active `SourceRepository`로 자동 연결한다. 사용자는 Repository 목록을 다시 선택하지 않는다.
9. callback 화면은 연결한 Repository 요약 아래에 `프로젝트 배포 타깃`과 `GitOps 감시 설정`을 차례로 표시한다.
10. 두 설정을 모두 저장해야 다음 단계가 완료된다.
11. 두 번째 저장이 성공하면 Web은 일회성 resume record를 읽어 기존 Repository 분석 URL로 이동한다.
12. Repository 분석 화면은 공개 분석 결과, 선택 Template, branch, deployment type, 답변과 진행 단계를 복원하고 resume record를 삭제한다.
13. 사용자는 재분석 없이 원래 선택한 Template의 Board 생성 흐름을 계속한다. 단, callback에서 저장하는 프로젝트 배포 타깃은 임시 정책에 따라 ECS Fargate다.

## GitHub 연결 계약

### Install URL 요청

프로젝트 범위 install URL 요청은 다음 UI context를 받는다.

```ts
type CreateGitHubProjectInstallUrlRequest = {
  repositoryUrl: string;
  resumeKey: string;
};
```

API는 `repositoryUrl`을 GitHub HTTPS Repository URL로 검증하고 owner/name을 정규화한다. 클라이언트가 보낸 owner/name을 그대로 신뢰하지 않는다.

프로젝트 범위 `GitHubAppStatePayload`는 이 흐름에서 다음 값을 서명한다.

```ts
type GitHubProjectConnectionTarget = {
  owner: string;
  name: string;
  resumeKey: string;
};
```

기존 account scope는 바꾸지 않는다. state, installation ID, GitHub access token, private key는 DB나 로그에 저장하지 않는다.

### Callback 응답과 자동 연결

callback 목록 API의 project scope 응답은 target identity와 resume key를 함께 반환한다. Web은 대소문자를 정규화한 `owner/name`이 target과 같은 후보만 선택한다. 후보가 하나이면 기존 `connectGitHubSourceRepository` API를 호출한다.

일치하는 후보가 없으면 다른 Repository 목록을 보여주지 않는다. 화면은 “분석한 Repository에 GitHub App 권한이 없습니다”와 GitHub permission 관리 동작을 제공한다.

Archived Repository, state 만료, 다른 사용자의 installation, 다른 project scope는 기존처럼 fail closed 처리한다.

## Repository 분석 resume 계약

`sessionStorage` record는 다음 UI 상태만 포함한다.

```ts
type RepositoryAnalysisResumeState = {
  schemaVersion: 1;
  createdAt: string;
  resumeKey: string;
  projectId: string;
  projectName: string;
  repositoryUrl: string;
  defaultBranch: string;
  publicAnalysis: SourceRepositoryAnalysisResult;
  selectedTemplateId: PublicRepositoryTemplateId | null;
  deploymentType: RepositoryDeploymentType;
  answers: Record<string, string | boolean>;
  stage: "configuration" | "questions";
};
```

record는 `resumeKey`로 찾고 다음 조건을 모두 만족할 때만 사용한다.

- schema version이 지원된다.
- 생성 후 30분이 지나지 않았다.
- callback의 `projectId`, target Repository URL, resume key와 일치한다.
- callback에서 연결한 active `SourceRepository`의 owner/name과 일치한다.

불일치하거나 만료된 record는 즉시 삭제한다. resume data에는 GitHub state, installation token, OAuth token, credential 또는 원본 Repository 파일 내용을 넣지 않는다. `SourceRepositoryAnalysisResult`의 구조화된 evidence path와 AI Handoff만 저장한다.

## 공개 Repository 분석 revision

`SourceRepositoryAnalysisResult`에 `repositoryRevision`을 추가한다. 값은 branch 이름이 아니라 선택 branch의 실제 GitHub head commit SHA다.

Public GitHub branch 응답의 `commit.sha`를 읽어 선택 branch와 함께 반환한다. 40자 또는 64자 SHA 검증에 실패하면 배포 타깃 저장을 활성화하지 않고 revision을 확인할 수 없다는 오류를 표시한다. branch 이름을 commit SHA처럼 저장하는 fallback은 사용하지 않는다.

## ECS Fargate 배포 타깃 기본값

### 임시 강제 정책

GitHub callback의 필수 설정 화면에서는 추천 Template 선택값과 무관하게 `runtimeTargetKind`를 항상 `ecs_fargate`로 설정한다. 추천 Template 선택값은 Repository 분석 복귀와 이후 Board 생성에 그대로 사용하며 배포 타깃 기본값을 결정하는 입력으로 사용하지 않는다.

callback은 기존 `ProjectDeploymentTarget` 유무에 관계없이 분석 결과에서 ECS 기본값을 계산한다. 기존 target 때문에 CodeBuild, ECR, cluster, service, container가 빈 값으로 남아서는 안 된다. 기존 target이 다른 runtime이면 ECS Fargate draft로 전환하고, 기존 target이 ECS Fargate여도 비어 있는 필드는 결정적 기본값으로 보충한다. 이미 저장된 안전한 ECS `outputUrl`은 보존하고, 없으면 빈 값으로 둔다. 이 강제·보충 동작은 callback에서만 활성화하며 일반 프로젝트 설정 화면이 기존 target을 임의로 덮어쓰지는 않는다.

| 필드 | 기본값 |
| --- | --- |
| `connectionId` | 첫 번째 verified AWS connection |
| `runtimeTargetKind` | `ecs_fargate` |
| `sourceRoot` | Dockerfile과 연결된 application unit root, 없으면 `.` |
| `evidencePath` | 분석에서 유일하게 확인한 Dockerfile path, 없으면 `Dockerfile` |
| `commitSha` | `SourceRepositoryAnalysisResult.repositoryRevision` |
| `version` | 빈 값 |
| `codeBuildProjectName` | `<project-slug>-app-build` |
| `ecrRepositoryName` | `<project-slug>-app` |
| `clusterName` | `<project-slug>-cluster` |
| `serviceName` | `<project-slug>-service` |
| `containerName` | `web` |
| `healthCheckPath` | `/` |
| `outputUrl` | `null` |
| `rolloutStrategy` | `all_at_once` |

`project-slug`는 소문자 영문, 숫자, 하이픈만 남기고 연속 하이픈을 하나로 줄인다. 비어 있으면 Repository name을 같은 규칙으로 사용한다. 각 AWS 필드 길이 제한을 적용하고 잘린 결과가 하이픈으로 끝나지 않게 한다.

### Board 이름 정합성

`ecs-fargate-container-app` Board 생성도 같은 결정적 이름 helper를 사용한다. 최소한 ECR repository, ECS cluster, ECS service, task family, container name과 CloudWatch log group이 배포 타깃 기본값과 같은 project slug를 사용해야 한다. Terraform local resource name은 기존 deterministic template identity를 유지하고 AWS에 생성되는 `name`/`family` 값만 project slug를 반영한다.

## Output URL 경계

Board 생성 전에는 ALB DNS name이나 사용자 domain이 존재하지 않으므로 가짜 `https://example.com` 값을 저장하지 않는다.

ECS Fargate의 초기 `ProjectDeploymentTarget.runtimeConfig.outputUrl`은 `string | null`을 허용한다. Target 저장은 `null`을 허용하지만 실제 Direct application release 또는 Git/CI/CD application release를 시작할 때는 승인된 IaC output이나 사용자가 입력한 안전한 HTTPS URL이 필요하다. 실행 단계에서 URL이 없으면 명시적인 `DEPLOYMENT_OUTPUT_URL_REQUIRED` 오류로 차단하며 빈 환경 변수를 workflow나 CodeBuild에 전달하지 않는다.

`project_deployment_targets.runtime_config`는 JSONB이므로 이 nullable 계약 변경에 DB migration은 필요하지 않다. shared type, API Zod schema, service validation, deployment/GitOps 실행 gate와 `docs/data-models.md`는 함께 갱신한다.

## GitOps 감시 기본값

연결된 active Repository를 기준으로 다음 값을 제공한다.

| 필드 | 기본값 |
| --- | --- |
| `enabled` | `true` |
| `monitorBranch` | 분석한 branch |
| `appPath` | 감지한 `sourceRoot`; `.`이면 repository root |
| `infraPath` | repository root `.` |

Board 생성 전에는 아직 Terraform directory가 Repository에 없으므로 존재하지 않는 `infra` 경로를 가정하지 않는다. 저장 시 기존 GitHub provider validation으로 branch와 directory 존재를 확인한다.

## 저장 완료와 복귀

### 임시 확인 버튼 우회

초기 UI 검증 기간에는 callback의 `프로젝트 배포 타깃 저장`과 `설정 저장` 버튼을 숨기고, 두 설정 아래에 단일 `확인` 버튼을 표시한다. 이 버튼은 배포 타깃 또는 GitOps 감시 설정 저장 API를 호출하지 않고 기존 Repository 분석 화면으로 즉시 돌아간다. 일반 프로젝트 설정 화면의 개별 저장 버튼과 API 계약은 유지한다. 이 임시 우회는 이후 통합 저장 흐름을 설계할 때 제거한다.

아래의 두 저장 성공 조건은 임시 우회가 제거된 뒤 복원할 목표 계약이다.

callback 상위 flow는 다음 두 상태를 별도로 가진다.

- `deploymentTargetSaved`
- `gitOpsMonitoringSaved`

기존 설정 컴포넌트는 저장 성공 시 `onSaved` callback을 호출한다. 로딩 완료만으로 저장된 것으로 간주하지 않는다. 사용자가 저장 후 값을 다시 변경하면 해당 완료 상태를 다시 false로 바꾼다.

두 상태가 모두 true가 되면 성공 상태를 표시하고 resume URL로 자동 이동한다. 한쪽 저장이 실패하면 callback에 남아 해당 오류를 보여준다. verified AWS connection이 없으면 배포 타깃 저장을 막고 `/dashboard/settings`의 AWS connection 구역으로 이동하는 복구 동작을 제공한다.

## 오류 처리

- **target Repository 권한 없음**: 다른 후보를 고르게 하지 않고 GitHub에서 해당 Repository 접근 권한을 추가하도록 안내한다.
- **resume state 만료 또는 누락**: 연결한 Repository는 유지하되 자동 재분석하지 않는다. Repository 시작 화면으로 이동해 분석 상태를 복원할 수 없다는 설명을 표시한다.
- **commit SHA 없음**: branch 이름을 대신 저장하지 않고 배포 타깃 저장을 차단한다.
- **verified AWS connection 없음**: AWS connection 설정 링크를 제공하고 target 저장을 차단한다.
- **배포 타깃 저장 실패**: GitOps 설정 상태를 보존하고 target 오류를 해당 섹션에 표시한다.
- **GitOps 검증 실패**: 배포 타깃 저장 상태를 보존하고 branch/path 오류를 해당 섹션에 표시한다.
- **callback 새로고침**: 서명된 state가 유효한 동안 자동 연결은 idempotent하게 동일 Repository를 active 상태로 유지해야 한다. resume record는 최종 분석 화면 복귀 시 한 번만 소비한다.

## 테스트

### Shared/API

- GitHub App state가 target owner/name과 resume key를 서명·검증한다.
- account scope에는 project target이 들어가지 않는다.
- install URL API가 비-GitHub URL과 비정상 resume key를 거부한다.
- public analysis가 선택 branch의 실제 commit SHA를 반환한다.
- callback installation 목록에서 target Repository만 자동 연결할 수 있다.
- target이 권한 목록에 없거나 archived이면 fail closed 처리한다.
- nullable ECS output URL target 저장은 허용하되 실제 application release는 명시 오류로 차단한다.

### Web

- GitHub 연결 시작 전에 resume state가 저장된다.
- callback은 target Repository를 자동 연결하고 후보 선택 목록을 렌더링하지 않는다.
- callback은 배포 타깃과 GitOps 설정을 연결 완료 뒤에만 렌더링한다.
- ECS 기본값 helper가 선택 Template과 무관하게 project slug, Dockerfile root/path, commit SHA와 resource names를 결정적으로 만든다.
- callback에서는 기존 target이 있거나 다른 runtime이어도 ECS Fargate draft를 만들고 빈 ECS 좌표를 남기지 않는다.
- 일반 프로젝트 설정 화면에서는 기존 저장 target을 자동 기본값으로 덮어쓰지 않는다.
- 두 설정 중 하나만 저장하면 복귀하지 않는다.
- 두 설정 저장 후 기존 분석 state가 복원되고 resume record가 삭제된다.
- 만료·불일치 resume state는 복원하지 않는다.

### 통합 검증

- 실제 로컬 흐름에서 공개 Repository 분석 결과가 GitHub 왕복 뒤에도 유지된다.
- callback에 Repository 재선택 목록이 나타나지 않는다.
- 어떤 추천 Template을 선택해도 callback 배포 타깃은 ECS Fargate 기본값으로 채워진다.
- 두 설정 저장 전에는 Board 생성 흐름으로 돌아가지 않는다.
- 두 설정 저장 후 재분석 요청 없이 기존 추천 화면으로 돌아가 Board를 생성할 수 있다.

## 문서 변경

- `docs/data-models.md`: public analysis revision, target-bound GitHub state, resume state, nullable ECS output URL, 저장 완료 계약
- `docs/architecture.md`: callback 자동 연결과 browser session resume 경계
- `docs/product.md`: Repository Analysis에서 Git/CI/CD 연결 후 같은 분석 결과로 복귀하는 사용자 여정

## 범위 밖

- 실제 Terraform Plan/Apply 또는 AWS 리소스 생성
- GitHub PR, workflow, repository settings 변경
- Template별 배포 타깃 자동 기본값. 임시 정책은 모든 선택을 ECS Fargate로 통일한다.
- account scope GitHub 설정 흐름 변경
- Repository 원본 파일이나 GitHub installation repository 목록의 RDS/S3 저장
- DB migration
