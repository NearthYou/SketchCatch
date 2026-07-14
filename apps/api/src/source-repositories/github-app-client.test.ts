import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createGitHubAppClient,
  GitHubRepositoryIdentityMismatchError,
  GitHubRepositoryArchivedError,
  GitHubRepositoryFileEncodingError,
  GitHubRepositoryEvidenceLimitError,
  GitHubRepositoryTreeTruncatedError
} from "./github-app-client.js";

const privateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem"
  },
  publicKeyEncoding: {
    type: "spki",
    format: "pem"
  }
}).privateKey;

const pkcs1PrivateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: {
    type: "pkcs1",
    format: "pem"
  },
  publicKeyEncoding: {
    type: "spki",
    format: "pem"
  }
}).privateKey;

test("listInstallationRepositories accepts GitHub PKCS#1 private keys", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: pkcs1PrivateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/installation/repositories") {
        return jsonResponse({
          repositories: [
            {
              id: 1001,
              name: "repo",
              full_name: "owner/repo",
              html_url: "https://github.com/owner/repo",
              default_branch: "main",
              private: true,
              visibility: "private",
              archived: false,
              owner: { login: "owner" }
            }
          ]
        });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  const repositories = await client.listInstallationRepositories("42");

  assert.deepEqual(repositories, [
    {
      githubRepositoryId: "1001",
      owner: "owner",
      name: "repo",
      fullName: "owner/repo",
      defaultBranch: "main",
      repositoryUrl: "https://github.com/owner/repo",
      visibility: "private",
      archived: false
    }
  ]);
});

test("listInstallations returns GitHub App installation account metadata", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations") {
        return jsonResponse([
          {
            id: 42,
            repository_selection: "selected",
            html_url: "https://github.com/settings/installations/42",
            account: {
              id: 987654,
              login: "NearthYou",
              type: "Organization"
            }
          }
        ]);
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  assert.deepEqual(await client.listInstallations(), [
    {
      installationId: "42",
      accountId: "987654",
      accountLogin: "NearthYou",
      accountType: "Organization",
      repositorySelection: "selected",
      htmlUrl: "https://github.com/settings/installations/42"
    }
  ]);
});

test("readRepositoryEvidence reads the recursive tree and only allowed static evidence files", async () => {
  const calls: GitHubApiCall[] = [];
  const fileContents = new Map([
    ["package.json", '{"workspaces":["apps/*"]}'],
    ["apps/web/package.json", '{"dependencies":{"next":"16.2.9"}}'],
    ["apps/web/next.config.mjs", "export default {}"],
    ["docker/api.Dockerfile", "FROM node:24-alpine"],
    ["README.md", "# Monorepo"]
  ]);
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ pathname, search }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "trunk" });
      }

      if (pathname === "/repos/owner/repo/commits/trunk") {
        return jsonResponse({ sha: "commit-sha" });
      }

      if (pathname === "/repos/owner/repo/git/trees/commit-sha" && search === "?recursive=1") {
        return jsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: [
            { path: "package.json", type: "blob" },
            { path: "apps/web/package.json", type: "blob" },
            { path: "apps/web/next.config.mjs", type: "blob" },
            { path: "docker/api.Dockerfile", type: "blob" },
            { path: "pnpm-lock.yaml", type: "blob" },
            { path: "README.md", type: "blob" },
            { path: "apps/web/src/page.tsx", type: "blob" }
          ]
        });
      }

      const contentsPrefix = "/repos/owner/repo/contents/";
      if (pathname.startsWith(contentsPrefix)) {
        const path = decodeURIComponent(pathname.slice(contentsPrefix.length));
        const content = fileContents.get(path);

        return content
          ? jsonResponse({ encoding: "base64", content: Buffer.from(content).toString("base64") })
          : jsonResponse({ message: "not found" }, 404);
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  const snapshot = await client.readRepositoryEvidence({
    installationId: "42",
    expectedRepositoryId: "1001",
    owner: "owner",
    name: "repo"
  });

  assert.equal(snapshot.revision, "commit-sha");
  assert.deepEqual(snapshot.treePaths, [
    "README.md",
    "apps/web/next.config.mjs",
    "apps/web/package.json",
    "apps/web/src/page.tsx",
    "docker/api.Dockerfile",
    "package.json",
    "pnpm-lock.yaml"
  ]);
  assert.deepEqual(
    snapshot.files.map((file) => file.path),
    [
      "README.md",
      "apps/web/next.config.mjs",
      "apps/web/package.json",
      "docker/api.Dockerfile",
      "package.json"
    ]
  );
  assert.equal(
    calls.some((call) => call.pathname.endsWith("/apps/web/src/page.tsx")),
    false
  );
  assert.equal(
    calls.some((call) => call.pathname.endsWith("/pnpm-lock.yaml")),
    false
  );
  assert.equal(
    calls
      .filter((call) => call.pathname.includes("/contents/"))
      .every((call) => call.search === "?ref=commit-sha"),
    true
  );
  assert.equal(
    calls.filter((call) => call.pathname === "/app/installations/42/access_tokens").length,
    1
  );
});

test("readRepositoryEvidence rejects a reused repository path with a different id", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 2002, default_branch: "main" });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    GitHubRepositoryIdentityMismatchError
  );
});

test("readRepositoryEvidence rejects truncated recursive trees", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "main" });
      }

      if (pathname === "/repos/owner/repo/commits/main") {
        return jsonResponse({ sha: "commit-sha" });
      }

      return jsonResponse({
        sha: "tree-sha",
        truncated: true,
        tree: []
      });
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    GitHubRepositoryTreeTruncatedError
  );
});

test("readRepositoryEvidence rejects a repository archived after connection", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "main", archived: true });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    GitHubRepositoryArchivedError
  );
});

test("readRepositoryEvidence rejects unsupported file encoding", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "main" });
      }

      if (pathname === "/repos/owner/repo/commits/main") {
        return jsonResponse({ sha: "commit-sha" });
      }

      if (pathname === "/repos/owner/repo/git/trees/commit-sha") {
        return jsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: [{ path: "package.json", type: "blob" }]
        });
      }

      return jsonResponse({ encoding: "utf-8", content: "{}" });
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    GitHubRepositoryFileEncodingError
  );
});

test("readRepositoryEvidence rejects repositories with too many evidence files", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "main" });
      }

      if (pathname === "/repos/owner/repo/commits/main") {
        return jsonResponse({ sha: "commit-sha" });
      }

      if (pathname === "/repos/owner/repo/git/trees/commit-sha") {
        return jsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: Array.from({ length: 129 }, (_, index) => ({
            path: `packages/package-${index}/package.json`,
            type: "blob"
          }))
        });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    (error: unknown) =>
      error instanceof GitHubRepositoryEvidenceLimitError && error.reason === "file_count"
  );
});

test("readRepositoryEvidence rejects oversized evidence content", async () => {
  const oversizedContent = "a".repeat(300 * 1024);
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "main" });
      }

      if (pathname === "/repos/owner/repo/commits/main") {
        return jsonResponse({ sha: "commit-sha" });
      }

      if (pathname === "/repos/owner/repo/git/trees/commit-sha") {
        return jsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: [{ path: "README.md", type: "blob" }]
        });
      }

      return jsonResponse({
        encoding: "base64",
        content: Buffer.from(oversizedContent).toString("base64")
      });
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    (error: unknown) =>
      error instanceof GitHubRepositoryEvidenceLimitError && error.reason === "file_size"
  );
});

test("readRepositoryEvidence rejects evidence beyond the total byte budget", async () => {
  const fileContent = "a".repeat(240 * 1024);
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo") {
        return jsonResponse({ id: 1001, default_branch: "main" });
      }

      if (pathname === "/repos/owner/repo/commits/main") {
        return jsonResponse({ sha: "commit-sha" });
      }

      if (pathname === "/repos/owner/repo/git/trees/commit-sha") {
        return jsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: Array.from({ length: 9 }, (_, index) => ({
            path: `packages/package-${index}/README.md`,
            type: "blob"
          }))
        });
      }

      return jsonResponse({
        encoding: "base64",
        content: Buffer.from(fileContent).toString("base64")
      });
    })
  });

  await assert.rejects(
    client.readRepositoryEvidence({
      installationId: "42",
      expectedRepositoryId: "1001",
      owner: "owner",
      name: "repo"
    }),
    (error: unknown) =>
      error instanceof GitHubRepositoryEvidenceLimitError && error.reason === "total_size"
  );
});

test("createPullRequest updates a generated file even when the target branch already contains the SketchCatch path", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ method, pathname, search, body }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (method === "GET" && pathname === "/repos/owner/repo/git/ref/heads/main") {
        return jsonResponse({ object: { sha: "target-sha" } });
      }

      if (method === "POST" && pathname === "/repos/owner/repo/git/refs") {
        return jsonResponse({ ref: "refs/heads/sketchcatch/project/iac-12345678" });
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf" &&
        search === "?ref=sketchcatch%2Fproject%2Fiac-12345678"
      ) {
        return jsonResponse({
          content: Buffer.from('resource "aws_s3_bucket" "old" {}').toString("base64"),
          encoding: "base64",
          sha: "source-file-sha"
        });
      }

      if (
        method === "PUT" &&
        pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf"
      ) {
        assert.equal(body.branch, "sketchcatch/project/iac-12345678");
        assert.equal(body.sha, "source-file-sha");
        return jsonResponse({ commit: { sha: "new-commit-sha" } });
      }

      if (method === "POST" && pathname === "/repos/owner/repo/pulls") {
        return jsonResponse({
          html_url: "https://github.com/owner/repo/pull/7",
          number: 7,
          head: { sha: "new-head-sha" }
        });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  const result = await client.createPullRequest({
    installationId: "42",
    owner: "owner",
    name: "repo",
    targetBranch: "main",
    sourceBranch: "sketchcatch/project/iac-12345678",
    commitMessage: "Add Terraform artifact",
    pullRequestTitle: "Add Terraform artifact",
    pullRequestBody: "Review generated Terraform.",
    files: [
      {
        path: "sketchcatch/project/terraform/main.tf",
        content: 'resource "aws_s3_bucket" "smoke" {}'
      }
    ]
  });

  assert.equal(result.pullRequestUrl, "https://github.com/owner/repo/pull/7");
  assert.equal(
    calls.some(
      (call) =>
        call.method === "GET" &&
        call.pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf" &&
        call.search === "?ref=main"
    ),
    false
  );
  assert.equal(
    calls.some((call) => call.method === "PUT" && call.pathname.endsWith("/terraform/main.tf")),
    true
  );
});

test("createPullRequest updates a file on an existing SketchCatch source branch", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ method, pathname, search, body }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (method === "GET" && pathname === "/repos/owner/repo/git/ref/heads/main") {
        return jsonResponse({ object: { sha: "target-sha" } });
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf" &&
        search === "?ref=main"
      ) {
        return jsonResponse({ message: "not found" }, 404);
      }

      if (method === "POST" && pathname === "/repos/owner/repo/git/refs") {
        return jsonResponse({ message: "reference already exists" }, 422);
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf" &&
        search === "?ref=sketchcatch%2Fproject%2Fiac-12345678"
      ) {
        return jsonResponse({ sha: "source-file-sha" });
      }

      if (
        method === "PUT" &&
        pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf"
      ) {
        assert.equal(body.branch, "sketchcatch/project/iac-12345678");
        assert.equal(body.sha, "source-file-sha");
        return jsonResponse({ commit: { sha: "new-commit-sha" } });
      }

      if (method === "POST" && pathname === "/repos/owner/repo/pulls") {
        return jsonResponse({
          html_url: "https://github.com/owner/repo/pull/7",
          number: 7,
          head: { sha: "new-head-sha" }
        });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  const result = await client.createPullRequest({
    installationId: "42",
    owner: "owner",
    name: "repo",
    targetBranch: "main",
    sourceBranch: "sketchcatch/project/iac-12345678",
    commitMessage: "Add Terraform artifact",
    pullRequestTitle: "Add Terraform artifact",
    pullRequestBody: "Review generated Terraform.",
    files: [
      {
        path: "sketchcatch/project/terraform/main.tf",
        content: 'resource "aws_s3_bucket" "smoke" {}'
      }
    ]
  });

  assert.equal(result.pullRequestUrl, "https://github.com/owner/repo/pull/7");
  assert.equal(result.pullRequestNumber, 7);
  assert.equal(result.pullRequestHeadSha, "new-head-sha");
  assert.equal(result.commitSha, "new-commit-sha");
  assert.equal(
    calls.some((call) => call.method === "PUT"),
    true
  );
});

test("createPullRequest bootstraps an empty repository before opening the handoff PR", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ method, pathname, search, body }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (method === "GET" && pathname === "/repos/owner/empty-repo/git/ref/heads/main") {
        return jsonResponse({ message: "not found" }, 404);
      }

      if (method === "POST" && pathname === "/repos/owner/empty-repo/git/trees") {
        assert.deepEqual(body.tree, [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            content: "# empty-repo\n\nInitialized by SketchCatch for Git/CI/CD handoff.\n"
          }
        ]);
        return jsonResponse({ sha: "initial-tree-sha" });
      }

      if (method === "POST" && pathname === "/repos/owner/empty-repo/git/commits") {
        assert.equal(body.message, "Initialize repository for SketchCatch handoff");
        assert.equal(body.tree, "initial-tree-sha");
        return jsonResponse({ sha: "initial-commit-sha" });
      }

      if (method === "POST" && pathname === "/repos/owner/empty-repo/git/refs") {
        if (body.ref === "refs/heads/main") {
          assert.equal(body.sha, "initial-commit-sha");
          return jsonResponse({ ref: "refs/heads/main" });
        }

        if (body.ref === "refs/heads/sketchcatch/project/iac-12345678") {
          assert.equal(body.sha, "initial-commit-sha");
          return jsonResponse({ ref: "refs/heads/sketchcatch/project/iac-12345678" });
        }
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/empty-repo/contents/sketchcatch/project/terraform/main.tf" &&
        search === "?ref=sketchcatch%2Fproject%2Fiac-12345678"
      ) {
        return jsonResponse({ message: "not found" }, 404);
      }

      if (
        method === "PUT" &&
        pathname === "/repos/owner/empty-repo/contents/sketchcatch/project/terraform/main.tf"
      ) {
        assert.equal(body.branch, "sketchcatch/project/iac-12345678");
        assert.equal("sha" in body, false);
        return jsonResponse({ commit: { sha: "new-commit-sha" } });
      }

      if (method === "POST" && pathname === "/repos/owner/empty-repo/pulls") {
        assert.equal(body.base, "main");
        assert.equal(body.head, "sketchcatch/project/iac-12345678");
        return jsonResponse({
          html_url: "https://github.com/owner/empty-repo/pull/1",
          number: 1,
          head: { sha: "new-head-sha" }
        });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  const result = await client.createPullRequest({
    installationId: "42",
    owner: "owner",
    name: "empty-repo",
    targetBranch: "main",
    sourceBranch: "sketchcatch/project/iac-12345678",
    commitMessage: "Add Terraform artifact",
    pullRequestTitle: "Add Terraform artifact",
    pullRequestBody: "Review generated Terraform.",
    files: [
      {
        path: "sketchcatch/project/terraform/main.tf",
        content: 'resource "aws_s3_bucket" "smoke" {}'
      }
    ]
  });

  assert.equal(result.pullRequestUrl, "https://github.com/owner/empty-repo/pull/1");
  assert.equal(
    calls.some(
      (call) =>
        call.method === "POST" &&
        call.pathname === "/repos/owner/empty-repo/git/refs" &&
        call.body.ref === "refs/heads/main"
    ),
    true
  );
});

test("createPullRequest skips unchanged files and rejects empty handoff diffs", async () => {
  const calls: GitHubApiCall[] = [];
  const unchangedContent = 'resource "aws_s3_bucket" "smoke" {}';
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ method, pathname, search }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (method === "GET" && pathname === "/repos/owner/repo/git/ref/heads/main") {
        return jsonResponse({ object: { sha: "target-sha" } });
      }

      if (method === "POST" && pathname === "/repos/owner/repo/git/refs") {
        return jsonResponse({ ref: "refs/heads/sketchcatch/project/iac-12345678" });
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/repo/contents/sketchcatch/project/terraform/main.tf" &&
        search === "?ref=sketchcatch%2Fproject%2Fiac-12345678"
      ) {
        return jsonResponse({
          content: Buffer.from(unchangedContent, "utf8").toString("base64"),
          encoding: "base64",
          sha: "source-file-sha"
        });
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  await assert.rejects(
    () =>
      client.createPullRequest({
        installationId: "42",
        owner: "owner",
        name: "repo",
        targetBranch: "main",
        sourceBranch: "sketchcatch/project/iac-12345678",
        commitMessage: "Add Terraform artifact",
        pullRequestTitle: "Add Terraform artifact",
        pullRequestBody: "Review generated Terraform.",
        files: [
          {
            path: "sketchcatch/project/terraform/main.tf",
            content: unchangedContent
          }
        ]
      }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 409
  );
  assert.equal(
    calls.some((call) => call.method === "PUT"),
    false
  );
  assert.equal(
    calls.some((call) => call.pathname.endsWith("/pulls")),
    false
  );
});

test("applyRepositorySettings creates environment and upserts repository variables", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ method, pathname, body }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (
        method === "PUT" &&
        pathname === "/repos/owner/repo/environments/sketchcatch-production"
      ) {
        return jsonResponse({});
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/repo/actions/variables/SKETCHCATCH_AWS_REGION"
      ) {
        return jsonResponse({ name: "SKETCHCATCH_AWS_REGION" });
      }

      if (
        method === "PATCH" &&
        pathname === "/repos/owner/repo/actions/variables/SKETCHCATCH_AWS_REGION"
      ) {
        assert.deepEqual(body, {
          name: "SKETCHCATCH_AWS_REGION",
          value: "ap-northeast-2"
        });
        return noContentResponse();
      }

      if (
        method === "GET" &&
        pathname === "/repos/owner/repo/actions/variables/SKETCHCATCH_RELEASE_BUCKET"
      ) {
        return jsonResponse({ message: "not found" }, 404);
      }

      if (method === "POST" && pathname === "/repos/owner/repo/actions/variables") {
        assert.deepEqual(body, {
          name: "SKETCHCATCH_RELEASE_BUCKET",
          value: "release-bucket"
        });
        return jsonResponse({});
      }

      return jsonResponse({ message: "not found" }, 404);
    })
  });

  const result = await client.applyRepositorySettings({
    installationId: "42",
    owner: "owner",
    name: "repo",
    environmentName: "sketchcatch-production",
    variables: {
      SKETCHCATCH_RELEASE_BUCKET: "release-bucket",
      SKETCHCATCH_AWS_REGION: "ap-northeast-2"
    }
  });

  assert.deepEqual(result, {
    environmentName: "sketchcatch-production",
    variables: ["SKETCHCATCH_AWS_REGION", "SKETCHCATCH_RELEASE_BUCKET"]
  });
  assert.equal(
    calls.some(
      (call) =>
        call.method === "PUT" &&
        call.pathname === "/repos/owner/repo/environments/sketchcatch-production"
    ),
    true
  );
});

test("getPipelineStatusForPullRequest tracks merge commit infra and app workflows", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (pathname === "/repos/owner/repo/pulls/7") {
        return jsonResponse({
          state: "closed",
          merged: true,
          merge_commit_sha: "merge-sha"
        });
      }

      return jsonResponse({
        workflow_runs: [
          {
            name: "SketchCatch Infra",
            html_url: "https://github.com/owner/repo/actions/runs/10",
            status: "completed",
            conclusion: "success",
            updated_at: "2026-07-05T00:05:00.000Z"
          },
          {
            name: "SketchCatch App",
            html_url: "https://github.com/owner/repo/actions/runs/11",
            status: "completed",
            conclusion: "success",
            updated_at: "2026-07-05T00:06:00.000Z"
          }
        ]
      });
    })
  });

  const status = await client.getPipelineStatusForPullRequest({
    installationId: "42",
    owner: "owner",
    name: "repo",
    pullRequestNumber: 7
  });

  assert.equal(status.status, "pipeline_success");
  assert.equal(status.mergeCommitSha, "merge-sha");
  assert.equal(status.infraPipelineStatus, "success");
  assert.equal(status.appPipelineStatus, "success");
});

test("getLatestWorkflowRunForHeadSha maps the latest GitHub Actions run status", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      return jsonResponse({
        workflow_runs: [
          {
            html_url: "https://github.com/owner/repo/actions/runs/1",
            status: "completed",
            conclusion: "success",
            updated_at: "2026-07-05T00:00:00.000Z"
          },
          {
            html_url: "https://github.com/owner/repo/actions/runs/2",
            status: "completed",
            conclusion: "failure",
            updated_at: "2026-07-05T00:05:00.000Z"
          }
        ]
      });
    })
  });

  const status = await client.getLatestWorkflowRunForHeadSha({
    installationId: "42",
    owner: "owner",
    name: "repo",
    headSha: "new-head-sha"
  });

  assert.equal(status.status, "pipeline_failed");
  assert.equal(status.pipelineRunUrl, "https://github.com/owner/repo/actions/runs/2");
});

test("getLatestWorkflowRunForHeadSha keeps pr_created when no Actions run exists", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      return jsonResponse({ workflow_runs: [] });
    })
  });

  const status = await client.getLatestWorkflowRunForHeadSha({
    installationId: "42",
    owner: "owner",
    name: "repo",
    headSha: "new-head-sha"
  });

  assert.equal(status.status, "pr_created");
  assert.equal(status.pipelineRunUrl, null);
});

test("validateRepositoryBranch maps GitHub 404 to false", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }
      return jsonResponse({ message: "not found" }, 404);
    })
  });

  assert.equal(
    await client.validateRepositoryBranch({
      installationId: "42",
      owner: "owner",
      name: "repo",
      branch: "missing"
    }),
    false
  );
  assert.equal(
    calls.some((call) => call.pathname === "/repos/owner/repo/git/ref/heads/missing"),
    true
  );
});

test("validateRepositoryDirectory distinguishes directory file and missing", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }
      if (pathname.endsWith("/contents/apps/web")) {
        return jsonResponse([{ type: "file", name: "package.json" }]);
      }
      if (pathname.endsWith("/contents/README.md")) {
        return jsonResponse({ type: "file", name: "README.md" });
      }
      return jsonResponse({ message: "not found" }, 404);
    })
  });
  const base = {
    installationId: "42",
    owner: "owner",
    name: "repo",
    branch: "main"
  };

  assert.equal(
    await client.validateRepositoryDirectory({ ...base, path: "apps/web" }),
    "directory"
  );
  assert.equal(await client.validateRepositoryDirectory({ ...base, path: "README.md" }), "file");
  assert.equal(await client.validateRepositoryDirectory({ ...base, path: "missing" }), "missing");
});

test("repository validation propagates GitHub permission errors", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }
      return jsonResponse({ message: "forbidden" }, 403);
    })
  });

  await assert.rejects(
    client.validateRepositoryBranch({
      installationId: "42",
      owner: "owner",
      name: "repo",
      branch: "main"
    }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 403
  );
});

test("GitHub Actions read methods return focused models from read-only endpoints", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }
      if (pathname.endsWith("/actions/runs")) {
        return jsonResponse({
          workflow_runs: [
            {
              id: 11,
              event: "workflow_run",
              head_sha: "abc",
              head_branch: "main",
              name: "SketchCatch App",
              html_url: "https://example/run/11",
              status: "in_progress",
              conclusion: null,
              created_at: "2026-07-13T00:00:00Z",
              updated_at: "2026-07-13T00:01:00Z",
              head_commit: { message: "Ship app" }
            }
          ]
        });
      }
      if (pathname.endsWith("/commits/abc")) {
        return jsonResponse({ files: [{ filename: "apps/web/page.tsx" }] });
      }
      if (pathname.endsWith("/actions/runs/11/jobs")) {
        return jsonResponse({
          jobs: [
            {
              id: 22,
              name: "Build",
              status: "completed",
              conclusion: "success",
              html_url: "https://example/job/22",
              started_at: "2026-07-13T00:00:00Z",
              completed_at: "2026-07-13T00:01:00Z"
            }
          ]
        });
      }
      throw new Error(`Unexpected GitHub path: ${pathname}`);
    })
  });
  const repo = { installationId: "42", owner: "owner", name: "repo" };

  const runs = await client.listBranchWorkflowRuns({ ...repo, branch: "main" });
  const files = await client.listCommitFiles({ ...repo, branch: "main", commitSha: "abc" });
  const jobs = await client.listWorkflowJobs({ ...repo, runId: 11 });

  assert.deepEqual(runs, [
    {
      id: 11,
      runAttempt: 1,
      event: "workflow_run",
      updatedAt: "2026-07-13T00:01:00Z",
      createdAt: "2026-07-13T00:00:00Z",
      commitSha: "abc",
      commitMessage: "Ship app",
      branch: "main",
      workflowName: "SketchCatch App",
      runUrl: "https://example/run/11",
      status: "in_progress",
      conclusion: null,
      startedAt: "2026-07-13T00:00:00Z",
      finishedAt: null
    }
  ]);
  assert.deepEqual(files, ["apps/web/page.tsx"]);
  assert.deepEqual(jobs, [
    {
      id: 22,
      name: "Build",
      runUrl: "https://example/job/22",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-07-13T00:00:00Z",
      finishedAt: "2026-07-13T00:01:00Z",
      steps: []
    }
  ]);
  assert.equal(
    calls.filter(
      (call) => call.method !== "GET" && call.pathname !== "/app/installations/42/access_tokens"
    ).length,
    0
  );
});

test("readWorkflowJobLog masks secret values before returning text", async () => {
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub([], ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens")
        return jsonResponse({ token: "installation-token" });
      return new Response("deploy token=super-secret\nfinished", { status: 200 });
    })
  });

  const log = await client.readWorkflowJobLog({
    installationId: "42",
    owner: "owner",
    name: "repo",
    jobId: 22
  });
  assert.equal(log, "deploy [REDACTED]\nfinished");
});

test("GitHub Actions reads paginate runs jobs and immutable commit files", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ pathname, search }) => {
      if (pathname === "/app/installations/42/access_tokens")
        return jsonResponse({ token: "installation-token" });
      const page = new URLSearchParams(search).get("page");
      if (pathname.endsWith("/actions/runs") && page === "3") {
        throw new Error("workflow run pagination exceeded the bounded discovery window");
      }
      const count = pathname.endsWith("/actions/runs") ? 100 : page === "1" ? 100 : 1;
      if (pathname.endsWith("/actions/runs"))
        return jsonResponse({
          workflow_runs: Array.from({ length: count }, (_, index) =>
            workflowRunPayload((page === "1" ? 0 : 100) + index)
          )
        });
      if (pathname.endsWith("/actions/runs/11/jobs"))
        return jsonResponse({
          jobs: Array.from({ length: count }, (_, index) =>
            workflowJobPayload((page === "1" ? 0 : 100) + index)
          )
        });
      if (pathname.endsWith("/commits/abc"))
        return jsonResponse({
          files: Array.from({ length: count }, (_, index) => ({
            filename: `apps/web/${(page === "1" ? 0 : 100) + index}.tsx`
          }))
        });
      throw new Error(`Unexpected path ${pathname}`);
    })
  });
  const repo = { installationId: "42", owner: "owner", name: "repo", branch: "main" };

  assert.equal((await client.listBranchWorkflowRuns(repo)).length, 200);
  assert.equal((await client.listWorkflowJobs({ ...repo, runId: 11 })).length, 101);
  assert.equal((await client.listCommitFiles({ ...repo, commitSha: "abc" })).length, 101);
  assert.equal(
    calls.filter((call) => call.search.includes("per_page=100") && call.search.includes("page=2"))
      .length,
    3
  );
  assert.equal(
    calls.filter(
      (call) => call.pathname.endsWith("/actions/runs") && call.search.includes("page=3")
    ).length,
    0
  );
});

test("GitHub Actions targeted run discovery sends head_sha and prefers run_started_at", async () => {
  const calls: GitHubApiCall[] = [];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey,
    fetch: createGitHubFetchStub(calls, ({ pathname }) => {
      if (pathname === "/app/installations/42/access_tokens")
        return jsonResponse({ token: "installation-token" });
      return jsonResponse({
        workflow_runs: [
          {
            ...workflowRunPayload(11),
            head_sha: "target-sha",
            run_started_at: "2026-07-13T00:00:30Z"
          }
        ]
      });
    })
  });

  const targetInput = {
    installationId: "42",
    owner: "owner",
    name: "repo",
    branch: "main",
    commitSha: "target-sha"
  };
  const runs = await client.listBranchWorkflowRuns(targetInput);

  assert.equal(runs[0]?.startedAt, "2026-07-13T00:00:30Z");
  const request = calls.find((call) => call.pathname.endsWith("/actions/runs"));
  assert.ok(request);
  assert.match(request.search, /head_sha=target-sha/);
});

function workflowRunPayload(id: number) {
  return {
    id,
    run_attempt: 1,
    event: "workflow_run",
    head_sha: `sha-${id}`,
    head_branch: "main",
    name: "SketchCatch App",
    html_url: `run-${id}`,
    status: "completed",
    conclusion: "success",
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:01:00Z",
    head_commit: { message: "Ship" }
  };
}

function workflowJobPayload(id: number) {
  return {
    id,
    name: "release",
    html_url: `job-${id}`,
    status: "completed",
    conclusion: "success",
    started_at: null,
    completed_at: null,
    steps: [
      {
        name: "Upload release artifact",
        status: "completed",
        conclusion: "success",
        started_at: null,
        completed_at: null
      }
    ]
  };
}

type GitHubApiCall = {
  method: string;
  pathname: string;
  search: string;
  body: Record<string, unknown>;
};

function createGitHubFetchStub(
  calls: GitHubApiCall[],
  handler: (call: GitHubApiCall) => Response | Promise<Response>
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input.toString());
    const body =
      typeof init?.body === "string" && init.body
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    const call: GitHubApiCall = {
      method: init?.method ?? "GET",
      pathname: url.pathname,
      search: url.search,
      body
    };

    calls.push(call);

    return handler(call);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function noContentResponse(): Response {
  return new Response(null, {
    status: 204
  });
}
