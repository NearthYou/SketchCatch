# Repository Analysis UI 재구축 전 정리 기준선

## 목적

`/workspace/repository`의 기존 결과 화면 표현을 제거했다. 이 변경은 새 UI 구현이 아니라, 다음 UI가 기능 계약 위에서 다시 시작할 수 있게 하는 정리 단계다.

## 확인한 기준

- `DESIGN.md`의 실제 제품 화면 원칙을 확인했다. 이번 단계는 의도적으로 스타일 없는 semantic HTML만 남긴다.
- `AGENTS.md`, `apps/web/AGENTS.md`, `CONTEXT.md`와 Repository Analysis 관련 문서를 읽었다.
- `AGENTS.gg.md`는 현재 브랜치에 없다.

## 남긴 semantic HTML

분석 전에는 다음을 유지한다.

- `main`과 단일 `h1`
- Repository URL, branch의 `label`/`input` 연결
- `form` submit과 키보드 submit
- loading `status`, 오류 `alert`

분석 완료 뒤에는 다음을 유지한다.

- 분석 결과를 담는 semantic `section`
- Template 선택 native `select`
- 기존 보드 생성 버튼
- AI 새 설계 링크
- 재시도, GitHub 연결, 권한 확인, Repository 분석/추천 갱신 동작

## 유지한 기능 계약

- Repository URL/branch 분석 API와 public/private Repository 처리
- loading, success, error, retry의 기존 요청 상태
- GitHub App 연결, installation 권한 확인, 분석 복귀 상태
- Repository Analysis 응답과 Template 추천 결과의 ID, 순서, 적합도
- Template 선택 뒤 `buildBoardTemplateDiagram`을 사용하는 기존 보드 생성
- Project Draft revision 저장, Repository Analysis Record 저장/재시도, workspace navigation
- AI 새 설계 진입과 auth/session 처리

## 제거한 표현 계층

- `repository-start.module.css`
- `repository-architecture-preview.tsx`
- `repository-architecture-preview.module.css`
- 상단 brand/header, 카드, grid, Preview, 후보 카드 목록, 긴 추천 설명, 아이콘 wrapper, 전체 폭 action 배치
- `RepositoryArchitecturePreview`, `createRepositoryPreviewDiagram`, `RepositoryCiCdConnectedState`, `RepositoryTemplateCandidates`
- 해당 화면의 CSS Module selector와 과거 화면 위치/className을 전제로 한 테스트 기대값

## 새 UI에서 되살리지 않을 것

- 기존 후보 카드와 점수/이유/고려사항의 장문 조합
- 기존 Preview panel과 Template 다이어그램 미리보기
- 기존 결과 카드/grid/전용 CSS wrapper
- 숨겨진 legacy DOM, backup component, feature flag 뒤의 과거 화면

## 검증 기록

- `pnpm --filter @sketchcatch/web exec tsx --test app/workspace/repository/repository-start-client.test.ts` 통과: 12개
- Repository Analysis, 추천, handoff 관련 focused test 통과: 36개
- `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 통과
- `git diff --check` 통과
- `pnpm --filter @sketchcatch/web test`는 이 변경 파일 밖의 기존 시각 테스트 8개가 실패한다. Repository 관련 test는 통과한다.
- `pnpm test`는 위 Web 시각 테스트와 API의 기존 route/Amazon Q fixture 실패 때문에 통과하지 않는다. 이번 변경은 API 파일이나 해당 Web 화면 파일을 수정하지 않았다.

브라우저는 별도 개발 서버 `127.0.0.1:3012`에서 route 진입, 로그인 세션, 콘솔 오류, 초기 수평 overflow를 확인했다. 실제 Repository 분석 성공/실패/재시도는 이 서버의 API 상태가 재현 가능한 고정 fixture가 아니어서 브라우저에서 끝까지 실행하지 않았다. 해당 계약은 focused test로 확인한다.

이 기준선은 새 Repository 결과 UI를 만들 때 과거 카드·Preview·전용 CSS를 되살리지 않기 위한 기록이다.
