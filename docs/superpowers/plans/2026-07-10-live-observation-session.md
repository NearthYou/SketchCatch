# Live Observation Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성공한 `demo_web_service` Deployment의 실제 traffic receipt, CloudWatch 지표, ASG lifecycle을 Workspace의 `시뮬레이션` 모달에서 안전하게 관측한다.

**Architecture:** 15분 관측 세션과 집계는 Runtime Cache에만 저장하고, 인증된 Live Observation API와 public receipt collector를 분리한다. AWS 조회는 `DeploymentObservabilityProvider` adapter에 격리하며, Web은 SSE snapshot과 Deployment output으로만 동작한다. Demo Web Service Terraform, audience asset, Traffic API가 동일한 ALB/ASG 경로를 만든다.

**Tech Stack:** TypeScript 6, Fastify 5, React 19, Next.js 16, Redis 6, AWS SDK v3, Node test runner, Terraform HCL embedded fixtures

## Global Constraints

- 실제 AWS apply, live smoke, 비용 리소스 생성·삭제를 실행하지 않는다.
- Web에서 AWS SDK 또는 Terraform CLI를 호출하지 않는다.
- 세션 TTL은 15분이며 RDS migration을 추가하지 않는다.
- token은 256-bit base64url로 만들고 SHA-256 lookup key만 사용한다.
- presenter boost는 `5 rps`, `90초`, `450건`, concurrency `5`를 넘지 않는다.
- collector는 token당 `10 receipts/second`, burst `20`, 세션당 `5,000 events`를 넘지 않는다.
- 사용자 기존 worktree 변경과 관련 없는 파일을 수정하거나 커밋하지 않는다.

---

## File Structure

- `packages/types/src/index.ts`: Live Observation 공유 DTO
- `apps/api/src/runtime-cache/*`: 원자 cache 연산과 backend readiness
- `apps/api/src/live-observations/live-observation-service.ts`: session, receipt, snapshot 계산
- `apps/api/src/live-observations/deployment-observability-provider.ts`: provider-neutral 관측 계약
- `apps/api/src/live-observations/aws-deployment-observability-provider.ts`: CloudWatch/ASG AWS adapter
- `apps/api/src/routes/live-observations.ts`: 인증 API, public collector, SSE
- `apps/api/src/app.ts`, `apps/api/src/config/env.ts`: route와 feature flag wiring
- `apps/api/src/aws-connections/aws-connection-service.ts`: read-only 관측 IAM
- `scripts/smoke/live-demo-web-service.ps1`: canonical demo Terraform/HTML/Python fixture
- `apps/web/features/workspace/live-observation.ts`: pressure/topology/boost 순수 로직
- `apps/web/features/workspace/LiveObservationModal.tsx`: 전체 화면 관측 UI
- `apps/web/features/workspace/WorkspaceRightPanel.tsx`: `Deploy` 옆 진입 버튼
- `apps/web/features/workspace/api.ts`: Live Observation API/SSE client
- `apps/web/features/workspace/workspace.module.css`: 모달과 상태 시각화
- canonical docs: 계약, 제품 위치, 운영 환경과 권한

---

### Task 1: Shared Live Observation Contract

**Files:**
- Create: `packages/types/src/live-observation-contract.test.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `docs/data-models.md`

**Interfaces:**
- Produces: `LiveObservationSession`, `LiveObservationSnapshot`, `CreateLiveObservationResponse`, `LiveObservationSnapshotResponse`, `StopLiveObservationResponse`, `CollectLiveObservationEventRequest`, `CollectLiveObservationEventResponse`

- [ ] **Step 1: Add compile-time consumers before definitions**

```ts
import type {
  CollectLiveObservationEventResponse,
  CreateLiveObservationResponse,
  LiveObservationSnapshotResponse,
  StopLiveObservationResponse
} from "./index.js";

export type LiveObservationContract = {
  collect: CollectLiveObservationEventResponse;
  create: CreateLiveObservationResponse;
  snapshot: LiveObservationSnapshotResponse;
  stop: StopLiveObservationResponse;
};
```

- [ ] **Step 2: Run typecheck to verify RED**

Run: `pnpm --filter @sketchcatch/types typecheck`

Expected: FAIL with missing exports from `@sketchcatch/types`.

- [ ] **Step 3: Add exact shared types**

```ts
export type LiveObservationStatus = "active" | "stopped" | "expired";
export type LiveObservationPressureLevel = "normal" | "warning" | "high" | "critical";
export type LiveObservationAwsState = "available" | "delayed" | "unavailable";

export type LiveObservationSession = {
  id: string;
  deploymentId: string;
  status: LiveObservationStatus;
  audienceUrl: string;
  trafficApiUrl: string;
  createdAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
};

export type LiveObservationSnapshot = {
  observationId: string;
  status: LiveObservationStatus;
  live: {
    acceptedEventCount: number;
    rollingRequestsPerSecond: number;
    projectedRequestsPerMinute: number;
    pressurePercent: number;
    pressureLevel: LiveObservationPressureLevel;
    observedAt: IsoDateTimeString;
  };
  cloudWatch: {
    state: LiveObservationAwsState;
    requestCountPerTarget: number | null;
    periodSeconds: 60;
    observedAt: IsoDateTimeString | null;
    delayedBySeconds: number | null;
    errorCode: string | null;
  };
  capacity: {
    state: LiveObservationAwsState;
    desiredCapacity: number | null;
    currentInstanceCount: number | null;
    inServiceInstanceCount: number | null;
    maxCapacity: number | null;
    instances: Array<{
      instanceId: string;
      lifecycleState: string;
      healthStatus: string;
    }>;
    latestActivity: {
      statusCode: string;
      description: string;
      startedAt: IsoDateTimeString;
      endedAt: IsoDateTimeString | null;
    } | null;
    observedAt: IsoDateTimeString | null;
    errorCode: string | null;
  };
};

export type CreateLiveObservationResponse = {
  session: LiveObservationSession;
  snapshot: LiveObservationSnapshot;
};
export type LiveObservationSnapshotResponse = { snapshot: LiveObservationSnapshot };
export type StopLiveObservationResponse = { snapshot: LiveObservationSnapshot };
export type CollectLiveObservationEventRequest = { eventId: string };
export type CollectLiveObservationEventResponse = {
  accepted: boolean;
  acceptedEventCount: number;
};
```

- [ ] **Step 4: Document the same contract**

Add a `Live Observation Session` section to `docs/data-models.md` with storage boundary, endpoint DTOs, status meanings, and token rule.

- [ ] **Step 5: Run typecheck to verify GREEN**

Run: `pnpm --filter @sketchcatch/types typecheck`

Run: `pnpm --filter @sketchcatch/api typecheck`

Expected: PASS.

### Task 2: Atomic Runtime Cache Operations

**Files:**
- Modify: `apps/api/src/runtime-cache/runtime-cache.ts`
- Modify: `apps/api/src/runtime-cache/in-memory-runtime-cache.ts`
- Modify: `apps/api/src/runtime-cache/redis-runtime-cache.ts`
- Modify: `apps/api/src/runtime-cache/runtime-cache-factory.ts`
- Modify: `apps/api/src/runtime-cache/in-memory-runtime-cache.test.ts`
- Modify: `apps/api/src/runtime-cache/redis-runtime-cache.test.ts`
- Modify: `apps/api/src/runtime-cache/runtime-cache-factory.test.ts`

**Interfaces:**
- Produces: `RuntimeCache.increment`, `RuntimeCache.setIfAbsent`, `RuntimeCache.backend`, `RuntimeCache.isAvailable`

- [ ] **Step 1: Write failing in-memory atomic tests**

```ts
const first = await cache.increment(key, 2, { ttlMs: 1_000 });
const second = await cache.increment(key, 3, { ttlMs: 1_000 });
assert.equal(first, 2);
assert.equal(second, 5);
assert.equal(await cache.setIfAbsent(lockKey, "first", { ttlMs: 1_000 }), true);
assert.equal(await cache.setIfAbsent(lockKey, "second", { ttlMs: 1_000 }), false);
```

- [ ] **Step 2: Run in-memory test to verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/runtime-cache/in-memory-runtime-cache.test.ts`

Expected: FAIL because the methods do not exist.

- [ ] **Step 3: Implement in-memory operations and readiness**

Use one synchronous Map mutation per call, preserve TTL on increment, and expose `backend: "memory"`, `isAvailable(): Promise<true>`.

- [ ] **Step 4: Write failing Redis command tests**

Assert `INCRBY` followed by `PEXPIRE`, `SET` with `NX` and `PX`, `backend: "redis"`, and `PING`-based availability without fallback.

- [ ] **Step 5: Run Redis test to verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/runtime-cache/redis-runtime-cache.test.ts`

Expected: FAIL because Redis client/adapter lacks the commands.

- [ ] **Step 6: Implement Redis operations**

```ts
incrementBy(key: string, delta: number): Promise<number>;
pExpire(key: string, ttlMs: number): Promise<boolean>;
ping(): Promise<string>;
set(key, value, { condition: "NX", expiration: { type: "PX", value: ttlMs } });
```

All normal cache operations retain existing fallback behavior. `isAvailable()` must report real Redis readiness.

- [ ] **Step 7: Run Runtime Cache tests**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/runtime-cache/in-memory-runtime-cache.test.ts src/runtime-cache/redis-runtime-cache.test.ts src/runtime-cache/runtime-cache-factory.test.ts`

Expected: PASS.

### Task 3: Live Observation Session Core

**Files:**
- Create: `apps/api/src/live-observations/live-observation-service.ts`
- Create: `apps/api/src/live-observations/live-observation-service.test.ts`
- Create: `apps/api/src/live-observations/deployment-observability-provider.ts`

**Interfaces:**
- Consumes: shared DTO, `RuntimeCache`
- Produces: `createLiveObservationService`, `getLiveObservationPressureLevel`, `createUnavailableObservabilitySnapshot`

- [ ] **Step 1: Write failing pressure and session tests**

```ts
assert.equal(getLiveObservationPressureLevel(39.99), "normal");
assert.equal(getLiveObservationPressureLevel(40), "warning");
assert.equal(getLiveObservationPressureLevel(70), "high");
assert.equal(getLiveObservationPressureLevel(100), "critical");
```

Test idempotent active session creation, required output validation, dedup, expiry, stop, 10-second rolling rate, burst/rolling/session limits, and token hash lookup.

- [ ] **Step 2: Run service test to verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/live-observations/live-observation-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement minimal service**

Use injected `now`, `randomBytes`, Runtime Cache, deployment loader, output loader, and observability provider. Never expose or log a standalone token. Build `audienceUrl` from `static_site_url`, token, and configured public collector base.

- [ ] **Step 4: Verify service GREEN**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/live-observations/live-observation-service.test.ts`

Expected: PASS.

### Task 4: AWS Observability Adapter and IAM

**Files:**
- Create: `apps/api/src/live-observations/aws-deployment-observability-provider.ts`
- Create: `apps/api/src/live-observations/aws-deployment-observability-provider.test.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-service.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-service.test.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: assumed-role credentials, ASG name, ALB/target group suffixes
- Produces: `DeploymentObservabilityProvider.observe`

- [ ] **Step 1: Write failing adapter mapping tests**

Test newest completed 60-second `RequestCountPerTarget` datapoint, delay calculation, ASG capacity/lifecycle/activity mapping, and unavailable results without sample values.

- [ ] **Step 2: Run adapter test to verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/live-observations/aws-deployment-observability-provider.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Add Auto Scaling SDK and implement adapter**

Add `@aws-sdk/client-auto-scaling` at the repository's pinned AWS SDK version. Use `GetMetricData`, `DescribeAutoScalingGroups`, and `DescribeScalingActivities` behind injectable client interfaces.

- [ ] **Step 4: Extend AWS Connection read-only permissions test-first**

Assert these actions exist in JSON and YAML generation:

```text
autoscaling:DescribeAutoScalingGroups
autoscaling:DescribeScalingActivities
ec2:DescribeInstances
elasticloadbalancing:DescribeLoadBalancers
elasticloadbalancing:DescribeTargetGroups
cloudwatch:GetMetricData
cloudwatch:GetMetricStatistics
```

- [ ] **Step 5: Run adapter and IAM tests**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/live-observations/aws-deployment-observability-provider.test.ts src/aws-connections/aws-connection-service.test.ts`

Expected: PASS.

### Task 5: API Routes, Collector, and SSE

**Files:**
- Create: `apps/api/src/routes/live-observations.ts`
- Create: `apps/api/src/routes/live-observations.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/env.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: five approved endpoints, snapshot SSE protocol, `LIVE_OBSERVATION_ENABLED`

- [ ] **Step 1: Write failing route tests**

Cover ownership, `SUCCESS`, profile/output validation, disabled feature, production Redis readiness, active reuse, `202/200/410/429` collector responses, allowed CORS, initial SSE snapshot, heartbeat, and GET fallback.

- [ ] **Step 2: Run route test to verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/routes/live-observations.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement route and app wiring**

Add Zod schemas, authenticated deployment context, safe errors, SSE headers, one-second snapshot updates, 10-second AWS refresh, 15-second heartbeat, cleanup on socket close, and route dependency injection in `BuildAppOptions`.

- [ ] **Step 4: Verify API routes GREEN**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/routes/live-observations.test.ts src/config/env.test.ts`

Expected: PASS.

### Task 6: Demo Web Service Terraform and Runtime Assets

**Files:**
- Modify: `apps/api/src/deployments/deployment-plan-summary.ts`
- Modify: `apps/api/src/deployments/deployment-plan-summary.test.ts`
- Modify: `apps/api/src/deployments/deployment-warning-factory.ts`
- Modify: `apps/api/src/deployments/deployment-safety-gate.test.ts`
- Modify: `apps/web/features/resource-settings/template-library.ts`
- Modify: `apps/web/features/resource-settings/template-library.test.ts`
- Modify: `scripts/smoke/live-demo-web-service.ps1`
- Create: `apps/api/src/deployments/demo-web-service-assets.test.ts`

**Interfaces:**
- Produces: constrained step-scaling resources, six outputs, public audience HTML, Python Traffic API

- [ ] **Step 1: Write failing Terraform and asset assertions**

Assert `1/1/2`, ELB health check, 120-second grace, 60-second warmup, `RequestCountPerTarget`, threshold 60, `1/1`, `notBreaching`, `ChangeInCapacity +1`, cooldown 180, no scale-in, six outputs, `/api/traffic`, `/api/health`, and receipt-after-success browser logic.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-plan-summary.test.ts src/deployments/demo-web-service-assets.test.ts`

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/template-library.test.ts`

Expected: FAIL for missing policy/alarm/output/assets.

- [ ] **Step 3: Implement canonical demo structure**

Allow `aws_autoscaling_policy` and `aws_cloudwatch_metric_alarm` only in demo profiles, add their known addresses to acknowledgement-only warnings, update the 3-tier template parameters/nodes, and update smoke embedded Terraform/HTML/Python.

- [ ] **Step 4: Verify Terraform and assets GREEN**

Run: `pnpm --filter @sketchcatch/api exec tsx --test src/deployments/deployment-plan-summary.test.ts src/deployments/demo-web-service-assets.test.ts`

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/template-library.test.ts`

Run: `powershell -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw scripts/smoke/live-demo-web-service.ps1))"`

Run the extraction assertions in `demo-web-service-assets.test.ts` to compile the embedded Python and parse the embedded HTML with the existing test runtime.

Expected: PASS without AWS execution.

### Task 7: Web API Client and Presenter Boost

**Files:**
- Create: `apps/web/features/workspace/live-observation.ts`
- Create: `apps/web/features/workspace/live-observation.test.ts`
- Modify: `apps/web/features/workspace/api.ts`
- Modify: `apps/web/features/workspace/api.test.ts`

**Interfaces:**
- Produces: eligible Deployment selection, snapshot stream client, `createPresenterTrafficBoost`

- [ ] **Step 1: Write failing client and boost tests**

Test latest eligible Deployment selection by `completedAt`, API paths, SSE parser/reconnect fallback, exactly 5 scheduled requests per second, maximum 450, concurrency 5, immediate abort, and receipt only after Traffic `2xx`.

- [ ] **Step 2: Run Web tests to verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/live-observation.test.ts features/workspace/api.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement Web client and boost controller**

Use `apiFetch` for authenticated JSON calls, a fetch-based authenticated SSE reader, exponential reconnect, GET snapshot fallback, `AbortController`, and injected clock/fetch in tests.

- [ ] **Step 4: Verify Web helpers GREEN**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/live-observation.test.ts features/workspace/api.test.ts`

Expected: PASS.

### Task 8: Workspace Simulation Modal

**Files:**
- Create: `apps/web/features/workspace/LiveObservationModal.tsx`
- Create: `apps/web/features/workspace/live-observation-modal.test.ts`
- Modify: `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`
- Modify: `apps/web/features/workspace/workspace-right-panel-layout.test.ts`
- Modify: `apps/web/features/workspace/index.ts`

**Interfaces:**
- Consumes: project id, Deployment list, Live Observation API, boost controller
- Produces: `Deploy` 옆 `시뮬레이션` button and portal modal

- [ ] **Step 1: Write failing source/layout tests**

Assert visible and collapsed simulation buttons, `createPortal`, dialog semantics, latest eligible Deployment behavior, `관측 시작`, QR/URL, topology labels, cards, activity timeline, boost/stop/session end actions, and pressure color data attributes.

- [ ] **Step 2: Run modal tests to verify RED**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/live-observation-modal.test.ts features/workspace/workspace-right-panel-layout.test.ts`

Expected: FAIL because the modal and button are absent.

- [ ] **Step 3: Implement modal and styles**

Keep the Architecture Board mounted, trap focus in the dialog, close on Escape, restore opener focus, render unavailable AWS state without solid extra EC2 nodes, and stop boost on unmount/session stop/expiry.

- [ ] **Step 4: Verify modal GREEN**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/live-observation-modal.test.ts features/workspace/workspace-right-panel-layout.test.ts`

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: PASS.

### Task 9: Canonical Docs, Review, and Full Verification

**Files:**
- Modify: `docs/product.md`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `agent-progress.md`
- Modify: `session-handoff.md` only if continuation risk remains
- Modify: `feature_list.json` only if the existing active-workstream rule can remain valid

- [ ] **Step 1: Update canonical docs**

Describe Live Observation as a bounded Deployment observation workflow, document environment/IAM/Redis/SSE/cleanup rules, and remove the apparent conflict with the old “고도화된 트래픽 시뮬레이터” exclusion.

- [ ] **Step 2: Run focused tests**

Run all new and modified test files from Tasks 2-8.

Expected: PASS.

- [ ] **Step 3: Run repository verification**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit 0. Record any pre-existing unrelated failure with exact output instead of claiming it passed.

- [ ] **Step 4: Run adversarial self-review**

Use `evaluator-rubric.md` and the `review` skill. Confirm token secrecy, AWS failure truthfulness, no direct desired-capacity mutation, stop versus destroy separation, and no user-supplied target URL.

- [ ] **Step 5: Update harness evidence and commit**

Stage only Live Observation files and the intentionally updated harness records. Use a Korean commit such as:

```text
Feat: Live Observation 실시간 관측 구현
```
