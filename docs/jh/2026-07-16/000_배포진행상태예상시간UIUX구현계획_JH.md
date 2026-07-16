# 배포 진행 상태·예상 시간 UI/UX 구현 계획

## 문서 상태

- 작성일: 2026-07-16
- 상태: 구현 전 확정 설계
- 사용자 결정: 배포 모달을 닫아도 진행 상태를 계속 보여주는 방식
- 선택 UI: 하단 고정 진행 바를 누르면 우측 상세 패널이 열리는 방식
- 적용 경로: Direct Deployment의 Plan, Apply, Destroy Plan, Destroy
- 현재 우선 대상: Repository 분석으로 만든 ECS Fargate `full_stack` 프로젝트

이 문서는 구현 순서와 계약 후보를 정리한 JH 참고 문서다. 공통 DTO와 DB 계약을 구현할 때는
`docs/data-models.md`, 실행 경계는 `docs/architecture.md`, 운영 흐름은 `docs/deployment.md`를 함께
갱신한다. 이 문서가 canonical 문서를 대체하지 않는다.

## 1. 해결할 문제

현재 배포 콘솔은 사용자에게 `검증 → 승인 → 배포`의 큰 단계와 실행 로그를 보여준다. 하지만 Plan 또는
배포 실행 버튼을 누른 뒤에는 여러 내부 작업이 하나의 `진행 중` 상태로 묶인다. 사용자는 다음 내용을 바로
알 수 없다.

- 현재 CodeBuild, Terraform init, Plan, Apply, Health Check 중 어디를 실행하고 있는지
- 전체 단계 중 몇 단계를 끝냈는지
- 정상적으로 실행 중인지 멈춘 것인지
- 보통 어느 정도 기다려야 하는지
- 모달을 닫은 뒤 어디에서 다시 상태를 확인하는지

이 기능은 AWS 작업 시간을 정확히 예언하는 기능이 아니다. 서버가 확인한 실제 단계와 경과 시간을 계속
보여주고, 과거 성공 실행 또는 보수적인 기본값으로 계산한 예상 범위를 함께 제공하는 기능이다.

## 2. 목표

1. 사용자가 배포 모달을 닫거나 다른 SketchCatch 화면으로 이동해도 실행 상태를 확인할 수 있어야 한다.
2. 진행률은 임의의 퍼센트가 아니라 실제 완료된 단계 수로 표시해야 한다.
3. 예상 시간은 단일 시각이 아니라 범위로 표시해야 한다.
4. 새로고침 후에도 서버의 실행 상태를 다시 읽어 같은 진행 상황을 복원해야 한다.
5. 완료, 실패, 취소, 부분 실패, 승인 대기를 서로 다른 상태로 명확히 표시해야 한다.
6. 기존 Deployment 안전 게이트와 worker 실행 경계를 변경하거나 우회하지 않아야 한다.
7. frontend는 AWS SDK나 Terraform 명령을 직접 실행하지 않아야 한다.

## 3. 비범위

- AWS가 제공하지 않는 정확한 완료 시각을 보장하는 기능
- 매초 서버에 진행률을 저장하는 기능
- 가짜 선형 퍼센트 애니메이션
- 이번 작업과 무관한 Deployment 실행 순서 변경
- 여러 사용자가 같은 Deployment를 공동 조작하는 협업 기능
- GitHub Actions UI 전체 재설계
- 인프라와 애플리케이션의 완전한 동시 롤백 추가

Git/CI/CD Pipeline Run도 나중에 같은 하단 활동 UI를 사용할 수 있도록 컴포넌트는 source-neutral하게
설계하되, 이번 구현의 상태 수집 범위는 Direct Deployment로 제한한다.

## 4. 사용자에게 보이는 최종 동작

### 4.1 하단 고정 진행 바

실행이 시작되면 인증된 SketchCatch 화면의 우측 하단에 진행 바를 고정한다.

```text
demo · Plan 생성 중
코드 사전 검증 · 2/6
1분 42초 경과 · 약 2~5분 남음
[자세히 보기]
```

규칙은 다음과 같다.

- 프로젝트 이름, 현재 작업, 현재 단계, 완료 단계 수, 경과 시간, 예상 범위를 표시한다.
- 실행 중에는 닫기 버튼을 제공하지 않는다. 사용자는 compact 상태로만 접을 수 있다.
- 같은 사용자가 여러 프로젝트에서 실행 중이면 가장 최근에 시작한 실행을 표시하고 `외 N건`을 함께
  표시한다.
- `자세히 보기`를 누르면 우측 상세 패널을 연다.
- Plan 생성이 끝나면 `Plan 확인 및 승인`을 primary action으로 표시한다.
- Apply가 끝나면 `배포 결과 보기` 또는 안전한 Output URL을 표시한다.
- terminal 결과는 사용자가 확인할 때까지 남기되, 확인한 뒤에는 닫을 수 있다.

### 4.2 우측 상세 패널

상세 패널은 새로운 중첩 modal이 아니라 app shell 위에 올라오는 right drawer로 구현한다. 기존 배포 콘솔과
같은 상태·용어를 사용한다.

상단 영역:

- 프로젝트 이름
- 작업 종류: `Plan`, `Apply`, `Destroy Plan`, `Destroy`
- 전체 상태
- 경과 시간과 예상 범위
- 배포 콘솔로 이동

단계 영역:

- 각 단계의 `대기`, `진행 중`, `완료`, `실패`, `건너뜀` 상태
- 현재 단계의 시작 시각과 경과 시간
- 완료 단계의 실제 소요 시간
- 현재 단계가 예상 상한을 넘으면 `예상보다 오래 걸리는 중` 표시

로그 영역:

- 최신 마스킹 로그 10줄만 기본 표시
- 기존 전체 Deployment Log 화면으로 이동하는 action 제공
- 로그 원문으로 진행 단계를 추측하지 않는다. 진행 단계는 구조화된 서버 상태를 사용한다.

실행 제어:

- 취소 가능한 상태에서만 `실행 취소`를 제공한다.
- 취소 action은 기존 Deployment 취소 API를 사용한다.
- Apply, Destroy, 재시도처럼 실제 AWS 상태를 바꾸는 새 action을 진행 패널에서 자동 실행하지 않는다.

### 4.3 상태별 문구

| 상태 | 대표 문구 | 시간 표시 | 사용자 action |
| --- | --- | --- | --- |
| `queued` | 실행 준비 중 | 경과 시간 | 자세히 보기 |
| `running` | `{현재 단계} 진행 중` | 경과 + 예상 범위 | 자세히 보기, 조건부 취소 |
| `waiting_for_approval` | 사용자 승인 대기 | ETA 중지 | Plan 확인 및 승인 |
| `partially_failed` | 일부 단계 완료, 후속 조치 필요 | 실제 경과 시간 | 오류 확인 또는 재시도 화면 이동 |
| `succeeded` | Plan 생성 완료 또는 배포 완료 | 실제 총 소요 시간 | 결과 보기 |
| `failed` | `{실패 단계}에서 실패` | 실제 경과 시간 | 원인 확인 |
| `cancelled` | 실행 취소됨 | 실제 경과 시간 | 기록 보기 |

`waiting_for_approval`은 저장된 실행 상태가 아니라 Plan progress run이 성공했고 아직 Deployment 승인이 없는
경우 API가 계산하는 presentation 상태다. 승인 대기 시간은 ETA 통계에 포함하지 않는다.

## 5. 진행 단계 계약

외부 UI의 큰 단계 `검증 → 승인 → 배포`는 유지한다. 하단 진행 바와 상세 패널만 내부 실행 단계를 더
구체적으로 보여준다.

### 5.1 Plan 단계

| Phase key | 사용자 문구 | `infrastructure` | `application` | `full_stack` |
| --- | --- | ---: | ---: | ---: |
| `request_accepted` | 요청 접수 | 사용 | 사용 | 사용 |
| `build_environment` | 빌드 환경 확인 | 건너뜀 | 조건부 사용 | 조건부 사용 |
| `application_preflight` | 코드 사전 검증 | 건너뜀 | 사용 | 사용 |
| `terraform_init` | Terraform 초기화 | 사용 | 건너뜀 | 사용 |
| `terraform_plan` | Terraform Plan 생성 | 사용 | 건너뜀 | 사용 |
| `result_persist` | 검증 결과 저장 | 사용 | 사용 | 사용 |

빌드 환경이 이미 `ready`이면 `build_environment`는 `skipped`로 기록한다. 화면의 분모에는 현재 실행에
실제로 포함된 단계와 `skipped` 단계를 모두 포함하되, `skipped`는 즉시 완료된 것으로 취급한다.

### 5.2 Apply 단계

| Phase key | 사용자 문구 | `infrastructure` | `application` | `full_stack` |
| --- | --- | ---: | ---: | ---: |
| `approval_recheck` | 승인 내용 재확인 | 사용 | 사용 | 사용 |
| `terraform_apply` | 인프라 생성·변경 | 사용 | 건너뜀 | 사용 |
| `terraform_evidence` | Terraform 결과 저장 | 사용 | 건너뜀 | 사용 |
| `api_release` | API Image 배포 | 건너뜀 | 조건부 사용 | 조건부 사용 |
| `frontend_release` | 웹 파일 배포 | 건너뜀 | 조건부 사용 | 조건부 사용 |
| `health_verification` | 서비스 상태 확인 | 건너뜀 | 사용 | 사용 |
| `result_persist` | 배포 결과 저장 | 사용 | 사용 | 사용 |

`application_release_steps`가 가진 세부 step은 위 사용자 phase에 매핑한다. 같은 작업을 별도 진행 단계로
중복 저장하지 않는다. API는 ApplicationRelease의 durable step과 Deployment progress를 조합해 하나의
사용자 snapshot을 만든다.

### 5.3 Destroy 단계

Destroy Plan은 Plan과 같은 Terraform 단계 구조를 사용하되 operation을 `destroy_plan`으로 구분한다.
Destroy 실행은 다음 phase를 사용한다.

```text
approval_recheck → terraform_destroy → cleanup_evidence → result_persist
```

application-only cleanup은 Terraform phase를 `skipped`로 두고 기존 application release cleanup step을 사용자
phase에 매핑한다.

## 6. 예상 시간 계산

### 6.1 표시 원칙

- `약 4분 남음` 같은 단일값 대신 `약 2~5분 남음`처럼 남은 시간 범위를 표시한다.
- 첫 실행부터 빈 화면이 되지 않도록 backend 기본 범위를 제공한다.
- 비교 가능한 성공 기록이 3건 이상이면 최근 기록으로 기본 범위를 대체한다.
- 최대 최근 20건만 사용한다.
- 사용자가 승인하기까지 기다린 시간은 제외한다.
- 실패, 취소, timeout 실행은 정상 ETA 표본에서 제외한다.
- active phase가 예상 상한을 초과하면 남은 시간을 0으로 만들지 않고 `예상보다 오래 걸리는 중`으로
  전환한다.

### 6.2 비교 key

다음 값이 같은 실행만 비교한다.

```ts
type DeploymentEstimateKey = {
  provider: string;
  operation: "plan" | "apply" | "destroy_plan" | "destroy";
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
  liveProfile: DeploymentLiveProfile;
};
```

AWS region은 snapshot에 표시하고 관측 자료에는 남기지만 초기 MVP 통계 key에서는 제외한다. 표본이 충분하지
않은 상태에서 region까지 나누면 계속 기본값만 사용하게 되기 때문이다. provider-neutral 계약은 유지하며
AWS 외 Provider Adapter도 자신의 기본 범위를 제공할 수 있어야 한다.

### 6.3 통계 방식

- 하한: 최근 성공 실행의 phase별 p50 합계
- 상한: 최근 성공 실행의 phase별 p90 합계
- 현재 phase의 이미 지난 시간은 남은 범위에서 차감
- 완료 phase는 실제 완료 시각을 사용
- 아직 시작하지 않은 phase는 historical 또는 default 범위를 사용
- 결과는 10초 단위로 반올림
- UI timer는 브라우저에서 증가시키되 서버 시각과 30초 이상 차이가 나면 snapshot을 다시 요청

### 6.4 초기 기본 범위

기본값은 UI에 하드코딩하지 않고 backend Provider Adapter 설정에 둔다. AWS-first ECS Fargate 시작값은 아래
범위를 사용하고 실제 기록이 쌓이면 자동으로 대체한다.

| Phase | 기본 범위 |
| --- | ---: |
| 요청 접수 | 5~20초 |
| 빌드 환경 확인 | 10~60초 |
| 코드 사전 검증 | 2~5분 |
| Terraform 초기화 | 1~3분 |
| Terraform Plan 생성·저장 | 30초~2분 |
| Terraform Apply | 3~10분 |
| API·웹 릴리즈와 Health Check | 3~10분 |
| 결과 저장 | 10초~1분 |

기본값은 보장 시간이 아니라 사용자 안내용 범위다. UI tooltip에 `최근 성공 기록 또는 기본 범위로 계산한
예상치이며 AWS 상태에 따라 달라질 수 있습니다.`를 표시한다.

## 7. 저장 모델

새로고침과 화면 이동 후에도 같은 phase를 복원하고 과거 실행 시간을 계산하려면 현재 진행 snapshot을 서버에
저장해야 한다. 하나의 Deployment에는 Plan, Apply, Destroy Plan, Destroy가 차례로 실행될 수 있으므로
Deployment의 단일 JSONB 필드를 계속 덮어쓰면 안 된다. 사용자에게 보이는 실행 1회마다 progress run row를
하나 만들고, 매초 event row를 추가하지 않은 채 phase transition만 해당 row에 저장한다.

### 7.1 제안 테이블

`deployment_progress_runs` 테이블을 추가한다. 내부 worker 실행 단위인 `DeploymentJob`과 목적이 다르다.
`DeploymentJob` 여러 개가 `init → plan`처럼 하나의 사용자 progress run을 구성할 수 있으므로
`deployment_jobs.progress_run_id` nullable FK로 연결한다.

```ts
type DeploymentProgressRun = {
  id: string;
  deploymentId: string;
  operation: "plan" | "apply" | "destroy_plan" | "destroy";
  status:
    | "queued"
    | "running"
    | "partially_failed"
    | "succeeded"
    | "failed"
    | "cancelled";
  provider: string;
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
  liveProfile: DeploymentLiveProfile;
  currentPhaseKey: DeploymentProgressPhaseKey | null;
  phases: DeploymentProgressPhase[];
  startedAt: IsoDateTimeString;
  completedAt: IsoDateTimeString | null;
  updatedAt: IsoDateTimeString;
};

type DeploymentProgressPhase = {
  key: DeploymentProgressPhaseKey;
  sequence: number;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
};
```

DB 필드:

| 컬럼 | 용도 |
| --- | --- |
| `id` | progress run ID |
| `deployment_id` | 사용자 Deployment FK, 삭제 시 cascade |
| `operation` | `plan`, `apply`, `destroy_plan`, `destroy` |
| `status` | 실행 자체의 terminal/active 상태 |
| `provider` | Provider Adapter 식별자 |
| `scope` | ETA 비교용 실행 범위 snapshot |
| `target_kind` | ETA 비교용 runtime snapshot |
| `live_profile` | ETA 비교용 profile snapshot |
| `current_phase_key` | 현재 phase |
| `phases` | phase 목록과 timestamp JSONB |
| `started_at`, `completed_at`, `updated_at` | 경과·ETA·정렬 근거 |

같은 Deployment에서 Plan과 Apply progress run은 별도 row로 보존한다. 재시도 역시 새 progress run을 만들고
이전 실패 기록을 덮어쓰지 않는다. 한 Deployment에는 `queued` 또는 `running` progress run이 동시에 하나만
존재하도록 partial unique index와 application check를 함께 사용한다.

저장 규칙:

- 사용자 실행 요청 생성 시 progress run과 전체 phase 목록을 한 번 저장한다.
- phase 시작, 완료, 실패, 취소 전이에만 업데이트한다.
- frontend timer 때문에 DB를 매초 갱신하지 않는다.
- worker가 저장할 때 기존 lease fence와 Deployment 소유권 검증을 사용한다.
- stale worker는 progress와 terminal 결과를 저장할 수 없어야 한다.
- `errorSummary`, AWS 응답 body, credential, token은 JSONB에 넣지 않는다.
- 상세 실패 설명과 로그는 기존 필드를 사용한다.
- progress run이 없는 기존 Deployment는 `legacy_progress_unavailable`로 읽고 현재 `Deployment`와 로그만
  표시한다.

구현 시점에 `apps/api/drizzle/**`의 최신 번호를 다시 확인하고 새 migration 번호를 정한다. 이 계획 문서에서는
다른 작업 브랜치와의 번호 충돌을 막기 위해 번호를 미리 고정하지 않는다.

## 8. API 계약

### 8.1 활성 실행 목록

```http
GET /api/deployment-activities/active
```

로그인 사용자가 소유한 프로젝트의 다음 항목을 반환한다.

- queued/running progress run
- 승인 대기 중인 최신 Plan
- 아직 사용자가 확인하지 않은 terminal Deployment 결과

terminal 결과 확인 여부는 서버 notification read 상태를 재사용한다. 성공한 Plan의 승인 대기 상태는
`Deployment.currentPlanArtifactId`가 있고 `approvedAt`이 없는지를 기준으로 계산한다. 진행 UI만을 위한 별도
브라우저 localStorage 상태를 source of truth로 사용하지 않는다.

### 8.2 단일 진행 snapshot

```http
GET /api/deployments/:deploymentId/progress
```

```ts
type DeploymentProgressSnapshot = {
  deploymentId: string;
  projectId: string;
  projectName: string;
  progressRunId: string;
  operation: DeploymentProgressRun["operation"];
  status: DeploymentProgressRun["status"] | "waiting_for_approval";
  currentPhase: DeploymentProgressPhase | null;
  phases: DeploymentProgressPhase[];
  completedPhaseCount: number;
  totalPhaseCount: number;
  startedAt: IsoDateTimeString;
  completedAt: IsoDateTimeString | null;
  lastHeartbeatAt: IsoDateTimeString | null;
  estimate: {
    source: "default" | "historical" | "unavailable";
    sampleCount: number;
    remainingMinSeconds: number | null;
    remainingMaxSeconds: number | null;
    overExpectedRange: boolean;
  };
  latestLogSummary: string | null;
  canCancel: boolean;
  nextAction: "open_plan" | "open_result" | "open_failure" | null;
};
```

`latestLogSummary`는 기존 `maskDeploymentMessage`를 통과한 짧은 문장만 반환한다. 전체 로그는 기존
`GET /api/deployments/:deploymentId/logs`와 log stream을 사용한다.

### 8.3 갱신 방식

MVP에서는 app shell provider가 다음 주기로 snapshot을 polling한다.

- active 실행이 있을 때: 3초
- 승인 대기 또는 확인하지 않은 terminal 결과만 있을 때: 10초
- 아무 activity도 없을 때: 30초
- 브라우저 tab이 hidden이면 active 주기를 10초로 완화
- 네트워크 실패 시 exponential backoff, 최대 30초

상세 패널이 열려 있을 때만 기존 Deployment log stream을 연결한다. 이번 구현에서 별도 global SSE와 Redis
fan-out을 추가하지 않는다. 추후 여러 active run의 초단위 push가 필요해질 때 같은 DTO를 SSE event payload로
재사용한다.

## 9. Backend 구현 경계

### 9.1 공통 progress service

새 service는 다음 책임만 가진다.

- scope와 operation에 맞는 phase 목록 생성
- fenced phase transition 저장
- 기존 Deployment/ApplicationReleaseStep을 사용자 phase로 합성
- historical/default ETA 계산
- 사용자별 active activity 조회

Terraform 실행, AWS SDK 호출, CodeBuild 실행은 이 service로 옮기지 않는다.

예상 파일:

- `apps/api/src/deployments/deployment-progress-service.ts`
- `apps/api/src/deployments/deployment-progress-repository.ts`
- `apps/api/src/deployments/deployment-progress-estimator.ts`
- `apps/api/src/routes/deployments.ts`

### 9.2 실행 지점 연결

다음 기존 service가 실제 side effect 전후에 phase transition을 기록한다.

- build environment prepare 진입·완료
- direct application preflight CodeBuild 시작·terminal 확인
- Terraform init 시작·완료
- Terraform Plan 시작·결과 저장
- approval snapshot 재검증
- Terraform Apply와 evidence 저장
- trusted application release step 전이
- Health Check와 최종 결과 저장
- cancel/recovery terminal 처리

phase 전이는 AWS 작업보다 먼저 성공으로 기록하면 안 된다. side effect가 완료되고 evidence를 저장한 뒤
`succeeded`로 전이한다.

## 10. Frontend 구조

### 10.1 App shell provider

진행 상태를 `DirectDeploymentScreen` 내부 state에만 두면 모달을 닫는 순간 사라진다. 인증된 app shell에
`DeploymentActivityProvider`를 두고 route가 바뀌어도 유지한다.

예상 컴포넌트:

- `apps/web/features/deployment-activity/DeploymentActivityProvider.tsx`
- `apps/web/features/deployment-activity/DeploymentProgressDock.tsx`
- `apps/web/features/deployment-activity/DeploymentProgressDrawer.tsx`
- `apps/web/features/deployment-activity/deployment-progress-presentation.ts`
- `apps/web/features/deployment-activity/deployment-activity.module.css`

`DirectDeploymentScreen`은 실행 요청이 성공하면 provider에 임시 optimistic row를 추가할 수 있지만, 다음 poll에서
서버 snapshot으로 반드시 교체한다. 실행 성공 여부를 frontend 추정값으로 확정하지 않는다.

### 10.2 위치와 반응형

Desktop:

- dock: 화면 우측 하단, 폭 420~520px
- drawer: 우측 고정, 현재 Workspace 패널을 가리지 않도록 app shell portal과 semantic z-index 사용
- toast, modal, tooltip과 충돌하지 않는 공통 z-index token 사용

Mobile/tablet:

- dock: 좌우 12px 여백의 하단 full-width
- drawer: 화면 전체 높이의 bottom sheet 또는 full-screen sheet
- safe-area inset 반영
- 긴 프로젝트명은 한 줄 말줄임하고 전체 이름은 상세 패널에서 표시

### 10.3 시각 규칙

- 기존 Pretendard와 흰색 surface, `#171717` ink, 검정 primary CTA를 유지한다.
- 진행 중 phase는 검정 원과 짧은 indeterminate motion으로 표시한다.
- 완료는 green, 경고는 amber, 실패는 red semantic token을 사용한다.
- 전체 progress를 부드럽게 증가시키는 가짜 linear bar는 사용하지 않는다.
- 단계 connector와 상태 변화 motion은 150~250ms로 제한한다.
- `prefers-reduced-motion`에서는 pulse를 제거하고 정적 상태표시로 바꾼다.

### 10.4 접근성

- phase가 바뀌거나 terminal 상태가 될 때만 `aria-live="polite"`로 알린다.
- 매초 증가하는 timer는 screen reader에 매초 발표하지 않는다.
- 색상만으로 상태를 구분하지 않고 icon, label, text를 함께 사용한다.
- drawer focus trap, ESC 닫기, focus return을 지원한다.
- 실행 중 dock 자체는 닫을 수 없지만 `접기` action에는 명확한 accessible name을 제공한다.

## 11. 오류와 복구 UX

| 상황 | 표시 방식 |
| --- | --- |
| snapshot 일시 조회 실패 | 마지막 서버 상태 유지 + `상태를 다시 확인하는 중` |
| heartbeat 지연 | `AWS 응답을 기다리는 중` 표시, 실패로 단정하지 않음 |
| 예상 상한 초과 | `예상보다 오래 걸리는 중` + 경과 시간 유지 |
| worker recovery 중 | `실행 상태 복구 중` phase 또는 latest status message 표시 |
| 실행 실패 | 실패 phase 고정 + 요약 + `원인 확인` |
| 부분 실패 | 완료 phase는 유지하고 실패한 후속 phase 및 재시도 경로 표시 |
| 사용자가 취소 요청 | `취소 요청됨 · 안전하게 중단하는 중` |
| 새로고침 | active endpoint에서 복원 후 dock 재표시 |

API 조회 실패만으로 실제 Deployment를 실패 처리하거나 cancel하지 않는다.

## 12. 구현 순서

1. `packages/types`에 progress phase, snapshot, estimate DTO 추가
2. `docs/data-models.md`에 확정 DTO와 progress run 저장 계약 반영
3. migration 번호 충돌 확인 후 `deployment_progress_runs`와
   `deployment_jobs.progress_run_id` 추가
4. progress repository와 fenced transition helper 구현
5. scope/operation별 phase template 구현
6. default/historical estimator 구현
7. Plan/Apply/Destroy/application release service에 transition 연결
8. active list와 단일 snapshot API 구현
9. app shell `DeploymentActivityProvider`와 polling 구현
10. 하단 dock 구현
11. 우측 drawer, 단계 목록, 최신 로그 연결 구현
12. Direct Deployment 실행 요청과 provider optimistic state 연결
13. 완료·실패 notification/toast와 결과 이동 action 연결
14. responsive, keyboard, reduced motion 검증
15. 실제 ECS Fargate Plan과 Apply에서 단계·ETA·복원 QA

## 13. 테스트 계획

### 13.1 Backend 단위 테스트

- scope/operation별 phase 목록과 `skipped` 규칙
- 허용되지 않은 phase 역전 차단
- stale fence의 progress 저장 차단
- completed phase의 timestamp 보존
- 승인 대기 시간이 ETA 표본에서 제외되는지
- 표본 0~2건에서 default 사용
- 표본 3건 이상에서 p50/p90 사용
- timeout/failed/cancelled 표본 제외
- 예상 상한 초과 시 `overExpectedRange: true`
- active endpoint의 사용자·프로젝트 소유권 필터
- log summary masking

### 13.2 Frontend 단위 테스트

- active snapshot이 있으면 route와 무관하게 dock 표시
- phase count와 사용자 문구 매핑
- 승인 대기에서 ETA 숨김
- terminal 결과 action 매핑
- 여러 active 실행의 `외 N건` 표시
- polling 주기와 backoff
- hidden tab 주기 완화
- server snapshot이 optimistic row를 교체
- screen reader announcement가 phase 전이 때만 발생

### 13.3 통합 테스트

- Plan 클릭 후 build environment, preflight, init, plan, result 순서 표시
- 배포 콘솔을 닫아도 dock 유지
- Workspace에서 Dashboard로 이동해도 dock 유지
- 새로고침 후 같은 deployment와 phase 복원
- Plan 완료 후 `Plan 확인 및 승인` 표시
- Apply 중 output/state 저장과 application release 단계 전환
- 실패 시 정확한 failure stage와 원인 확인 action 표시
- cancel 요청 후 terminal 확인 전까지 `취소 중` 유지

### 13.4 실제 데모 QA

1. `jh-9999/audience-live-check` 프로젝트에서 Plan 실행
2. 하단 dock에 `코드 사전 검증`, `Terraform 초기화`, `Terraform Plan 생성` 전이 확인
3. 모달을 닫고 Board/Settings를 이동해도 dock 유지 확인
4. 새로고침 후 동일 deployment 복원 확인
5. Plan 완료 후 생성·변경·삭제 요약으로 이동 확인
6. 승인 후 Apply 실행
7. Terraform Apply, ECS release, S3/CloudFront release, Health Check 전이 확인
8. 성공 후 CloudFront HTTPS Output URL과 실제 총 소요 시간 확인

## 14. 완료 기준

- 사용자가 실행 시작 후 현재 내부 단계와 실제 경과 시간을 항상 확인할 수 있다.
- 모달을 닫고 route를 이동하거나 새로고침해도 active progress가 사라지지 않는다.
- 진행률이 구조화된 서버 phase와 일치한다.
- 첫 실행은 기본 범위, 비교 가능한 성공 기록 3건부터 historical 범위를 사용한다.
- 예상 상한을 넘겨도 가짜 완료율을 만들지 않는다.
- 승인 대기 시간은 ETA에서 제외된다.
- Plan, Apply, Destroy의 기존 승인·로그·cancel·recovery 안전 계약이 유지된다.
- frontend가 AWS SDK나 Terraform을 직접 호출하지 않는다.
- 비밀값과 민감 output이 progress DTO, 로그 요약, 화면에 노출되지 않는다.
- 모바일과 `prefers-reduced-motion` 환경에서도 상태를 읽고 조작할 수 있다.

## 15. 구현 전 확인 사항

- 새 migration을 만들기 직전에 `apps/api/drizzle/meta/_journal.json`의 최신 번호를 재확인한다.
- 다른 브랜치가 같은 migration 번호를 사용 중이면 먼저 번호를 조정한다.
- app shell provider를 넣을 공통 authenticated layout 위치를 코드 기준으로 확정한다.
- 기존 `DeploymentNotification` read 상태를 terminal dock 확인 여부에 재사용할 수 있는지 검증한다.
- 기존 `ApplicationReleaseStep`을 사용자 phase에 매핑할 때 중복 progress row를 만들지 않는지 확인한다.
- 기본 ETA 범위는 환경 설정 또는 Provider Adapter 상수로 관리하고 frontend에 복제하지 않는다.
