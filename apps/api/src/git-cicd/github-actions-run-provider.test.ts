import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitHubActionsReadClient,
  GitHubWorkflowJobSummary,
  GitHubWorkflowRunSummary
} from "../source-repositories/github-app-client.js";
import { createGitHubActionsRunProvider } from "./github-actions-run-provider.js";

const commitSha = "a".repeat(40);
const repositoryRef = {
  installationId: "123",
  owner: "jh-9999",
  name: "audience-live-check",
  branch: "main"
};

test("app push and infra workflow_dispatch on the same commit stay independent", async () => {
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [
        workflowRun({ id: 101, workflowName: "SketchCatch App", event: "push" }),
        workflowRun({
          id: 102,
          workflowName: "SketchCatch Infra",
          event: "workflow_dispatch"
        })
      ]
    })
  );

  const snapshots = await provider.listSnapshots(repositoryRef);

  assert.equal(snapshots.length, 2);
  assert.deepEqual(
    snapshots.map((snapshot) => [snapshot.executionKind, snapshot.workflowRunId]),
    [
      ["infra", "102"],
      ["app", "101"]
    ]
  );
});

test("an Infra Plan failure keeps Apply skipped in the independent run snapshot", async () => {
  const run = workflowRun({
    id: 201,
    workflowName: "SketchCatch Infra",
    event: "workflow_dispatch",
    conclusion: "failure"
  });
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [run],
      jobsByRunId: {
        [run.id]: [
          workflowJob({
            id: 301,
            name: "deploy",
            conclusion: "failure",
            steps: [
              workflowStep("Prepare Terraform", "success"),
              workflowStep("Terraform Plan", "failure"),
              workflowStep("Terraform Apply", "skipped")
            ]
          })
        ]
      }
    })
  );

  const [snapshot] = await provider.listSnapshots(repositoryRef);

  assert.equal(snapshot?.status, "failed");
  assert.equal(
    snapshot?.jobs.find((job) => job.stageKind === "infra_plan" && job.status === "failed")
      ?.status,
    "failed"
  );
  assert.equal(
    snapshot?.jobs.find((job) => job.stageKind === "infra_apply")?.status,
    "skipped"
  );
});

test("only the highest attempt of one run ID is hydrated and event/name/path mismatches are ignored", async () => {
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [
        workflowRun({
          id: 401,
          runAttempt: 1,
          workflowName: "SketchCatch App",
          event: "push"
        }),
        workflowRun({
          id: 401,
          runAttempt: 2,
          workflowName: "SketchCatch App",
          event: "push"
        }),
        workflowRun({
          id: 402,
          workflowName: "SketchCatch App",
          event: "workflow_dispatch"
        }),
        workflowRun({ id: 403, workflowName: "SketchCatch Infra", event: "push" }),
        workflowRun({
          id: 404,
          workflowName: "SketchCatch App",
          workflowPath: ".github/workflows/lookalike-app.yml",
          event: "push"
        }),
        workflowRun({
          id: 405,
          workflowName: "SketchCatch Infra",
          workflowPath: ".github/workflows/lookalike-infra.yml",
          event: "workflow_dispatch"
        })
      ]
    })
  );

  const snapshots = await provider.listSnapshots(repositoryRef);

  assert.deepEqual(
    snapshots.map((snapshot) => [snapshot.workflowRunId, snapshot.workflowRunAttempt]),
    [["401", 2]]
  );
});

test("an Infra Apply failure is attributed to the Apply stage", async () => {
  const run = workflowRun({
    id: 501,
    workflowName: "SketchCatch Infra",
    event: "workflow_dispatch",
    conclusion: "failure"
  });
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [run],
      jobsByRunId: {
        [run.id]: [
          workflowJob({
            id: 601,
            name: "deploy",
            conclusion: "failure",
            steps: [
              workflowStep("Prepare Terraform", "success"),
              workflowStep("Terraform Plan", "success"),
              workflowStep("Terraform Apply", "failure")
            ]
          })
        ]
      }
    })
  );

  const [snapshot] = await provider.listSnapshots(repositoryRef);

  assert.equal(
    snapshot?.jobs.find((job) => job.stageKind === "infra_apply")?.status,
    "failed"
  );
});

test("an Infra preparation failure does not masquerade as a Plan or Apply failure", async () => {
  const run = workflowRun({
    id: 651,
    workflowName: "SketchCatch Infra",
    event: "workflow_dispatch",
    conclusion: "failure"
  });
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [run],
      jobsByRunId: {
        [run.id]: [
          workflowJob({
            id: 652,
            name: "deploy",
            conclusion: "failure",
            steps: [
              workflowStep("Prepare Terraform", "failure"),
              workflowStep("Terraform Plan", "skipped"),
              workflowStep("Terraform Apply", "skipped"),
              workflowStep("Report SketchCatch infrastructure result", "failure")
            ]
          })
        ]
      }
    })
  );

  const [snapshot] = await provider.listSnapshots(repositoryRef);

  assert.equal(snapshot?.status, "failed");
  assert.equal(snapshot?.jobs.some((job) => job.status === "failed"), false);
});

test("workflow logs are masked before entering a snapshot", async () => {
  const run = workflowRun({ id: 701, workflowName: "SketchCatch App", event: "push" });
  const secret = "temporary-session-token";
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [run],
      jobsByRunId: {
        [run.id]: [workflowJob({ id: 801, name: "release" })]
      },
      logsByJobId: {
        801: `AWS_SESSION_TOKEN=${secret}\nrelease completed`
      }
    })
  );

  const [snapshot] = await provider.listSnapshots(repositoryRef);
  const messages = snapshot?.logs.map((log) => log.message).join("\n") ?? "";

  assert.equal(messages.includes(secret), false);
  assert.match(messages, /\[REDACTED\]/);
  assert.match(messages, /release completed/);
});

test("a GitHub log read failure is replaced with a fixed user-safe summary", async () => {
  const run = workflowRun({ id: 811, workflowName: "SketchCatch App", event: "push" });
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [run],
      jobsByRunId: {
        [run.id]: [workflowJob({ id: 812, name: "release" })]
      },
      logErrorsByJobId: {
        812: new Error("token=raw-github-credential upstream request failed")
      }
    })
  );

  const [snapshot] = await provider.listSnapshots(repositoryRef);

  assert.deepEqual(snapshot?.logs.map((log) => log.message), [
    "GitHub Actions job log is unavailable."
  ]);
});

test("valid ECS release evidence remains attached to its exact workflow run", async () => {
  const run = workflowRun({ id: 901, workflowName: "SketchCatch App", event: "push" });
  const digest = `sha256:${"b".repeat(64)}`;
  const evidence = {
    schemaVersion: 1 as const,
    runtimeTargetKind: "ecs_fargate" as const,
    outcome: "succeeded" as const,
    commitSha,
    imageDigest: digest,
    imageUri: `131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/demo@${digest}`,
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    containerName: "web",
    taskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:131404649047:task-definition/demo-service:2",
    previousTaskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:131404649047:task-definition/demo-service:1",
    outputUrl: "https://demo.cloudfront.net"
  };
  const provider = createGitHubActionsRunProvider(
    createFakeClient({
      runs: [run],
      jobsByRunId: {
        [run.id]: [workflowJob({ id: 902, name: "release" })]
      },
      logsByJobId: {
        902: `SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=${Buffer.from(JSON.stringify(evidence)).toString("base64")}`
      }
    })
  );

  const [snapshot] = await provider.listSnapshots(repositoryRef);

  assert.deepEqual(snapshot?.releaseEvidence, evidence);
  assert.deepEqual(snapshot?.logs.map((log) => log.message), ["ECS release evidence captured."]);
});

function createFakeClient(input: {
  runs: GitHubWorkflowRunSummary[];
  jobsByRunId?: Readonly<Record<number, GitHubWorkflowJobSummary[]>>;
  logsByJobId?: Readonly<Record<number, string>>;
  logErrorsByJobId?: Readonly<Record<number, Error>>;
}): GitHubActionsReadClient {
  return {
    async listBranchWorkflowRuns() {
      return input.runs;
    },
    async getWorkflowRun({ runId }) {
      const run = input.runs.find((candidate) => candidate.id === runId);
      if (!run) throw new Error("workflow run not found");
      return run;
    },
    async listCommitFiles() {
      return [];
    },
    async listWorkflowJobs({ runId }) {
      return input.jobsByRunId?.[runId] ?? [];
    },
    async readWorkflowJobLog({ jobId }) {
      const error = input.logErrorsByJobId?.[jobId];
      if (error) throw error;
      return input.logsByJobId?.[jobId] ?? "";
    }
  };
}

function workflowRun(
  overrides: Partial<GitHubWorkflowRunSummary> &
    Pick<GitHubWorkflowRunSummary, "id" | "workflowName" | "event">
): GitHubWorkflowRunSummary {
  const { id, workflowName, event, ...rest } = overrides;
  return {
    id,
    runAttempt: 1,
    event,
    updatedAt: "2026-07-16T00:00:00.000Z",
    createdAt: "2026-07-16T00:00:00.000Z",
    commitSha,
    commitMessage: "release audience app",
    branch: "main",
    workflowName,
    workflowPath:
      workflowName === "SketchCatch App"
        ? ".github/workflows/sketchcatch-app.yml"
        : workflowName === "SketchCatch Infra"
          ? ".github/workflows/sketchcatch-infra.yml"
          : ".github/workflows/unmonitored.yml",
    runUrl: `https://github.com/jh-9999/audience-live-check/actions/runs/${id}`,
    status: "completed",
    conclusion: "success",
    startedAt: "2026-07-16T00:00:00.000Z",
    finishedAt: "2026-07-16T00:01:00.000Z",
    ...rest
  };
}

function workflowJob(
  overrides: Partial<GitHubWorkflowJobSummary> & Pick<GitHubWorkflowJobSummary, "id" | "name">
): GitHubWorkflowJobSummary {
  const { id, name, ...rest } = overrides;
  return {
    id,
    name,
    runUrl: `https://github.com/jh-9999/audience-live-check/actions/jobs/${id}`,
    status: "completed",
    conclusion: "success",
    startedAt: "2026-07-16T00:00:00.000Z",
    finishedAt: "2026-07-16T00:01:00.000Z",
    steps: [],
    ...rest
  };
}

function workflowStep(name: string, conclusion: string) {
  return {
    name,
    status: "completed",
    conclusion,
    startedAt: "2026-07-16T00:00:00.000Z",
    finishedAt: "2026-07-16T00:01:00.000Z"
  };
}
