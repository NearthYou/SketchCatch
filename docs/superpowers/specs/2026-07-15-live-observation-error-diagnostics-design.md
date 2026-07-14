# Live Observation 비활성 응답과 프런트 오류 진단 설계

## 목적

이 변경은 Live Observation 기능이 서버에서 꺼져 있을 때 일반 404 대신 실제 원인을 반환하고, 프런트에 표시되는 API 오류에 요청 위치와 응답 정보를 함께 보여준다. 사용자는 어떤 동작이 어떤 API를 호출했고 서버가 어떻게 응답했는지 한눈에 확인할 수 있다.

이 변경은 Live Observation을 자동으로 활성화하거나 capability secret을 생성하지 않는다. 실제 관측 실행은 운영자가 `LIVE_OBSERVATION_ENABLED`와 capability keyring을 올바르게 설정한 뒤 API를 재시작해야 한다.

## 확인된 원인

API는 `LIVE_OBSERVATION_ENABLED=true`일 때만 Live Observation 라우트를 등록한다. 현재 로컬 `.env`에는 이 값이 없으므로 기본적으로 비활성화되고, `POST /api/deployments/:deploymentId/live-observations`는 공통 not-found handler의 `404 not_found`를 반환한다. Next.js 프록시와 API 원본 포트에서 같은 응답이 재현되므로 프록시 오류가 아니다.

## 선택한 접근

Live Observation 라우트 플러그인은 기능이 비활성화된 상태에서도 인증된 세션 관리 경로를 등록한다. 비활성 경로는 실제 service나 Store를 호출하지 않고 `503`과 전용 오류 코드 `LIVE_OBSERVATION_DISABLED`를 반환한다. 기능이 활성화되면 기존 service 경로를 그대로 사용한다.

프런트 공통 API client는 각 실패에 다음 진단 정보를 결합한다.

- HTTP method
- query와 fragment를 제거한 API path
- HTTP status 또는 네트워크 응답 없음
- 서버 error code
- 서버가 `x-request-id`로 반환한 요청 ID

화면은 기존 사용자용 한국어 설명 뒤에 대괄호 형태의 진단 문구를 붙인다. 예시는 다음과 같다.

```text
실시간 관측 기능이 서버에서 비활성화되어 있습니다. [POST /api/deployments/…/live-observations · HTTP 503 · LIVE_OBSERVATION_DISABLED · 요청 ID req-123]
```

## 계약과 구성 요소

### Shared type

`ApiErrorCode`에 `LIVE_OBSERVATION_DISABLED`를 추가한다. 응답 body 구조인 `{ error, message }`는 유지하므로 DB나 migration은 필요하지 않다.

### API

Fastify는 모든 응답에 현재 `request.id`를 `x-request-id` header로 넣는다. 오류 body나 로그에 credential, cookie, authorization header를 추가하지 않는다.

Live Observation 비활성 라우트는 `503`과 다음 body를 반환한다.

```json
{
  "error": "LIVE_OBSERVATION_DISABLED",
  "message": "Live Observation is disabled"
}
```

기능이 비활성화된 경우 capability keyring, Store, AWS adapter, manifest materializer는 초기화하거나 호출하지 않는다.

### Web API client

`apiFetch`는 fetch 전에 정규화한 method와 안전한 path를 만든다. `ApiClientError`는 기존 status, code, message에 request context를 추가한다. 서버 응답 오류에서는 `x-request-id`를 읽고, 연결 실패에서는 status를 `0`으로 유지하면서 method/path와 `응답 없음`을 표시한다.

query와 fragment는 진단 path에 포함하지 않는다. 따라서 OAuth code, token, 검색 조건처럼 URL에 들어갈 수 있는 값은 사용자 화면에 복제되지 않는다.

수동으로 생성되는 클라이언트 검증 오류처럼 실제 HTTP 요청이 없었던 오류는 요청 진단 문구를 붙이지 않는다.

## 오류 흐름

1. 사용자가 `관측 시작`을 누른다.
2. Web이 `POST /api/deployments/:deploymentId/live-observations`를 요청한다.
3. 비활성 API 라우트가 service를 실행하지 않고 `503 LIVE_OBSERVATION_DISABLED`와 `x-request-id`를 반환한다.
4. `apiFetch`가 method, 안전한 path, status, code, request ID를 가진 `ApiClientError`를 만든다.
5. 기존 `getApiErrorMessage` 호출부가 한국어 설명과 진단 문구를 하나의 문자열로 표시한다.

## 테스트

- API 앱 테스트는 비활성 Live Observation 생성 요청이 더 이상 404가 아니며 `503 LIVE_OBSERVATION_DISABLED`를 반환하는지 검증한다.
- API 앱 테스트는 오류 응답에 `x-request-id`가 있는지 검증한다.
- Web API client 테스트는 서버 오류의 method, 안전한 path, status, code, request ID 표시를 검증한다.
- Web API client 테스트는 query와 fragment가 진단 문구에서 제거되는지 검증한다.
- Web API client 테스트는 연결 실패가 `응답 없음`으로 구분되는지 검증한다.
- 기존 Live Observation 활성 경로 테스트는 세션 생성 동작이 유지되는지 검증한다.

## 범위 밖

- 로컬 `.env`에 capability secret 생성 또는 저장
- Live Observation을 기본 활성화
- Redis, RDS migration 또는 AWS 리소스 변경
- 모든 화면의 오류 UI를 별도 공통 컴포넌트로 교체
