import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createGitHubAppClient } from "./github-app-client.js";

test("GitHub workflow run API path is preserved in the summary", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const requests: string[] = [];
  const client = createGitHubAppClient({
    appId: "123",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    fetch: async (request) => {
      const url = String(request);
      requests.push(url);
      if (url.endsWith("/app/installations/456/access_tokens")) {
        return Response.json({ token: "installation-token" });
      }
      if (url.includes("/repos/jh-9999/audience-live-check/actions/runs?")) {
        return Response.json({
          workflow_runs: [
            {
              id: 987654321,
              run_attempt: 2,
              event: "push",
              head_sha: "a".repeat(40),
              head_branch: "main",
              html_url:
                "https://github.com/jh-9999/audience-live-check/actions/runs/987654321",
              name: "SketchCatch App",
              path: ".github/workflows/sketchcatch-app.yml",
              status: "completed",
              conclusion: "success",
              created_at: "2026-07-16T00:00:00.000Z",
              run_started_at: "2026-07-16T00:00:01.000Z",
              updated_at: "2026-07-16T00:01:00.000Z",
              head_commit: { message: "release app" }
            }
          ]
        });
      }
      return new Response("not found", { status: 404 });
    }
  });

  const runs = await client.listBranchWorkflowRuns({
    installationId: "456",
    owner: "jh-9999",
    name: "audience-live-check",
    branch: "main"
  });

  assert.equal(runs[0]?.workflowPath, ".github/workflows/sketchcatch-app.yml");
  assert.equal(
    requests.some((url) => url.includes("/actions/runs?branch=main")),
    true
  );
});
