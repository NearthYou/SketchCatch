# SketchCatch

SketchCatch는 클라우드 아키텍처를 시각적으로 설계하고, 리소스 관계를 이해하고, 예상 비용과 위험을 확인한 뒤, 배포까지 도와주는 웹 서비스입니다.

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
