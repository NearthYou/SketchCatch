import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createGitHubAppClient,
  GitHubRepositorySettingsVerificationError
} from "./github-app-client.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test("repository settings skip writes when environment, branch policy, and variables are exact", async () => {
  let writeCount = 0;
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKeyPem,
    now: () => new Date("2026-07-22T00:00:00.000Z"),
    fetch: async (resource, init = {}) => {
      const url = new URL(
        typeof resource === "string"
          ? resource
          : resource instanceof URL
            ? resource.href
            : resource.url
      );
      const method = init.method ?? "GET";

      if (url.pathname === "/app/installations/installation-1/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (method !== "GET") writeCount += 1;

      if (url.pathname.endsWith("/environments/sketchcatch-production")) {
        return jsonResponse({
          name: "sketchcatch-production",
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true
          }
        });
      }

      if (url.pathname.endsWith("/deployment-branch-policies")) {
        return jsonResponse({
          total_count: 1,
          branch_policies: [{ id: 11, name: "main", type: "branch" }]
        });
      }

      if (url.pathname.endsWith("/actions/variables/SKETCHCATCH_PROJECT_ID")) {
        return jsonResponse({ name: "SKETCHCATCH_PROJECT_ID", value: "project-1" });
      }

      return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    }
  });

  const input = {
    installationId: "installation-1",
    owner: "sketchcatch",
    name: "demo",
    environmentName: "sketchcatch-production",
    targetBranch: "main",
    variables: { SKETCHCATCH_PROJECT_ID: "project-1" }
  };
  const result = await client.applyRepositorySettings(input);

  assert.equal(result.verified, true);
  assert.equal(writeCount, 0);
});

test("repository settings converge to exactly one target branch policy and verify it", async () => {
  let environment = {
    name: "sketchcatch-production",
    deployment_branch_policy: null as null | {
      protected_branches: boolean;
      custom_branch_policies: boolean;
    }
  };
  let policies = [
    { id: 11, name: "staging", type: "branch" },
    { id: 12, name: "main", type: "tag" }
  ];
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKeyPem,
    now: () => new Date("2026-07-22T00:00:00.000Z"),
    fetch: async (resource, init = {}) => {
      const url = new URL(
        typeof resource === "string"
          ? resource
          : resource instanceof URL
            ? resource.href
            : resource.url
      );
      const method = init.method ?? "GET";
      const body = typeof init.body === "string"
        ? JSON.parse(init.body) as Record<string, unknown>
        : null;

      if (url.pathname === "/app/installations/installation-1/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (url.pathname.endsWith("/environments/sketchcatch-production")) {
        if (method === "PUT") {
          environment = {
            name: "sketchcatch-production",
            deployment_branch_policy: body?.deployment_branch_policy as {
              protected_branches: boolean;
              custom_branch_policies: boolean;
            }
          };
        }
        return jsonResponse(environment);
      }

      if (url.pathname.endsWith("/deployment-branch-policies")) {
        if (method === "POST") {
          policies = [{ id: 13, name: String(body?.name), type: String(body?.type) }];
          return jsonResponse(policies[0]);
        }
        return jsonResponse({ total_count: policies.length, branch_policies: policies });
      }

      const policyMatch = url.pathname.match(/\/deployment-branch-policies\/(\d+)$/u);
      if (policyMatch && method === "DELETE") {
        policies = policies.filter((policy) => policy.id !== Number(policyMatch[1]));
        return new Response(null, { status: 204 });
      }

      return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    }
  });

  const input = {
    installationId: "installation-1",
    owner: "sketchcatch",
    name: "demo",
    environmentName: "sketchcatch-production",
    targetBranch: "main",
    variables: {}
  };
  const result = await client.applyRepositorySettings(input);

  assert.equal(result.verified, true);
  assert.deepEqual(environment.deployment_branch_policy, {
    protected_branches: false,
    custom_branch_policies: true
  });
  assert.deepEqual(policies, [{ id: 13, name: "main", type: "branch" }]);
});

test("repository settings fail when GitHub read-back differs from the requested variable value", async () => {
  let variableReadCount = 0;
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKeyPem,
    now: () => new Date("2026-07-22T00:00:00.000Z"),
    fetch: async (resource, init = {}) => {
      const url = new URL(
        typeof resource === "string"
          ? resource
          : resource instanceof URL
            ? resource.href
            : resource.url
      );
      const method = init.method ?? "GET";

      if (url.pathname === "/app/installations/installation-1/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (url.pathname.endsWith("/environments/sketchcatch-production")) {
        return method === "PUT"
          ? jsonResponse({})
          : jsonResponse({
              name: "sketchcatch-production",
              deployment_branch_policy: {
                protected_branches: false,
                custom_branch_policies: true
              }
            });
      }

      if (url.pathname.endsWith("/deployment-branch-policies")) {
        return jsonResponse({
          total_count: 1,
          branch_policies: [{ id: 11, name: "main", type: "branch" }]
        });
      }

      if (url.pathname.endsWith("/actions/variables/SKETCHCATCH_PROJECT_ID")) {
        if (method === "PATCH") return jsonResponse({});
        variableReadCount += 1;
        return jsonResponse({
          name: "SKETCHCATCH_PROJECT_ID",
          value: variableReadCount === 1 ? "old-project" : "wrong-project"
        });
      }

      return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    }
  });

  await assert.rejects(
    client.applyRepositorySettings({
      installationId: "installation-1",
      owner: "sketchcatch",
      name: "demo",
      environmentName: "sketchcatch-production",
      targetBranch: "main",
      variables: { SKETCHCATCH_PROJECT_ID: "expected-project" }
    }),
    (error: unknown) =>
      error instanceof GitHubRepositorySettingsVerificationError &&
      error.settingName === "SKETCHCATCH_PROJECT_ID"
  );

  assert.equal(variableReadCount, 2);
});

test("repository settings delete a blank managed variable and verify that it is absent", async () => {
  let currentValue: string | null = "https://stale.example.com";
  let deleteCount = 0;
  let writeCount = 0;
  let absentReadCount = 0;
  const client = createGitHubAppClient({
    appId: "12345",
    privateKey: privateKeyPem,
    now: () => new Date("2026-07-22T00:00:00.000Z"),
    fetch: async (resource, init = {}) => {
      const url = new URL(
        typeof resource === "string"
          ? resource
          : resource instanceof URL
            ? resource.href
            : resource.url
      );
      const method = init.method ?? "GET";

      if (url.pathname === "/app/installations/installation-1/access_tokens") {
        return jsonResponse({ token: "installation-token" });
      }

      if (url.pathname.endsWith("/environments/sketchcatch-production")) {
        return method === "PUT"
          ? jsonResponse({})
          : jsonResponse({
              name: "sketchcatch-production",
              deployment_branch_policy: {
                protected_branches: false,
                custom_branch_policies: true
              }
            });
      }

      if (url.pathname.endsWith("/deployment-branch-policies")) {
        return jsonResponse({
          total_count: 1,
          branch_policies: [{ id: 11, name: "main", type: "branch" }]
        });
      }

      if (url.pathname.endsWith("/actions/variables/SKETCHCATCH_STATIC_SITE_URL")) {
        if (method === "DELETE") {
          deleteCount += 1;
          currentValue = null;
          return new Response(null, { status: 204 });
        }

        if (method === "PATCH") {
          writeCount += 1;
          currentValue = "";
          return jsonResponse({});
        }

        if (currentValue === null) {
          absentReadCount += 1;
          return jsonResponse({ message: "Not Found" }, 404);
        }

        return jsonResponse({
          name: "SKETCHCATCH_STATIC_SITE_URL",
          value: currentValue
        });
      }

      if (url.pathname.endsWith("/actions/variables") && method === "POST") {
        writeCount += 1;
        currentValue = "";
        return jsonResponse({}, 201);
      }

      return jsonResponse({ message: `Unhandled ${method} ${url.pathname}` }, 500);
    }
  });

  const result = await client.applyRepositorySettings({
    installationId: "installation-1",
    owner: "sketchcatch",
    name: "demo",
    environmentName: "sketchcatch-production",
    targetBranch: "main",
    variables: { SKETCHCATCH_STATIC_SITE_URL: "" }
  });

  assert.equal(result.verified, true);
  assert.equal(deleteCount, 1);
  assert.equal(writeCount, 0);
  assert.equal(absentReadCount, 1);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
