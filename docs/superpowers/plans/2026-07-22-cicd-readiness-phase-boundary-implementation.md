# CI/CD Readiness 단계 책임 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** verified AWS 배포 대상과 확정 빌드 설정이 저장되면 CI/CD 2단계를 완료하고, Plan·CodeBuild checkout·최초 앱 배포·Static Site URL/API Base URL은 3단계의 배포 evidence로 표시한다.

**Architecture:** `deployment_target` readiness는 저장된 `ProjectDeploymentTarget`과 현재 사용자 소유의 verified AWS connection만 읽어 Phase 2를 판정한다. ECS Plan 요청은 기존 `prepareEcsBuildEnvironmentForPlan` 경계에서만 Build Environment를 준비하고 exact commit checkout을 검증한다. `ProjectDeliveryProfile`은 DB 검증 결과를 secret-safe `buildVerification`으로 투영하고, Web은 서버 missing key와 이 projection 및 `handoffConfigurationPreview`를 이용해 Phase 2/3을 렌더링한다.

**Tech Stack:** TypeScript, Node test runner, Fastify, Drizzle ORM, React/Next.js, pnpm/Turborepo

## Global Constraints

- [ ] 구현 시작 전 `pnpm harness:check`를 다시 실행하고 `agent-progress.md`, `feature_list.json`의 현재 workstream을 확인한다.
- [ ] 기존 작업 트리가 dirty 상태이므로 각 파일의 현재 diff를 먼저 읽는다. 특히 `CicdConsoleScreen.tsx`, `CicdHandoffPanel.tsx`, `cicd-readiness-presentation.ts`의 기존 변경을 보존한다.
- [ ] commit 전 `git diff -- <task files>`를 검토한다. 사용자 변경과 구현 변경을 안전하게 분리할 수 없으면 관련 commit을 보류하고 파일을 통째로 stage하지 않는다.
- [ ] CI/CD 화면에서 Plan, Apply, 최초 앱 배포, PR을 자동 실행하지 않는다. 주요 CTA는 Direct Deployment 화면만 연다.
- [ ] `ProjectBuildEnvironment` create/reconcile와 Repository checkout은 `prepareEcsBuildEnvironmentForPlan` 밖으로 이동하지 않는다.
- [ ] Build ARN, CodeBuild Role ARN, AWS credential, provider token을 `ProjectDeliveryProfile`에 추가하지 않는다.
- [ ] DB schema 변경과 Drizzle migration은 만들지 않는다.
- [ ] 각 task는 failing test를 먼저 확인하고 최소 구현 후 같은 test를 통과시킨다.

---

## Task 1: Phase 2 readiness 계약과 서버 판정을 설정 기준으로 변경

**Files:**

- Modify: `packages/types/src/git-cicd-readiness-contract.test.ts:20-70`
- Modify: `packages/types/src/index.ts:840-864`
- Modify: `apps/api/src/git-cicd/git-cicd-readiness-service.test.ts:384-410, 656-735`
- Modify: `apps/api/src/git-cicd/git-cicd-readiness-service.ts:351-380, 1298-1489`
- Modify: `apps/web/features/workspace/cicd-handoff.ts:273-289`
- Modify: `apps/web/features/workspace/cicd-handoff.test.ts:130-160`
- Modify: `docs/data-models.md:1868-1925`

### Step 1: 공유 계약과 서버 회귀 test를 먼저 실패시킨다

- [ ] `GitCicdDeploymentTargetReadinessKey`의 exact union 기대값을 두 key로 줄인다.

```ts
IsExactUnion<
  GitCicdDeploymentTargetReadinessKey,
  "aws_connection" | "build_config"
>
```

- [ ] `GitCicdReadinessAction` 기대값에서 `inspect_runtime_outputs`, `inspect_output_url`을 제거한다.
- [ ] API test에 “Deployment/Plan/Build Environment/output URL이 없어도 저장 target이 유효하면 Phase 2는 ready” 사례를 추가한다.

```ts
test("marks a persisted user-configured target ready before Deployment evidence exists", async () => {
  const state = createRepositoryState({
    existingTarget: createExistingTarget(createConfirmedBuildConfig())
  });
  state.buildEnvironment = undefined;

  const result = await createGitCicdReadinessService({
    repository: createRepository({ state, deployments: [] }),
    planVerifier: createPlanVerifier()
  }).inspect({ projectId: "project-1", userId: "user-1" });

  assert.deepEqual(getReadinessItem(result, "deployment_target"), {
    key: "deployment_target",
    label: "배포 타깃",
    status: "ready",
    completedCount: 4,
    totalCount: 4,
    missingKeys: [],
    action: null
  });
});
```

- [ ] 별도 subtest로 verified connection 없음, Region 불일치, invalid confirmed config를 각각 검증한다.

```ts
assert.deepEqual(targetItem.missingKeys, ["aws_connection"]);
assert.equal(targetItem.action, "select_aws_connection");
```

```ts
assert.deepEqual(targetItem.missingKeys, ["build_config"]);
assert.equal(targetItem.action, "confirm_build_config");
```

- [ ] checkout `not_checked`/stale commit test의 기대를 바꿔 Phase 2가 막히지 않음을 증명한다. 이 test는 post-Apply reconciliation의 exact checkout 안전 조건까지 제거하지 않는다.

### Step 2: targeted test가 예상대로 실패하는지 확인한다

Run:

```bash
pnpm --filter @sketchcatch/types exec tsx --test src/git-cicd-readiness-contract.test.ts
pnpm --filter @sketchcatch/api exec tsx --test src/git-cicd/git-cicd-readiness-service.test.ts
```

Expected:

- types test는 기존 4-key/action union 때문에 exact union assertion에서 실패한다.
- API test는 `deployment_target`에 `aws_connection`, `build_config`, `runtime_config`, `output_url`이 남아 있어 실패한다.

### Step 3: readiness 계약을 두 사용자 설정 key로 축소한다

- [ ] `packages/types/src/index.ts`를 다음 계약으로 변경한다.

```ts
export type GitCicdDeploymentTargetReadinessKey =
  | "aws_connection"
  | "build_config";

export type GitCicdReadinessAction =
  | "approve_apply_plan"
  | "deploy_initial_application"
  | "select_repository"
  | "confirm_monitoring_config"
  | "select_aws_connection"
  | "confirm_build_config";
```

- [ ] `apps/web/features/workspace/cicd-handoff.ts`의 target detail key/label map도 두 key만 유지한다.

```ts
const deploymentTargetDetailKeys = [
  "aws_connection",
  "build_config"
] as const satisfies readonly GitCicdDeploymentTargetReadinessKey[];
```

### Step 4: 서버 Phase 2 판정을 persisted target 기준으로 교체한다

- [ ] `createReadinessItems`에서 `deploymentEvidence.connection`, Build Environment status, checkout evidence, runtime output을 target missing key 계산에 사용하지 않는다.
- [ ] target의 provider/runtime kind와 confirmed config를 target별 공용 validator로 검증하고, current Repository revision과 confirmed commit이 같은지 확인한다.

```ts
function hasValidConfirmedBuildConfigForRepository(
  target: ProjectDeploymentTargetRecord | undefined,
  sourceRepository: RepositoryMonitoringRecord | undefined
): boolean {
  if (!target?.confirmedBuildConfig || !sourceRepository?.analysisRevision) return false;
  try {
    validateConfirmedBuildConfig(target.runtimeTargetKind, target.confirmedBuildConfig);
  } catch {
    return false;
  }
  return target.confirmedBuildConfig.confirmedCommitSha.toLowerCase() ===
    sourceRepository.analysisRevision.toLowerCase();
}
```

- [ ] AWS connection 완료는 target connection과 현재 사용자 verified connection이 같고 Region도 같을 때만 인정한다.
- [ ] 4개 UI 설정의 count는 AWS connection/Region 2개, runtime target 1개, build config 1개로 계산하되 missing key는 서버 action 단위인 2개를 유지한다.

```ts
const awsConnectionReady = Boolean(
  input.target &&
    input.targetConnection &&
    input.target.provider === "aws" &&
    input.target.connectionId === input.targetConnection.id &&
    input.target.region === input.targetConnection.region
);
const runtimeTargetReady = Boolean(
  input.target &&
    ["ecs_fargate", "lambda", "ec2_asg", "static_site"].includes(
      input.target.runtimeTargetKind
    )
);
const buildConfigReady = hasValidConfirmedBuildConfigForRepository(
  input.target,
  input.sourceRepository
);

if (!awsConnectionReady) targetMissingKeys.push("aws_connection");
if (!buildConfigReady || !runtimeTargetReady) targetMissingKeys.push("build_config");

const completedCount =
  (awsConnectionReady ? 2 : 0) +
  (runtimeTargetReady ? 1 : 0) +
  (buildConfigReady ? 1 : 0);
```

- [ ] `resolveDeploymentTargetAction`은 두 action만 반환한다.

```ts
if (missingKeys.includes("aws_connection")) return "select_aws_connection";
if (missingKeys.includes("build_config")) return "confirm_build_config";
return null;
```

- [ ] `hasCurrentRepositoryAccessVerification`은 post-Apply target synchronization에서 계속 사용한다. `hasSafeOutputUrl`도 initial release evidence 검증에서 계속 사용한다.
- [ ] 더 이상 사용하지 않는 `targetReconciled`, `acceptPersistedTargetIdentity`, `hasValidPersistedDeploymentTargetIdentity`만 정리한다.

### Step 5: canonical 문서를 같은 계약으로 갱신한다

- [ ] `docs/data-models.md`의 union/action 예시와 설명을 두 setting key로 바꾼다.
- [ ] `deployment_target`은 Phase 2 설정만 나타내며 Build Environment·checkout·runtime URL은 Phase 3 evidence라는 문장을 추가한다.

### Step 6: targeted test를 통과시킨다

Run:

```bash
pnpm --filter @sketchcatch/types exec tsx --test src/git-cicd-readiness-contract.test.ts
pnpm --filter @sketchcatch/api exec tsx --test src/git-cicd/git-cicd-readiness-service.test.ts
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/cicd-handoff.test.ts
```

Expected: 세 command 모두 exit code 0.

### Step 7: 변경 범위를 검토하고 commit한다

```bash
git diff -- packages/types/src/index.ts packages/types/src/git-cicd-readiness-contract.test.ts apps/api/src/git-cicd/git-cicd-readiness-service.ts apps/api/src/git-cicd/git-cicd-readiness-service.test.ts apps/web/features/workspace/cicd-handoff.ts apps/web/features/workspace/cicd-handoff.test.ts docs/data-models.md
git add packages/types/src/index.ts packages/types/src/git-cicd-readiness-contract.test.ts apps/api/src/git-cicd/git-cicd-readiness-service.ts apps/api/src/git-cicd/git-cicd-readiness-service.test.ts apps/web/features/workspace/cicd-handoff.ts apps/web/features/workspace/cicd-handoff.test.ts docs/data-models.md
git commit -m "Fix: CI/CD 배포 대상 readiness 책임 분리"
```

Expected: 관련 없는 기존 hunk가 없을 때만 commit한다.

---

## Task 2: Delivery Profile에 secret-safe Build Verification projection 추가

**Files:**

- Modify: `packages/types/src/index.ts:882-895`
- Modify: `packages/types/src/git-cicd-readiness-contract.test.ts:1-110`
- Modify: `apps/api/src/delivery/project-delivery-profile-service.ts:1-125, 127-250`
- Modify: `apps/api/src/delivery/project-delivery-profile-service.test.ts:1-360`
- Modify: `apps/api/src/routes/project-delivery-profile.test.ts:49-65`
- Modify: `docs/data-models.md:3449-3475`

### Step 1: projection contract test를 먼저 추가한다

- [ ] shared type test에 네 상태와 secret-safe 필드 shape를 추가한다.

```ts
const buildVerification = {
  status: "failed",
  requestedCommitSha: "a".repeat(40),
  resolvedCommitSha: null,
  statusReason: "Repository checkout verification failed",
  verifiedAt: null
} satisfies ProjectDeliveryBuildVerification;
```

- [ ] profile service test에 `not_started`, `preparing`, `verified`, `failed` 네 mapping을 추가한다.
- [ ] 실패 fixture에는 ARN과 secret-shaped 문자열을 넣고 응답에서 제거되는지 검사한다.

```ts
assert.doesNotMatch(JSON.stringify(profile.buildVerification), /arn:aws|temporary-secret/iu);
```

### Step 2: failing test를 확인한다

Run:

```bash
pnpm --filter @sketchcatch/types exec tsx --test src/git-cicd-readiness-contract.test.ts
pnpm --filter @sketchcatch/api exec tsx --test src/delivery/project-delivery-profile-service.test.ts src/routes/project-delivery-profile.test.ts
```

Expected: 새 type/property와 store method가 없어 compile/test failure.

### Step 3: shared DTO를 추가한다

```ts
export type ProjectDeliveryBuildVerificationStatus =
  | "not_started"
  | "preparing"
  | "verified"
  | "failed";

export type ProjectDeliveryBuildVerification = {
  status: ProjectDeliveryBuildVerificationStatus;
  requestedCommitSha: string | null;
  resolvedCommitSha: string | null;
  statusReason: string | null;
  verifiedAt: IsoDateTimeString | null;
};

export type ProjectDeliveryProfile = {
  // existing fields
  buildVerification: ProjectDeliveryBuildVerification;
};
```

### Step 4: API store는 필요한 열만 읽는다

- [ ] `projectBuildEnvironments` import와 `findBuildVerification(projectId)` store method를 추가한다.
- [ ] select 목록을 다음 필드로 제한한다.

```ts
{
  status: projectBuildEnvironments.status,
  repositoryVerificationStatus: projectBuildEnvironments.repositoryVerificationStatus,
  requestedCommitSha:
    projectBuildEnvironments.repositoryVerificationRequestedCommitSha,
  resolvedCommitSha:
    projectBuildEnvironments.repositoryVerificationResolvedCommitSha,
  statusReason:
    projectBuildEnvironments.repositoryVerificationStatusReason,
  verifiedAt: projectBuildEnvironments.repositoryVerifiedAt
}
```

- [ ] `repositoryVerificationBuildArn`, `codeBuildServiceRoleArn`, `permissionsBoundaryArn`, AWS connection credential 관련 열은 select하지 않는다.

### Step 5: 저장 record를 네 상태로 투영한다

```ts
function toProjectDeliveryBuildVerification(
  record: ProjectDeliveryBuildVerificationRecord | null
): ProjectDeliveryBuildVerification {
  if (!record) return emptyBuildVerification("not_started");
  if (record.repositoryVerificationStatus === "verified") {
    return {
      status: "verified",
      requestedCommitSha: record.requestedCommitSha,
      resolvedCommitSha: record.resolvedCommitSha,
      statusReason: null,
      verifiedAt: record.verifiedAt?.toISOString() ?? null
    };
  }
  if (
    record.repositoryVerificationStatus === "failed" ||
    record.status === "verification_failed" ||
    record.status === "disconnected"
  ) {
    return {
      status: "failed",
      requestedCommitSha: record.requestedCommitSha,
      resolvedCommitSha: record.resolvedCommitSha,
      statusReason: sanitizeBuildVerificationReason(record.statusReason),
      verifiedAt: null
    };
  }
  return {
    status: "preparing",
    requestedCommitSha: record.requestedCommitSha,
    resolvedCommitSha: record.resolvedCommitSha,
    statusReason: null,
    verifiedAt: null
  };
}
```

- [ ] sanitizer는 `maskDeploymentMessage`를 사용하고 line break를 제거하며 500자로 제한하고 AWS ARN을 `[AWS_RESOURCE]`로 치환한다.
- [ ] `createProjectDeliveryProfileService.get`의 첫 `Promise.all`에서 build verification record를 함께 읽고 응답에 projection을 넣는다.
- [ ] no-row 상태는 항상 `not_started`이며 Phase 2 오류로 취급하지 않는다.

### Step 6: route 및 문서를 갱신한다

- [ ] `createProfile()` route fixture에 `buildVerification`을 넣고 JSON 응답에 그대로 포함되는지 확인한다.
- [ ] `docs/data-models.md`에 새 type, mapping 규칙과 비노출 필드를 기록한다.

### Step 7: targeted test를 통과시킨다

Run:

```bash
pnpm --filter @sketchcatch/types exec tsx --test src/git-cicd-readiness-contract.test.ts
pnpm --filter @sketchcatch/api exec tsx --test src/delivery/project-delivery-profile-service.test.ts src/routes/project-delivery-profile.test.ts
```

Expected: 모두 exit code 0, 실패 projection JSON에 ARN/secret 없음.

### Step 8: 변경 범위를 검토하고 commit한다

```bash
git diff -- packages/types/src/index.ts packages/types/src/git-cicd-readiness-contract.test.ts apps/api/src/delivery/project-delivery-profile-service.ts apps/api/src/delivery/project-delivery-profile-service.test.ts apps/api/src/routes/project-delivery-profile.test.ts docs/data-models.md
git add packages/types/src/index.ts packages/types/src/git-cicd-readiness-contract.test.ts apps/api/src/delivery/project-delivery-profile-service.ts apps/api/src/delivery/project-delivery-profile-service.test.ts apps/api/src/routes/project-delivery-profile.test.ts docs/data-models.md
git commit -m "Feat: Delivery 빌드 검증 상태 제공"
```

---

## Task 3: Web Phase 2 표시를 서버 판정과 일치시키고 Phase 3 evidence를 보강

**Files:**

- Modify: `apps/web/features/workspace/cicd-readiness-presentation.test.ts:1-330`
- Modify: `apps/web/features/workspace/cicd-readiness-presentation.ts:1-330`
- Modify: `apps/web/features/workspace/CicdConsoleScreen.tsx:130-150, 747-842`
- Modify: `apps/web/features/workspace/CicdHandoffPanel.tsx:1-150, 180-240, 340-390`
- Modify: `apps/web/features/workspace/cicd-handoff-configuration-preview.test.ts:1-40`
- Modify if styling is required: `apps/web/features/workspace/cicd-handoff.module.css`

### Step 1: Web presentation test를 먼저 추가한다

- [ ] profile fixture에 `buildVerification` 기본값을 추가한다.

```ts
buildVerification: {
  status: "not_started",
  requestedCommitSha: null,
  resolvedCommitSha: null,
  statusReason: null,
  verifiedAt: null
}
```

- [ ] valid target + server target ready + no Deployment/Build Environment/URL 사례의 current phase/task를 검증한다.

```ts
assert.equal(result.currentPhase, "pr");
assert.equal(result.currentTask.id, "approve_apply_plan");
assert.equal(result.currentTask.actionLabel, "배포에서 Plan 검토하기");
```

- [ ] target object에 connectionId가 있어도 서버 missing key가 `aws_connection`이면 Phase 2가 완료가 아닌 사례를 추가한다.
- [ ] `build_config` missing key도 같은 방식으로 추가한다.
- [ ] build verification 네 상태의 한글 표시와 output pending/available/missing-after-success 표시 test를 추가한다.

### Step 2: failing test를 확인한다

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/cicd-readiness-presentation.test.ts features/workspace/cicd-handoff-configuration-preview.test.ts
```

Expected: profile의 새 required property와 새 label/row expectation 때문에 실패.

### Step 3: Phase 2 row용 서버 판정 projection을 만든다

- [ ] `cicd-readiness-presentation.ts`에 target readiness item을 읽는 pure helper를 추가한다.

```ts
export function getCicdTargetSettingState(profile: ProjectDeliveryProfile) {
  const item = profile.readiness.items.find(({ key }) => key === "deployment_target");
  const missing = new Set(item?.missingKeys ?? []);
  const target = profile.deploymentTarget;

  return {
    awsConnectionReady: Boolean(
      item && target?.connectionId && !missing.has("aws_connection")
    ),
    regionReady: Boolean(item && target?.region && !missing.has("aws_connection")),
    runtimeTargetReady: Boolean(target?.runtimeTargetKind),
    buildConfigReady: Boolean(
      item && target?.confirmedBuildConfig && !missing.has("build_config")
    )
  };
}
```

- [ ] item이 없을 때 완료로 낙관하지 않도록 target field 존재도 각 boolean에 함께 요구한다.
- [ ] `isUserConfiguredTarget`은 target field를 따로 추정하지 말고 server item `status === "ready"`를 최종 기준으로 사용한다.

### Step 4: Phase 2 네 행을 동일 state로 렌더링한다

- [ ] `CicdConsoleScreen.tsx`에서 `getCicdTargetSettingState(deliveryProfile)`을 한 번 계산한다.
- [ ] `AWS 연결`, `Region`, `실행 방식`, `빌드 설정`의 `statusLabel/statusTone`을 그 state로 통일한다.
- [ ] server가 `aws_connection`을 누락하면 connectionId/region 문자열이 남아 있어도 해당 행을 완료로 표시하지 않는다.
- [ ] server가 `build_config`를 누락하면 confirmed config가 남아 있어도 빌드 설정을 완료로 표시하지 않는다.

### Step 5: Phase 3 Build Verification과 output presentation을 추가한다

- [ ] build status pure mapping을 추가한다.

```ts
export function getCicdBuildVerificationPresentation(
  verification: ProjectDeliveryBuildVerification
) {
  switch (verification.status) {
    case "not_started":
      return { complete: false, label: "Plan 생성 시 자동 준비" };
    case "preparing":
      return { complete: false, label: "검증 중" };
    case "verified":
      return { complete: true, label: "검증 완료" };
    case "failed":
      return { complete: false, label: verification.statusReason ?? "검증 실패" };
  }
}
```

- [ ] `CicdHandoffPanel`에 `buildVerification`과 `deploymentTarget` prop을 전달한다.
- [ ] `sourceDeployment?.status === "SUCCESS"` 또는 `readiness.initialApplicationReleaseId !== null`을 이용한 `deploymentSucceeded` prop도 전달해 “아직 배포 전”과 “성공했지만 URL 없음”을 구분한다.
- [ ] `Apply Plan` 바로 다음에 `Repository 빌드 검증` 행을 표시한다.
- [ ] `배포 결과` 아래에 `Static Site URL`, `API Base URL`을 각각 표시한다.
- [ ] URL은 `configurationPreview`만 source of truth로 사용하고 raw target 내부 origin URL은 표시하지 않는다.
- [ ] initial release 전 null은 `배포 후 자동 확인`, 성공 후 applicable URL이 없으면 `확인 필요`, runtime에 적용되지 않는 URL은 `생성 대상 아님`으로 구분한다.
- [ ] 실제 URL이 있으면 credential-free HTTPS link로 렌더링한다.
- [ ] CTA 문구를 `배포에서 Plan 검토하기`로 바꾸고 handler는 기존 `onOpenDirectDeployment?.(null)`만 호출한다.

### Step 6: targeted Web test를 통과시킨다

Run:

```bash
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/cicd-readiness-presentation.test.ts features/workspace/cicd-handoff-configuration-preview.test.ts features/workspace/cicd-task-focused-layout.test.ts features/workspace/delivery-center-integration.test.ts
pnpm --filter @sketchcatch/web typecheck
```

Expected: test/typecheck exit code 0. Typecheck가 기존 unrelated dirty worktree 오류를 발견하면 이번 변경 오류와 구분해 기록한다.

### Step 7: 변경 범위를 검토하고 commit한다

```bash
git diff -- apps/web/features/workspace/cicd-readiness-presentation.ts apps/web/features/workspace/cicd-readiness-presentation.test.ts apps/web/features/workspace/CicdConsoleScreen.tsx apps/web/features/workspace/CicdHandoffPanel.tsx apps/web/features/workspace/cicd-handoff-configuration-preview.test.ts apps/web/features/workspace/cicd-handoff.module.css
git add apps/web/features/workspace/cicd-readiness-presentation.ts apps/web/features/workspace/cicd-readiness-presentation.test.ts apps/web/features/workspace/CicdConsoleScreen.tsx apps/web/features/workspace/CicdHandoffPanel.tsx apps/web/features/workspace/cicd-handoff-configuration-preview.test.ts apps/web/features/workspace/cicd-handoff.module.css
git commit -m "Fix: CI/CD 단계 완료와 배포 evidence 표시 일치"
```

Expected: 기존 디자인 작업의 unrelated hunk를 분리할 수 있을 때만 commit한다.

---

## Task 4: Plan 안전 경계와 신규 프로젝트 전환 흐름 회귀 고정

**Files:**

- Modify: `apps/api/src/routes/deployments.test.ts:2720-2925`
- Modify: `apps/api/src/delivery/project-delivery-profile-service.test.ts`
- Modify: `apps/web/features/workspace/cicd-readiness-presentation.test.ts`
- Modify: `apps/web/features/workspace/delivery-center-integration.test.ts`

### Step 1: Plan 경계 회귀 test를 명시적으로 보강한다

- [ ] ECS full-stack Plan에서 호출 순서가 아래와 같은지 유지한다.

```ts
assert.deepEqual(calls, [
  "prepare_build_environment",
  "verify_repository_access",
  "preflight_and_plan"
]);
```

- [ ] checkout 실패 시 `planCalls === 0`, deployment `FAILED`, `failureStage === "build_environment"`를 유지한다.
- [ ] CI/CD target 저장 또는 Delivery Profile GET 자체는 build preparation/verification mock을 호출하지 않는 test를 추가한다.

### Step 2: 신규 프로젝트 end-to-end state transition을 test로 고정한다

- [ ] 같은 fixture에서 다음 상태 변화를 순서대로 검증한다.

```text
Repository + monitoring + target 저장
→ currentPhase: pr / currentTask: approve_apply_plan
→ buildVerification: not_started / Plan 생성 시 자동 준비
→ Plan 요청 후 buildVerification: verified
→ Apply + 최초 앱 배포 evidence 후 Static Site URL/API Base URL 표시
→ PR 생성 가능
```

- [ ] CI/CD CTA 호출 test는 Direct Deployment open callback만 1회 호출되고 Plan/Apply API mock은 호출되지 않음을 확인한다.

### Step 3: 관련 회귀 test를 실행한다

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/routes/deployments.test.ts src/delivery/project-delivery-profile-service.test.ts src/git-cicd/git-cicd-readiness-service.test.ts
pnpm --filter @sketchcatch/web exec tsx --test features/workspace/cicd-readiness-presentation.test.ts features/workspace/delivery-center-integration.test.ts features/workspace/cicd-handoff-configuration-preview.test.ts
```

Expected: 모두 exit code 0.

### Step 4: 회귀 test만의 변경이 있으면 commit한다

```bash
git diff -- apps/api/src/routes/deployments.test.ts apps/api/src/delivery/project-delivery-profile-service.test.ts apps/web/features/workspace/cicd-readiness-presentation.test.ts apps/web/features/workspace/delivery-center-integration.test.ts
git add apps/api/src/routes/deployments.test.ts apps/api/src/delivery/project-delivery-profile-service.test.ts apps/web/features/workspace/cicd-readiness-presentation.test.ts apps/web/features/workspace/delivery-center-integration.test.ts
git commit -m "Test: CI/CD readiness 순환 의존 회귀 방지"
```

---

## Task 5: 전체 검증, self-review, harness 기록

**Files:**

- Modify carefully: `agent-progress.md`
- Modify only if next session needs continuation: `session-handoff.md`

### Step 1: placeholder와 계약 불일치를 검색한다

Run:

```bash
rg -n "runtime_config|output_url|inspect_runtime_outputs|inspect_output_url" packages/types/src apps/api/src apps/web/features/workspace docs/data-models.md
rg -n "repositoryVerificationBuildArn|codeBuildServiceRoleArn|permissionsBoundaryArn|secretAccessKey|sessionToken" apps/api/src/delivery packages/types/src apps/web/features/workspace
```

Expected:

- 첫 검색은 legacy compatibility나 별도 runtime 도메인 사용만 남고 readiness union/map에는 결과가 없다.
- 두 번째 검색은 Delivery Profile DTO/store select/Web에서 결과가 없다.

### Step 2: affected package test와 typecheck를 실행한다

Run:

```bash
pnpm --filter @sketchcatch/types test
pnpm --filter @sketchcatch/api test
pnpm --filter @sketchcatch/web test
pnpm --filter @sketchcatch/types typecheck
pnpm --filter @sketchcatch/api typecheck
pnpm --filter @sketchcatch/web typecheck
```

Expected: 모두 exit code 0. 기존 unrelated 실패는 command/output과 함께 별도로 기록하고 이번 변경의 실패를 숨기지 않는다.

### Step 3: repository required checks를 실행한다

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

Expected: 모두 exit code 0.

### Step 4: adversarial self-review를 수행한다

- [ ] CI/CD Phase 2 GET/refresh가 AWS 또는 GitHub provider mutation을 호출하지 않는지 확인한다.
- [ ] Plan 전 Build Environment가 없는 정상 상태가 `not_started`이고 오류가 아닌지 확인한다.
- [ ] verified connection 해제/Region mismatch가 실제로 Phase 2로 되돌리는지 확인한다.
- [ ] source Repository revision 변경 뒤 기존 confirmed config가 stale로 판정되는지 확인한다.
- [ ] approved Plan이 존재하려면 checkout verification이 성공해야 하는 기존 경계가 유지되는지 확인한다.
- [ ] URL은 public credential-free HTTPS projection만 표시되는지 확인한다.
- [ ] successful release인데 applicable output URL이 없을 때만 `확인 필요`로 표시되는지 확인한다.
- [ ] DB schema/migration diff가 없는지 확인한다.

### Step 5: harness 기록을 업데이트한다

- [ ] `agent-progress.md`에 변경 요약, 실행한 command, 성공/실패, known risk와 다음 action을 영어로 간결하게 추가한다.
- [ ] `feature_list.json`은 해당 workstream이 이미 존재할 때만 evidence와 `lastVerified`를 갱신하고, 다른 in-progress 항목을 만들지 않는다.
- [ ] continuation이 필요할 때만 `session-handoff.md`를 갱신한다.
- [ ] 마지막으로 `pnpm harness:check`를 다시 실행한다.

### Step 6: 최종 diff와 status를 검토한다

Run:

```bash
git diff --check
git status --short
git log -5 --oneline
```

Expected:

- whitespace error 없음.
- migration 파일 변경 없음.
- 관련 없는 기존 dirty file은 보존됨.
- 완료 보고에는 changed files, checks, 못 돌린 check, 남은 risk를 명시함.
