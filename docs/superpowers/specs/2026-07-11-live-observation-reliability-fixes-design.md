# Live Observation 신뢰성 보완 설계

## 목표

Live Observation의 초 단위 Redis counter 키가 TTL 없이 남을 수 있는 원자성 결함을 제거하고, SSE 및 snapshot polling 실패를 자동 재연결과 함께 사용자에게 표시한다.

## 범위

- `RuntimeCache.increment()`의 Redis 구현
- `streamLiveObservationSnapshots()` 오류 통지 계약
- `LiveObservationModal`의 연결 지연 피드백
- 관련 API/Web 단위 테스트

API DTO, RDS, AWS 조회, SSE 서버, Terraform, traffic 수집 계약은 변경하지 않는다.

## Redis atomic increment

### 확인된 문제

현재 Redis 구현은 `INCRBY` 이후 `PEXPIRE`를 별도 명령으로 실행한다. 첫 명령만 성공하고 프로세스 또는 연결이 종료되면 TTL 없는 `live-observation-bucket` 키가 남을 수 있다.

### 채택 방식

Lua 스크립트를 `EVAL`로 실행한다.

```lua
local nextValue = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return nextValue
```

- key는 `KEYS[1]`, delta와 TTL은 `ARGV`로 전달해 문자열 조합으로 스크립트에 삽입하지 않는다.
- Redis는 Lua 스크립트 전체를 하나의 원자적 작업으로 실행한다.
- 반환값이 safe integer가 아니면 Redis 작업 실패로 취급하고 기존 in-memory fallback 값을 반환한다.
- Redis 연결·명령 실패 시 degradation count와 `onDegraded` 동작을 그대로 유지한다.
- `set()`과 `setIfAbsent()`의 기존 단일 명령 TTL 처리 방식은 변경하지 않는다.

## stream error notification

### 확인된 문제

`streamLiveObservationSnapshots()`는 SSE와 snapshot GET 오류를 내부 무한 재시도 루프에서 모두 처리한다. 따라서 호출부 Promise의 `.catch()`는 일반적인 연결 실패로 실행되지 않는다.

### 채택 방식

스트림 입력에 선택적 `onError`를 추가한다.

```ts
type LiveObservationStreamFailure = Readonly<{
  error: unknown;
  retryCount: number;
  source: "stream" | "snapshot-poll";
}>;
```

- SSE 실패 시 `source: "stream"`으로 알린다.
- fallback GET 실패 시 `source: "snapshot-poll"`로 알린다.
- AbortSignal로 종료한 경우에는 오류를 알리지 않는다.
- 오류 통지 후 기존 exponential backoff와 무한 재연결을 유지한다.
- snapshot을 정상 수신하면 Modal의 연결 지연 메시지만 해제한다.
- Modal의 실행되지 않는 Promise `.catch()`는 제거한다.
- `onError`는 관측·표시용이며 스트림 제어 흐름을 변경하지 않는다.

## UI 동작

- Modal은 기존 요청 오류와 분리된 `streamErrorMessage` 상태를 사용한다.
- 스트림 또는 polling 오류가 전달되면 `실시간 연결이 지연되고 있습니다. 최신 상태를 다시 연결합니다.`를 표시한다.
- 이후 SSE 또는 polling으로 snapshot을 받으면 `streamErrorMessage`만 해제해 QR, 복사, 관측 시작 등 다른 오류를 덮어쓰거나 지우지 않는다.
- session 종료 또는 Abort에 따른 정상 cleanup은 오류로 표시하지 않는다.

## 테스트 전략

1. Redis
   - increment가 `EVAL` 한 번으로 key, delta, TTL을 전달한다.
   - Lua 호출 결과를 숫자로 반환한다.
   - 직접 `INCRBY`와 `PEXPIRE`를 순차 호출하지 않는다.
   - Lua 명령 실패 시 fallback 값과 degradation 동작을 유지한다.
2. Web stream
   - SSE 실패 후 polling 성공 시 `stream` 오류를 통지하고 snapshot을 전달한다.
   - AbortSignal 종료는 `onError`를 호출하지 않는다.
   - Modal이 `onError`를 전달하고 dead `.catch()`를 사용하지 않는다.
   - 정상 snapshot 수신 시 연결 지연 메시지를 해제한다.

## 완료 기준

- Redis counter 생성과 TTL 설정 사이에 부분 성공 구간이 없다.
- 스트림 재시도는 계속되면서 호출부가 연결 실패를 관측할 수 있다.
- Modal에서 연결 지연과 정상 복구가 명시적으로 보인다.
- 기존 Live Observation animation, AWS 관측, boost, session cleanup 동작이 유지된다.
