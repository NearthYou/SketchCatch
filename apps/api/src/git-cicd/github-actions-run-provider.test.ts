import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubActionsRunProvider } from "./github-actions-run-provider.js";
import type { GitHubActionsReadClient } from "../source-repositories/github-app-client.js";

test("provider groups app and infra workflows into one commit snapshot", async () => {
  const client = {
    async listCommitFiles() {
      return [];
    },
    async listBranchWorkflowRuns() {
      return [
        {
          id: 1,
          commitSha: "abc",
          commitMessage: "Ship both",
          branch: "main",
          workflowName: "SketchCatch Infra",
          runUrl: "https://run/infra",
          status: "completed",
          conclusion: "success",
          startedAt: "2026-07-13T00:00:00Z",
          finishedAt: "2026-07-13T00:03:00Z"
        },
        {
          id: 2,
          commitSha: "abc",
          commitMessage: "Ship both",
          branch: "main",
          workflowName: "SketchCatch App",
          runUrl: "https://run/app",
          status: "in_progress",
          conclusion: null,
          startedAt: "2026-07-13T00:01:00Z",
          finishedAt: null
        },
        {
          id: 3,
          commitSha: "ignored",
          commitMessage: "Other",
          branch: "main",
          workflowName: "Unrelated",
          runUrl: "https://run/other",
          status: "completed",
          conclusion: "success",
          startedAt: null,
          finishedAt: null
        }
      ];
    },
    async listWorkflowJobs(input: { runId: number }) {
      return input.runId === 1
        ? [
            {
              id: 11,
              name: "Terraform Plan",
              runUrl: "https://job/plan",
              status: "completed",
              conclusion: "success",
              startedAt: null,
              finishedAt: null
            }
          ]
        : [
            {
              id: 22,
              name: "Build App",
              runUrl: "https://job/build",
              status: "completed",
              conclusion: "success",
              startedAt: null,
              finishedAt: null
            }
          ];
    },
    async readWorkflowJobLog(input: { jobId: number }) {
      return input.jobId === 11 ? "plan ok" : "token=[REDACTED]\nbuilding";
    }
  } as GitHubActionsReadClient;

  const snapshots = await createGitHubActionsRunProvider(client).listSnapshots({
    installationId: "42",
    owner: "owner",
    name: "repo",
    branch: "main"
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.commitSha, "abc");
  assert.equal(snapshots[0]?.status, "running");
  assert.deepEqual(
    snapshots[0]?.jobs.map((job) => job.stageKind),
    ["infra_plan", "app_build"]
  );
  assert.deepEqual(
    snapshots[0]?.logs.map((log) => log.message),
    ["plan ok", "[REDACTED]", "building"]
  );
});

test("provider maps aggregate terminal failure and cancelled statuses", async () => {
  const baseRun = {
    id: 1,
    commitSha: "abc",
    commitMessage: "Ship",
    branch: "main",
    workflowName: "SketchCatch App",
    runUrl: "https://run/app",
    status: "completed",
    startedAt: null,
    finishedAt: null
  };
  for (const [conclusion, expected] of [
    ["failure", "failed"],
    ["cancelled", "cancelled"],
    ["success", "succeeded"]
  ] as const) {
    const client = {
      listCommitFiles: async () => [],
      listBranchWorkflowRuns: async () => [{ ...baseRun, conclusion }],
      listWorkflowJobs: async () => [],
      readWorkflowJobLog: async () => ""
    } as GitHubActionsReadClient;
    const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots({
      installationId: "42",
      owner: "owner",
      name: "repo",
      branch: "main"
    });
    assert.equal(snapshot?.status, expected);
  }
});
