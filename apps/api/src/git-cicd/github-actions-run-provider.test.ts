import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubActionsReadClient } from "../source-repositories/github-app-client.js";
import { createGitHubActionsRunProvider } from "./github-actions-run-provider.js";

const repository = { installationId: "42", owner: "owner", name: "repo", branch: "main" };

test("provider maps the exact generated release job steps to app stages", async () => {
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({
        id: 1,
        workflowName: "SketchCatch Infra",
        runUrl: "infra",
        status: "completed",
        conclusion: "success"
      }),
      run({
        id: 2,
        workflowName: "SketchCatch App",
        runUrl: "app",
        status: "in_progress",
        conclusion: null
      })
    ],
    listWorkflowJobs: async ({ runId }: { runId: number }) =>
      runId === 1
        ? [
            {
              id: 11,
              name: "plan",
              runUrl: "plan",
              status: "completed",
              conclusion: "success",
              startedAt: null,
              finishedAt: null,
              steps: []
            }
          ]
        : [
            {
              id: 22,
              name: "release",
              runUrl: "release",
              status: "in_progress",
              conclusion: null,
              startedAt: null,
              finishedAt: null,
              steps: [
                step("Upload release artifact", "completed", "success"),
                step("Refresh Auto Scaling Group", "in_progress", null),
                step("Verify URLs", "queued", null)
              ]
            }
          ],
    readWorkflowJobLog: async () => "plan ok"
  } as GitHubActionsReadClient;

  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
  assert.equal(snapshot?.status, "running");
  assert.deepEqual(
    snapshot?.jobs.map((job) => [job.stageKind, job.status]),
    [
      ["infra_plan", "succeeded"],
      ["app_build", "succeeded"],
      ["app_deploy", "running"],
      ["verify", "queued"]
    ]
  );
});

test("provider selects the larger attempt only for the same GitHub run id", async () => {
  const requestedRunIds: number[] = [];
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({
        id: 10,
        runAttempt: 1,
        updatedAt: "2026-07-13T00:03:00Z",
        status: "completed",
        conclusion: "failure",
        runUrl: "old"
      }),
      run({
        id: 10,
        runAttempt: 2,
        updatedAt: "2026-07-13T00:02:00Z",
        status: "completed",
        conclusion: "success",
        runUrl: "new"
      })
    ],
    listWorkflowJobs: async ({ runId }: { runId: number }) => {
      requestedRunIds.push(runId);
      return [];
    },
    readWorkflowJobLog: async () => ""
  } as GitHubActionsReadClient;

  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
  assert.equal(snapshot?.status, "succeeded");
  assert.equal(snapshot?.runUrl, "new");
  assert.deepEqual(requestedRunIds, [10]);
});

test("provider selects newer distinct run id even when its attempt is lower", async () => {
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({
        id: 10,
        runAttempt: 2,
        updatedAt: "2026-07-13T00:02:00Z",
        createdAt: "2026-07-13T00:01:00Z",
        status: "completed",
        conclusion: "failure",
        runUrl: "older-attempt-two"
      }),
      run({
        id: 20,
        runAttempt: 1,
        updatedAt: "2026-07-13T00:03:00Z",
        createdAt: "2026-07-13T00:02:00Z",
        status: "completed",
        conclusion: "success",
        runUrl: "newer-attempt-one"
      })
    ],
    listWorkflowJobs: async () => [],
    readWorkflowJobLog: async () => ""
  } as GitHubActionsReadClient;
  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
  assert.equal(snapshot?.status, "succeeded");
  assert.equal(snapshot?.runUrl, "newer-attempt-one");
});

test("provider maps aggregate terminal failure and cancelled statuses", async () => {
  for (const [conclusion, expected] of [
    ["failure", "failed"],
    ["cancelled", "cancelled"],
    ["success", "succeeded"]
  ] as const) {
    const client = clientForRun(run({ status: "completed", conclusion }));
    const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
    assert.equal(snapshot?.status, expected);
  }
});

test("provider keeps mixed workflows nonterminal until all selected workflows finish", async () => {
  for (const item of [
    { infra: ["completed", "failure"], app: ["in_progress", null], expected: "running" },
    { infra: ["completed", "cancelled"], app: ["in_progress", null], expected: "running" },
    { infra: ["completed", "failure"], app: ["queued", null], expected: "queued" },
    { infra: ["completed", "failure"], app: ["completed", "success"], expected: "failed" },
    { infra: ["completed", "cancelled"], app: ["completed", "success"], expected: "cancelled" },
    { infra: ["completed", "success"], app: ["completed", "success"], expected: "succeeded" }
  ] as const) {
    const client = {
      listCommitFiles: async () => [],
      listBranchWorkflowRuns: async () => [
        run({
          id: 1,
          workflowName: "SketchCatch Infra",
          status: item.infra[0],
          conclusion: item.infra[1]
        }),
        run({
          id: 2,
          workflowName: "SketchCatch App",
          status: item.app[0],
          conclusion: item.app[1]
        })
      ],
      listWorkflowJobs: async () => [],
      readWorkflowJobLog: async () => ""
    } as GitHubActionsReadClient;
    const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
    assert.equal(snapshot?.status, item.expected);
  }
});

test("provider preserves queued and complete terminal status semantics", async () => {
  for (const item of [
    { status: "queued", conclusion: null, expected: "queued" },
    { status: "in_progress", conclusion: null, expected: "running" },
    { status: "completed", conclusion: "skipped", expected: "succeeded" },
    { status: "completed", conclusion: "startup_failure", expected: "failed" },
    { status: "completed", conclusion: "stale", expected: "failed" }
  ] as const) {
    const [snapshot] = await createGitHubActionsRunProvider(clientForRun(run(item))).listSnapshots(
      repository
    );
    assert.equal(snapshot?.status, item.expected);
  }
});

test("provider maps exact generated plan job stage statuses", async () => {
  for (const item of [
    { status: "queued", conclusion: null, expected: "queued" },
    { status: "in_progress", conclusion: null, expected: "running" },
    { status: "completed", conclusion: "success", expected: "succeeded" },
    { status: "completed", conclusion: "skipped", expected: "skipped" },
    { status: "completed", conclusion: "cancelled", expected: "cancelled" },
    { status: "completed", conclusion: "timed_out", expected: "failed" },
    { status: "completed", conclusion: "action_required", expected: "failed" },
    { status: "completed", conclusion: "startup_failure", expected: "failed" },
    { status: "completed", conclusion: "stale", expected: "failed" }
  ] as const) {
    const client = {
      listCommitFiles: async () => [],
      listBranchWorkflowRuns: async () => [
        run({ workflowName: "SketchCatch Infra", status: item.status, conclusion: item.conclusion })
      ],
      listWorkflowJobs: async () => [
        {
          id: 1,
          name: "plan",
          runUrl: "plan",
          status: item.status,
          conclusion: item.conclusion,
          startedAt: null,
          finishedAt: null,
          steps: []
        }
      ],
      readWorkflowJobLog: async () => ""
    } as GitHubActionsReadClient;
    const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
    assert.equal(snapshot?.jobs[0]?.status, item.expected);
  }
});

test("provider bounds hydration to recent commit groups independently of repository history", async () => {
  const hydratedRunIds: number[] = [];
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () =>
      Array.from({ length: 25 }, (_, index) =>
        run({
          id: index + 1,
          commitSha: `sha-${index}`,
          updatedAt: new Date(Date.UTC(2026, 6, 13, 0, index)).toISOString(),
          createdAt: new Date(Date.UTC(2026, 6, 13, 0, index)).toISOString()
        })
      ),
    listWorkflowJobs: async ({ runId }: { runId: number }) => {
      hydratedRunIds.push(runId);
      return [];
    },
    readWorkflowJobLog: async () => ""
  } as GitHubActionsReadClient;

  const snapshots = await createGitHubActionsRunProvider(client).listSnapshots(repository);

  assert.equal(snapshots.length, 10);
  assert.equal(hydratedRunIds.length, 10);
  assert.deepEqual(hydratedRunIds, [25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
});

test("provider targets one commit and derives stable upstream and log revisions", async () => {
  const listInputs: unknown[] = [];
  const hydratedRunIds: number[] = [];
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async (input: unknown) => {
      listInputs.push(input);
      return [
        run({ id: 11, commitSha: "target", runAttempt: 2, updatedAt: "2026-07-13T00:02:00Z" }),
        run({ id: 22, commitSha: "other", updatedAt: "2026-07-13T00:03:00Z" })
      ];
    },
    listWorkflowJobs: async ({ runId }: { runId: number }) => {
      hydratedRunIds.push(runId);
      return [];
    },
    readWorkflowJobLog: async () => ""
  } as GitHubActionsReadClient;

  const snapshots = await createGitHubActionsRunProvider(client).listSnapshots({
    ...repository,
    commitSha: "target"
  });

  assert.equal(snapshots.length, 1);
  assert.deepEqual(hydratedRunIds, [11]);
  assert.deepEqual(listInputs, [{ ...repository, commitSha: "target" }]);
  const snapshot = snapshots[0] as unknown as Record<string, unknown>;
  assert.equal(snapshot.logRevision, "SketchCatch App:11:2");
  assert.equal(
    snapshot.upstreamOrderingToken,
    "2026-07-13T00:02:00.000Z|SketchCatch App:00000000000000000011:0000000002"
  );
});

test("provider ordering token remains monotonic when numeric run ids cross digit widths", async () => {
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({ id: 9, commitSha: "older", updatedAt: "2026-07-13T00:02:00Z" }),
      run({ id: 10, commitSha: "newer", updatedAt: "2026-07-13T00:02:00Z" })
    ],
    listWorkflowJobs: async () => [],
    readWorkflowJobLog: async () => ""
  } as GitHubActionsReadClient;

  const snapshots = await createGitHubActionsRunProvider(client).listSnapshots(repository);
  const older = snapshots.find((snapshot) => snapshot.commitSha === "older")!;
  const newer = snapshots.find((snapshot) => snapshot.commitSha === "newer")!;

  assert.ok(older.upstreamOrderingToken < newer.upstreamOrderingToken);
});

function clientForRun(workflowRun: ReturnType<typeof run>): GitHubActionsReadClient {
  return {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [workflowRun],
    listWorkflowJobs: async () => [],
    readWorkflowJobLog: async () => ""
  };
}

function run(overrides: Partial<ReturnType<typeof baseRun>> = {}) {
  return { ...baseRun(), ...overrides };
}
function baseRun() {
  return {
    id: 1,
    runAttempt: 1,
    updatedAt: "2026-07-13T00:00:00Z",
    createdAt: "2026-07-13T00:00:00Z",
    commitSha: "abc",
    commitMessage: "Ship",
    branch: "main",
    workflowName: "SketchCatch App",
    runUrl: "run",
    status: "completed",
    conclusion: "success" as string | null,
    startedAt: null,
    finishedAt: null
  };
}
function step(name: string, status: string, conclusion: string | null) {
  return { name, status, conclusion, startedAt: null, finishedAt: null };
}
