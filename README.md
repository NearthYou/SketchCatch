# SketchCatch

SketchCatch는 AWS 입문자가 실습용 아키텍처를 시각적으로 설계하고, 리소스 관계를 이해하고, 예상 비용과 위험을 확인한 뒤, 승인된 실습 환경만 안전하게 다룰 수 있도록 돕는 웹 서비스입니다.

현재 저장소는 초기 인프라와 개발 기반을 잡는 단계입니다. Terraform 실행, AI 생성, 인증, 운영 기능 워크플로는 아직 실제 제품 기능으로 구현하지 않았습니다.

## 기술 스택

- pnpm workspace
- Turborepo
- TypeScript
- `apps/web`: Next.js, React, TypeScript
- `apps/api`: Node.js, TypeScript
- `packages/*`: 공유 패키지
- 로컬 PostgreSQL용 Docker Compose
- ESLint, Prettier
- GitHub Actions CI

## 저장소 구조

```text
sketchcatch/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── ui/
│   ├── types/
│   └── config/
├── infra/
│   └── local/
├── docs/
├── examples/
│   └── terraform/
└── .github/
    └── workflows/
```

## 빠른 시작

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

로컬 PostgreSQL 실행:

```bash
docker compose -f infra/local/docker-compose.yml up -d
```

## 운영 배포

운영 배포는 EC2, RDS, S3, GitHub Actions, AWS Systems Manager, Docker, Nginx 컨테이너를 사용합니다. 운영 배포에는 Docker Compose를 사용하지 않습니다.

자세한 내용은 [배포 운영 문서](docs/deployment.md)를 봅니다.

## 문서

문서는 [docs/README.md](docs/README.md)부터 보면 됩니다. 평소 읽을 문서는 아래로 줄였습니다.

- [제품 방향](docs/product.md)
- [아키텍처](docs/architecture.md)
- [데이터 모델](docs/data-models.md)
- [개발 가이드](docs/development.md)
- [배포 운영 문서](docs/deployment.md)

## 루트 스크립트

- `pnpm dev`: Turborepo로 개발 서버 실행
- `pnpm build`: 전체 앱과 패키지 빌드
- `pnpm lint`: 전체 앱과 패키지 린트
- `pnpm typecheck`: 전체 앱과 패키지 타입 체크
- `pnpm test`: 테스트 실행
- `pnpm format`: Prettier로 저장소 포맷
- `pnpm docker:build`: Docker Compose 없이 운영용 Docker image 로컬 빌드
