import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitHubOAuthRepositorySettingsApplier } from "./git-cicd-repository-settings-service.js";
import type {
  GitCicdHandoffRecord,
  GitCicdHandoffSourceRepositoryRecord
} from "./git-cicd-handoff-service.js";

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
          SKETCHCATCH_AWS_REGION: "ap-northeast-2"
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
    requests.some(
      (request) =>
        request.method === "GET" && request.url.includes("/actions/variables/SKETCHCATCH_AWS_REGION")
    ),
    false
  );
});
