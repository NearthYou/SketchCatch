import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  createGitHubOAuthRepositorySettingsApplier,
  createGitHubRepositorySettingsApplier,
  GitCicdRepositorySettingsPermissionError
} from "./git-cicd-repository-settings-service.js";
import type {
  GitCicdHandoffRecord,
  GitCicdHandoffSourceRepositoryRecord
} from "./git-cicd-handoff-service.js";
import type { GitHubAppClient } from "../source-repositories/github-app-client.js";

test("GitHub OAuth repository settings applier patches existing variables without a GET probe", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const fetcher = (async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET"
    });

    return new Response(JSON.stringify({}), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  }) as typeof fetch;
  const applier = createGitHubOAuthRepositorySettingsApplier("oauth-token", fetcher);

  await applier.applyRepositorySettings({
    handoff: {
      repositorySettingsPreview: {
        environmentName: "sketchcatch-production",
        variables: {
          SKETCHCATCH_ASG_NAME: "",
          SKETCHCATCH_AWS_REGION: "ap-northeast-2",
          SKETCHCATCH_STATIC_SITE_URL: "   "
        },
        secrets: [],
        workflowFiles: []
      }
    } as unknown as GitCicdHandoffRecord,
    sourceRepository: {
      owner: "NearthYou",
      name: "SketchCatch"
    } as unknown as GitCicdHandoffSourceRepositoryRecord
  });

  assert.deepEqual(
    requests.map((request) => request.method),
    ["PUT", "PATCH"]
  );
  assert.equal(
    requests.some((request) => request.url.includes("SKETCHCATCH_ASG_NAME")),
    false
  );
  assert.equal(
    requests.some((request) => request.url.includes("SKETCHCATCH_STATIC_SITE_URL")),
    false
  );
  assert.equal(
    requests.some(
      (request) =>
        request.method === "GET" && request.url.includes("/actions/variables/SKETCHCATCH_AWS_REGION")
    ),
    false
  );
});

test("GitHub App repository settings applier uses the shared GIT_APP env config", async () => {
  const previousEnv = {
    GIT_APP_ID: process.env.GIT_APP_ID,
    GIT_APP_SLUG: process.env.GIT_APP_SLUG,
    GIT_APP_PRIVATE_KEY_BASE64: process.env.GIT_APP_PRIVATE_KEY_BASE64,
    GIT_APP_CALLBACK_URL: process.env.GIT_APP_CALLBACK_URL,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY
  };
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      format: "pem",
      type: "pkcs8"
    },
    publicKeyEncoding: {
      format: "pem",
      type: "spki"
    }
  });

  try {
    process.env.GIT_APP_ID = "12345";
    process.env.GIT_APP_SLUG = "sketchcatch";
    process.env.GIT_APP_PRIVATE_KEY_BASE64 = Buffer.from(privateKey).toString("base64");
    process.env.GIT_APP_CALLBACK_URL = "https://sketchcatch.net/api/source-repositories/github/callback";
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    const applier = createGitHubRepositorySettingsApplier();

    await assert.rejects(
      () =>
        applier.applyRepositorySettings({
          handoff: {
            repositorySettingsPreview: {
              environmentName: "sketchcatch-production",
              variables: {},
              secrets: [],
              workflowFiles: []
            }
          } as unknown as GitCicdHandoffRecord,
          sourceRepository: {
            owner: "NearthYou",
            name: "SketchCatch"
          } as unknown as GitCicdHandoffSourceRepositoryRecord
        }),
      GitCicdRepositorySettingsPermissionError
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("GitHub App repository settings applier maps missing shared config to permission error", () => {
  const previousEnv = {
    GIT_APP_ID: process.env.GIT_APP_ID,
    GIT_APP_SLUG: process.env.GIT_APP_SLUG,
    GIT_APP_PRIVATE_KEY_BASE64: process.env.GIT_APP_PRIVATE_KEY_BASE64,
    GIT_APP_CALLBACK_URL: process.env.GIT_APP_CALLBACK_URL,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY
  };

  try {
    delete process.env.GIT_APP_ID;
    delete process.env.GIT_APP_SLUG;
    delete process.env.GIT_APP_PRIVATE_KEY_BASE64;
    delete process.env.GIT_APP_CALLBACK_URL;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    assert.throws(
      () => createGitHubRepositorySettingsApplier(),
      GitCicdRepositorySettingsPermissionError
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("GitHub App repository settings applier skips blank variables", async () => {
  let appliedVariables: Record<string, string> | null = null;
  const applier = createGitHubRepositorySettingsApplier({
    async applyRepositorySettings(input) {
      appliedVariables = input.variables;

      return {
        environmentName: input.environmentName,
        variables: Object.keys(input.variables)
      };
    },
    async createPullRequest() {
      throw new Error("not used");
    },
    async getLatestWorkflowRunForHeadSha() {
      throw new Error("not used");
    },
    async getPipelineStatusForPullRequest() {
      throw new Error("not used");
    },
    async listInstallationRepositories() {
      throw new Error("not used");
    },
    async listInstallations() {
      throw new Error("not used");
    }
  } satisfies GitHubAppClient);

  const result = await applier.applyRepositorySettings({
    handoff: {
      repositorySettingsPreview: {
        environmentName: "sketchcatch-production",
        variables: {
          SKETCHCATCH_ASG_NAME: "",
          SKETCHCATCH_AWS_REGION: "ap-northeast-2",
          SKETCHCATCH_API_BASE_URL: null,
          SKETCHCATCH_RDS_ENABLED: "false",
          SKETCHCATCH_RELEASE_BUCKET: undefined,
          SKETCHCATCH_STATIC_SITE_URL: " "
        } as unknown as Record<string, string>,
        secrets: [],
        workflowFiles: []
      }
    } as unknown as GitCicdHandoffRecord,
    sourceRepository: {
      githubInstallationId: "123",
      owner: "NearthYou",
      name: "SketchCatch"
    } as unknown as GitCicdHandoffSourceRepositoryRecord
  });

  assert.deepEqual(appliedVariables, {
    SKETCHCATCH_AWS_REGION: "ap-northeast-2",
    SKETCHCATCH_RDS_ENABLED: "false"
  });
  assert.deepEqual(result.variables, ["SKETCHCATCH_AWS_REGION", "SKETCHCATCH_RDS_ENABLED"]);
});

function restoreEnv(previousEnv: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
