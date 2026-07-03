# SketchCatch

**요구사항을 클라우드 아키텍처와 Terraform 실행 흐름으로 연결하는 IaC 운영 서비스**

SketchCatch는 사용자가 텍스트나 음성으로 인프라 요구사항을 입력하면, 이를 Practice Architecture로 구조화하고 Terraform IaC Preview, 사전 점검, 배포 승인, 배포 이력 관리까지 이어주는 웹 서비스입니다.

MVP는 AWS와 Terraform을 우선 지원하지만, 내부 모델은 provider-neutral 구조로 설계해 다른 cloud provider와 IaC target으로 확장할 수 있도록 만들었습니다.

## Demo Flow

```text
요구사항 입력
-> AI 아키텍처 초안 생성
-> Architecture Board 편집
-> Terraform IaC Preview 생성
-> Pre-Deployment Check
-> 사용자 승인
-> Direct Deployment 또는 Git/CI/CD Handoff
-> Deployment History / Cleanup
```

## 주요 기능

- 텍스트 기반 인프라 요구사항 입력
- Voice Requirement Input을 위한 음성 요구사항 처리 흐름
- AI 기반 Practice Architecture 초안 생성
- 시각적 Architecture Board와 리소스 관계 편집
- Diagram JSON과 Terraform 코드 간 변환
- Terraform validation과 preview 설명
- 배포 전 비용, 보안, 설정 점검
- AWS Role 연결 및 CloudFormation Quick Create 템플릿 제공
- Terraform plan/apply/destroy 기반 Direct Deployment
- 배포 로그, Terraform output, deployed resource 이력 관리
- 배포 실패 또는 실습 종료 후 cleanup 흐름

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Backend | Node.js, Fastify, TypeScript |
| Database | PostgreSQL, Drizzle |
| Infra / Cloud | AWS EC2, S3, RDS, SSM, IAM |
| IaC | Terraform |
| AI | OpenAI API, AWS Bedrock, Amazon Q Assistance 확장 구조 |
| DevOps | Docker, Nginx, GitHub Actions, pnpm workspace, Turborepo |

## 아키텍처

```text
apps/web
  Next.js web client
  Architecture Board, workspace UI, auth UI

apps/api
  Fastify API server
  auth, projects, architecture, Terraform, deployment routes

packages/types
  shared domain types and API contracts

packages/ui
  shared presentation components

infra / deploy / docker
  local DB, AWS templates, Docker images, EC2 deployment scripts
```

## 팀 프로젝트에서 집중한 부분

- 프론트엔드와 백엔드가 같은 domain type을 공유하도록 `packages/types`를 구성
- Terraform 실행 로직을 UI에서 분리하고 API 배포 계층 뒤에 배치
- 실제 cloud mutation은 plan, 승인, 로그, secret masking, cleanup safeguard를 거치도록 설계
- AWS-first MVP를 만들되 AWS-only 제품처럼 굳지 않도록 Provider Adapter 개념 유지
- public repo에서 secret, account-specific value, private credential이 노출되지 않도록 환경변수와 GitHub Secrets로 분리

## 로컬 실행

```bash
pnpm install
cp .env.example .env
docker compose -f infra/local/docker-compose.yml up -d
pnpm dev
```

기본 주소:

```text
Web: http://localhost:3000
API: http://localhost:4000
Health: http://localhost:4000/health
```

개별 실행:

```bash
pnpm --filter @sketchcatch/web dev
pnpm --filter @sketchcatch/api dev
```

## 환경 변수

환경 변수 예시는 [.env.example](./.env.example)에 있습니다.

실제 `.env` 파일, OAuth secret, OpenAI API key, AWS credential, DB password는 커밋하지 않습니다. 운영 값은 GitHub Actions `production` environment variables와 secrets에 저장합니다.

## 주요 명령어

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Docker image 로컬 빌드:

```bash
pnpm docker:build
```

## 배포 구조

운영 배포는 GitHub Actions에서 Docker image를 빌드한 뒤 S3 release artifact로 업로드하고, AWS SSM Run Command를 통해 EC2에서 container를 교체하는 방식으로 구성했습니다.

```text
GitHub Actions
-> lint / typecheck / build
-> Docker image build
-> S3 release artifact upload
-> SSM Run Command
-> EC2 docker run
-> API / Web / Nginx container restart
```

운영 환경에서는 Docker Compose를 사용하지 않고, EC2에서 `docker run`으로 API, Web, Nginx container를 실행합니다.

## 문서

- [제품 방향](./docs/product.md)
- [데이터 모델](./docs/data-models.md)
- [아키텍처](./docs/architecture.md)
- [개발 가이드](./docs/development.md)
- [배포 운영 문서](./docs/deployment.md)
