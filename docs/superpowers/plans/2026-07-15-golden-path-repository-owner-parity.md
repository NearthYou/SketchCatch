# Golden-path Repository Owner Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `whiskend/audience-live-check.git`과 owner만 다른 `jh-9999/audience-live-check.git`이 각각의 실제 GitHub evidence를 읽으면서 동일한 ECS Fargate Repository 분석 절차를 통과하도록 회귀 보호한다.

**Architecture:** 공개 Repository endpoint가 URL의 owner/name을 소문자로 정규화한 뒤 해당 Repository의 branch, tree, evidence를 독립적으로 조회한다. 추천기는 owner를 입력으로 받지 않고 동일한 Dockerfile·Application Unit·README evidence에 같은 ECS Fargate 우선순위를 적용한다. URL allowlist, revision 공유, cache alias는 추가하지 않는다.

**Tech Stack:** TypeScript, Fastify injection, Node.js test runner, Zod, pnpm 11.8.0

## Global Constraints

- 실제 GitHub Repository를 수정하거나 GitHub App 권한을 변경하지 않는다.
- Terraform Plan/Apply, AWS 배포 또는 Git/CI/CD handoff를 실행하지 않는다.
- 각 Repository의 실제 `repositoryRevision`과 owner/name 경계를 유지한다.
- Repository 분석 관련 집중 테스트와 필수 `harness`, `lint`, `typecheck`, `build`만 실행한다.
- dependency와 DB schema를 변경하지 않는다.

---

### Task 1: 공개 Repository owner 동등성 회귀 보호

**Files:**
- Modify: `apps/api/src/routes/public-repository-analysis-revision.test.ts`
- Modify: `apps/api/src/routes/ai.ts:957`

**Interfaces:**
- Consumes: `POST /ai/source-repository-analysis`의 `{ repositoryUrl, defaultBranch? }` 요청과 현재 `SourceRepositoryAnalysisResult` 응답
- Produces: `parseGitHubRepositoryUrl(repositoryUrl: string): { owner: string; repo: string }`가 소문자 owner/name을 반환하는 내부 계약

- [x] **Step 1: 실제 endpoint를 통과하는 실패 회귀 테스트 작성**

`public-repository-analysis-revision.test.ts`에 Fastify와 `registerAiRoutes`를 사용한 테스트를 추가한다. `globalThis.fetch`를 복구 가능한 mock으로 교체하고 metadata, branches, tree, raw evidence 응답을 제공한다.

```ts
test("public Repository analysis keeps owner-only golden-path forks on the same ECS flow", async () => {
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  process.env.OPENAI_API_KEY = "";
  globalThis.fetch = createGoldenPathRepositoryFetch(requestedUrls);

  const app = Fastify({ logger: false });

  try {
    await registerAiRoutes(app);
    await app.ready();

    for (const repositoryUrl of [
      "https://github.com/Whiskend/audience-live-check.git",
      "https://github.com/JH-9999/audience-live-check.git"
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/ai/source-repository-analysis",
        payload: { repositoryUrl }
      });
      const result = response.json<SourceRepositoryAnalysisResult>();

      assert.equal(response.statusCode, 200, repositoryUrl);
      assert.equal(result.repositoryRevision, "a".repeat(40), repositoryUrl);
      assert.equal(result.recommendedTemplateId, "ecs-fargate-container-app", repositoryUrl);
      assert.equal(
        result.aiHandoff?.recommendation?.candidates[0]?.templateId,
        "ecs-fargate-container-app",
        repositoryUrl
      );
    }

    assert.equal(requestedUrls.some((url) => /Whiskend|JH-9999/u.test(url)), false);
    assert.equal(requestedUrls.some((url) => url.includes("/repos/whiskend/audience-live-check")), true);
    assert.equal(requestedUrls.some((url) => url.includes("/repos/jh-9999/audience-live-check")), true);
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
  }
});
```

mock evidence는 root workspace package, React/Vite web package, Express API package, `apps/api/Dockerfile`, ECS/Fargate golden-path README를 반환한다.

```ts
function createGoldenPathRepositoryFetch(requestedUrls: string[]): typeof fetch {
  const files: Readonly<Record<string, string>> = {
    "package.json": JSON.stringify({ private: true, workspaces: ["apps/*", "packages/*"] }),
    "apps/api/package.json": JSON.stringify({ dependencies: { express: "latest" } }),
    "apps/web/package.json": JSON.stringify({
      dependencies: { react: "latest" },
      devDependencies: { vite: "latest" }
    }),
    "apps/api/Dockerfile": "FROM node:24\nEXPOSE 8080\nHEALTHCHECK CMD curl -f http://localhost:8080/health",
    "README.md": "apps/web은 S3와 CloudFront로 정적 배포합니다. apps/api는 Docker image를 ECR에 push한 뒤 ECS/Fargate Service로 실행합니다. 데이터베이스는 사용하지 않습니다."
  };

  return async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

    requestedUrls.push(url);

    if (url.includes("/branches?")) {
      return Response.json([{ name: "main", commit: { sha: "a".repeat(40) } }]);
    }

    if (url.includes("/git/trees/main?recursive=1")) {
      return Response.json({
        truncated: false,
        tree: Object.keys(files).map((path) => ({ path, type: "blob" }))
      });
    }

    if (url.startsWith("https://raw.githubusercontent.com/")) {
      const path = decodeURIComponent(new URL(url).pathname.split("/").slice(4).join("/"));
      const content = files[path];
      return content === undefined
        ? new Response("", { status: 404 })
        : new Response(content, { status: 200 });
    }

    if (/\/repos\/(?:whiskend|jh-9999)\/audience-live-check$/u.test(url)) {
      return Response.json({ default_branch: "main" });
    }

    return new Response("", { status: 404 });
  };
}
```

- [x] **Step 2: 집중 테스트를 실행해 올바른 실패 확인**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/routes/public-repository-analysis-revision.test.ts
```

Expected: 두 분석 응답은 ECS Fargate지만 GitHub 요청 URL에 `Whiskend` 또는 `JH-9999`가 남아 정규화 assertion이 실패한다.

- [x] **Step 3: URL parser에서 owner/name을 최소 정규화**

`apps/api/src/routes/ai.ts`의 기존 parser 반환값만 변경한다.

```ts
return {
  owner: owner?.toLowerCase() ?? "",
  repo: repo?.toLowerCase() ?? ""
};
```

추천 점수, 후보 순서, cache namespace와 evidence 선택 규칙은 변경하지 않는다.

- [x] **Step 4: 같은 집중 테스트를 실행해 통과 확인**

Run:

```bash
pnpm --filter @sketchcatch/api exec tsx --test src/routes/public-repository-analysis-revision.test.ts src/source-repositories/repository-template-recommendation.test.ts
```

Expected: route owner parity와 기존 ECS Fargate AI 재정렬 보호 테스트가 모두 PASS한다.

- [x] **Step 5: 구현 변경 커밋**

```bash
git add apps/api/src/routes/ai.ts apps/api/src/routes/public-repository-analysis-revision.test.ts
git commit -m "Fix: Repository fork 분석 동등성 보호"
```

---

### Task 2: 하네스 증거와 최종 검증

**Files:**
- Modify: `feature_list.json`
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: Task 1의 집중 테스트 결과와 실제 공개 endpoint 재현 결과
- Produces: `REPOSITORY-ANALYSIS-DRAFT-FLOW-001`의 최신 owner parity 검증 증거

- [x] **Step 1: feature tracker에 두 owner의 동등성 기록**

`REPOSITORY-ANALYSIS-DRAFT-FLOW-001.verification`의 기존 `whiskend` 항목을 다음 내용으로 확장한다.

```json
"whiskend/audience-live-check와 jh-9999/audience-live-check의 동일한 golden-path 근거는 owner와 무관하게 AI confidence 재정렬 이후에도 ECS Fargate를 1순위로 유지한다."
```

evidence commands에 집중 route/recommendation 테스트와 두 URL의 live read-only POST를 기록한다.

- [x] **Step 2: agent progress에 결과와 비변경 경계 기록**

`agent-progress.md`에 다음 사실을 영어로 기록한다.

```markdown
### 2026-07-15 - Preserve golden-path Repository owner parity

- Verified that the whiskend and jh-9999 audience-live-check repositories currently resolve to the same commit and independently produce ECS Fargate as the top recommendation.
- Normalized public GitHub owner/name casing and added an endpoint-level regression covering both `.git` URLs without adding an owner allowlist or cache alias.
- Verification: focused public Repository route and recommendation tests, harness, lint, typecheck, build, and diff checks pass. No GitHub, cloud, deployment, or Terraform mutation was performed.
```

- [x] **Step 3: 필수 검증 실행**

Run:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: 모든 명령이 exit code 0으로 통과한다. 전체 `pnpm test`는 변경 범위 밖이므로 실행하지 않는다.

- [x] **Step 4: 종료 하네스 확인과 증거 커밋**

Run:

```bash
pnpm harness:check
git add feature_list.json agent-progress.md docs/superpowers/plans/2026-07-15-golden-path-repository-owner-parity.md
git commit -m "Docs: Repository fork 분석 검증 기록"
```

Expected: 하네스가 통과하고 worktree가 clean 상태가 된다.
