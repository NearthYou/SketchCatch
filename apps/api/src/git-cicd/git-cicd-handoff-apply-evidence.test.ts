import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createGitCicdHandoffPlanArtifactVerifier,
  createGitCicdPullRequestDraft,
  executeGitCicdHandoffWithVerifiedApplyEvidence,
  GitCicdHandoffPlanArtifactVerificationUnavailableError,
  GitCicdHandoffProviderConflictError,
  invokeGitCicdHandoffProviderWithVerifiedPlan,
  resolveGitCicdHandoffApplyEvidence,
  resolveGitCicdHandoffApplyPlanSummary,
  verifyGitCicdHandoffPlanArtifactIntegrity,
  type GitCicdHandoffApprovedDeploymentRecord,
  type GitCicdHandoffApprovedPlanArtifactRecord,
  type GitCicdHandoffRepository,
  type GitCicdHandoffTerraformArtifactRecord
} from "./git-cicd-handoff-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const deploymentId = "22222222-2222-4222-8222-222222222222";
const architectureId = "33333333-3333-4333-8333-333333333333";
const terraformArtifactId = "44444444-4444-4444-8444-444444444444";
const connectionId = "55555555-5555-4555-8555-555555555555";
const applyPlanId = "66666666-6666-4666-8666-666666666666";
const destroyPlanId = "77777777-7777-4777-8777-777777777777";
const ownerId = "99999999-9999-4999-8999-999999999999";
const planBody = Buffer.from("immutable approved apply plan");
const planSha256 = createHash("sha256").update(planBody).digest("hex");

test("handoff rejects an older Apply id from the same Deployment before provider invocation", async () => {
  const olderApplyPlanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const providerCalls: string[] = [];
  const repository = createSelectionRepository({
    deployments: [
      createDeployment({
        currentPlanArtifactId: destroyPlanId,
        approvedPlanArtifactId: destroyPlanId
      })
    ],
    plans: [
      createApplyPlan({ id: olderApplyPlanId, createdAt: new Date("2026-07-17T01:00:00Z") }),
      createApplyPlan({ id: applyPlanId, createdAt: new Date("2026-07-17T02:00:00Z") })
    ]
  });

  await assert.rejects(
    executeGitCicdHandoffWithVerifiedApplyEvidence(
      createEvidenceInput({ userAcceptedChangeId: olderApplyPlanId }),
      repository,
      createPlanVerifier(),
      async () => {
        providerCalls.push("called");
        return "created";
      }
    ),
    GitCicdHandoffProviderConflictError
  );
  assert.deepEqual(providerCalls, []);
});

test("handoff rejects a request scoped to an older successful Direct Deployment", async () => {
  const olderDeploymentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  let providerCalls = 0;
  const repository = createSelectionRepository({
    deployments: [
      createDeployment({
        id: olderDeploymentId,
        completedAt: new Date("2026-07-17T01:00:00Z")
      }),
      createDeployment({ completedAt: new Date("2026-07-17T03:00:00Z") })
    ],
    plans: [createApplyPlan()]
  });

  await assert.rejects(
    executeGitCicdHandoffWithVerifiedApplyEvidence(
      createEvidenceInput({ sourceDeploymentId: olderDeploymentId }),
      repository,
      createPlanVerifier(),
      async () => {
        providerCalls += 1;
        return "created";
      }
    ),
    GitCicdHandoffProviderConflictError
  );
  assert.equal(providerCalls, 0);
});

test("handoff keeps the valid approved Apply ahead of a newer unapproved Apply", async () => {
  const approvedApplyPlanId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const repository = createSelectionRepository({
    deployments: [createDeployment({ approvedPlanArtifactId: approvedApplyPlanId })],
    plans: [
      createApplyPlan({ id: approvedApplyPlanId, createdAt: new Date("2026-07-17T01:00:00Z") }),
      createApplyPlan({ id: applyPlanId, createdAt: new Date("2026-07-17T02:00:00Z") })
    ]
  });

  const result = await executeGitCicdHandoffWithVerifiedApplyEvidence(
    createEvidenceInput({ userAcceptedChangeId: approvedApplyPlanId }),
    repository,
    createPlanVerifier(),
    async (evidence) => evidence.plan.id
  );

  assert.equal(result, approvedApplyPlanId);
});

test("handoff reuses Apply evidence after reconnecting the same AWS account and region", async () => {
  const repository = createSelectionRepository({
    deployments: [createDeployment()],
    plans: [createApplyPlan()]
  });

  const result = await resolveGitCicdHandoffApplyEvidence(
    createEvidenceInput({
      connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }),
    repository,
    createPlanVerifier()
  );

  assert.equal(result.deployment.id, deploymentId);
  assert.equal(result.plan.id, applyPlanId);
});

test("handoff falls back to the newest Apply when the approved Apply fails S3 verification", async () => {
  const tamperedApprovedPlanId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const repository = createSelectionRepository({
    deployments: [createDeployment({ approvedPlanArtifactId: tamperedApprovedPlanId })],
    plans: [
      createApplyPlan({ id: tamperedApprovedPlanId, createdAt: new Date("2026-07-17T01:00:00Z") }),
      createApplyPlan({ id: applyPlanId, createdAt: new Date("2026-07-17T02:00:00Z") })
    ]
  });
  const verifier = createGitCicdHandoffPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact(input) {
      return input.planArtifactId === tamperedApprovedPlanId
        ? Buffer.from("tampered approved plan")
        : planBody;
    }
  });

  const result = await executeGitCicdHandoffWithVerifiedApplyEvidence(
    createEvidenceInput(),
    repository,
    verifier,
    async (evidence) => evidence.plan.id
  );

  assert.equal(result, applyPlanId);
});

test("handoff falls back to the newest Apply when the approved Apply object is missing", async () => {
  const missingApprovedPlanId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const repository = createSelectionRepository({
    deployments: [createDeployment({ approvedPlanArtifactId: missingApprovedPlanId })],
    plans: [
      createApplyPlan({ id: missingApprovedPlanId, createdAt: new Date("2026-07-17T01:00:00Z") }),
      createApplyPlan({ id: applyPlanId, createdAt: new Date("2026-07-17T02:00:00Z") })
    ]
  });
  const verifier = createGitCicdHandoffPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact(input) {
      if (input.planArtifactId === missingApprovedPlanId) {
        const error = new Error("approved plan object is missing");
        error.name = "NoSuchKey";
        throw error;
      }
      return planBody;
    }
  });

  const result = await executeGitCicdHandoffWithVerifiedApplyEvidence(
    createEvidenceInput(),
    repository,
    verifier,
    async (evidence) => evidence.plan.id
  );

  assert.equal(result, applyPlanId);
});

test("handoff stops instead of falling back when approved Apply verification is transiently unavailable", async (t) => {
  const approvedApplyPlanId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const scenarios = [
    {
      name: "timeout",
      createError() {
        const error = new Error("secret timeout detail");
        error.name = "TimeoutError";
        return error;
      }
    },
    {
      name: "network failure",
      createError() {
        const error = new Error("secret network detail");
        error.name = "NetworkingError";
        return error;
      }
    },
    {
      name: "S3 5xx",
      createError() {
        return Object.assign(new Error("secret upstream detail"), {
          $metadata: { httpStatusCode: 503 }
        });
      }
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const repository = createSelectionRepository({
        deployments: [createDeployment({ approvedPlanArtifactId: approvedApplyPlanId })],
        plans: [
          createApplyPlan({
            id: approvedApplyPlanId,
            createdAt: new Date("2026-07-17T01:00:00Z")
          }),
          createApplyPlan({ id: applyPlanId, createdAt: new Date("2026-07-17T02:00:00Z") })
        ]
      });
      const verifier = createGitCicdHandoffPlanArtifactVerifier({
        async downloadDeploymentPlanArtifact() {
          throw scenario.createError();
        }
      });
      let providerCalls = 0;

      await assert.rejects(
        executeGitCicdHandoffWithVerifiedApplyEvidence(
          createEvidenceInput(),
          repository,
          verifier,
          async () => {
            providerCalls += 1;
            return "created";
          }
        ),
        (error: unknown) =>
          error instanceof GitCicdHandoffPlanArtifactVerificationUnavailableError &&
          error.code === "GIT_CICD_HANDOFF_PLAN_VERIFICATION_UNAVAILABLE" &&
          !error.message.includes("secret")
      );
      assert.equal(providerCalls, 0);
    });
  }
});

test("Destroy current Plan summary is not rendered as the selected Apply PR summary", () => {
  const deployment = createDeployment({
    currentPlanArtifactId: destroyPlanId,
    approvedPlanArtifactId: destroyPlanId,
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 99,
      replaceCount: 0,
      blocked: false,
      warnings: []
    }
  });
  const applyPlan = createApplyPlan();
  const planSummary = resolveGitCicdHandoffApplyPlanSummary(deployment, applyPlan);
  const draft = createGitCicdPullRequestDraft({
    repositoryOwner: "jh-9999",
    repositoryName: "audience-live-check",
    terraformArtifact: {
      id: terraformArtifactId,
      projectId,
      architectureId,
      assetType: "terraform_file",
      objectKey: `projects/${projectId}/terraform/main.tf`,
      fileName: "main.tf",
      contentType: "text/plain",
      uploadStatus: "uploaded"
    } as GitCicdHandoffTerraformArtifactRecord,
    planSummary,
    title: null
  });

  assert.equal(planSummary, null);
  assert.match(draft.body, /Plan summary was not attached/u);
  assert.doesNotMatch(draft.body, /delete 99/u);
});

test("handoff resolves the requested approved Apply artifact even when Destroy is current", async () => {
  const deployment = createDeployment({
    currentPlanArtifactId: destroyPlanId,
    approvedPlanArtifactId: destroyPlanId
  });
  const plan = createApplyPlan();
  const repository = createSelectionRepository({
    deployments: [deployment],
    plans: [plan]
  });

  const evidence = await resolveGitCicdHandoffApplyEvidence(
    {
      projectId,
      architectureId,
      terraformArtifactId,
      sourceDeploymentId: deploymentId,
      userAcceptedChangeId: applyPlanId,
      userId: ownerId,
      connectionId,
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    repository,
    createPlanVerifier()
  );

  assert.equal(evidence.plan.id, applyPlanId);
  assert.equal(evidence.deployment.approvedPlanArtifactId, destroyPlanId);
});

test("handoff rejects an Apply artifact scoped to another Deployment", async () => {
  const repository = createSelectionRepository({
    deployments: [createDeployment()],
    plans: [createApplyPlan({
      deploymentId: "88888888-8888-4888-8888-888888888888"
    })]
  });

  await assert.rejects(
    resolveGitCicdHandoffApplyEvidence(
      {
        projectId,
        architectureId,
        terraformArtifactId,
        sourceDeploymentId: deploymentId,
        userAcceptedChangeId: applyPlanId,
        userId: ownerId,
        connectionId,
        accountId: "123456789012",
        region: "ap-northeast-2"
      },
      repository,
      createPlanVerifier()
    ),
    GitCicdHandoffProviderConflictError
  );
});

test("handoff re-downloads and verifies the Apply plan immediately before provider use", async () => {
  const plan = createApplyPlan();
  const verifier = createGitCicdHandoffPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact(input) {
      assert.deepEqual(input, {
        deploymentId,
        planArtifactId: applyPlanId,
        objectKey: plan.objectKey
      });
      return planBody;
    }
  });

  await verifyGitCicdHandoffPlanArtifactIntegrity(plan, verifier);

  const tamperedVerifier = createGitCicdHandoffPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact() {
      return Buffer.from("tampered plan");
    }
  });
  await assert.rejects(
    verifyGitCicdHandoffPlanArtifactIntegrity(plan, tamperedVerifier),
    GitCicdHandoffProviderConflictError
  );
});

test("handoff never invokes the provider when the last Apply plan integrity check fails", async () => {
  let providerCalls = 0;
  const tamperedVerifier = createGitCicdHandoffPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact() {
      return Buffer.from("tampered plan");
    }
  });

  await assert.rejects(
    invokeGitCicdHandoffProviderWithVerifiedPlan(
      createApplyPlan(),
      tamperedVerifier,
      async () => {
        providerCalls += 1;
        return "created";
      }
    ),
    GitCicdHandoffProviderConflictError
  );
  assert.equal(providerCalls, 0);
});

function createDeployment(
  overrides: Partial<GitCicdHandoffApprovedDeploymentRecord> = {}
): GitCicdHandoffApprovedDeploymentRecord {
  return {
    id: deploymentId,
    projectId,
    architectureId,
    terraformArtifactId,
    awsConnectionId: connectionId,
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    scope: "full_stack",
    targetKind: "ecs_fargate",
    source: "direct",
    status: "SUCCESS",
    completedAt: new Date("2026-07-17T01:00:00.000Z"),
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    currentPlanArtifactId: applyPlanId,
    approvedPlanArtifactId: applyPlanId,
    planSummary: null,
    approvedAt: new Date("2026-07-17T00:59:00.000Z"),
    approvedByUserId: ownerId,
    approvedTerraformArtifactId: terraformArtifactId,
    ...overrides
  };
}

function createApplyPlan(
  overrides: Partial<GitCicdHandoffApprovedPlanArtifactRecord> = {}
): GitCicdHandoffApprovedPlanArtifactRecord {
  return {
    id: applyPlanId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256: "a".repeat(64),
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${applyPlanId}.tfplan`,
    sha256: planSha256,
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: new Date("2026-07-17T02:00:00.000Z"),
    ...overrides
  };
}

function createEvidenceInput(
  overrides: Partial<Parameters<typeof resolveGitCicdHandoffApplyEvidence>[0]> = {}
): Parameters<typeof resolveGitCicdHandoffApplyEvidence>[0] {
  return {
    projectId,
    architectureId,
    terraformArtifactId,
    sourceDeploymentId: deploymentId,
    userAcceptedChangeId: applyPlanId,
    userId: ownerId,
    connectionId,
    accountId: "123456789012",
    region: "ap-northeast-2",
    ...overrides
  };
}

function createSelectionRepository(input: {
  deployments: GitCicdHandoffApprovedDeploymentRecord[];
  plans: GitCicdHandoffApprovedPlanArtifactRecord[];
}): Pick<
  GitCicdHandoffRepository,
  "listSuccessfulDirectDeploymentsForHandoff" | "listPlanArtifactsForHandoff"
> {
  return {
    async listSuccessfulDirectDeploymentsForHandoff(requestedProjectId) {
      return requestedProjectId === projectId ? input.deployments : [];
    },
    async listPlanArtifactsForHandoff(requestedDeploymentId) {
      return input.plans.filter((plan) => plan.deploymentId === requestedDeploymentId);
    }
  };
}

function createPlanVerifier() {
  return createGitCicdHandoffPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact() {
      return planBody;
    }
  });
}
