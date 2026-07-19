# GitOps Build Environment Commit Fingerprint 오류 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions가 승인 이후의 새 커밋을 전달해도, 물리적으로 동일한 Project Build Environment를 커밋 차이만으로 거부하지 않는다.

**Architecture:** Project Build Environment fingerprint는 재사용되는 CodeBuild project·role·Repository·CodeConnection·build configuration만 나타내고 실행마다 달라지는 `confirmedCommitSha`는 포함하지 않는다. 기존 DB에 commit 포함 fingerprint가 남아 있어도 실제 CodeBuild 계약을 구성하는 명시 필드와 AWS 검증이 통과하면 release를 허용한다. 커밋 자체는 기존 OIDC run identity, CodeBuild `sourceVersion`, ReleaseCandidate/ApplicationArtifact 계약에서 계속 검증한다.

**Tech Stack:** TypeScript, Node test runner, AWS CodeBuild adapter, pnpm workspace

## Global Constraints

- 오류 수정 범위는 commit SHA 때문에 발생하는 `BUILD_ENVIRONMENT_CHANGED`만 포함한다.
- 기존 사용자 변경, DB schema, Drizzle migration, UI, GitHub workflow YAML은 수정하지 않는다.
- 실제 AWS mutation, 배포 재실행, commit, push는 수행하지 않는다.
- `dev`의 공유 dirty worktree를 보존한다.

---

### Task 1: Commit-independent Build Environment identity

**Files:**
- Modify: `apps/api/src/build-environments/project-build-environment-service.test.ts`
- Modify: `apps/api/src/build-environments/project-build-environment-service.ts`
- Create: `apps/api/src/deployments/project-build-environment-release-verification.test.ts`
- Modify: `apps/api/src/deployments/aws-codebuild-direct-application-release-gateway.ts`

**Interfaces:**
- Consumes: `createDesiredProjectBuildEnvironment(context)` and `verifyCurrentProjectBuildEnvironment(context, gateway)`
- Produces: commit-independent `runtimeFingerprint` and legacy-fingerprint-compatible release verification

- [x] **Step 1: Write the failing fingerprint test**

Change the existing commit test to require equality:

```ts
test("build environment fingerprint stays stable when only the confirmed commit changes", () => {
  // Create identical environment/build configuration inputs with different confirmedCommitSha values.
  assert.equal(first.runtimeFingerprint, second.runtimeFingerprint);
});
```

- [x] **Step 2: Write the failing release compatibility test**

Create a real `DirectApplicationReleaseContext` whose stored environment has a legacy fingerprint, while all physical CodeBuild contract fields match the newly approved commit. Stub only the AWS gateway boundary and assert verification reaches it:

```ts
let verifyCalls = 0;
await verifyCurrentProjectBuildEnvironment(context, {
  async reconcile() {
    throw new Error("Unexpected reconcile");
  },
  async verify() {
    verifyCalls += 1;
    return { verified: true, statusReason: null };
  },
  async verifyRepositoryAccess() {
    throw new Error("Unexpected repository verification");
  }
});
assert.equal(verifyCalls, 1);
```

- [x] **Step 3: Run RED verification**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  --test-name-pattern "build environment fingerprint stays stable|release verification accepts" \
  src/build-environments/project-build-environment-service.test.ts \
  src/deployments/project-build-environment-release-verification.test.ts
```

Expected: both tests fail because the current hash contains `confirmedCommitSha` and release verification rejects the legacy fingerprint before calling the gateway.

- [x] **Step 4: Implement the minimal production fix**

Keep `confirmedCommitSha` in `DesiredProjectBuildEnvironment` for exact checkout verification, but exclude it from the fingerprint input:

```ts
const confirmedCommitSha = context.confirmedBuildConfig.confirmedCommitSha.toLowerCase();
const fingerprintInput = {
  projectId: context.projectId,
  codeBuildProjectName,
  codeBuildServiceRoleArn,
  permissionsBoundaryArn,
  sourceRepositoryUrl,
  codeConnectionArn: context.codeConnection.connectionArn,
  image: projectBuildImage,
  computeType: projectBuildComputeType,
  buildCache,
  buildConfig: context.confirmedBuildConfig.ecsWeb
} as const;
const runtimeFingerprint = createHash("sha256")
  .update(JSON.stringify(fingerprintInput))
  .digest("hex");
return {
  ...fingerprintInput,
  awsConnection: context.awsConnection,
  awsCodeConnectionId: context.codeConnection.id,
  codeBuildServiceRoleName,
  confirmedCommitSha,
  runtimeFingerprint
};
```

In release verification, remove only the `runtimeFingerprint` equality guard. Preserve the explicit project name, role ARN, permissions boundary, Repository URL checks and `gateway.verify(desired)` AWS contract verification.

- [x] **Step 5: Run GREEN and focused regression verification**

Run the RED command again, then:

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/build-environments/project-build-environment-service.test.ts \
  src/deployments/project-build-environment-release-verification.test.ts \
  src/deployments/aws-codebuild-direct-application-release-gateway.test.ts \
  src/git-cicd/github-release-run-executor.test.ts
```

Expected: all selected tests pass with zero failures.

- [x] **Step 6: Run repository checks and scoped review**

Run `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Then request a read-only sub-agent review limited to the four files above and fix only Critical or Important findings that concern this error.
