# Live Observation Session 설계

## 목적

성공한 `demo_web_service` Deployment에서 실제 청중 요청, CloudWatch 지표, Auto Scaling Group 상태를 서로 다른 근거로 관측한다. 이 기능은 미래 용량을 예측하는 고도화된 트래픽 시뮬레이터가 아니라, SketchCatch의 실제 Deployment 흐름을 증명하는 제한된 `Live Observation` 운영 화면이다.

Workspace의 `Deploy` 버튼 옆에 `시뮬레이션` 버튼을 추가한다. 버튼은 별도의 전체 화면 모달을 열며, 가장 최근의 `SUCCESS + demo_web_service` Deployment를 자동 선택한다. 성공 Deployment가 여러 개라면 모달 안에서 대상을 변경할 수 있다.

모달을 여는 동작만으로 세션을 만들지 않는다. 사용자가 `관측 시작`을 눌러야 15분 세션을 생성한다.

## 범위

- 청중 접속용 S3 페이지
- ALB 뒤 EC2의 공개 Traffic API
- 성공 요청 receipt의 실시간 집계
- 발표자용 제한된 90초 traffic boost
- CloudWatch와 ASG 실제 상태 관측
- 인증된 snapshot 조회와 SSE
- Workspace의 읽기 전용 Live Observation 모달
- Demo Web Service Terraform Preview, live safety gate, smoke fixture 정합성
- AWS Connection read-only 관측 권한

실제 AWS apply, live smoke, 비용 리소스 생성·삭제는 이 구현 작업에서 실행하지 않는다.

## 핵심 상태 구분

화면은 다음 근거를 섞지 않는다.

1. `Live event`: Traffic API 성공 뒤 public collector가 수락한 receipt
2. `CloudWatch measured`: 완료된 60초 CloudWatch datapoint
3. `Auto Scaling actual`: AWS에서 조회한 ASG/EC2 lifecycle과 scaling activity

점선 EC2는 예상 또는 launching 상태다. 실선 EC2는 실제 `InService` instance만 나타낸다. AWS 조회 실패 시 sample capacity를 만들지 않는다.

## 컴포넌트 경계

### 공유 계약

`packages/types`에 다음 타입을 둔다.

- `LiveObservationStatus`
- `LiveObservationPressureLevel`
- `LiveObservationAwsState`
- `LiveObservationSession`
- `LiveObservationSnapshot`
- 세션 생성, snapshot, stop, public receipt 응답 DTO

`docs/data-models.md`를 같은 필드명으로 갱신하고, API Zod schema와 Web consumer가 공유 타입을 따른다.

### Runtime Cache

기존 `RuntimeCache`에 다음 원자 연산을 추가한다.

```ts
increment(entryKey, delta, { ttlMs }): Promise<number>;
setIfAbsent(entryKey, value, { ttlMs }): Promise<boolean>;
```

Redis adapter는 `INCRBY`와 `SET NX PX`를 사용한다. in-memory adapter는 같은 process 안에서 동일한 의미를 보장한다.

namespace는 아래로 고정한다.

- `live-observation-session`
- `live-observation-event`
- `live-observation-bucket`

세션 TTL은 15분이다. 최근 요청률은 1초 bucket을 30초 TTL로 저장하고 최근 10초 합계로 계산한다. RDS migration은 만들지 않는다.

Production에서 Redis를 사용할 수 없으면 세션 생성을 `503 LIVE_OBSERVATION_CACHE_UNAVAILABLE`로 차단한다. 테스트와 로컬 단일 API에서는 in-memory adapter를 허용한다.

### Live Observation API

인증 route는 Deployment 소유권을 확인하고 `SUCCESS`, `liveProfile === "demo_web_service"`, 필수 Terraform output을 검증한다.

```text
POST /api/deployments/:deploymentId/live-observations
GET  /api/deployments/:deploymentId/live-observations/:observationId
GET  /api/deployments/:deploymentId/live-observations/:observationId/stream
POST /api/deployments/:deploymentId/live-observations/:observationId/stop
```

같은 Deployment에 active 세션이 있으면 기존 세션을 반환한다.

public collector는 token으로 세션을 찾고 body에서 `eventId`만 받는다.

```text
POST /api/live-observations/public/:token/events
```

- 최초 수락: `202`, `accepted: true`
- 중복: `200`, `accepted: false`
- 만료 또는 stop: `410`
- rate limit 초과: `429`

token은 256-bit base64url로 생성하고 SHA-256 lookup key만 cache key에 사용한다. 원문 token은 독립 응답 필드, RDS, 로그, localStorage에 저장하지 않고 `audienceUrl` query 안에서만 전달한다.

### SSE

SSE는 연결 직후 전체 snapshot을 보낸다.

- live count: 최대 1초 간격
- AWS 상태: 최대 10초 간격
- heartbeat: 15초 간격
- 재연결: 최신 전체 snapshot
- fallback: 인증된 GET snapshot polling

CloudWatch 또는 ASG 조회 실패는 해당 카드만 `unavailable`로 만들고 live event stream을 종료하지 않는다.

### DeploymentObservabilityProvider

provider-neutral service는 아래 입력만 소비한다.

- Deployment의 AWS Connection
- `asg_name`
- `alb_arn_suffix`
- `target_group_arn_suffix`

AWS adapter가 CloudWatch, Auto Scaling, EC2, ELBv2 SDK 호출을 소유한다. 세션별 AWS 결과는 10초 cache한다.

CloudWatch는 최근 5분의 `AWS/ApplicationELB / RequestCountPerTarget`을 조회하고 가장 최신 완료 60초 datapoint를 사용한다. `observedAt`과 `delayedBySeconds`를 계산한다. ASG adapter는 min/desired/max, instance lifecycle, health, 최근 scaling activity를 반환한다.

AWS Connection CloudFormation 정책에는 관측에 필요한 read-only action만 추가한다.

### Demo Web Service Terraform

제품 Terraform Preview와 smoke fixture는 아래 기본 구조를 공유해야 한다.

| 설정 | 값 |
| --- | --- |
| ASG min/desired/max | `1 / 1 / 2` |
| health check | `ELB`, `/api/health` |
| health check grace | `120초` |
| instance warmup | `60초` |
| metric | `RequestCountPerTarget` |
| statistic/period | `Sum / 60초` |
| threshold | `60 requests/target/min` |
| evaluation/datapoints | `1 / 1` |
| missing data | `notBreaching` |
| scaling policy | Step scaling, `ChangeInCapacity +1` |
| cooldown | `180초` |
| scale-in | v1에서 없음 |

필수 output은 `static_site_url`, `api_base_url`, `asg_name`, `alb_arn_suffix`, `target_group_arn_suffix`, `scale_out_threshold`다.

live safety gate는 위 제한된 Demo Web Service용 `aws_autoscaling_policy`와 `aws_cloudwatch_metric_alarm` 형태만 허용한다.

### Audience Page와 Traffic API

Audience URL 형식은 다음과 같다.

```text
<static_site_url>/?observation=<public-token>&collector=<public-api-base>
```

S3 정적 페이지는 큰 `트래픽 보내기` 버튼, Traffic 성공/실패, receipt 성공/실패, 해당 브라우저 성공 횟수를 표시한다. `POST /api/traffic`이 `2xx`일 때만 receipt를 전송한다.

EC2 Python API는 `OPTIONS /api/traffic`, `POST /api/traffic`, `GET /api/health`를 제공한다. CPU burn이나 sleep 없이 즉시 응답한다. credential을 사용하지 않는 Traffic API에만 `Access-Control-Allow-Origin: *`를 허용한다.

### Workspace 모달

`WorkspaceRightPanel`의 `Deploy` 버튼 옆에 `시뮬레이션` 버튼을 추가한다. 오른쪽 패널이 접힌 상태에도 대응되는 shortcut을 제공한다.

모달은 기존 Architecture Board를 수정하지 않고 `createPortal`로 별도 렌더링한다.

초기 상태:

- 프로젝트의 성공 `demo_web_service` Deployment 목록 조회
- 최신 항목 자동 선택
- 다른 성공 Deployment 선택 가능
- 대상 없음, 로딩, API 오류 상태 표시
- `관측 시작` 전에는 traffic boost 비활성화

active 상태:

- 세션 상태와 남은 시간
- QR과 audience URL 복사
- `Audience → ALB → ASG → EC2` 토폴로지
- live 성공 event 카드
- CloudWatch 실측과 지연 카드
- ASG 실제 상태와 scaling activity
- `+90초 부하`, `중지`, `세션 종료`

압력 단계는 `<40`, `40~<70`, `70~<100`, `>=100` 경계로 계산하고 초록, 노랑, 주황, 빨강을 사용한다.

```text
projectedRequestsPerMinute = rollingRequestsPerSecond * 60
pressurePercent = projectedRequestsPerMinute / scaleOutThreshold * 100
```

QR은 audience URL을 표현한다. 새 runtime dependency가 필요하지 않도록 우선 현재 프로젝트 의존성으로 구현 가능한 방식과 브라우저 표시/복사 fallback을 사용하고, QR 생성에 검증된 추가 package가 반드시 필요하면 lockfile 변경을 최소화해 명시적으로 추가한다.

### 발표자 Traffic Boost

발표자 브라우저가 Audience Page와 같은 Traffic API와 receipt 함수를 사용한다. SketchCatch API가 traffic을 proxy하지 않는다.

제한은 아래로 고정한다.

- 5 requests/second
- 최대 90초
- 최대 450 requests
- 최대 concurrency 5
- 중복 실행 금지
- 즉시 중지
- 모달 종료, 페이지 이동, session stop/expiry에서 자동 중지

target URL은 Deployment output만 사용하고 사용자 URL 입력을 받지 않는다. Traffic 실패는 receipt를 만들지 않는다.

collector는 token당 10 receipts/second, burst 20, 세션당 최대 5,000 events를 허용한다.

## 오류와 안전

- Redis unavailable: Production 세션 생성 차단
- CloudWatch unavailable: AWS metric 카드만 unavailable
- ASG not found: 실제 EC2 추가 표시 금지
- Traffic 실패: receipt 미전송
- Receipt 실패: Traffic 성공과 집계 실패를 분리 표시
- Session expired/stopped: collector `410`
- SSE 끊김: exponential backoff 후 재연결, GET polling fallback
- collector CORS: audience origin과 SketchCatch Web origin만 허용
- stop: 관측 세션만 종료하며 인프라를 destroy하지 않음
- 비용 리소스 cleanup: 기존 Deployment destroy 흐름만 사용
- token, AWS credential, sensitive Terraform output: 로그와 UI 저장소에서 제외

## 테스트 전략

TDD로 다음 seam을 순서대로 검증한다.

1. shared type과 API/Web 계약
2. Runtime Cache `increment`와 `setIfAbsent`의 in-memory/Redis 의미
3. 세션 조건, token 만료, stop, dedup, rate limit
4. snapshot 압력 경계 `39.99`, `40`, `70`, `100`
5. SSE 최초 snapshot, live update, AWS update, heartbeat
6. AWS adapter 성공/실패와 sample 값 미생성
7. 예상, launching, 실제 `InService` EC2 표시 전환
8. boost의 5 rps, 90초, 450건, concurrency 5 제한
9. Terraform `1/1/2`, alarm, policy, output과 safety gate
10. PowerShell smoke parse, embedded Python/HTML syntax
11. Workspace 버튼, 모달 상태, 최신 성공 Deployment 자동 선택

마지막에 `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행한다. 실제 AWS acceptance는 별도 명시 승인 없이는 실행하지 않는다.

## 저장 경계

Live Observation 세션과 집계는 15분 TTL Runtime Cache 데이터다. RDS migration을 추가하지 않는다. Deployment와 Terraform output은 기존 RDS 원천 기록을 읽기만 한다. S3 audience asset은 Demo Web Service Terraform artifact가 생성하는 정적 파일이다.
