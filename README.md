# SketchCatch

클라우드 구성을 다이어그램과 Terraform 코드로 편집하고 AWS에 배포하는 서비스입니다. 자연어 요구사항으로 설계 초안을 만들거나 기존 저장소와 AWS 자원을 불러와 시작할 수 있습니다.

`TypeScript` `Next.js` `Fastify` `Terraform` `ECS Fargate` `PostgreSQL`

![SketchCatch Architecture Board](https://velog.velcdn.com/images/nearthyou/post/b1c9881e-7581-46d7-b080-71c143d80053/image.png)

다이어그램과 Terraform 코드에서 같은 구성을 수정할 수 있습니다. Terraform Plan으로 변경 내용을 확인한 뒤 승인한 계획을 Apply합니다.

현재 연동과 배포를 검증한 대상은 AWS입니다. Azure와 GCP는 추후 지원할 계획입니다.

## 작업 흐름

| 단계 | 사용자가 하는 일 | SketchCatch가 하는 일 |
| --- | --- | --- |
| 1. 시작 | AI, 저장소, ReverseEngineering, 템플릿 중 하나를 선택 | 입력을 분석해 설계 후보와 근거 제시 |
| 2. 설계 | Board와 Terraform을 검토하고 수정 | 두 형식의 리소스와 참조 관계를 동기화 |
| 3. 검증 | 비용, 보안, 설정과 Plan의 변경 범위를 확인 | 규칙 기반 검사와 Terraform Plan 실행 |
| 4. 배포 | Apply 또는 Git과 CI/CD 전달을 승인 | Terraform Worker 실행, 상태와 결과 파일 저장 |
| 5. 운영 | 배포 이력과 실시간 트래픽 관측 확인 | 실행 상태, 로그와 운영 지표 수집 |

## 설계 입력

| 시작 방식 | 입력 | 결과 |
| --- | --- | --- |
| AI | 사용자 수와 접근 범위, 데이터 저장 방식과 예산 등 필요한 조건 입력 | 아키텍처 초안 생성 |
| GitHub Repository | 고정된 commit SHA의 제한된 파일 | 파일별 근거가 있는 배포 구성 추천 |
| Reverse Engineering | 검증된 AWS 연결, Region과 리소스 종류 | 새 자산, 변경 자산과 중복 가능성을 구분한 Board 후보 |
| Template | 검토된 반복 구조와 기본값 | 이름과 참조를 다시 매핑한 재사용 구성 |

저장소 분석은 `package.json`과 Dockerfile, 배포 설정을 정적으로 읽습니다. 근거가 부족하거나 후보가 여러 개면 사용자가 선택합니다.

기존 AWS 자원은 조회 결과를 미리 보여 줍니다. 사용자가 변경 내용과 확인할 항목을 검토한 뒤 Board에 추가합니다.

## 핵심 설계

| 문제 | 설계 선택 | 지키려는 기준 |
| --- | --- | --- |
| Board와 Terraform을 모두 수정할 수 있음 | 두 형식 사이에 `InfrastructureGraph`를 두고 양방향 변환 | 화면과 실제 배포 값의 일치 |
| Terraform 실행 중 API가 재시작될 수 있음 | ECS RunTask 기반 일회성 Terraform Worker와 RDS lease 사용 | 실행 상태 복구와 중복 Apply 방지 |
| 사용자 AWS 계정에 연결해야 함 | CloudFormation Quick Create, External ID, STS AssumeRole 사용 | 장기 Access Key를 저장하지 않는 연결 |
| AI 결과가 운영 변경으로 이어짐 | AI 제안, 결정론적 검사, 사용자 승인을 분리 | 근거와 변경 범위를 확인한 뒤 실행 |

지원하지 않는 자원은 Board에 추가하지 않습니다. 기존 값과 Terraform 원문은 유지하고 해석하지 못한 내용을 알려 줍니다.

API가 Terraform Worker의 Task ARN을 저장하기 전에 종료돼도 Job ID가 담긴 `startedBy`로 기존 ECS Task를 다시 찾습니다. 승인한 artifact, tfplan hash, AWS account와 Region이 현재 실행 대상과 다르면 Apply를 막습니다.

## 검증 기록

| 검증 대상 | 결과 | 측정 범위 |
| --- | --- | --- |
| Board와 Terraform 동기화 | 관련 테스트 111개 통과 | 그래프 생성, HCL 렌더링, 역동기화와 실패 처리 |
| Terraform Worker 복구 | 관련 시나리오 25개 통과 | dispatch 실패, API 재시작, ECS 조회 지연, 취소와 중복 실행 |
| 운영 배포 시간 | 7분 51초에서 6분 9초 | 최근 성공 4회 중앙값과 같은 commit의 warm cache 조건 비교, 21.7% 감소 |
| Live Observation 503 | Redis ingress 2개로 복구 | 무관한 `5 add, 7 change, 2 destroy` 제외, 예상한 404와 후속 Plan `No changes` 확인 |

## 운영 아키텍처

![SketchCatch 운영 아키텍처](./assets/sketchcatch-production-architecture.png)

서울 리전에서 Web과 API를 ECS Fargate 서비스로 운영합니다. Terraform은 배포할 때만 실행하는 별도 Worker가 처리합니다.

- Route 53과 ACM이 도메인과 TLS를 담당하고, public ALB가 기본 요청은 Web으로, `/api`, `/health` 요청은 API로 직접 라우팅합니다.
- Web과 API는 ECS/Fargate 서비스로 실행됩니다. Terraform Worker는 상시 서비스가 아니라 API가 필요할 때 ECS RunTask로 실행하는 일회성 Task입니다.
- 현재 NAT Gateway를 사용하지 않는 구성이라 Web, API와 Worker Task는 public subnet과 public IP를 사용합니다. 외부 요청은 ALB를 통해서만 서비스로 전달되고 Worker에는 inbound rule이 없습니다.
- RDS PostgreSQL과 ElastiCache Redis는 private subnet의 데이터 계층입니다. S3는 Terraform, export와 배포 artifact를 저장하고 ECR은 API와 Web container image를 저장합니다.
- GitHub Actions는 OIDC와 STS로 배포 역할을 위임받아 image와 ECS revision을 배포합니다. API와 Worker는 External ID를 포함한 STS AssumeRole로 사용자 AWS 계정의 SketchCatch Execution Role에 접근합니다.

## 기술 스택

| 영역 | 기술과 역할 |
| --- | --- |
| Web | Next.js, React, TypeScript, ECS/Fargate |
| API | Fastify, TypeScript, ECS/Fargate |
| Terraform Worker | ECS RunTask 기반 일회성 Task |
| 데이터 | RDS PostgreSQL, S3 파일 저장, ElastiCache Redis 상태 캐시 |
| Edge | ALB, Route 53, ACM |
| CI/CD | Docker, ECR, GitHub Actions OIDC/STS |
| AI | OpenAI API, Bedrock, Amazon Q, Amazon Transcribe |

초기 EC2, SSM, Nginx 배포 경로는 종료했습니다. 현재 ALB가 Web과 API의 ECS 서비스를 직접 라우팅합니다.

## 로컬 실행

Docker와 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/local/docker-compose.yml up -d
pnpm dev
```

Web은 `http://localhost:3000`, API는 `http://localhost:4000`에서 실행됩니다. 필요한 환경 변수는 [`.env.example`](./.env.example)에서 확인할 수 있습니다.

## 검증 명령

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## 관련 문서

- [6분 47초 최종 발표 영상](https://www.youtube.com/watch?v=a18RZGg8PyM)
- [제품 방향](./docs/product.md)
- [아키텍처](./docs/architecture.md)
- [데이터 모델](./docs/data-models.md)
- [개발 가이드](./docs/development.md)
- [배포 운영](./docs/deployment.md)
- [Terraform 운영 구조](./infra/aws/terraform/README.md)
