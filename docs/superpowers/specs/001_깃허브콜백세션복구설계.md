# GitHub callback 세션 복구 설계

## 목표

GitHub App 설치를 마치고 SketchCatch callback으로 돌아왔을 때 메모리 access token이 사라져도 저장된 refresh session으로 인증을 먼저 복구하고 Repository 선택을 계속한다. refresh session을 복구할 수 없으면 안전한 내부 `returnTo`를 포함해 로그인으로 이동하고, 로그인 완료 후 같은 callback을 다시 연다.

## 범위

- GitHub App callback의 인증 대기와 Repository 목록 요청 순서를 보장한다.
- refresh API가 반환한 실제 인증 오류를 최초 보호 API의 일반 401로 덮어쓰지 않는다.
- callback 인증 실패 시 기존 로그인 화면과 `getSafeReturnPath`를 이용해 로그인 후 callback으로 복귀한다.
- 외부 redirect를 포함한 세션 복구 흐름을 회귀 테스트로 고정한다.
- refresh token 저장 방식, API DTO, DB schema, GitHub App 권한 모델은 변경하지 않는다.

## 컴포넌트와 책임

### `AuthProvider`

기존 `loading | authenticated | unauthenticated` 상태를 인증 복구 완료 여부의 단일 기준으로 유지한다. callback은 이 상태가 `loading`인 동안 Repository API를 호출하지 않는다.

### GitHub callback page

`useAuth()` 상태를 읽는다. `authenticated`일 때만 `installation-repositories`를 호출한다. `unauthenticated`이면 현재 callback의 path와 query를 `returnTo`로 인코딩해 `/login`으로 이동한다. effect 재실행이나 React Strict Mode에서도 같은 Repository 요청을 중복 실행하지 않도록 한 번의 활성 요청만 유지한다.

### API client refresh

refresh가 400 또는 401이면 메모리 session은 지우되 refresh 응답의 `ApiClientError`를 보존해 호출자에게 전달한다. 보호 API의 최초 401은 refresh 실패 원인을 덮어쓰지 않는다. 동시에 발생한 refresh 요청은 기존 `refreshSessionPromise`로 계속 하나로 합친다.

### Login

이미 구현된 `getSafeReturnPath`와 `returnTo` 처리를 재사용한다. 새로운 외부 URL 허용 규칙이나 별도 callback 전용 로그인 화면은 추가하지 않는다.

## 데이터 흐름

1. GitHub가 `/integrations/github/callback`으로 이동한다.
2. 새 문서에서 메모리 access token은 비어 있고 `AuthProvider`가 refresh session 복구를 시도한다.
3. callback은 인증 상태가 `loading`인 동안 대기한다.
4. 복구 성공 시 Repository 목록을 요청하고 선택 화면을 표시한다.
5. 복구 실패 시 callback 전체 내부 경로를 `returnTo`로 담아 로그인으로 이동한다.
6. 로그인 성공 시 기존 로그인 로직이 callback으로 복귀시키고 Repository 목록 요청을 다시 진행한다.

## 오류 처리

- refresh cookie 누락, 만료, revoked token, CSRF 불일치는 API가 반환한 구체적인 인증 메시지를 유지한다.
- callback query에 `installation_id` 또는 `state`가 없으면 기존 연결 정보 누락 오류를 유지하며 로그인으로 보내지 않는다.
- callback `state`가 로그인 과정 중 만료되면 기존 state 검증 오류를 표시하고 사용자가 Repository 연결을 다시 시작하게 한다.
- 외부 origin, protocol-relative URL, 잘못된 `returnTo`는 기존 `getSafeReturnPath`가 `/dashboard`로 대체한다.

## 테스트

- callback은 인증 상태가 `loading`일 때 Repository API를 호출하지 않는다.
- callback은 인증 완료 후 Repository API를 호출한다.
- callback은 미인증 상태에서 현재 callback을 `returnTo`로 포함해 로그인으로 이동한다.
- refresh 401의 구체 메시지가 최초 보호 API의 일반 401 대신 전달된다.
- 동시에 시작된 인증 복구와 보호 API retry가 refresh 요청 하나를 공유한다.
- 기존 로그인 `returnTo` 안전성 및 Source Repository route 테스트를 함께 실행한다.

## 제외 사항

- refresh token을 Web Storage에 저장하지 않는다.
- callback URL이나 GitHub state를 장기 저장하지 않는다.
- GitHub App 설치·권한·Repository 분석 계약은 변경하지 않는다.
- 인증 오류를 해결하기 위해 자동으로 GitHub 설치를 반복하거나 권한을 변경하지 않는다.
