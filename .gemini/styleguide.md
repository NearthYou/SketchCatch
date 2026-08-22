# Gemini Code Assist 스타일가이드

이 문서는 Gemini Code Assist가 SketchCatch 저장소에서 작업할 때 따라야 하는 기준입니다.

## 응답 원칙

1. 모든 설명, 리뷰, 요약, PR/Issue 초안은 한글로만 작성합니다.
2. 코드, 명령어, 파일명, 패키지명, API 이름처럼 원문 표기가 필요한 경우에만 영어를 사용합니다.
3. 사용자가 명시적으로 다른 언어를 요청하지 않는 한 한글 응답 원칙을 유지합니다.
4. 실패한 명령은 통과한 것처럼 말하지 말고 실패 원인과 다음 조치를 명확히 보고합니다.

## 프로젝트 원칙

1. 이 저장소는 SketchCatch입니다.
2. SketchCatch는 multi-cloud-ready IaC operations service입니다.
3. Terraform은 MVP의 primary IaC이며 AWS는 첫 Provider Adapter입니다. Domain model을 AWS 전용으로 만들지 않습니다.
4. 제품 흐름은 Requirement Input, Source Repository 또는 Reverse Engineering에서 Architecture Board, IaC Preview, deployment check와 승인된 실행으로 이어집니다.
5. managed deployment와 CI/CD delivery를 모두 지원합니다.
6. AI와 자동화는 제안, 설명과 검토를 담당합니다. Board 저장, Terraform handoff, Git 변경과 cloud mutation은 User-Accepted Change를 요구합니다.
7. Redis는 내부 Runtime Cache이며 사용자 infrastructure resource로 설명하지 않습니다.
8. Secret, 실제 cloud credential과 `.env` 파일을 commit하지 않습니다.

## 코드 위치 규칙

1. 프론트엔드 코드는 `apps/web`에 작성합니다.
2. 백엔드 코드는 `apps/api`에 작성합니다.
3. 공유 타입은 `packages/types`에 작성합니다.
4. 공유 UI는 `packages/ui`에 작성합니다.
5. 공유 설정은 `packages/config`에 작성합니다.
6. Terraform 관련 로직은 UI 컴포넌트에 섞지 않습니다.
7. AWS SDK 로직은 프론트엔드 컴포넌트에서 직접 호출하지 않습니다.

## 코드 컨벤션

### 공통

1. 변수명과 함수명은 의미가 드러나게 작성합니다.
2. 불필요한 주석을 작성하지 않습니다.
3. 중복 코드는 함수로 분리합니다.
4. 사용하지 않는 코드는 삭제합니다.
5. ESLint와 Prettier를 적용합니다.

### Frontend

- 컴포넌트명은 `PascalCase`를 사용합니다.
- 변수명과 함수명은 `camelCase`를 사용합니다.
- 파일명은 `PascalCase` 또는 `kebab-case` 중 하나로 통일합니다.

### Backend

- API, Service, Repository 역할을 분리합니다.
- 에러 응답 형식을 통일합니다.
- 환경변수는 `.env`를 사용합니다.
- Secret Key는 코드에 직접 작성하지 않습니다.

## Git 컨벤션

커밋 메시지는 다음 형식을 사용합니다.

```text
Type: 작업 내용
```

허용 타입:

- `Feat`: 새로운 기능 추가
- `Fix`: 버그 수정
- `Refactor`: 코드 리팩토링
- `Style`: 코드 스타일 수정
- `Docs`: 문서 수정
- `Chore`: 기타 작업
- `Remove`: 파일 삭제
- `Init`: 프로젝트 초기 설정

예시:

```text
Init: 프로젝트 초기 환경 설정
Feat: 로그인 기능 구현
Fix: 토큰 만료 오류 수정
```

기본 운영 흐름:

```text
Issue 생성
→ Branch 생성
→ 작업
→ Commit
→ Push
→ PR 생성
→ Review
→ dev Merge
→ main Merge
```

원칙적으로 `main`, `dev`에는 직접 push하지 않습니다. 모든 작업은 이슈 생성 후 `dev`에서 작업 브랜치를 분기하고, PR로 병합합니다.

## 마무리 전 확인

작업을 마치기 전에 다음 명령을 실행합니다.

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm build
```

## Code Review Rules

1. When new commits are added to the same PR, run code review again instead of reusing only the previous review result.
2. During re-review, inspect the new commit diff and the full PR context for regressions, missing tests, and whether prior review feedback was addressed.
3. Clearly verify which previous review comments were resolved by the new commits, and raise unresolved items again.
