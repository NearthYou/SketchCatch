import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubActionsReadClient } from "../source-repositories/github-app-client.js";
import { createGitHubActionsRunProvider } from "./github-actions-run-provider.js";

const repository = { installationId: "42", owner: "owner", name: "repo", branch: "main" };

test("provider maps generated ECS release steps to build publish deploy and health stages", async () => {
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
                step("Run CodeBuild", "completed", "success"),
                step("Publish immutable ECR digest", "completed", "success"),
                step("Deploy ECS Fargate revision", "in_progress", null),
                step("Verify ECS release", "queued", null)
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
      ["artifact_publish", "succeeded"],
      ["app_deploy", "running"],
      ["verify", "queued"]
    ]
  );
});

test("provider parses bounded ECS release evidence while keeping job logs masked", async () => {
  const evidence = {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha: "a".repeat(40),
    imageDigest: `sha256:${"b".repeat(64)}`,
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch/api@sha256:${"b".repeat(64)}`,
    clusterName: "sketchcatch-api",
    serviceName: "sketchcatch-api",
    containerName: "api",
    taskDefinitionArn: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/sketchcatch-api:42",
    previousTaskDefinitionArn: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/sketchcatch-api:41",
    outputUrl: "https://api.example.com"
  };
  const encoded = Buffer.from(JSON.stringify(evidence)).toString("base64");
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({ commitSha: "a".repeat(40), status: "completed", conclusion: "success" })
    ],
    listWorkflowJobs: async () => [
      {
        id: 22,
        name: "release",
        runUrl: "release",
        status: "completed",
        conclusion: "success",
        startedAt: null,
        finishedAt: null,
        steps: [step("Verify ECS release", "completed", "success")]
      }
    ],
    readWorkflowJobLog: async () =>
      `Verify ECS release\ntoken=super-secret\nSKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=${encoded}`
  } as GitHubActionsReadClient;

  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
  const actual = snapshot as typeof snapshot & { releaseEvidence?: typeof evidence | null };

  assert.deepEqual(actual?.releaseEvidence, evidence);
  assert.equal(snapshot?.logs.some((log) => log.message.includes("super-secret")), false);
  assert.equal(snapshot?.logs.some((log) => log.message.includes(encoded)), false);
  assert.equal(snapshot?.logs.at(-1)?.message, "ECS release evidence captured.");
  assert.equal(snapshot?.logs.at(-1)?.stageKind, "verify");
});

test("provider maps Lambda stages and parses one bounded Lambda release evidence record", async () => {
  const evidence = {
    schemaVersion: 1,
    runtimeTargetKind: "lambda",
    outcome: "succeeded",
    commitSha: "a".repeat(40),
    artifactDigest: `sha256:${"b".repeat(64)}`,
    artifactUri: `s3://sketchcatch-release/lambda/${"a".repeat(40)}/${"b".repeat(64)}.zip`,
    functionName: "sketchcatch-api",
    aliasName: "live",
    publishedVersion: "42",
    previousVersion: "41",
    activeVersion: "42",
    deploymentId: "d-ABCDEFGHI",
    deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
    outputUrl: "https://lambda.example.com"
  } as const;
  const encoded = Buffer.from(JSON.stringify(evidence)).toString("base64");
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({ commitSha: "a".repeat(40), status: "completed", conclusion: "success" })
    ],
    listWorkflowJobs: async () => [
      {
        id: 22,
        name: "release",
        runUrl: "release",
        status: "completed",
        conclusion: "success",
        startedAt: null,
        finishedAt: null,
        steps: [
          step("Build confirmed SAM application", "completed", "success"),
          step("Publish immutable Lambda version", "completed", "success"),
          step("Deploy Lambda alias AllAtOnce", "completed", "success"),
          step("Verify Lambda release", "completed", "success")
        ]
      }
    ],
    readWorkflowJobLog: async () =>
      `Verify Lambda release\nSKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64=${encoded}`
  } as GitHubActionsReadClient;

  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);

  assert.deepEqual(snapshot?.jobs.map((job) => job.stageKind), [
    "app_build",
    "artifact_publish",
    "app_deploy",
    "verify"
  ]);
  assert.deepEqual(snapshot?.releaseEvidence, evidence);
  assert.equal(snapshot?.logs.some((log) => log.message.includes(encoded)), false);
  assert.equal(snapshot?.logs.at(-1)?.message, "Lambda release evidence captured.");
});

test("provider maps EC2 ASG stages and parses one bounded release evidence record", async () => {
  const evidence = {
    schemaVersion: 1,
    runtimeTargetKind: "ec2_asg",
    outcome: "succeeded",
    failureReason: null,
    commitSha: "a".repeat(40),
    artifactDigest: `sha256:${"b".repeat(64)}`,
    artifactUri: `s3://sketchcatch-release/api/ec2-asg/${"a".repeat(40)}/${"b".repeat(64)}.zip`,
    artifactVersionId: "version-current",
    previousArtifactUri: "s3://sketchcatch-release/api/ec2-asg/previous.zip",
    previousArtifactVersionId: "version-previous",
    codeDeployApplicationName: "sketchcatch-api",
    codeDeployDeploymentGroupName: "sketchcatch-api-asg",
    autoScalingGroupName: "sketchcatch-api-asg",
    deploymentId: "d-CURRENT123",
    activeDeploymentId: "d-CURRENT123",
    deploymentConfigName: "CodeDeployDefault.AllAtOnce",
    targetInstanceCount: 2,
    succeededInstanceCount: 2,
    outputUrl: "https://ec2.example.com"
  } as const;
  const encoded = Buffer.from(JSON.stringify(evidence)).toString("base64");
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({ id: 7, workflowName: "SketchCatch App", commitSha: evidence.commitSha })
    ],
    listWorkflowJobs: async () => [
      {
        id: 77,
        name: "release",
        runUrl: "release",
        status: "completed",
        conclusion: "success",
        startedAt: null,
        finishedAt: null,
        steps: [
          step("Build confirmed CodeDeploy bundle", "completed", "success"),
          step("Publish versioned S3 bundle", "completed", "success"),
          step("Deploy EC2 ASG bundle AllAtOnce", "completed", "success"),
          step("Verify EC2 ASG release and rollback", "completed", "success")
        ]
      }
    ],
    readWorkflowJobLog: async () =>
      `Verify EC2 ASG release and rollback\nSKETCHCATCH_EC2_RELEASE_EVIDENCE_B64=${encoded}`
  } as GitHubActionsReadClient;

  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);

  assert.deepEqual(snapshot?.jobs.map((job) => job.stageKind), [
    "app_build",
    "artifact_publish",
    "app_deploy",
    "verify"
  ]);
  assert.deepEqual(snapshot?.releaseEvidence, evidence);
  assert.equal(snapshot?.logs.some((log) => log.message.includes(encoded)), false);
  assert.equal(snapshot?.logs.at(-1)?.message, "EC2 ASG release evidence captured.");
});

test("provider maps static stages and parses one bounded release evidence record", async () => {
  const commitSha = "a".repeat(40);
  const digest = "b".repeat(64);
  const releasePrefix = `releases/${commitSha}/${digest}`;
  const evidence = {
    schemaVersion: 1,
    runtimeTargetKind: "static_site",
    outcome: "succeeded",
    failureReason: null,
    commitSha,
    artifactDigest: `sha256:${digest}`,
    manifestUri: `s3://sketchcatch-static-releases/${releasePrefix}/.sketchcatch-release-manifest.json`,
    manifestVersionId: "version-current",
    releasePrefix,
    previousReleasePrefix: "releases/previous/old",
    activeReleasePrefix: releasePrefix,
    hostingBucketName: "sketchcatch-static-releases",
    cloudFrontDistributionId: "E1234567890ABC",
    cloudFrontOriginId: "static-origin",
    distributionEtag: "E2ABCDEF123456",
    invalidationId: "I1234567890ABC",
    fileCount: 42,
    outputUrl: "https://static.example.com"
  } as const;
  const encoded = Buffer.from(JSON.stringify(evidence)).toString("base64");
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => [
      run({ id: 8, workflowName: "SketchCatch App", commitSha })
    ],
    listWorkflowJobs: async () => [
      {
        id: 88,
        name: "release",
        runUrl: "release",
        status: "completed",
        conclusion: "success",
        startedAt: null,
        finishedAt: null,
        steps: [
          step("Build confirmed static output", "completed", "success"),
          step("Publish versioned static release", "completed", "success"),
          step("Switch CloudFront release pointer", "completed", "success"),
          step("Verify static release and rollback", "completed", "success")
        ]
      }
    ],
    readWorkflowJobLog: async () =>
      `Verify static release and rollback\nSKETCHCATCH_STATIC_RELEASE_EVIDENCE_B64=${encoded}`
  } as GitHubActionsReadClient;

  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);

  assert.deepEqual(snapshot?.jobs.map((job) => job.stageKind), [
    "app_build",
    "artifact_publish",
    "app_deploy",
    "verify"
  ]);
  assert.deepEqual(snapshot?.releaseEvidence, evidence);
  assert.equal(snapshot?.logs.some((log) => log.message.includes(encoded)), false);
  assert.equal(snapshot?.logs.at(-1)?.message, "Static release evidence captured.");
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
    "2026-07-13T00:02:00.000Z|01|00000000000000000000:0000000000|00000000000000000011:0000000002"
  );
});

test("provider ordering token treats Infra to Infra+App as a newer strict superset", async () => {
  const infra = run({ id: 20, workflowName: "SketchCatch Infra" });
  const app = run({ id: 10, workflowName: "SketchCatch App" });

  const partial = await snapshotForRuns([infra]);
  const superset = await snapshotForRuns([infra, app]);

  assert.ok(partial.upstreamOrderingToken < superset.upstreamOrderingToken);
  assert.ok(superset.upstreamOrderingToken > partial.upstreamOrderingToken);
});

test("provider ordering token treats App to App+Infra as a newer strict superset", async () => {
  const app = run({ id: 10, workflowName: "SketchCatch App" });
  const infra = run({ id: 20, workflowName: "SketchCatch Infra" });

  const partial = await snapshotForRuns([app]);
  const superset = await snapshotForRuns([app, infra]);

  assert.ok(partial.upstreamOrderingToken < superset.upstreamOrderingToken);
  assert.ok(superset.upstreamOrderingToken > partial.upstreamOrderingToken);
});

test("provider fixed workflow slots advance for run id and attempt increments", async () => {
  const idNine = await snapshotForRuns([run({ id: 9, runAttempt: 1 })]);
  const idTen = await snapshotForRuns([run({ id: 10, runAttempt: 1 })]);
  const attemptTwo = await snapshotForRuns([run({ id: 10, runAttempt: 2 })]);

  assert.ok(idNine.upstreamOrderingToken < idTen.upstreamOrderingToken);
  assert.ok(idTen.upstreamOrderingToken < attemptTwo.upstreamOrderingToken);
});

async function snapshotForRuns(workflowRuns: ReturnType<typeof run>[]) {
  const client = {
    listCommitFiles: async () => [],
    listBranchWorkflowRuns: async () => workflowRuns,
    listWorkflowJobs: async () => [],
    readWorkflowJobLog: async () => ""
  } as GitHubActionsReadClient;
  const [snapshot] = await createGitHubActionsRunProvider(client).listSnapshots(repository);
  assert.ok(snapshot);
  return snapshot;
}

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
