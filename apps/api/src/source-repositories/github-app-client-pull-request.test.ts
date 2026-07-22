import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createGitHubAppClient } from "./github-app-client.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const sourceBranch = "sketchcatch/demo/iac-11111111";
const targetBranch = "main";
const desiredPath = ".github/workflows/sketchcatch-app.yml";
const desiredContent = "name: SketchCatch App\n";
const manifestPath = "sketchcatch/demo/ci-cd/handoff.json";
const manifestContent = '{"handoffId":"handoff-1"}\n';

test("reuses an exact open PR without writes even when persisted head evidence is missing", async () => {
  const fixture = createGitHubFixture({
    pullRequests: [createPullRequest({ number: 7, state: "open", branch: sourceBranch })],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "source-sha"]
    ]),
    contents: new Map([
      [`${sourceBranch}:${desiredPath}`, desiredContent],
      [`${sourceBranch}:${manifestPath}`, manifestContent]
    ])
  });

  const result = await fixture.client.createPullRequest(
    createInput({ expectedPullRequestHeadSha: null })
  );

  assert.equal(result.pullRequestNumber, 7);
  assert.equal(result.sourceBranch, sourceBranch);
  assert.equal(result.pullRequestHeadSha, "source-sha");
  assert.equal(fixture.countRequests("POST", "/pulls"), 0);
  assert.equal(fixture.countRequests("PATCH", "/pulls/7"), 0);
});

test("creates a new SketchCatch retry branch after a closed unmerged PR", async () => {
  const fixture = createGitHubFixture({
    pullRequests: [
      createPullRequest({ number: 7, state: "closed", merged: false, branch: sourceBranch })
    ],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "user-modified-sha"]
    ]),
    contents: new Map([[`${sourceBranch}:${desiredPath}`, "user-edited-content\n"]])
  });

  const result = await fixture.client.createPullRequest(createInput());

  assert.equal(result.pullRequestNumber, 8);
  assert.equal(result.sourceBranch, `${sourceBranch}-retry-2`);
  assert.equal(fixture.countRequests("POST", "/pulls"), 1);
  assert.equal(fixture.countRequests("PATCH", "/git/refs"), 0);
  assert.equal(fixture.countRequests("DELETE", "/git/refs"), 0);
  assert.equal(fixture.refs.get(sourceBranch), "user-modified-sha");
});

test("treats an exact merged PR and target files as an idempotent success", async () => {
  const fixture = createGitHubFixture({
    pullRequests: [
      createPullRequest({ number: 7, state: "closed", merged: true, branch: sourceBranch })
    ],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "merged-head-sha"]
    ]),
    contents: new Map([
      [`${targetBranch}:${desiredPath}`, desiredContent],
      [`${targetBranch}:${manifestPath}`, manifestContent]
    ])
  });

  const result = await fixture.client.createPullRequest(createInput());

  assert.equal(result.pullRequestNumber, 7);
  assert.equal(result.sourceBranch, sourceBranch);
  assert.equal(fixture.countRequests("POST", "/pulls"), 0);
  assert.equal(fixture.countRequests("PUT", `/contents/${desiredPath}`), 0);
});

test("increments an existing retry branch suffix instead of nesting it", async () => {
  const previousRetryBranch = `${sourceBranch}-retry-2`;
  const fixture = createGitHubFixture({
    pullRequests: [
      createPullRequest({ number: 7, state: "closed", merged: false, branch: previousRetryBranch })
    ],
    refs: new Map([
      [targetBranch, "target-sha"],
      [previousRetryBranch, "previous-retry-sha"]
    ]),
    contents: new Map()
  });

  const result = await fixture.client.createPullRequest(
    createInput({ sourceBranch: previousRetryBranch })
  );

  assert.equal(result.sourceBranch, `${sourceBranch}-retry-3`);
  assert.equal(fixture.refs.has(`${previousRetryBranch}-retry-2`), false);
});

test("preserves an open PR with a changed head and creates a retry PR", async () => {
  const fixture = createGitHubFixture({
    pullRequests: [createPullRequest({ number: 7, state: "open", branch: sourceBranch })],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "user-modified-sha"]
    ]),
    contents: new Map([
      [`${sourceBranch}:${desiredPath}`, "user-edited-content\n"],
      [`${sourceBranch}:${manifestPath}`, manifestContent]
    ])
  });

  const result = await fixture.client.createPullRequest(
    createInput({ expectedPullRequestHeadSha: "persisted-head-sha" })
  );

  assert.equal(result.pullRequestNumber, 8);
  assert.equal(result.sourceBranch, `${sourceBranch}-retry-2`);
  assert.equal(fixture.contents.get(`${sourceBranch}:${desiredPath}`), "user-edited-content\n");
  assert.equal(fixture.countRequests("PATCH", "/pulls/7"), 0);
});

test("prefers a retry PR over an older merged PR when the current open PR is not safe", async () => {
  const previousRetryBranch = `${sourceBranch}-retry-2`;
  const fixture = createGitHubFixture({
    pullRequests: [
      createPullRequest({ number: 7, state: "open", branch: sourceBranch }),
      createPullRequest({
        number: 6,
        state: "closed",
        merged: true,
        branch: previousRetryBranch
      })
    ],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "user-modified-sha"],
      [previousRetryBranch, "merged-head-sha"]
    ]),
    contents: new Map([
      [`${sourceBranch}:${desiredPath}`, "user-edited-content\n"],
      [`${sourceBranch}:${manifestPath}`, manifestContent],
      [`${targetBranch}:${desiredPath}`, desiredContent],
      [`${targetBranch}:${manifestPath}`, manifestContent]
    ])
  });

  const result = await fixture.client.createPullRequest(
    createInput({ expectedPullRequestHeadSha: "persisted-head-sha" })
  );

  assert.equal(result.pullRequestNumber, 8);
  assert.equal(result.sourceBranch, `${sourceBranch}-retry-3`);
  assert.equal(fixture.contents.get(`${sourceBranch}:${desiredPath}`), "user-edited-content\n");
});

test("preserves an open PR when its handoff manifest no longer belongs to this handoff", async () => {
  const fixture = createGitHubFixture({
    pullRequests: [createPullRequest({ number: 7, state: "open", branch: sourceBranch })],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "source-sha"]
    ]),
    contents: new Map([
      [`${sourceBranch}:${desiredPath}`, "stale-workflow\n"],
      [`${sourceBranch}:${manifestPath}`, '{"handoffId":"another-handoff"}\n']
    ])
  });

  const result = await fixture.client.createPullRequest(createInput());

  assert.equal(result.pullRequestNumber, 8);
  assert.equal(result.sourceBranch, `${sourceBranch}-retry-2`);
  assert.equal(
    fixture.contents.get(`${sourceBranch}:${manifestPath}`),
    '{"handoffId":"another-handoff"}\n'
  );
  assert.equal(fixture.countRequests("PATCH", "/pulls/7"), 0);
});

test("updates an owned open PR only when its persisted head and manifest both match", async () => {
  const fixture = createGitHubFixture({
    pullRequests: [createPullRequest({ number: 7, state: "open", branch: sourceBranch })],
    refs: new Map([
      [targetBranch, "target-sha"],
      [sourceBranch, "source-sha"]
    ]),
    contents: new Map([
      [`${sourceBranch}:${desiredPath}`, "stale-workflow\n"],
      [`${sourceBranch}:${manifestPath}`, manifestContent]
    ])
  });

  const result = await fixture.client.createPullRequest(createInput());

  assert.equal(result.pullRequestNumber, 7);
  assert.equal(result.sourceBranch, sourceBranch);
  assert.equal(fixture.contents.get(`${sourceBranch}:${desiredPath}`), desiredContent);
  assert.equal(fixture.countRequests("POST", "/pulls"), 0);
  assert.equal(fixture.countRequests("PATCH", "/pulls/7"), 1);
});

function createInput(overrides: {
  sourceBranch?: string;
  expectedPullRequestHeadSha?: string | null;
} = {}) {
  return {
    installationId: "installation-1",
    owner: "sketchcatch",
    name: "demo",
    targetBranch,
    sourceBranch: overrides.sourceBranch ?? sourceBranch,
    commitMessage: "chore: install SketchCatch",
    pullRequestTitle: "Deploy: SketchCatch",
    pullRequestBody: "Generated by SketchCatch",
    expectedPullRequestHeadSha:
      overrides.expectedPullRequestHeadSha === undefined
        ? "source-sha"
        : overrides.expectedPullRequestHeadSha,
    files: [
      { path: desiredPath, content: desiredContent },
      { path: manifestPath, content: manifestContent }
    ]
  };
}

function createPullRequest(input: {
  number: number;
  state: "open" | "closed";
  branch: string;
  merged?: boolean;
}) {
  return {
    html_url: `https://github.com/sketchcatch/demo/pull/${input.number}`,
    number: input.number,
    state: input.state,
    merged: input.merged ?? false,
    head: {
      sha: input.merged ? "merged-head-sha" : "source-sha",
      ref: input.branch,
      repo: { full_name: "sketchcatch/demo" }
    },
    base: { ref: targetBranch }
  };
}

function createGitHubFixture(input: {
  pullRequests: ReturnType<typeof createPullRequest>[];
  refs: Map<string, string>;
  contents: Map<string, string>;
}) {
  const requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];
  const refs = input.refs;
  let nextCommit = 1;

  const fetchImpl: typeof fetch = async (resource, init = {}) => {
    const url = new URL(
      typeof resource === "string"
        ? resource
        : resource instanceof URL
          ? resource.href
          : resource.url
    );
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;

    if (url.pathname === "/app/installations/installation-1/access_tokens") {
      return jsonResponse({ token: "installation-token" });
    }

    requests.push({ method, path: `${url.pathname}${url.search}`, body });
    const repositoryPrefix = "/repos/sketchcatch/demo";
    const relativePath = url.pathname.slice(repositoryPrefix.length);

    if (relativePath.startsWith("/git/ref/heads/") && method === "GET") {
      const branch = decodeURIComponent(relativePath.slice("/git/ref/heads/".length));
      const sha = refs.get(branch);
      return sha ? jsonResponse({ object: { sha } }) : jsonResponse({ message: "Not Found" }, 404);
    }

    if (relativePath === "/git/refs" && method === "POST") {
      const ref = typeof body?.ref === "string" ? body.ref : "";
      const branch = ref.replace(/^refs\/heads\//u, "");
      if (refs.has(branch)) return jsonResponse({ message: "Reference already exists" }, 422);
      const sha = typeof body?.sha === "string" ? body.sha : "";
      refs.set(branch, sha);
      return jsonResponse({ object: { sha } }, 201);
    }

    if (relativePath === "/pulls" && method === "GET") {
      return jsonResponse(input.pullRequests);
    }

    if (relativePath.startsWith("/pulls/") && method === "PATCH") {
      const number = Number(relativePath.slice("/pulls/".length));
      const existing = input.pullRequests.find((pullRequest) => pullRequest.number === number);
      return existing ? jsonResponse(existing) : jsonResponse({ message: "Not Found" }, 404);
    }

    if (relativePath === "/pulls" && method === "POST") {
      const branch = typeof body?.head === "string" ? body.head : "";
      const created = createPullRequest({ number: 8, state: "open", branch });
      created.head.sha = refs.get(branch) ?? "retry-head-sha";
      input.pullRequests.unshift(created);
      return jsonResponse(created, 201);
    }

    if (relativePath.startsWith("/contents/") && method === "GET") {
      const path = decodeURIComponent(relativePath.slice("/contents/".length));
      const branch = url.searchParams.get("ref") ?? "";
      const content = input.contents.get(`${branch}:${path}`);
      return content === undefined
        ? jsonResponse({ message: "Not Found" }, 404)
        : jsonResponse({
            sha: `blob-${branch}`,
            encoding: "base64",
            content: Buffer.from(content, "utf8").toString("base64")
          });
    }

    if (relativePath.startsWith("/contents/") && method === "PUT") {
      const path = decodeURIComponent(relativePath.slice("/contents/".length));
      const branch = typeof body?.branch === "string" ? body.branch : "";
      const content = typeof body?.content === "string"
        ? Buffer.from(body.content, "base64").toString("utf8")
        : "";
      input.contents.set(`${branch}:${path}`, content);
      const commitSha = `commit-${nextCommit++}`;
      refs.set(branch, commitSha);
      return jsonResponse({ commit: { sha: commitSha }, content: { sha: `blob-${branch}` } });
    }

    return jsonResponse({ message: `Unhandled ${method} ${relativePath}${url.search}` }, 500);
  };

  return {
    client: createGitHubAppClient({
      appId: "12345",
      privateKey: privateKeyPem,
      fetch: fetchImpl,
      now: () => new Date("2026-07-22T00:00:00.000Z")
    }),
    refs,
    contents: input.contents,
    countRequests(method: string, pathPart: string) {
      return requests.filter(
        (request) => request.method === method && request.path.includes(pathPart)
      ).length;
    }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
