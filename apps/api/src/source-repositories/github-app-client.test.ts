import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createGitHubAppClient } from "./github-app-client.js";

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
      accountLogin: "NearthYou",
      accountType: "Organization",
      repositorySelection: "selected",
      htmlUrl: "https://github.com/settings/installations/42"
    }
  ]);
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
          content: Buffer.from("resource \"aws_s3_bucket\" \"old\" {}").toString("base64"),
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
        content: "resource \"aws_s3_bucket\" \"smoke\" {}"
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
        content: "resource \"aws_s3_bucket\" \"smoke\" {}"
      }
    ]
  });

  assert.equal(result.pullRequestUrl, "https://github.com/owner/repo/pull/7");
  assert.equal(result.pullRequestNumber, 7);
  assert.equal(result.pullRequestHeadSha, "new-head-sha");
  assert.equal(result.commitSha, "new-commit-sha");
  assert.equal(calls.some((call) => call.method === "PUT"), true);
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
            content:
              "# empty-repo\n\nInitialized by SketchCatch for Git/CI/CD handoff.\n"
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
        content: "resource \"aws_s3_bucket\" \"smoke\" {}"
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
  const unchangedContent = "resource \"aws_s3_bucket\" \"smoke\" {}";
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
  assert.equal(calls.some((call) => call.method === "PUT"), false);
  assert.equal(calls.some((call) => call.pathname.endsWith("/pulls")), false);
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
        return jsonResponse({});
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
