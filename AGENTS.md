# AGENTS.md

이 저장소는 SketchCatch입니다. SketchCatch는 AWS 입문자가 안전하게 AWS 실습 아키텍처를 시각적으로 설계하고, 리소스 관계와 비용/위험을 이해하도록 돕는 웹 서비스입니다.

Gemini Code Assist 관련 설정은 `.gemini/config.yaml`과 `.gemini/styleguide.md`에 둡니다.

## 에이전트 작업 규칙

1. 명시적으로 요청받기 전까지 실제 AWS 배포를 구현하지 않습니다.
2. Secret, 실제 클라우드 자격 증명, `.env` 파일을 커밋하지 않습니다.
3. 프론트엔드 코드는 `apps/web`에 둡니다.
4. 백엔드 코드는 `apps/api`에 둡니다.
5. 공유 타입은 `packages/types`에 둡니다.
6. 공유 UI는 `packages/ui`에 둡니다.
7. 향후 Terraform 로직을 UI 컴포넌트에 섞지 않습니다.
8. 향후 AWS SDK 로직을 프론트엔드 컴포넌트에서 직접 호출하지 않습니다.
9. AWS 초보자를 위한 안전한 학습 흐름과 비용 사고 방지를 우선합니다.
10. 명령이 실패하면 통과한 척하지 말고 실패 내용을 명확히 보고합니다.

## 마무리 전 필수 확인

작업을 마치기 전에 다음 명령을 실행합니다.

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Git 컨벤션

### Commit Convention

커밋 메시지는 다음 형식을 사용합니다.

```text
Type: 작업 내용
```

허용되는 커밋 타입은 다음과 같습니다.

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
Feat: 로그인 기능 구현
Fix: 토큰 만료 오류 수정
Refactor: UserService 구조 개선
Docs: README 수정
Init: 프로젝트 초기 환경 설정
```

### Branch Convention

브랜치는 이슈 단위로 생성합니다.

```text
{type}/{name}/{issue-number}-{task-name}
```

예시:

```text
feature/sw/12-login
fix/jh/21-token-error
refactor/ck/30-user-service
docs/ys/35-readme
chore/jh/40-eslint-config
```

브랜치 타입은 다음과 같습니다.

- `feature`: 기능 개발
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `docs`: 문서 수정
- `chore`: 기타 작업
- `hotfix`: main 긴급 수정

### Git Flow

기본 브랜치 흐름은 다음과 같습니다.

```text
main
└─ dev
   ├─ feature/12-login
   └─ fix/21-token-error
```

규칙:

1. `main`, `dev`에는 직접 push하지 않습니다.
2. 모든 작업은 이슈 생성 후 브랜치를 생성합니다.
3. 작업 브랜치는 `dev`에서 분기합니다.
4. 작업 완료 후 `dev`로 PR을 생성합니다.
5. 배포 시 `dev`에서 `main`으로 PR을 생성합니다.

작업 시작 예시:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/12-login
```

작업 업로드 예시:

```bash
git add .
git commit -m "Feat: 로그인 기능 구현"
git push origin feature/12-login
```

### PR Convention

PR 제목 형식:

```text
[Feat] #12 로그인 기능 구현
[Fix] #21 토큰 만료 오류 수정
```

PR 본문 형식:

```markdown
## 작업 내용

- 로그인 기능 구현

## 변경 사항

- Auth API 추가
- Login 페이지 추가

## 테스트

- [x] 로컬 테스트 완료
- [x] API 테스트 완료

## 참고 사항

- 없음
```

### Issue Convention

이슈 제목 형식:

```text
Feat: 로그인 기능 구현
Fix: 토큰 만료 오류 수정
```

기능 이슈 본문:

```markdown
## 작업 내용

- 로그인 기능을 구현한다.

## 완료 조건

- [ ] 로그인 API 연동
- [ ] 로그인 성공 시 토큰 저장
- [ ] 로그인 실패 시 에러 메시지 출력

## 참고 사항

- 없음
```

버그 이슈 본문:

```markdown
## 문제

로그인 시 토큰이 저장되지 않음

## 원인

토큰 저장 로직 누락

## 해결 방향

로그인 성공 후 localStorage에 토큰 저장

## 영향 범위

- 로그인
- 인증 처리
```

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

## 최종 운영 규칙

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
