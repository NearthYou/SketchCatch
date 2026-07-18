# SketchCatch

> 자연어 요구사항을 검토 가능한 클라우드 아키텍처와 Terraform 실행 계획으로 바꾸는 IaC 운영 서비스

인프라 요청은 보통 말이나 문서로 시작합니다. 실제 배포까지 가려면 리소스 관계를 정리하고 IaC를 작성한 뒤 비용과 보안 설정을 확인해야 합니다. SketchCatch는 이 과정을 하나의 승인 흐름으로 연결합니다.

MVP는 AWS와 Terraform을 먼저 지원합니다. 도메인 모델은 특정 클라우드에 묶이지 않도록 provider-neutral 구조로 설계했습니다.

## 해결 흐름

```text
텍스트·음성 요구사항
→ AI 아키텍처 초안
→ Architecture Board 검토·수정
→ Terraform Preview
→ Pre-Deployment Check
→ 사용자 승인
→ 직접 배포 또는 Git/CI/CD 전달
→ 배포 이력 확인·정리
```

## AI와 배포 권한을 나눈 기준

| 구분 | 맡긴 일 |
| --- | --- |
| AI | 요구사항 해석, 아키텍처 초안, IaC 설명, 위험 후보 제안 |
| 검증 로직 | graph 유효성 검사, 지원 리소스 확인, Terraform 검증, 배포 전 규칙 점검 |
| 사용자 | 아키텍처 확정, 배포 승인, `apply`·`destroy` 실행 결정 |

AI의 답변이 바로 배포 명령이 되지는 않습니다. 구조화된 결과와 재현 가능한 검증을 통과한 뒤 사용자가 승인해야 실제 변경이 일어납니다.

## AI와 결정론적 검증의 경계

AI는 요구사항 해석, 추천, 설명, 검토를 보조합니다. 배포 가능한 구조와 실행 판단은 재현 가능한 project data, graph validation, Terraform generator, rule engine, 사용자 승인 기록을 기준으로 합니다.

| 경계 | 현재 상태 | 근거 |
| --- | --- | --- |
| Infrastructure Graph validation | Implemented | deterministic graph validator와 테스트 |
| Terraform High finding 탐지 | Implemented | public S3/SSH/RDS, IAM wildcard scanner tests |
| High finding의 Plan 기록·표시 | Implemented | Deployment Safety Gate summary |
| High severity만으로 Plan 승인 자동 차단 | Planned | 현재 summary는 `blocked: false`; 사용자가 finding을 검토한 뒤 승인 가능 |
| 승인 없는 Terraform apply 차단 | Implemented | approval/apply service boundary |

현재 정책의 상세 기준은 [`docs/deployment.md`](docs/deployment.md)와 [ADR 0001](docs/adr/0001-ai-assists-deterministic-architecture-flow.md)을 따릅니다.

## 핵심 기능

- 자연어 요구사항을 리소스와 관계가 있는 Architecture Draft로 변환
- Architecture Board에서 초안을 직접 검토하고 수정
- Diagram JSON을 Terraform Preview로 변환
- 배포 전 비용·보안·설정 위험 확인
- 승인 후 Terraform `plan`, `apply`, `destroy` 실행
- 로그와 Terraform output, 배포 리소스 이력 관리
- Direct Deployment와 Git/CI/CD Handoff 지원

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| Web | Next.js, React, TypeScript |
| API | Fastify, TypeScript |
| Data | PostgreSQL, Drizzle |
| IaC / Cloud | Terraform, AWS |
| AI | OpenAI API, AWS Bedrock, Amazon Q 연동 구조 |
| Operations | Docker, Nginx, GitHub Actions, S3, SSM |

`apps/web`과 `apps/api`는 `packages/types`의 도메인 계약을 공유합니다. Terraform 실행은 UI에서 분리해 API의 배포 계층 뒤에 두었습니다.

## 로컬 실행

Docker와 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env
docker compose -f infra/local/docker-compose.yml up -d
pnpm dev
```

기본 주소는 Web `http://localhost:3000`, API `http://localhost:4000`입니다. 환경 변수와 비밀정보 관리 기준은 [`.env.example`](./.env.example)에서 확인할 수 있습니다.

## 검증

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

## 문서

- [제품 방향](./docs/product.md)
- [아키텍처](./docs/architecture.md)
- [데이터 모델](./docs/data-models.md)
- [개발 가이드](./docs/development.md)
- [배포 운영](./docs/deployment.md)
