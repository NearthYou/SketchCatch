import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SourceRepositoryAnalysisResult } from "@sketchcatch/types";

import {
  fetchPublicRepositoryBranchInventory,
  registerAiRoutes,
  resolvePublicRepositoryRevision
} from "./ai.js";

test("public Repository analysis resolves the selected branch head SHA", () => {
  assert.equal(
    resolvePublicRepositoryRevision(
      [
        { name: "main", revision: "a".repeat(40) },
        { name: "develop", revision: "b".repeat(40) }
      ],
      "develop"
    ),
    "b".repeat(40)
  );
});

test("public Repository analysis rejects a branch without a commit SHA", () => {
  assert.equal(resolvePublicRepositoryRevision([{ name: "main", revision: null }], "main"), null);
});

test("public Repository lookup classifies unavailable, rate limited, and provider failures", async () => {
  const originalFetch = globalThis.fetch;

  try {
    for (const scenario of [
      { status: 404, errorCode: "PUBLIC_REPOSITORY_UNAVAILABLE", statusCode: 404 },
      { status: 429, errorCode: "PUBLIC_REPOSITORY_RATE_LIMITED", statusCode: 429 },
      { status: 503, errorCode: "PUBLIC_REPOSITORY_PROVIDER_UNAVAILABLE", statusCode: 503 }
    ] as const) {
      globalThis.fetch = (async () => new Response("", { status: scenario.status })) as typeof fetch;

      await assert.rejects(
        fetchPublicRepositoryBranchInventory({ owner: "sketchcatch", repo: "private" }),
        (error: unknown) => {
          assert.equal((error as { errorCode?: string }).errorCode, scenario.errorCode);
          assert.equal((error as { statusCode?: number }).statusCode, scenario.statusCode);
          return true;
        }
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public Repository lookup classifies a missing selected branch separately", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    return url.includes("/branches?")
      ? Response.json([])
      : Response.json({ default_branch: "main" });
  }) as typeof fetch;

  try {
    const inventory = await fetchPublicRepositoryBranchInventory({
      owner: "sketchcatch",
      repo: "service"
    });
    const branch = inventory.defaultBranch ?? "main";
    assert.equal(resolvePublicRepositoryRevision(inventory.branches, branch), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
    assert.equal(
      requestedUrls.some((url) => url.includes("/repos/whiskend/audience-live-check")),
      true
    );
    assert.equal(
      requestedUrls.some((url) => url.includes("/repos/jh-9999/audience-live-check")),
      true
    );
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

test("audience-live-check public analysis pins the approved demo source revision", async () => {
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  process.env.OPENAI_API_KEY = "";
  globalThis.fetch = createGoldenPathRepositoryFetch(requestedUrls);

  const app = Fastify({ logger: false });

  try {
    await registerAiRoutes(app);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/ai/source-repository-analysis",
      payload: { repositoryUrl: "https://github.com/chaekang/audience-live-check" }
    });
    const result = response.json<SourceRepositoryAnalysisResult>();

    assert.equal(response.statusCode, 200);
    assert.equal(result.repositoryRevision, "23a87399cbe3456f3f427140f88b8d199ace34f9");
    assert.equal(result.recommendedTemplateId, "ecs-fargate-container-app");
    assert.equal(result.aiHandoff?.recommendation?.candidates[0]?.templateId, "ecs-fargate-container-app");
    assert.equal(
      requestedUrls.some((url) => url.includes("/git/trees/23a87399cbe3456f3f427140f88b8d199ace34f9?recursive=1")),
      true
    );
    assert.equal(
      requestedUrls.some((url) => url.includes("/23a87399cbe3456f3f427140f88b8d199ace34f9/apps/api/Dockerfile")),
      true
    );
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

function createGoldenPathRepositoryFetch(requestedUrls: string[]): typeof fetch {
  const files: Readonly<Record<string, string>> = {
    "package.json": JSON.stringify({ private: true, workspaces: ["apps/*", "packages/*"] }),
    "apps/api/package.json": JSON.stringify({ dependencies: { express: "latest" } }),
    "apps/web/package.json": JSON.stringify({
      dependencies: { react: "latest" },
      devDependencies: { vite: "latest" }
    }),
    "apps/api/Dockerfile": [
      "FROM node:24",
      "EXPOSE 8080",
      "HEALTHCHECK CMD curl -f http://localhost:8080/health"
    ].join("\n"),
    "README.md": [
      "apps/web은 S3와 CloudFront로 정적 배포합니다.",
      "apps/api는 Docker image를 ECR에 push한 뒤 ECS/Fargate Service로 실행합니다.",
      "데이터베이스는 사용하지 않습니다."
    ].join(" ")
  };

  return (async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

    requestedUrls.push(url);

    if (url.includes("/branches?")) {
      return Response.json([{ name: "main", commit: { sha: "a".repeat(40) } }]);
    }

    if (/\/git\/trees\/(?:main|23a87399cbe3456f3f427140f88b8d199ace34f9)\?recursive=1$/u.test(url)) {
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

    if (/\/repos\/(?:whiskend|jh-9999|chaekang)\/audience-live-check$/u.test(url)) {
      return Response.json({ default_branch: "main" });
    }

    return new Response("", { status: 404 });
  }) as typeof fetch;
}
