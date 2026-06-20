# AGENTS.md

This repository is SketchCatch.

SketchCatch is a web service for safe AWS learning. It helps AWS beginners visually design practice architectures, understand resource relationships, estimate cost and risk, and eventually deploy only approved practice environments with automatic cleanup.

## Agent Rules

1. Do not implement real AWS deployment unless the user explicitly asks for it.
2. Do not commit secrets, `.env` files, private keys, real AWS credentials, or real DB passwords.
3. Keep frontend code in `apps/web`.
4. Keep backend code in `apps/api`.
5. Keep shared types in `packages/types`.
6. Keep shared UI in `packages/ui`.
7. Do not mix future Terraform or CloudFormation generation logic into UI components.
8. Do not call future AWS SDK logic directly from frontend components.
9. Prefer safe AWS learning workflows and cost-accident prevention for beginners.
10. If a command fails, report the failure clearly instead of pretending it passed.
11. Production deployment uses Docker, but does not use Docker Compose.
12. Production deployment is based on EC2, S3 release artifacts, RDS, GitHub Actions, SSM Run Command, `docker run`, and Nginx.
13. Store project data and architecture JSON in RDS. Store diagram images, IaC files, and export artifacts in S3.

## Required Checks Before Finishing

Run these before finishing code or infrastructure changes:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

If local `pnpm` is not available, use the repository package manager version through Corepack or npm:

```bash
corepack pnpm lint
npm exec --package=pnpm@11.8.0 -- pnpm lint
```

## Git Convention

### Commit Convention

Use this format:

```text
Type: 작업 내용
```

Allowed commit types:

- `Feat`: 새로운 기능 추가
- `Fix`: 버그 수정
- `Refactor`: 코드 리팩토링
- `Style`: 코드 스타일 수정
- `Docs`: 문서 수정
- `Chore`: 기타 작업
- `Remove`: 파일 삭제
- `Init`: 프로젝트 초기 설정

Examples:

```text
Feat: 로그인 기능 구현
Fix: 토큰 만료 오류 수정
Refactor: UserService 구조 개선
Docs: README 수정
Init: 프로젝트 초기 환경 설정
```

### Branch Convention

Branches are created per issue.

```text
{type}/{name}/{issue-number}-{task-name}
```

Examples:

```text
feature/sw/12-login
fix/jh/21-token-error
refactor/ck/30-user-service
docs/ys/35-readme
chore/jh/40-eslint-config
```

Branch types:

- `feature`: 기능 개발
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `docs`: 문서 수정
- `chore`: 기타 작업
- `hotfix`: main 긴급 수정

### Git Flow

Default branch flow:

```text
main
└─ dev
   ├─ feature/{name}/{issue}-{task}
   ├─ fix/{name}/{issue}-{task}
   ├─ docs/{name}/{issue}-{task}
   └─ chore/{name}/{issue}-{task}
```

Rules:

1. Do not push directly to `main`.
2. Do not push directly to `dev` except for one-time repository administration or explicit user approval.
3. Start all normal work from `dev`.
4. Open feature/fix/docs/chore PRs into `dev`.
5. Promote `dev` to `main` through a PR for releases.
6. Keep PRs small enough to review.
7. Run lint, typecheck, and build before asking for review.

Start work:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/sw/12-login
```

Upload work:

```bash
git add .
git commit -m "Feat: 로그인 기능 구현"
git push origin feature/sw/12-login
```

### PR Convention

PR title format:

```text
[Feat] #12 로그인 기능 구현
[Fix] #21 토큰 만료 오류 수정
[Docs] #35 README 수정
```

PRs must include:

- 작업 내용
- 변경 사항
- 테스트 결과
- 참고 사항

### Issue Convention

Issue title format:

```text
Feat: 로그인 기능 구현
Fix: 토큰 만료 오류 수정
Docs: README 수정
```

Create an issue before starting normal development work.

## Code Convention

### Common

1. Use meaningful variable and function names.
2. Avoid unnecessary comments.
3. Extract duplicated code into functions or modules.
4. Remove unused code.
5. Apply ESLint and Prettier.

### Frontend

- Component names use `PascalCase`.
- Variables and functions use `camelCase`.
- Keep frontend code in `apps/web`.

### Backend

- Separate API, service, and repository responsibilities when the module grows.
- Keep error response formats consistent.
- Use environment variables for runtime configuration.
- Never hardcode secret keys.
