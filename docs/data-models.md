# 데이터 모델

프로젝트의 설계, 편집 초안과 실제 배포를 별도 기록으로 관리합니다. API와 화면의 타입은 [공유 타입](../packages/types/src/index.ts), DB 필드와 제약은 [Drizzle 스키마](../apps/api/src/db/schema.ts)가 기준입니다.

## 프로젝트와 설계

| 모델 | 의미 |
| --- | --- |
| `Project` | 사용자 소유의 프로젝트 |
| `ArchitectureSnapshot` | 저장한 설계의 특정 버전 |
| `ArchitectureJson` | 클라우드 자원과 연결 관계 |
| `DiagramJson` | 편집 화면의 자원과 배치 정보 |
| `InfrastructureGraph` | 다이어그램과 Terraform을 연결하는 공통 그래프 |
| `ProjectDraft` | 현재 편집 중인 설계와 Terraform 초안 |
| `ProjectAsset`, `TerraformArtifact` | S3 파일의 위치와 종류, 업로드 상태 |

프로젝트는 저장된 설계와 편집 초안을 구분합니다. 초안에는 버전을 두어 다른 탭의 오래된 내용이 최신 편집 결과를 덮어쓰지 않게 합니다.

## AWS 연결과 배포

| 모델 | 의미 |
| --- | --- |
| `AwsConnection` | 사용자가 연결하고 검증한 AWS 역할 |
| `AwsImportAccess` | 기존 AWS 자원을 조회하기 위한 권한 설정과 승인, 처리 상태 |
| `Deployment` | 특정 프로젝트의 Terraform 실행과 결과 |
| `DeploymentJob` | API와 Worker가 추적하는 실행 작업 |
| `DeploymentPlanArtifact` | 승인할 Plan 파일과 해시, 대상 및 상태 정보 |
| `DeploymentLog` | 단계별 실행 로그 |
| `DeployedResource`, `TerraformOutput` | 실행 후 확인한 자원과 출력 |
| `ApplicationArtifact` | 빌드 파일의 식별 정보와 내용 해시 |
| `ApplicationRelease` | 빌드 파일을 실제 환경에 반영한 기록 |
| `ReleaseCandidate`, `ProjectExecutionLease` | 검증한 배포 후보와 프로젝트 실행 점유권 |

Plan 승인에는 파일 해시뿐 아니라 프로젝트와 AWS 계정, 리전, Terraform State의 계보와 버전을 연결합니다. 실행 전에 다시 비교합니다. 작업 번호와 실행 세대는 중복 실행과 늦은 완료 기록을 막는 데 사용합니다.

## CI/CD와 관측

| 모델 | 의미 |
| --- | --- |
| `SourceRepository` | 프로젝트에 연결한 Git 저장소 |
| `GitCicdHandoff` | 사용자가 승인한 저장소 설정 및 PR 전달 정보 |
| `GitCicdPipelineRun` | GitHub workflow run과 재시도별 실행 기록 |
| `GitCicdPipelineStage`, `GitCicdPipelineLog` | 실행 단계와 순서가 있는 로그 |
| `ReverseEngineeringScan` | 기존 자원 조회와 설계 복원 결과 |
| `ReverseEngineeringScanPreview` | 설계에 반영하기 전의 조회 결과와 만료 시각, 반영 여부 |
| `DeploymentNotification` | 배포 완료 알림과 수신함 상태 |

같은 커밋의 앱 배포와 인프라 변경도 별도 실행으로 저장합니다. 늦게 도착한 조회 결과가 완료 상태를 되돌리지 못하게 갱신 순서를 검사합니다. 관측 세션은 Redis에 최대 15분 저장하며 영구 배포 기록을 대신하지 않습니다.

## 요청과 승인

`RequirementInput`은 입력한 요구사항이고 `UserAcceptedChange`는 사용자가 수락한 변경입니다. `CheckFinding`은 비용이나 보안, 설정 검사 결과입니다. AI 초안과 설명은 승인 기록을 대신하지 않습니다.

## 저장 규칙

- API 필드는 `camelCase`, DB 컬럼은 `snake_case`를 씁니다.
- 공통 날짜 타입은 `IsoDateTimeString`입니다.
- 원본 비밀번호와 AWS 키, 비공개 토큰은 공유 응답 타입에 넣지 않습니다.
- 프로젝트와 자원 관계에는 소유권을 확인하는 외래 키와 고유 제약을 둡니다.
- 새 필드와 상태를 추가할 때는 공유 타입, API의 Zod 검증, DB 스키마와 화면을 함께 맞춥니다.
- 스키마 변경은 [Drizzle 마이그레이션](../apps/api/drizzle)과 [마이그레이션 검사](../scripts/check-db-migration-compatibility.mjs)를 거칩니다.

저장 위치는 [아키텍처](architecture.md#데이터-저장), 실행 조건은 [배포 절차](deployment.md)에 있습니다.
