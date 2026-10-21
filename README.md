# SketchCatch

<p align="center">
  <img src="./apps/web/public/sketchcatch-logo.png" width="112" alt="SketchCatch 로고" />
</p>

클라우드 구성을 다이어그램으로 편집하고 Terraform 코드로 배포하는 서비스입니다. 요구사항을 입력해 설계 초안을 만들거나 기존 저장소와 AWS 자원을 불러올 수 있습니다. 배포 전에는 비용과 보안 위험을 확인하고 실제 변경 내용을 승인합니다.

[서비스](https://sketchcatch.net) | [제품 문서](./docs/product.md) | [개발 가이드](./docs/development.md)

`TypeScript` `Next.js` `Fastify` `Terraform` `ECS Fargate` `PostgreSQL`

![클라우드 설계를 편집하는 SketchCatch 작업 화면](./docs/assets/readme/visual-workspace.png)

## 배포 흐름

요구사항 입력부터 설계 편집과 배포 결과 확인까지 같은 프로젝트에서 진행합니다. 승인한 변경은 서비스에서 직접 실행하거나 Git Pull Request와 CI/CD로 전달합니다.

```mermaid
flowchart LR
    A["요구사항 입력<br/>텍스트, 음성, 저장소"] --> B["다이어그램 편집"]
    B --> C["Terraform 자동 생성"]
    C --> D["비용과 보안 및 설정 점검"]
    D --> E{"담당자 승인"}
    E --> F["바로 배포"]
    E --> G["Git과 CI/CD로 전달"]
    F --> H["배포 결과 확인과 자원 정리"]
    G --> H
```

## 주요 기능

### 요구사항 기반 설계

텍스트나 음성으로 필요한 구성을 설명하거나 템플릿을 선택합니다. AI가 제안한 초안에서 자원과 연결 관계를 확인하고 수정할 수 있습니다.

### 다이어그램과 Terraform 동기화

![다이어그램과 Terraform 코드 동기화 구조](./docs/assets/readme/diagram-code-sync.png)

다이어그램을 편집하면 Terraform 코드에 반영됩니다. 가져온 Terraform 코드도 다이어그램으로 변환해 편집할 수 있습니다.

### 기존 AWS 자원 조회

![기존 AWS 자원을 불러온 화면](./docs/assets/readme/reverse-board-candidates.png)

운영 중인 AWS 자원과 연결 관계를 읽어 다이어그램으로 불러옵니다. 조회 결과를 미리 확인한 뒤 필요한 설계에 적용합니다.

### 배포 검토와 실행

![배포 작업을 별도 Worker에서 실행하는 구조](./docs/assets/readme/isolated-deployment-workers.png)

예상 비용과 외부 접근 허용 여부, 권한을 배포 전에 점검합니다. 승인된 작업은 별도 Worker에서 실행하고 결과와 로그를 기록합니다.

### 기능 목록

| 기능 | 내용 |
| --- | --- |
| 설계 초안 | 자연어와 음성 요구사항, 템플릿 또는 소스 저장소를 바탕으로 생성 |
| 설계 편집 | 자원과 네트워크 연결 및 설정 확인과 수정 |
| Terraform 생성 | 설계를 Terraform 파일과 실행 계획으로 변환 |
| 배포 점검 | 예상 비용과 보안 위험 및 변경 내용 확인 |
| 배포 실행 | 승인 후 직접 실행하거나 Git Pull Request와 CI/CD로 전달 |
| 이력 관리 | 배포 상태와 로그 및 출력값 기록, 변경 이력 확인과 자원 정리 |

## 구현과 검증

![공통 그래프로 편집 내용을 맞추고 작업 번호로 ECS 실행을 다시 찾는 구조](./docs/assets/readme/implementation-summary.png)

### 설계와 코드의 변경 유지

두 편집기가 자원을 따로 저장하면 코드에서 고친 값이 다음 생성 때 지워질 수 있었습니다. 다이어그램과 Terraform이 [공통 그래프](./apps/api/src/services/terraform/infrastructure-graph.ts)를 거치게 하고 해석하지 못한 블록은 원래 코드에 보존했습니다. [왕복 변환 테스트](./apps/web/features/architecture-board-compiler/authored-terraform-round-trip.test.ts)로 수정 내용과 미지원 블록이 남는지 확인합니다.

### API 재시작 후 작업 추적

ECS 실행을 시작한 뒤 받은 식별자를 DB에 저장하기 전에 API가 종료되면 진행 중인 배포를 놓칠 수 있었습니다. [실행 요청](./apps/api/src/deployments/deployment-worker-dispatcher.ts)에 DB의 작업 번호를 넣어 기존 ECS 작업을 다시 찾도록 했습니다. 같은 배포의 진행 중인 작업은 DB에서 하나로 제한합니다. Worker는 실행 상태를 확인한 경우에만 Terraform을 실행하므로 추적 상태 복구와 배포 자동 재개는 구분합니다. [검증 자료](./.eval/README.md#배포-작업-추적)에 관련 테스트와 한계를 정리했습니다.

### 팀의 AI 작업 기준

합의한 데이터 형식과 작업 순서를 [AGENTS.md](./AGENTS.md)와 공통 문서에 남겨 각 에이전트가 같은 계약을 읽게 했습니다. [하네스 검사](./scripts/check-harness.mjs)는 검증 날짜와 명령이 없는 완료 표시를 거부합니다. 기록이 존재하는지 확인하는 검사이며 실제 테스트 실행은 각 검증 명령과 CI가 담당합니다.

### 운영 배포 측정

[보관한 GitHub Actions 기록](./.eval/deployment-build-results.json)에서 개선 전 성공 4회의 전체 실행 시간 중앙값은 470.5초였습니다. 두 이미지의 병렬 빌드와 캐시 재사용 후 warm-cache 배포 1회는 369초였습니다. 이 관측의 감소율은 약 21.6%이며 반복 실행 전체의 성능 보장을 뜻하지 않습니다. [측정 조건과 원본 링크](./.eval/README.md#운영-배포-측정)를 함께 공개했습니다.

## 인프라 아키텍처

서울 리전의 ECS Fargate에서 Web과 API를 운영합니다. 사용자 요청은 Route 53과 ALB를 거쳐 Web의 `/` 또는 API의 `/api`로 전달됩니다.

![SketchCatch의 Public Subnet ECS Fargate, Private Subnet DB와 Redis, Terraform Worker 및 배포 경로](./docs/assets/readme/system-architecture.png)

- Web과 API는 NAT Gateway 비용을 줄이기 위해 Public Subnet에 두고 ALB 요청만 받습니다.
- RDS PostgreSQL과 ElastiCache Redis는 Private Subnet에 둡니다. DB는 프로젝트와 설계 및 배포 이력을 저장하고 Redis는 배포 상태와 실시간 관측 세션을 관리합니다.
- API가 ECS RunTask로 Terraform Worker를 시작합니다. Worker는 배포할 때만 실행되며 사용자 AWS 계정의 실행 역할을 AssumeRole로 받아 Terraform을 적용합니다. Terraform 파일과 plan 및 state는 S3에 보관합니다.
- API는 OpenAI와 GitHub API를 호출합니다. Amazon Q 설계 검토는 관련 설정이 활성화된 경우에 사용하는 선택 연동입니다. 실행 로그는 CloudWatch에 남깁니다.
- GitHub Actions는 OIDC 임시 권한으로 ECR에 이미지를 올리고 ECS에 배포합니다.

현재 배포 대상은 AWS이며 Terraform을 사용합니다. 다른 클라우드도 지원할 수 있도록 설계 데이터와 클라우드별 실행 코드를 분리했습니다.

## 기술 스택

| 영역 | 기술 | 하는 일 |
| --- | --- | --- |
| 사용자 화면 | Next.js, React, TypeScript | 설계 편집과 코드 미리보기, 배포 검토와 승인 |
| API | Fastify, TypeScript | 프로젝트와 설계 관리, 배포 요청 처리와 권한 확인 |
| 데이터 | PostgreSQL, Drizzle ORM | 프로젝트 상태와 승인 기록, 배포 이력 저장 |
| 파일 보관 | Amazon S3 | Terraform 파일과 실행 계획, 상태 파일과 생성 결과물 보관 |
| 인프라 자동화 | Terraform | 설계를 인프라 코드로 변환하고 실행 |
| AI | OpenAI API, AWS Bedrock, Amazon Q | 요구사항 해석과 설계 제안, 오류 설명과 위험 검토 |
| 실행 환경 | Docker, Amazon ECS/Fargate, ALB | Web과 API 및 배포 Worker 운영, 요청 전달 |
| 자동 배포 | GitHub Actions, Amazon ECR | 코드 검증과 이미지 빌드, 서비스 배포 |
| 상태와 로그 | Redis, Amazon CloudWatch | 작업 진행 상태 전달, 로그와 지표 수집 |

## 배포 승인과 검증

AI가 제안한 설계는 사용자가 확인하고 수정합니다. 실제 배포는 코드 검증과 사용자 승인을 거친 뒤 실행합니다.

- 설계와 Terraform 코드의 구조 및 참조 관계를 검사합니다.
- 공개 저장소와 모든 주소에 열린 SSH, 외부에 공개된 DB와 과도한 권한을 점검합니다.
- 승인한 코드와 실행 계획 또는 대상 계정과 리전이 바뀌면 실행을 막습니다.
- 클라우드 자격 증명과 민감한 출력값은 화면과 응답 및 로그에서 숨깁니다.
- 실패한 작업의 상태와 로그를 남겨 복구하거나 자원을 정리할 때 확인할 수 있습니다.

## 로컬 실행

<details>
<summary>개발 환경 설정</summary>

Docker와 저장소에 지정된 pnpm 버전이 필요합니다.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/local/docker-compose.yml up -d
pnpm dev
```

기본 주소는 Web `http://localhost:3000`, API `http://localhost:4000`입니다. 환경 변수 기준은 [`.env.example`](./.env.example)에서 확인할 수 있습니다.

</details>

<details>
<summary>검증 명령</summary>

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

</details>

## 관련 문서

- [제품 범위와 로드맵](./docs/product.md)
- [시스템 아키텍처](./docs/architecture.md)
- [데이터 모델](./docs/data-models.md)
- [개발 가이드](./docs/development.md)
- [배포와 안전 정책](./docs/deployment.md)

## 팀원별 담당

| 팀원 | 주요 영역 | 핵심 기여 |
| --- | --- | --- |
| 송채강 | Frontend, Backend | 관리형 배포와 실시간 관측, 설계 보드와 저장소 연결 화면 |
| 이시원 | 팀장, Infrastructure, CI/CD, Backend | 설계와 코드 동기화, 배포 실행과 재시작 추적, AWS 운영 환경과 AI 작업 기준 정리 |
| 이경근 | Frontend, Backend, 공용 타입 | 설계 보드와 Workspace AI, 기존 자원 조회와 Terraform 및 템플릿 매핑 |
| 고윤서 | Frontend, Backend, Database | 로그인과 JWT, 회원과 프로젝트 계정 관리, 설정과 AWS 연결 화면 |
| 이정현 | Frontend, Backend, CI/CD | CI/CD 전달과 준비 상태 점검, 설정 자동화와 배포 화면, 프로젝트 초안 관리 |
