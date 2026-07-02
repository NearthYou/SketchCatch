# JWT 고도화 정리

## 1. 목적

이번 JWT 고도화의 목적은 단순히 access token을 발급하는 수준에서 멈추지 않고, 로그인 세션을 더 안전하게 유지하고 갱신할 수 있는 구조를 만드는 것이다.

핵심 방향은 아래와 같다.

| 구분 | 기존 방향 | 고도화 후 방향 |
|---|---|---|
| access token | 자체 문자열 서명 방식 | `jose` 기반 표준 JWT |
| refresh token 전달 | 응답 body 포함 가능 | `HttpOnly` cookie 전용 |
| refresh token 저장 | 원문 저장 금지 필요 | DB에는 `token_hash`만 저장 |
| 프론트 저장소 | localStorage 저장 가능성 | access token은 브라우저 메모리만 사용 |
| token 재발급 | refresh token body 전달 | cookie + CSRF header 검증 |
| token 탈취 대응 | 단순 만료 검증 | refresh token 회전 및 재사용 감지 |

## 2. 관련 파일

| 파일 | 역할 |
|---|---|
| `apps/api/src/auth/tokens.ts` | access token 생성/검증, refresh token 생성/해시 |
| `apps/api/src/routes/auth.ts` | 로그인, 회원가입, refresh, logout, logout-all, 회원탈퇴 인증 흐름 |
| `apps/api/src/auth/current-user.ts` | `Authorization: Bearer <accessToken>` 검증 후 현재 사용자 식별 |
| `apps/api/src/config/env.ts` | `AUTH_TOKEN_SECRET` 필수값, 길이, placeholder 검증 |
| `apps/api/src/db/schema.ts` | `refresh_tokens`, `login_attempts` 테이블 정의 |
| `apps/web/lib/api-client.ts` | access token 첨부, 401 refresh 재시도, CSRF header 전송 |
| `apps/web/lib/auth-storage.ts` | access token을 브라우저 메모리에만 저장 |
| `packages/types/src/index.ts` | `AuthSession`, `RefreshTokenRequest`, `LogoutRequest` 타입 계약 |
| `.env.example` | `AUTH_TOKEN_SECRET` 생성 안내 |

## 3. Access token 변경

### 3.1 표준 JWT 사용

`apps/api/src/auth/tokens.ts`에서 access token 생성 방식을 `jose`의 `SignJWT`로 변경했다.

현재 access token 속성은 아래와 같다.

| 항목 | 값 |
|---|---|
| 알고리즘 | `HS256` |
| header typ | `JWT` |
| payload typ | `access` |
| subject | `userId` |
| TTL | `15 * 60`, 즉 15분 |
| secret | `AUTH_TOKEN_SECRET` |

검증 시에는 `jwtVerify()`로 서명을 검증하고, `payload.sub`가 문자열인지와 `payload.typ === "access"`인지 확인한다. 검증에 실패하면 예외를 밖으로 노출하지 않고 `null`을 반환한다.

### 3.2 보호 API 인증 방식

보호 API는 계속 아래 형식을 사용한다.

```http
Authorization: Bearer <accessToken>
```

`apps/api/src/auth/current-user.ts`는 header에서 bearer token을 꺼낸 뒤 `verifyAccessToken()`으로 검증한다. 이후 `requireActiveUserId()`는 DB의 `users.deleted_at`까지 확인해서 탈퇴/비활성 사용자 접근을 막는다.

## 4. Refresh token 변경

### 4.1 refresh token 원문을 body로 내려주지 않음

로그인, 회원가입, refresh 응답의 `AuthSession`은 아래처럼 access token만 포함한다.

```ts
type AuthSession = {
  accessToken: string;
  expiresInSeconds: number;
};
```

`refreshToken`은 더 이상 API 응답 body나 프론트 상태 타입에 포함하지 않는다. 서버는 refresh token 원문을 `Set-Cookie`로 내려보낸다.

### 4.2 Cookie 정책

`apps/api/src/routes/auth.ts`의 refresh cookie 정책은 아래와 같다.

| 쿠키 | 값 |
|---|---|
| 이름 | `sketchcatch_refresh_token` |
| Path | `/api/auth` |
| Max-Age | 30일 |
| HttpOnly | 적용 |
| SameSite | `Lax` |
| Secure | `NODE_ENV === "production"`일 때 적용 |

CSRF 검증용 쿠키는 아래와 같다.

| 쿠키 | 값 |
|---|---|
| 이름 | `sketchcatch_csrf_token` |
| Path | `/` |
| Max-Age | 30일 |
| HttpOnly | 미적용 |
| SameSite | `Lax` |
| Secure | `NODE_ENV === "production"`일 때 적용 |

CSRF token은 프론트가 읽어서 `X-CSRF-Token` header로 다시 보내야 한다.

## 5. DB 저장 방식

refresh token 원문은 DB에 저장하지 않는다.

`apps/api/src/auth/tokens.ts`는 refresh token 원문을 아래 방식으로 해시한다.

```ts
createHmac("sha256", requireAuthTokenSecret()).update(token).digest("base64url")
```

DB에는 `refresh_tokens.token_hash`만 저장한다.

| 컬럼 | 설명 |
|---|---|
| `user_id` | refresh token 소유 사용자 |
| `token_hash` | refresh token 원문을 HMAC-SHA256으로 해시한 값 |
| `expires_at` | refresh token 만료 시각 |
| `revoked_at` | 로그아웃, 회전, 재사용 감지 시 폐기 시각 |
| `user_agent` | 발급 당시 브라우저 정보 |
| `ip_address` | 발급 당시 IP |

## 6. Refresh token 회전

`POST /api/auth/refresh` 흐름은 아래 순서로 동작한다.

1. `sketchcatch_refresh_token` cookie를 읽는다.
2. `sketchcatch_csrf_token` cookie와 `X-CSRF-Token` header가 같은지 확인한다.
3. refresh token 원문을 해시해서 DB의 `refresh_tokens.token_hash`와 비교한다.
4. token이 없거나 만료되었거나 사용자 계정이 삭제된 경우 cookie를 지우고 `401`을 반환한다.
5. 기존 refresh token의 `revoked_at`을 채운다.
6. 새 refresh token을 만들고 DB에는 새 `token_hash`를 저장한다.
7. 새 refresh token 원문은 `HttpOnly` cookie로 다시 내려보낸다.
8. 새 access token을 응답 body로 내려보낸다.

이 방식 때문에 한 번 사용된 refresh token은 다시 사용할 수 없다.

## 7. Refresh token 재사용 감지

이미 `revoked_at`이 채워진 refresh token이 다시 들어오면 재사용 시도로 판단한다.

이 경우 서버는 아래 처리를 한다.

| 처리 | 이유 |
|---|---|
| 요청 refresh cookie 제거 | 클라이언트가 더 이상 해당 token을 쓰지 못하게 함 |
| 같은 사용자 active refresh token 전체 폐기 | 탈취 가능성이 있는 세션을 한 번에 종료 |
| `401 unauthorized` 반환 | 재로그인 유도 |
| warning log 기록 | 의심 이벤트 추적 |

관련 구현은 `apps/api/src/routes/auth.ts`의 `revokeActiveRefreshTokensForUser()` 흐름이다.

## 8. Logout / Logout-all / 회원탈퇴 처리

| API | 처리 |
|---|---|
| `POST /api/auth/logout` | 현재 refresh cookie가 있으면 해당 `token_hash`의 `revoked_at`을 채우고 cookie를 만료 처리 |
| `POST /api/auth/logout-all` | 현재 사용자의 active refresh token 전체 `revoked_at` 처리 후 cookie 만료 |
| `DELETE /api/auth/me` | 사용자 `deleted_at` 저장, active refresh token 전체 폐기, cookie 만료 |

`logout`, `refresh`처럼 cookie 기반으로 인증이 이어지는 요청은 CSRF header 검증을 요구한다.

## 9. Frontend 저장 방식 변경

프론트는 refresh token을 직접 보관하지 않는다.

| 항목 | 저장 위치 |
|---|---|
| access token | 브라우저 런타임 메모리 |
| refresh token | 서버가 내려준 `HttpOnly` cookie |
| CSRF token | 일반 cookie, 요청 시 `X-CSRF-Token` header로 전송 |

`apps/web/lib/auth-storage.ts`는 access token을 모듈 변수에만 저장한다. 또한 SSR 환경에서 사용자 세션이 서버 전역 변수에 남지 않도록 `typeof window !== "undefined"` 조건으로 브라우저에서만 읽고 쓰도록 막았다.

`apps/web/lib/api-client.ts`는 인증 요청에서 다음을 처리한다.

| 상황 | 처리 |
|---|---|
| 일반 인증 요청 | 메모리의 access token을 `Authorization` header에 추가 |
| cookie 필요한 요청 | `credentials: "include"` 기본 적용 |
| `GET`, `HEAD` 외 요청 | CSRF cookie를 읽어 `X-CSRF-Token` header 추가 |
| access token 만료로 `401` 발생 | `/auth/refresh` 호출 후 원래 요청 1회 재시도 |
| refresh 실패 | 메모리 세션 제거 후 인증 실패 처리 |

## 10. 환경 변수 강화

`AUTH_TOKEN_SECRET`은 access token 서명과 refresh token 해시에 모두 쓰인다.

현재 검증 기준은 아래와 같다.

| 조건 | 실패 메시지 |
|---|---|
| 값 없음 | `AUTH_TOKEN_SECRET is required` |
| 32자 미만 | `AUTH_TOKEN_SECRET must be at least 32 characters` |
| 예시 placeholder 그대로 사용 | `AUTH_TOKEN_SECRET must be changed from the example placeholder` |

`.env.example`에는 실제 secret을 넣지 않고, 로컬 생성 명령만 안내한다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 11. 테스트 포인트

현재 코드 기준으로 확인해야 하는 핵심 테스트는 아래와 같다.

| 테스트 | 확인 내용 |
|---|---|
| access token round trip | JWT가 3개 파트로 생성되고 `userId`를 검증할 수 있음 |
| tampered payload reject | payload를 바꾸면 검증 실패 |
| refresh token hash | 같은 token은 같은 hash, 원문과 hash는 다름 |
| placeholder secret reject | 예시 secret을 그대로 쓰면 실패 |
| refresh route scenario | 유효 refresh token이면 회전 후 새 access token 발급 |
| revoked refresh reuse | 폐기된 refresh token 재사용 시 active session 전체 폐기 |
| logout/delete account | refresh token 폐기와 cookie 만료 처리 |

## 12. 남은 주의사항

- access token은 짧게 유지하고 refresh token은 회전한다.
- refresh token 원문은 로그, DB, 문서, 테스트 출력에 남기지 않는다.
- 프론트에서 refresh token을 localStorage/sessionStorage에 저장하지 않는다.
- cookie 기반 인증 요청에는 CSRF 검증을 유지한다.
- 운영 환경에서는 `NODE_ENV=production`으로 `Secure` cookie가 붙도록 해야 한다.
- `AUTH_TOKEN_SECRET`은 배포 환경마다 충분히 긴 랜덤 값으로 설정해야 한다.
