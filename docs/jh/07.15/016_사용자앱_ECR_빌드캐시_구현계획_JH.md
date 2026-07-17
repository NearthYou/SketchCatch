# 사용자 앱 ECR 빌드 캐시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repository가 연결된 ECS/Fargate 프로젝트의 첫 CodeBuild 결과를 프로젝트 전용 ECR cache에 저장하고 다음 commit 빌드에서 변경되지 않은 Docker layer를 재사용한다.

**Architecture:** 사용자 AWS account/region에 프로젝트별 cache Repository를 생성하고 build-only role에는 그 Repository의 layer read/write만 허용한다. server-generated preflight buildspec이 BuildKit registry cache를 import/export하며, 실제 release image는 계속 SketchCatch 내부 Artifact S3 검증과 trusted worker를 통해 배포한다.

**Tech Stack:** TypeScript, AWS SDK v3 ECR/IAM/CodeBuild, AWS CloudFormation YAML, Docker Buildx/BuildKit, Node test runner, pnpm

## Global Constraints

- 대상은 ECS/Fargate Direct Deployment와 Git/CI/CD Application Release가 공유하는 preflight candidate build다.
- cache Repository 이름은 `sketchcatch-<projectId 앞 8자>-build-cache`, tag는 `buildcache-v1-linux-amd64`다.
- CodeBuild role에는 배포용 ECR, ECS, S3, CloudFront, `iam:PassRole` 권한을 추가하지 않는다.
- cache tag는 ECS Task Definition이나 ApplicationArtifact reference로 사용하지 않는다.
- cache 실패는 cold build로 전환하고 release 실패로 취급하지 않는다.
- 공개 API와 DB schema는 변경하지 않으며 migration을 만들지 않는다.
- 기존 AWS 연결은 새 CloudFormation permissions boundary를 받기 위해 한 번 재연결한다.
- 프로젝트와 AWS 연결 cleanup은 ownership tag를 확인한 cache Repository까지 삭제한다.

---

### Task 1: cache identity와 CloudFormation 권한 상한

**Files:**
- Create: `apps/api/src/build-environments/project-build-cache.ts`
- Create: `apps/api/src/build-environments/project-build-cache.test.ts`
- Modify: `apps/api/src/build-environments/project-build-environment-service.ts`
- Modify: `apps/api/src/build-environments/project-build-environment-service.test.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-service.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-service.test.ts`

**Interfaces:**
- Produces: `createProjectBuildCacheIdentity(input): ProjectBuildCacheIdentity`
- `ProjectBuildCacheIdentity`: `repositoryName`, `repositoryArn`, `repositoryUri`, `cacheTag`, `cacheReference`
- `DesiredProjectBuildEnvironment.buildCache`와 runtime fingerprint가 이 identity를 포함한다.

- [ ] **Step 1: 실패 테스트 작성**

```ts
test("project cache identity is deterministic and account scoped", () => {
  const value = createProjectBuildCacheIdentity({
    projectId: "5ac411f8-10cf-4092-8440-790836a6471b",
    accountId: "131404649047",
    region: "ap-northeast-2"
  });
  assert.equal(value.repositoryName, "sketchcatch-5ac411f8-build-cache");
  assert.equal(value.cacheTag, "buildcache-v1-linux-amd64");
  assert.equal(
    value.repositoryArn,
    "arn:aws:ecr:ap-northeast-2:131404649047:repository/sketchcatch-5ac411f8-build-cache"
  );
});
```

CloudFormation 테스트는 boundary에 `ecr:GetAuthorizationToken`과 7개 layer action이 있고 Resource가 `repository/sketchcatch-*-build-cache`로 제한되는지 확인한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/build-environments/project-build-cache.test.ts src/build-environments/project-build-environment-service.test.ts src/aws-connections/aws-connection-service.test.ts
```

Expected: cache identity와 boundary action이 없어 FAIL.

- [ ] **Step 3: 최소 구현**

```ts
export const projectBuildCacheTag = "buildcache-v1-linux-amd64";

export function createProjectBuildCacheIdentity(input: {
  projectId: string;
  accountId: string;
  region: string;
}): ProjectBuildCacheIdentity {
  const suffix = input.projectId.replaceAll("-", "").slice(0, 8).toLowerCase();
  const repositoryName = "sketchcatch-" + suffix + "-build-cache";
  const repositoryUri =
    input.accountId + ".dkr.ecr." + input.region + ".amazonaws.com/" + repositoryName;
  return {
    repositoryName,
    repositoryArn:
      "arn:aws:ecr:" + input.region + ":" + input.accountId + ":repository/" + repositoryName,
    repositoryUri,
    cacheTag: projectBuildCacheTag,
    cacheReference: repositoryUri + ":" + projectBuildCacheTag
  };
}
```

CloudFormation boundary에는 `ecr:GetAuthorizationToken` on `*`와 exact cache-name pattern의 layer read/write statement를 추가한다. 실제 desired environment에는 project exact ARN을 넣는다.

- [ ] **Step 4: 통과 확인**

Run: Step 2와 동일. Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/build-environments/project-build-cache.ts apps/api/src/build-environments/project-build-cache.test.ts apps/api/src/build-environments/project-build-environment-service.ts apps/api/src/build-environments/project-build-environment-service.test.ts apps/api/src/aws-connections/aws-connection-service.ts apps/api/src/aws-connections/aws-connection-service.test.ts
git commit -m "Feat: 프로젝트별 ECR 빌드 캐시 계약 추가"
```

### Task 2: ECR Repository reconcile·verify·remove와 build-only IAM

**Files:**
- Modify: `apps/api/src/build-environments/aws-project-build-environment-gateway.ts`
- Modify: `apps/api/src/build-environments/aws-project-build-environment-gateway.test.ts`

**Interfaces:**
- Consumes: `DesiredProjectBuildEnvironment.buildCache`
- Produces: gateway `reconcile`, `verify`, `remove`가 ECR cache까지 managed build environment로 다룬다.

- [ ] **Step 1: 실패 테스트 작성**

Mock ECR client에서 다음을 검증한다.

```text
DescribeRepositories
CreateRepository(AES256, MUTABLE, ownership tags)
PutLifecyclePolicy(imageCountMoreThan 3)
DescribeRepositories
ListTagsForResource
GetLifecyclePolicy
```

추가 테스트는 unmanaged Repository 수정·삭제 거부, Repository 생성 뒤 IAM 실패 시 이번 호출이 생성한 Repository만 보상 삭제, remove의 `DeleteRepository(force=true)`, 설정·tag·lifecycle drift 검출을 포함한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/build-environments/aws-project-build-environment-gateway.test.ts
```

Expected: ECR client dependency가 없어 FAIL.

- [ ] **Step 3: ECR lifecycle 구현**

`createAwsProjectBuildEnvironmentGateway`에 `createEcrClient`를 추가하고 모든 client factory의 `finally`에서 destroy한다. Reconcile 순서는 cache Repository, build role, CodeBuild project, 전체 verify다. 실패 시 이번 호출이 만든 project, role, Repository만 역순으로 보상 삭제한다.

- [ ] **Step 4: build-only IAM 구현**

Inline policy는 `ecr:GetAuthorizationToken` on `*`와 다음 action을 `input.buildCache.repositoryArn`에만 허용한다.

```text
ecr:BatchCheckLayerAvailability
ecr:GetDownloadUrlForLayer
ecr:BatchGetImage
ecr:InitiateLayerUpload
ecr:UploadLayerPart
ecr:CompleteLayerUpload
ecr:PutImage
```

`ecs:`, `s3:`, `cloudfront:`, `iam:PassRole` 금지는 유지한다. CodeBuild project의 native cache는 `NO_CACHE`를 유지한다.

- [ ] **Step 5: 통과 확인**

Run: Step 2와 동일. Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/api/src/build-environments/aws-project-build-environment-gateway.ts apps/api/src/build-environments/aws-project-build-environment-gateway.test.ts
git commit -m "Feat: 빌드 캐시 ECR 환경 자동 관리"
```

### Task 3: BuildKit registry cache와 cold-build fallback

**Files:**
- Modify: `apps/api/src/releases/preflight-buildspec.ts`
- Modify: `apps/api/src/releases/preflight-buildspec.test.ts`
- Modify: `apps/api/src/deployments/aws-codebuild-direct-application-release-gateway.ts`
- Modify: `apps/api/src/deployments/aws-codebuild-direct-application-release-gateway.test.ts`

**Interfaces:**
- Consumes: `DesiredProjectBuildEnvironment.buildCache.cacheReference`
- Produces: `SKETCHCATCH_BUILD_CACHE_REFERENCE`, `SKETCHCATCH_BUILD_CACHE_REGISTRY` overrides와 cache-aware buildspec

- [ ] **Step 1: 실패 테스트 작성**

```ts
assert.match(buildspec, /docker buildx build/);
assert.match(buildspec, /--cache-from/);
assert.match(buildspec, /--cache-to/);
assert.match(buildspec, /ignore-error=true/);
assert.match(buildspec, /--load/);
assert.match(buildspec, /falling back to a cold Docker build/);
assert.doesNotMatch(buildspec, /SKETCHCATCH_ECR_REPOSITORY/);
```

StartBuild 테스트는 cache reference가 server-generated override로 전달되고 배포용 ECR 이름은 전달되지 않는지 확인한다.

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/releases/preflight-buildspec.test.ts src/deployments/aws-codebuild-direct-application-release-gateway.test.ts
```

Expected: cache-aware build command가 없어 FAIL.

- [ ] **Step 3: 최소 구현**

buildspec은 ECR login과 Buildx가 성공하면 registry cache를 사용한다.

```bash
docker buildx build \
  --file "$SKETCHCATCH_DOCKERFILE_PATH" \
  --tag sketchcatch-preflight-api \
  --cache-from "type=registry,ref=$SKETCHCATCH_BUILD_CACHE_REFERENCE" \
  --cache-to "type=registry,ref=$SKETCHCATCH_BUILD_CACHE_REFERENCE,mode=max,oci-mediatypes=true,image-manifest=true,ignore-error=true" \
  --load \
  "$SKETCHCATCH_API_SOURCE_ROOT"
```

ECR login, Buildx 준비 또는 cached build가 실패하면 이유를 secret 없이 stderr에 남기고 기존 `docker build`을 정확히 한 번 실행한다. cache 실패가 candidate 실패로 전환되지 않게 한다.

- [ ] **Step 4: environment override 구현**

`createPreflightEnvironmentOverrides`는 client 입력이 아니라 현재 context의 account, region, projectId로 desired cache identity를 다시 계산해 registry와 reference를 전달한다. `verifyBuildEnvironment`도 같은 identity와 runtime fingerprint를 재검증한다.

- [ ] **Step 5: 통과 확인**

Run: Step 2와 동일. Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/api/src/releases/preflight-buildspec.ts apps/api/src/releases/preflight-buildspec.test.ts apps/api/src/deployments/aws-codebuild-direct-application-release-gateway.ts apps/api/src/deployments/aws-codebuild-direct-application-release-gateway.test.ts
git commit -m "Feat: 사용자 앱 Docker layer 캐시 적용"
```

### Task 4: 프로젝트·AWS 연결 cleanup과 운영 계약

**Files:**
- Modify: `apps/api/src/aws-connections/aws-connection-managed-cleanup.ts`
- Modify: `apps/api/src/aws-connections/aws-connection-managed-cleanup.test.ts`
- Modify: `apps/api/src/projects/project-deletion-service.test.ts`
- Modify: `docs/deployment.md`
- Modify: `feature_list.json`

**Interfaces:**
- Consumes: `codeBuildProjects[].projectId`, connection account와 region
- Produces: managed cleanup이 cache identity를 계산하고 owned Repository를 삭제한다.

- [ ] **Step 1: 실패 테스트 작성**

```text
owned tags -> DeleteRepository(force=true)
unmanaged tags -> cleanup 중단, DB 기록 보존
missing Repository -> idempotent success
ECR delete error -> project/AWS connection cleanup failure
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/aws-connections/aws-connection-managed-cleanup.test.ts src/projects/project-deletion-service.test.ts
```

Expected: ECR cleanup이 없어 FAIL.

- [ ] **Step 3: cleanup 구현**

`createAwsConnectionManagedCleanup`에 ECR client를 추가한다. 각 build project의 cache identity를 계산하고 Repository ARN과 `ManagedBy`, `SketchCatchProject`, `SketchCatchPurpose` tags를 확인한 뒤 `DeleteRepository(force=true)`를 실행한다. missing Resource만 성공으로 처리한다.

- [ ] **Step 4: 문서와 tracker 수정**

`docs/deployment.md`는 사용자 CodeBuild가 프로젝트 전용 ECR build cache만 사용하고 배포용 ECR/ECS 권한은 갖지 않는다고 기록한다. `feature_list.json`은 실제 구현 파일과 검증 명령을 evidence에 반영한다.

- [ ] **Step 5: 통과 확인**

Run: Step 2와 동일. Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/api/src/aws-connections/aws-connection-managed-cleanup.ts apps/api/src/aws-connections/aws-connection-managed-cleanup.test.ts apps/api/src/projects/project-deletion-service.test.ts docs/deployment.md feature_list.json
git commit -m "Fix: 빌드 캐시 정리와 운영 계약 일치"
```

### Task 5: 통합 검증과 014 구현 전환

**Files:**
- Audit: `docs/jh/07.15/014_Direct_Deployment_최초앱자동배포와_CICD설치분리_구현계획_JH.md`
- Update evidence: `docs/jh/07.15/016_사용자앱_ECR_빌드캐시_구현계획_JH.md`

**Interfaces:**
- Produces: cache 구현 증거와 014 요구사항별 구현 gap

- [ ] **Step 1: cache 집중 테스트**

```bash
pnpm --filter @sketchcatch/api exec tsx --test \
  src/build-environments/project-build-cache.test.ts \
  src/build-environments/project-build-environment-service.test.ts \
  src/build-environments/aws-project-build-environment-gateway.test.ts \
  src/releases/preflight-buildspec.test.ts \
  src/deployments/aws-codebuild-direct-application-release-gateway.test.ts \
  src/aws-connections/aws-connection-service.test.ts \
  src/aws-connections/aws-connection-managed-cleanup.test.ts \
  src/projects/project-deletion-service.test.ts
```

Expected: 모두 PASS.

- [ ] **Step 2: 필수 저장소 검증**

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: 모두 exit code 0.

- [ ] **Step 3: 실제 AWS 검증**

현재 AWS 연결을 삭제·재연결하고 `빌드 환경 준비`를 실행한다. commit 두 개를 순서대로 배포해 두 번째 CodeBuild log의 cached layer, final release digest와 cache tag 분리, Docker build phase 단축을 확인한다. 검증 뒤 cache Repository는 프로젝트 삭제 또는 명시적 cleanup으로 제거한다.

- [ ] **Step 4: 014 요구사항 audit와 구현**

014의 모든 checkbox와 완료 조건을 shared type, API, DB, frontend, GitHub workflow, 테스트에 매핑한다. 이미 구현된 항목은 직접 근거를 기록하고, 누락되거나 간접 근거만 있는 항목은 TDD로 구현한다. cache 구현을 014 완료 증거로 대체하지 않는다.

- [ ] **Step 5: 014 필수 검증**

014에서 명시한 집중 테스트와 `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`를 실행하고 요구사항별 완료 증거를 대조한다.
