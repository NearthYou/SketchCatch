# Deployment Runtime Cache 상태/로그 커서 가이드

이 문서는 #133 Runtime Cache vertical slice를 클론 코딩할 때 보는 학습 자료다. #131의 `RuntimeCache` 추상화와 #132의 Redis adapter를 그대로 사용하며, RDS/S3 원천 기록 위에 짧은 TTL 보조 상태를 얹는 방식만 다룬다.

## 원칙

- Deployment, DeploymentLog, Terraform artifact, tfplan, state, output의 최종 기록은 계속 RDS/S3다.
- Runtime Cache는 API 재시작, polling, SSE streaming 경험을 부드럽게 만드는 보조 계층이다.
- cache miss, Redis 연결 실패, cache command 실패는 API 실패로 전파하지 않는다.
- cache 값은 없어져도 RDS 조회로 복구 가능해야 한다.
- Runtime Cache에는 secret, AWS credential, raw Terraform content를 넣지 않는다.

## 이번 slice의 범위

이번 slice는 두 가지를 연결한다.

| 영역 | Runtime Cache 역할 | 원천 기록 |
| --- | --- | --- |
| Deployment job status | `RUNNING`, `PENDING`, `SUCCESS`, `FAILED`, `DESTROYED` 같은 최근 job snapshot 저장 | `deployments` |
| Deployment log cursor | SSE stream이 마지막으로 내보낸 `DeploymentLog.sequence` 저장 | `deployment_logs` |

Reverse scan status와 pipeline polling cache는 이번 slice에서 기능 구현하지 않고 key convention만 문서화한다.

## Key convention

Runtime Cache adapter는 물리 Redis key를 `sketchcatch:runtime-cache:{namespace}:{key}` 형태로 변환한다. consumer는 logical namespace/key만 지정한다.

| 용도 | namespace | key | TTL |
| --- | --- | --- | --- |
| Deployment status snapshot | `deployment.status` | `deployment:{deploymentId}` | 1 hour |
| Deployment log stream cursor | `deployment.log_cursor` | `deployment:{deploymentId}` | 10 minutes |
| Future reverse scan status | `reverse_scan.status` | `scan:{scanId}` | 1 hour |
| Future pipeline polling cache | `pipeline.polling` | `handoff:{handoffId}` 또는 `pipeline:{provider}:{runId}` | 5-10 minutes |

key에는 raw user text를 직접 붙이지 않는다. workflow id처럼 이미 검증된 식별자만 사용한다.

## 상태 snapshot 정책

`createRuntimeCachedDeploymentRepository`는 기존 `DeploymentRepository`를 감싼다. RDS mutation이 성공해 `DeploymentRecord`가 반환된 뒤에만 cache를 갱신한다.

대표 mutation:

- `markDeploymentInitRunning`
- `markDeploymentPlanRunning`
- `markDeploymentApplyRunning`
- `markDeploymentDestroyRunning`
- `markDeploymentInitSucceeded`
- `saveDeploymentPlan`
- `approveDeployment`
- `completeDeploymentApply`
- `completeDeploymentDestroy`
- `failDeployment`
- `requestDeploymentCancellation`
- `cancelDeployment`
- `recoverInterruptedDeployments`

cache write가 실패해도 mutation 결과는 그대로 반환한다. 즉 Redis 장애는 Deployment 상태 전이를 막지 않는다.
API 재시작 시 중단된 실행을 RDS에서 `FAILED`로 복구한 경우에도 반환된 Deployment 목록을 즉시 cache에 다시 써서, 오래 남은 `RUNNING` snapshot이 다음 polling 응답을 흐리지 않게 한다.

## 로그 커서 정책

`createDeploymentLog`와 `createDeploymentLogs`는 저장된 로그 중 가장 큰 `sequence`를 `deployment.log_cursor`에 기록한다. SSE log stream도 새 로그를 전송하면 같은 cursor를 갱신한다.

stream 시작 시에는 요청의 `sinceSequence`만 조회 시작점으로 사용한다. `deployment.log_cursor`는 deployment 단위의 공유 cache라서 사용자, 탭, 새로고침 세션을 구분하지 못한다. 따라서 cached cursor로 `sinceSequence`를 덮어쓰면 다른 클라이언트가 아직 보지 못한 초기 로그를 건너뛸 수 있다.

프론트엔드는 stream 시작 전에 `GET /logs`로 기존 기록을 로드하므로, stream cursor는 현재 slice에서 "마지막으로 전송/기록된 sequence"를 관찰하는 보조 힌트로만 사용한다. 이후 per-client 또는 per-session cursor key가 도입되기 전까지는 RDS `deployment_logs` 조회의 기준을 바꾸지 않는다.

## 테스트 포인트

- Deployment plan/apply/destroy start가 RDS 상태 변경 후 `deployment.status` snapshot을 기록하는지 확인한다.
- SSE stream이 RDS 로그를 전송한 뒤 `deployment.log_cursor`를 저장하는지 확인한다.
- Runtime Cache가 throw해도 SSE stream은 RDS 로그 조회 결과를 반환해야 한다.
- Redis 서버가 없어도 `createInMemoryRuntimeCache` 또는 throwing fake cache로 테스트한다.

## 확장 방향

Reverse Engineering과 Git/CI/CD polling도 같은 규칙을 따른다.

- 원천 기록은 RDS/S3에 둔다.
- Runtime Cache에는 최근 진행률, provider polling cursor, 마지막 확인 시각처럼 재구성 가능한 값만 둔다.
- key namespace를 feature 단위로 분리한다.
- TTL은 장기 작업 예상 시간보다 길고, 영구 기록처럼 오해될 만큼 길지 않게 둔다.
