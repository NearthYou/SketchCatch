import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  ConfirmedBuildConfig,
  GitCicdReadinessItemKey,
  GitCicdReadinessSnapshot,
  RepositoryAnalysisAiHandoff
} from "@sketchcatch/types";
import {
  createDeploymentPlanArtifactVerifier,
  createGitCicdReadinessService,
  createPostgresGitCicdReadinessRepository,
  type DeployedResourceRecord,
  type GitCicdReadinessApplicationReleaseRecord,
  type GitCicdReadinessDeploymentRecord,
  type GitCicdReadinessPlanArtifactRecord,
  type GitCicdReadinessRepository,
  GitCicdReadinessRefreshError,
  type ProjectBuildEnvironmentRecord,
  type ProjectDeploymentTargetRecord,
  type RepositoryMonitoringRecord,
  type SaveReconciledDeploymentTargetInput,
  type TerraformOutputRecord
} from "./git-cicd-readiness-service.js";
import { resolveEcsFargateRuntimeOutputs } from "../deployments/ecs-fargate-output-reconciliation.js";
import type { Database } from "../db/client.js";

const terraformArtifactSha256 = "a".repeat(64);
const planBody = Buffer.from("approved terraform apply plan");
const planSha256 = createHash("sha256").update(planBody).digest("hex");

test("inspect reads readiness without reconciling or saving a deployment target", async () => {
  const state = createRepositoryState({ readyContext: true });
  const service = createGitCicdReadinessService({
    repository: createRepository({
      deployments: [createDeployment({ approvedPlanArtifactId: "plan-1" })],
      plans: [createPlan({ id: "plan-1" })],
      state
    }),
    planVerifier: createPlanVerifier()
  });

  const result = await service.inspect({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.sourceDeploymentId, "deployment-1");
  assert.equal(state.savedTargets.length, 0);
  assert.equal(state.targetRows.has("project-1"), false);
});

test("selects the currently approved apply plan before other apply artifacts", async () => {
  const deployment = createDeployment({ approvedPlanArtifactId: "approved-apply" });
  const repository = createRepository({
    deployments: [deployment],
    plans: [
      createPlan({ id: "newer-apply", createdAt: new Date("2026-07-17T02:00:00Z") }),
      createPlan({ id: "approved-apply", createdAt: new Date("2026-07-17T01:00:00Z") })
    ]
  });
  const service = createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier()
  });

  const result = await service.refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.sourceDeploymentId, deployment.id);
  assert.equal(result.approvedApplyPlanArtifactId, "approved-apply");
  assert.equal(getReadinessItem(result, "approved_apply_plan").status, "ready");
});

test("falls back from an approved destroy plan to the newest apply artifact", async () => {
  const repository = createRepository({
    deployments: [createDeployment({ approvedPlanArtifactId: "approved-destroy" })],
    plans: [
      createPlan({ id: "approved-destroy", operation: "destroy" }),
      createPlan({ id: "older-apply", createdAt: new Date("2026-07-17T01:00:00Z") }),
      createPlan({ id: "newest-apply", createdAt: new Date("2026-07-17T02:00:00Z") })
    ]
  });

  const result = await createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.approvedApplyPlanArtifactId, "newest-apply");
});

test("ignores failed, pending, and GitOps deployments", async () => {
  const repository = createRepository({
    deployments: [
      createDeployment({ id: "failed", status: "FAILED" }),
      createDeployment({ id: "pending", status: "PENDING", completedAt: null }),
      createDeployment({ id: "gitops", source: "gitops" }),
      createDeployment({ id: "eligible" })
    ],
    plansByDeployment: new Map([
      ["failed", [createPlan({ id: "failed-plan", deploymentId: "failed" })]],
      ["pending", [createPlan({ id: "pending-plan", deploymentId: "pending" })]],
      ["gitops", [createPlan({ id: "gitops-plan", deploymentId: "gitops" })]],
      ["eligible", [createPlan({ id: "eligible-plan", deploymentId: "eligible" })]]
    ])
  });

  const result = await createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.sourceDeploymentId, "eligible");
  assert.equal(result.approvedApplyPlanArtifactId, "eligible-plan");
});

test("does not fall back to an older successful deployment when the latest deployment evidence is invalid", async () => {
  const newest = createDeployment({
    id: "newest-deployment",
    completedAt: new Date("2026-07-17T05:00:00Z")
  });
  const older = createDeployment({
    id: "older-deployment",
    completedAt: new Date("2026-07-17T04:00:00Z")
  });
  const repository = createRepository({
    deployments: [older, newest],
    plansByDeployment: new Map([
      [
        newest.id,
        [
          createPlan({
            id: "tampered-newest-plan",
            deploymentId: newest.id,
            sha256: "f".repeat(64)
          })
        ]
      ],
      [older.id, [createPlan({ id: "valid-older-plan", deploymentId: older.id })]]
    ])
  });

  const result = await createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.sourceDeploymentId, newest.id);
  assert.equal(result.approvedApplyPlanArtifactId, null);
  assert.equal(getReadinessItem(result, "approved_apply_plan").status, "action_required");
});

test("keeps verified AWS connection readiness separate from Apply Plan evidence", async () => {
  const repository = createRepository({
    plans: [createPlan({ sha256: "f".repeat(64) })]
  });

  const result = await createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(getReadinessItem(result, "approved_apply_plan").status, "action_required");
  assert.equal(
    getReadinessItem(result, "deployment_target").missingKeys.includes("aws_connection"),
    false
  );
});

test("reuses infrastructure evidence after reconnecting the same AWS account and region", async () => {
  const state = createRepositoryState({ readyContext: true });
  const service = createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier()
  });
  await service.refresh({ projectId: "project-1", userId: "user-1" });
  const currentTarget = state.targetRows.get("project-1");
  assert.ok(currentTarget);

  state.targetRows.set("project-1", {
    ...currentTarget,
    connectionId: "connection-2"
  });
  state.buildEnvironment = {
    ...state.buildEnvironment!,
    awsConnectionId: "connection-2"
  };
  state.verifiedConnectionIds.add("connection-2");

  const result = await service.refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(getReadinessItem(result, "approved_apply_plan").status, "ready");
  assert.equal(
    getReadinessItem(result, "deployment_target").missingKeys.includes("aws_connection"),
    false
  );
});

test("does not add the ECS initial release item for another runtime target", async () => {
  const target = {
    ...createExistingTarget(createConfirmedBuildConfig()),
    runtimeTargetKind: "lambda"
  } as unknown as ProjectDeploymentTargetRecord;
  const state = createRepositoryState({ existingTarget: target });

  const result = await createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.items.some((item) => item.key === "initial_application_release"), false);
});

test("requires a current successful Direct application release in addition to infrastructure evidence", async (t) => {
  await t.test("infrastructure-only success keeps the initial release incomplete", async () => {
    const deployment = createDeployment({ scope: "infrastructure" });
    const state = createRepositoryState({ readyContext: true });
    const result = await createGitCicdReadinessService({
      repository: createRepository({ deployments: [deployment], releases: [], state }),
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.equal(getReadinessItem(result, "approved_apply_plan").status, "ready");
    assert.equal(getReadinessItem(result, "initial_application_release").status, "action_required");
    assert.equal(
      getReadinessItem(result, "initial_application_release").recommendedDeploymentScope,
      "application"
    );
    assert.equal(result.initialApplicationReleaseId, null);
  });

  await t.test("full-stack success with matching release completes both evidence items", async () => {
    const state = createRepositoryState({ readyContext: true });
    const repository = createRepository({ state });
    const result = await createGitCicdReadinessService({
      repository,
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.equal(getReadinessItem(result, "approved_apply_plan").status, "ready");
    assert.equal(getReadinessItem(result, "initial_application_release").status, "ready");
    assert.equal(result.initialApplicationReleaseId, "release-1");
  });

  await t.test("application-only recovery keeps the older infrastructure evidence", async () => {
    const infrastructure = createDeployment({ id: "infra-1", scope: "infrastructure" });
    const application = createDeployment({
      id: "app-1",
      scope: "application",
      terraformArtifactId: infrastructure.terraformArtifactId,
      completedAt: new Date("2026-07-17T04:00:00Z")
    });
    const state = createRepositoryState({ readyContext: true });
    const repository = createRepository({
      deployments: [application, infrastructure],
      plansByDeployment: new Map([[infrastructure.id, [createPlan({ deploymentId: infrastructure.id })]]]),
      state,
      createRelease: (target) =>
        createEligibleRelease(target, {
          deploymentId: application.id,
          deploymentScope: "application"
        })
    });

    const result = await createGitCicdReadinessService({
      repository,
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.equal(result.sourceDeploymentId, infrastructure.id);
    assert.equal(result.initialApplicationReleaseId, "release-1");
    assert.equal(result.ready, true);
  });

  const invalidReleaseCases: Array<{
    name: string;
    override: Partial<GitCicdReadinessApplicationReleaseRecord>;
  }> = [
    { name: "failed status", override: { status: "failed" } },
    { name: "different commit", override: { commitSha: "c".repeat(40) } },
    { name: "different target", override: { deploymentTargetFingerprint: "d".repeat(64) } },
    { name: "HTTP URL", override: { outputUrl: "http://example.com" } },
    { name: "unhealthy runtime", override: { healthEvidence: { state: "failed" } } },
    { name: "missing frontend evidence", override: { frontendEvidence: null } }
  ];
  for (const candidate of invalidReleaseCases) {
    await t.test(`rejects ${candidate.name}`, async () => {
      const state = createRepositoryState({ readyContext: true });
      const result = await createGitCicdReadinessService({
        repository: createRepository({
          state,
          createRelease: (target) => createEligibleRelease(target, candidate.override)
        }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(result.initialApplicationReleaseId, null);
      assert.equal(getReadinessItem(result, "initial_application_release").status, "action_required");
    });
  }

  await t.test("release evidence cannot replace missing infrastructure evidence", async () => {
    const state = createRepositoryState({
      readyContext: true,
      existingTarget: createExistingTarget(createConfirmedBuildConfig())
    });
    const target = state.targetRows.get("project-1");
    assert.ok(target);
    target.runtimeConfig = {
      ...target.runtimeConfig,
      outputUrl: "https://d111111abcdef8.cloudfront.net"
    } as ProjectDeploymentTargetRecord["runtimeConfig"];
    target.deploymentTargetFingerprint = "e".repeat(64);
    const result = await createGitCicdReadinessService({
      repository: createRepository({ deployments: [], releases: [createEligibleRelease(target)] }),
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.equal(result.sourceDeploymentId, null);
    assert.equal(result.initialApplicationReleaseId, null);
  });
});

test("marks aws_connection missing when the deployment or persisted target connection is not verified", async (t) => {
  await t.test("deployment connection", async () => {
    const state = createRepositoryState();
    state.verifiedConnectionIds.clear();
    const result = await createGitCicdReadinessService({
      repository: createRepository({ state }),
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.ok(getReadinessItem(result, "deployment_target").missingKeys.includes("aws_connection"));
  });

  await t.test("persisted target connection", async () => {
    const target = createExistingTarget(createConfirmedBuildConfig());
    target.connectionId = "unverified-target-connection";
    const state = createRepositoryState({ existingTarget: target });
    const result = await createGitCicdReadinessService({
      repository: createRepository({ state }),
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.ok(getReadinessItem(result, "deployment_target").missingKeys.includes("aws_connection"));
  });
});

test("rejects apply artifacts outside the deployment, Terraform artifact, account, or region scope", async (t) => {
  const mismatches: Array<{
    name: string;
    plan: Partial<GitCicdReadinessPlanArtifactRecord>;
  }> = [
    { name: "deployment", plan: { deploymentId: "other-deployment" } },
    { name: "Terraform artifact", plan: { terraformArtifactId: "other-artifact" } },
    { name: "Terraform artifact hash", plan: { terraformArtifactSha256: "not-a-sha" } },
    { name: "account", plan: { accountId: "999999999999" } },
    { name: "region", plan: { region: "us-west-2" } }
  ];

  for (const mismatch of mismatches) {
    await t.test(mismatch.name, async () => {
      const repository = createRepository({
        deployments: [createDeployment()],
        plans: [createPlan({ id: "mismatched", ...mismatch.plan })]
      });

      const result = await createGitCicdReadinessService({
        repository,
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(result.approvedApplyPlanArtifactId, null);
      assert.equal(getReadinessItem(result, "approved_apply_plan").status, "action_required");
    });
  }
});

test("does not report an apply plan when the downloaded S3 body hash differs from DB metadata", async () => {
  const repository = createRepository({
    deployments: [createDeployment()],
    plans: [createPlan({ id: "tampered-plan" })]
  });

  const result = await createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier(Buffer.from("different body"))
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.approvedApplyPlanArtifactId, null);
  assert.equal(getReadinessItem(result, "approved_apply_plan").action, "approve_apply_plan");
});

test("treats a missing S3 plan object as action_required evidence", async () => {
  const planVerifier = createDeploymentPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact() {
      throw Object.assign(new Error("missing"), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 }
      });
    }
  });

  const result = await createGitCicdReadinessService({
    repository: createRepository(),
    planVerifier
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(getReadinessItem(result, "approved_apply_plan").status, "action_required");
});

test("propagates a transient S3 plan download failure as a readiness refresh error", async () => {
  const transient = Object.assign(new Error("socket timeout"), {
    name: "TimeoutError",
    $metadata: { httpStatusCode: 503 }
  });
  const planVerifier = createDeploymentPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact() {
      throw transient;
    }
  });

  await assert.rejects(
    createGitCicdReadinessService({
      repository: createRepository(),
      planVerifier
    }).refresh({ projectId: "project-1", userId: "user-1" }),
    (error: unknown) =>
      error instanceof GitCicdReadinessRefreshError && error.cause === transient
  );
});

test("integration refresh reconciles a missing target from the latest Direct deployment's older verified Apply", async () => {
  const successfulDeploymentId = "latest-successful-direct-deployment";
  const destroyPlanId = "current-approved-destroy-plan";
  const olderApplyPlanId = "older-verified-apply-plan";
  const deployment = {
    ...createDeployment({
      id: successfulDeploymentId,
      approvedPlanArtifactId: destroyPlanId,
      completedAt: new Date("2026-07-17T05:00:00.000Z")
    }),
    currentPlanArtifactId: destroyPlanId
  };
  const olderApplyPlan = createPlan({
    id: olderApplyPlanId,
    deploymentId: successfulDeploymentId,
    objectKey: `deployments/${successfulDeploymentId}/plans/${olderApplyPlanId}.tfplan`,
    createdAt: new Date("2026-07-17T03:00:00.000Z")
  });
  const state = createRepositoryState({ readyContext: true });
  assert.ok(state.repositoryMonitoring);
  state.repositoryMonitoring.id = "jh-9999/audience-live-check";
  assert.equal(state.targetRows.size, 0);
  const verifiedPlanIds: string[] = [];
  const planVerifier = createDeploymentPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact(input) {
      verifiedPlanIds.push(input.planArtifactId);
      assert.deepEqual(input, {
        deploymentId: successfulDeploymentId,
        planArtifactId: olderApplyPlanId,
        objectKey: olderApplyPlan.objectKey
      });
      return planBody;
    }
  });
  const repository = createRepository({
    deployments: [deployment],
    plansByDeployment: new Map([
      [
        successfulDeploymentId,
        [
          createPlan({
            id: destroyPlanId,
            deploymentId: successfulDeploymentId,
            operation: "destroy",
            objectKey: `deployments/${successfulDeploymentId}/plans/${destroyPlanId}.tfplan`,
            createdAt: new Date("2026-07-17T04:00:00.000Z")
          }),
          olderApplyPlan
        ]
      ]
    ]),
    state
  });

  const result = await createGitCicdReadinessService({
    repository,
    planVerifier,
    now: () => new Date("2026-07-17T06:00:00.000Z")
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.sourceDeploymentId, successfulDeploymentId);
  assert.equal(result.approvedApplyPlanArtifactId, olderApplyPlanId);
  assert.deepEqual(verifiedPlanIds, [olderApplyPlanId]);
  assert.equal(getReadinessItem(result, "approved_apply_plan").status, "ready");
  assert.equal(getReadinessItem(result, "source_repository").status, "ready");
  assert.equal(getReadinessItem(result, "monitoring_config").status, "ready");
  assert.deepEqual(getReadinessItem(result, "deployment_target"), {
    key: "deployment_target",
    label: "배포 타깃",
    status: "ready",
    completedCount: 4,
    totalCount: 4,
    missingKeys: [],
    action: null
  });
  assert.equal(result.requiredActionCount, 0);
  assert.equal(result.ready, true);
  assert.equal(state.savedTargets.length, 1);
  assert.equal(state.targetRows.get("project-1")?.runtimeTargetKind, "ecs_fargate");
});

test("creates a canonical ECS Fargate target from successful outputs without AWS mutation", async () => {
  const state = createRepositoryState({ readyContext: true });
  let awsMutationCalls = 0;
  const repository = createRepository({ state }) as GitCicdReadinessRepository & {
    mutateAws(): Promise<void>;
  };
  repository.mutateAws = async () => {
    awsMutationCalls += 1;
  };
  const service = createGitCicdReadinessService({
    repository,
    planVerifier: createPlanVerifier(),
    now: () => new Date("2026-07-17T04:00:00.000Z")
  });

  const result = await service.refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.ready, true);
  assert.equal(result.requiredActionCount, 0);
  assert.deepEqual(Object.keys(service).sort(), [
    "inspect",
    "refresh",
    "synchronizeDeploymentTargetAfterSuccessfulApply"
  ]);
  assert.equal(awsMutationCalls, 0);
  assert.equal(state.savedTargets.length, 1);
  const saved = state.savedTargets[0];
  assert.ok(saved);
  assert.equal(saved.connectionId, "connection-1");
  assert.equal(saved.confirmedBuildConfig.dockerfilePath, "apps/api/Dockerfile");
  assert.equal(saved.confirmedBuildConfig.confirmedCommitSha, "b".repeat(40));
  assert.equal(saved.runtimeConfig.runtimeTargetKind, "ecs_fargate");
  assert.equal(saved.runtimeConfig.codeBuildProjectName, "project-build");
  assert.equal(saved.runtimeConfig.buildEnvironmentId, "build-environment-1");
  assert.equal(saved.runtimeConfig.ecrRepositoryName, "app");
  assert.equal(saved.runtimeConfig.cloudFrontDistributionId, "E1234567890");
  assert.equal(saved.runtimeConfig.outputUrl, "https://d111111abcdef8.cloudfront.net");
  assert.equal(saved.runtimeTarget.adapterKind, "ecs_service_fargate");
  assert.match(saved.deploymentTargetFingerprint, /^[0-9a-f]{64}$/);
});

test("Git/CI/CD readiness blocks a build environment whose repository checkout was not verified", async () => {
  const state = createRepositoryState({ readyContext: true });
  assert.ok(state.buildEnvironment);
  state.buildEnvironment.repositoryVerificationStatus = "not_checked";

  const result = await createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier(),
    now: () => new Date("2026-07-17T04:00:00.000Z")
  }).refresh({ projectId: "project-1", userId: "user-1" });

  const targetItem = getReadinessItem(result, "deployment_target");
  assert.equal(result.ready, false);
  assert.ok(targetItem.missingKeys.includes("build_config"));
  assert.equal(state.savedTargets.length, 0);
});

test("Git/CI/CD readiness rejects stale Repository and commit verification evidence", async () => {
  const state = createRepositoryState({ readyContext: true });
  assert.ok(state.buildEnvironment);
  state.buildEnvironment.repositoryVerificationRequestedCommitSha = "a".repeat(40);
  state.buildEnvironment.repositoryVerificationResolvedCommitSha = "a".repeat(40);

  const staleCommit = await createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier(),
    now: () => new Date("2026-07-17T04:00:00.000Z")
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(staleCommit.ready, false);
  assert.ok(
    getReadinessItem(staleCommit, "deployment_target").missingKeys.includes(
      "build_config"
    )
  );
  assert.equal(state.savedTargets.length, 0);
});

test("refresh is idempotent for the same reconciled target", async () => {
  const state = createRepositoryState({ readyContext: true });
  const service = createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier(),
    now: () => new Date("2026-07-17T04:00:00.000Z")
  });

  const first = await service.refresh({ projectId: "project-1", userId: "user-1" });
  const second = await service.refresh({ projectId: "project-1", userId: "user-1" });

  assert.deepEqual(second, first);
  assert.equal(state.targetRows.size, 1);
  assert.equal(state.targetRows.get("project-1")?.projectId, "project-1");
});

test("retries a repeatable-read serialization conflict after locking the project row", async () => {
  let attempts = 0;
  let projectLocks = 0;
  const isolationLevels: Array<string | undefined> = [];
  const db = {
    async transaction(
      operation: (transaction: unknown) => Promise<string>,
      config?: { isolationLevel?: string }
    ) {
      attempts += 1;
      isolationLevels.push(config?.isolationLevel);
      const transaction = {
        select() {
          return {
            from() {
              return {
                where() {
                  return {
                    async for(lockKind: string) {
                      assert.equal(lockKind, "update");
                      projectLocks += 1;
                      if (attempts === 1) {
                        throw Object.assign(new Error("serialization conflict"), {
                          code: "40001"
                        });
                      }
                      return [];
                    }
                  };
                }
              };
            }
          };
        }
      };
      return operation(transaction);
    }
  } as unknown as Database;
  const repository = createPostgresGitCicdReadinessRepository(db);

  const result = await repository.runInProjectSnapshot("project-1", async () => "same");

  assert.equal(result, "same");
  assert.equal(attempts, 2);
  assert.equal(projectLocks, 2);
  assert.deepEqual(isolationLevels, ["repeatable read", "repeatable read"]);
});

test("preserves an existing confirmed build config while refreshing AWS runtime coordinates", async () => {
  const confirmedBuildConfig = createConfirmedBuildConfig({
    confirmedAt: "2026-07-16T00:00:00.000Z",
    healthCheckPath: "/existing-health"
  });
  const existingTarget = createExistingTarget(confirmedBuildConfig);
  const state = createRepositoryState({ readyContext: true, existingTarget });

  await createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  const saved = state.savedTargets[0];
  assert.ok(saved);
  assert.deepEqual(saved.confirmedBuildConfig, confirmedBuildConfig);
  assert.equal(saved.runtimeConfig.runtimeTargetKind, "ecs_fargate");
  assert.equal(saved.runtimeConfig.clusterName, "app-cluster");
  assert.equal(saved.runtimeConfig.serviceName, "app-service");
  assert.equal(saved.runtimeConfig.outputUrl, "https://d111111abcdef8.cloudfront.net");
});

test("does not reuse an existing ECS target build config that fails ledger or preflight validation", async (t) => {
  const valid = createConfirmedBuildConfig();
  const cases: Array<{ name: string; config: ConfirmedBuildConfig }> = [
    {
      name: "missing ecsWeb",
      config: { ...valid, ecsWeb: null }
    },
    {
      name: "ledger package manager contract",
      config: {
        ...valid,
        ecsWeb: {
          ...valid.ecsWeb!,
          frontend: {
            ...valid.ecsWeb!.frontend,
            installPreset: "npm_ci"
          }
        }
      }
    },
    {
      name: "incomplete ecsWeb package manager version",
      config: {
        ...valid,
        ecsWeb: {
          ...valid.ecsWeb!,
          frontend: {
            ...valid.ecsWeb!.frontend,
            packageManagerVersion: ""
          }
        }
      }
    },
    {
      name: "preflight health check contract",
      config: {
        ...valid,
        ecsWeb: {
          ...valid.ecsWeb!,
          api: {
            ...valid.ecsWeb!.api,
            healthCheckPath: "health"
          }
        }
      }
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const state = createRepositoryState({
        readyContext: true,
        existingTarget: createExistingTarget(candidate.config)
      });

      const result = await createGitCicdReadinessService({
        repository: createRepository({ state }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(state.savedTargets.length, 0);
      const targetItem = getReadinessItem(result, "deployment_target");
      assert.equal(targetItem.status, "action_required");
      assert.ok(targetItem.missingKeys.includes("build_config"));
    });
  }
});

test("does not guess a build config when Dockerfile evidence is missing or ambiguous", async (t) => {
  for (const dockerfileCount of [0, 2]) {
    await t.test(`${dockerfileCount} Dockerfiles`, async () => {
      const analysis = createRepositoryAnalysis(dockerfileCount);
      const state = createRepositoryState({ readyContext: true, analysis });

      const result = await createGitCicdReadinessService({
        repository: createRepository({ state }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(state.savedTargets.length, 0);
      const targetItem = getReadinessItem(result, "deployment_target");
      assert.ok(targetItem.missingKeys.includes("build_config"));
      assert.equal(targetItem.action, "confirm_build_config");
    });
  }
});

test("does not create a build config from an invalid analysis revision or ambiguous application unit", async (t) => {
  const cases: Array<{
    name: string;
    configure(state: TestRepositoryState): void;
  }> = [
    {
      name: "invalid analysis revision",
      configure(state) {
        if (state.repositoryMonitoring) state.repositoryMonitoring.analysisRevision = "branch-main";
      }
    },
    {
      name: "Dockerfile without one application unit",
      configure(state) {
        const analysis = createRepositoryAnalysis(1);
        state.repositoryMonitoring = {
          ...state.repositoryMonitoring!,
          analysisResult: {
            ...analysis,
            evidence: analysis.evidence.map((evidence) =>
              evidence.kind === "dockerfile"
                ? { ...evidence, applicationUnitId: "missing-unit" }
                : evidence
            )
          }
        };
      }
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const state = createRepositoryState({ readyContext: true });
      candidate.configure(state);

      const result = await createGitCicdReadinessService({
        repository: createRepository({ state }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(state.savedTargets.length, 0);
      assert.ok(getReadinessItem(result, "deployment_target").missingKeys.includes("build_config"));
    });
  }
});

test("requires one package manifest, lockfile, package manager, and static output for web-inclusive analysis", async () => {
  const analysis = createRepositoryAnalysis(1, { webInclusive: true });
  const state = createRepositoryState({ readyContext: true, analysis });

  await createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  const saved = state.savedTargets[0];
  assert.ok(saved?.confirmedBuildConfig.ecsWeb);
  assert.equal(saved.confirmedBuildConfig.ecsWeb.frontend.packageManifestPath, "apps/web/package.json");
  assert.equal(saved.confirmedBuildConfig.ecsWeb.frontend.lockfilePath, "apps/web/pnpm-lock.yaml");
  assert.equal(saved.confirmedBuildConfig.ecsWeb.frontend.packageManager, "pnpm");
  assert.equal(saved.confirmedBuildConfig.ecsWeb.frontend.outputPath, "apps/web/dist");

  const ambiguousState = createRepositoryState({
    readyContext: true,
    analysis: {
      ...analysis,
      evidence: [
        ...analysis.evidence,
        {
          kind: "lockfile",
          path: "apps/web/package-lock.json",
          applicationUnitId: "web",
          signals: ["package-lock.json"]
        }
      ]
    }
  });
  const ambiguous = await createGitCicdReadinessService({
    repository: createRepository({ state: ambiguousState }),
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(ambiguousState.savedTargets.length, 0);
  assert.ok(getReadinessItem(ambiguous, "deployment_target").missingKeys.includes("build_config"));
});

test("accepts one repository-root lockfile for a monorepo frontend build", async () => {
  const analysis = createRepositoryAnalysis(1, { webInclusive: true });
  const state = createRepositoryState({
    readyContext: true,
    analysis: {
      ...analysis,
      evidence: [
        ...analysis.evidence.filter((evidence) => evidence.kind !== "lockfile"),
        {
          kind: "package_json",
          path: "package.json",
          applicationUnitId: null,
          signals: ["workspace root"]
        },
        {
          kind: "lockfile",
          path: "package-lock.json",
          applicationUnitId: null,
          signals: ["package-lock.json"]
        }
      ]
    }
  });

  const result = await createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier()
  }).refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(result.ready, true);
  const saved = state.savedTargets[0];
  assert.ok(saved?.confirmedBuildConfig.ecsWeb);
  assert.equal(saved.confirmedBuildConfig.sourceRoot, ".");
  assert.equal(saved.confirmedBuildConfig.ecsWeb.api.sourceRoot, ".");
  assert.equal(
    saved.confirmedBuildConfig.ecsWeb.frontend.lockfilePath,
    "package-lock.json"
  );
  assert.equal(saved.confirmedBuildConfig.ecsWeb.frontend.packageManager, "npm");
  assert.equal(saved.confirmedBuildConfig.ecsWeb.frontend.installPreset, "npm_ci");
});

test("requires exactly one frontend or fullstack unit for a new ECS/Fargate target", async (t) => {
  const backendOnly = createRepositoryAnalysis(1);
  const webInclusive = createRepositoryAnalysis(1, { webInclusive: true });
  const cases: Array<{ name: string; analysis: RepositoryAnalysisAiHandoff }> = [
    { name: "no frontend unit", analysis: backendOnly },
    {
      name: "ambiguous frontend units",
      analysis: {
        ...webInclusive,
        applicationUnits: [
          ...webInclusive.applicationUnits,
          {
            id: "admin-web",
            rootPath: "apps/admin",
            kind: "frontend",
            frameworks: ["Vite"],
            evidencePaths: ["apps/admin/package.json"]
          }
        ]
      }
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const state = createRepositoryState({ readyContext: true, analysis: candidate.analysis });

      const result = await createGitCicdReadinessService({
        repository: createRepository({ state }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(state.savedTargets.length, 0);
      assert.ok(getReadinessItem(result, "deployment_target").missingKeys.includes("build_config"));
    });
  }
});

test("rejects build evidence that escapes its corresponding application unit source root", async (t) => {
  const cases = [
    { kind: "dockerfile", path: "apps/web/Dockerfile" },
    { kind: "package_json", path: "apps/api/package.json" },
    { kind: "lockfile", path: "apps/api/pnpm-lock.yaml" },
    { kind: "static_output", path: "apps/api/dist" }
  ] as const;

  for (const candidate of cases) {
    await t.test(candidate.kind, async () => {
      const analysis = createRepositoryAnalysis(1, { webInclusive: true });
      const state = createRepositoryState({
        readyContext: true,
        analysis: {
          ...analysis,
          evidence: analysis.evidence.map((evidence) =>
            evidence.kind === candidate.kind
              ? { ...evidence, path: candidate.path }
              : evidence
          )
        }
      });

      const result = await createGitCicdReadinessService({
        repository: createRepository({ state }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(state.savedTargets.length, 0);
      assert.ok(getReadinessItem(result, "deployment_target").missingKeys.includes("build_config"));
    });
  }
});

test("does not create a target when required CloudFront, ECS, ECR, or ALB output evidence is incomplete", async (t) => {
  for (const missingOutput of [
    "cloudfront_distribution_id",
    "ecs_service_name",
    "ecr_repository_name",
    "alb_arn"
  ]) {
    await t.test(missingOutput, async () => {
      const state = createRepositoryState({
        readyContext: true,
        outputs: createTerraformOutputs().filter((output) => output.name !== missingOutput)
      });

      const result = await createGitCicdReadinessService({
        repository: createRepository({ state }),
        planVerifier: createPlanVerifier()
      }).refresh({ projectId: "project-1", userId: "user-1" });

      assert.equal(state.savedTargets.length, 0);
      const targetItem = getReadinessItem(result, "deployment_target");
      assert.ok(targetItem.missingKeys.includes("runtime_config"));
      assert.ok(targetItem.missingKeys.includes("output_url"));
    });
  }
});

test("does not treat an existing target as ready when the selected deployment outputs are incomplete", async () => {
  const state = createRepositoryState({ readyContext: true });
  const service = createGitCicdReadinessService({
    repository: createRepository({ state }),
    planVerifier: createPlanVerifier()
  });
  const first = await service.refresh({ projectId: "project-1", userId: "user-1" });
  assert.equal(first.ready, true);
  state.outputs = createTerraformOutputs().filter(
    (output) => output.name !== "cloudfront_distribution_id"
  );

  const result = await service.refresh({ projectId: "project-1", userId: "user-1" });

  assert.equal(state.savedTargets.length, 1);
  const targetItem = getReadinessItem(result, "deployment_target");
  assert.equal(targetItem.status, "action_required");
  assert.ok(targetItem.missingKeys.includes("runtime_config"));
  assert.ok(targetItem.missingKeys.includes("output_url"));
});

test("treats runtime evidence gaps as action_required but propagates database read failures", async (t) => {
  await t.test("runtime evidence gap", async () => {
    const state = createRepositoryState({
      readyContext: true,
      outputs: createTerraformOutputs().filter(
        (output) => output.name !== "cloudfront_distribution_id"
      )
    });

    const result = await createGitCicdReadinessService({
      repository: createRepository({ state }),
      planVerifier: createPlanVerifier()
    }).refresh({ projectId: "project-1", userId: "user-1" });

    assert.ok(getReadinessItem(result, "deployment_target").missingKeys.includes("runtime_config"));
  });

  await t.test("Terraform output query failure", async () => {
    const transient = new Error("database output timeout");
    const repository = createRepository({ state: createRepositoryState({ readyContext: true }) });
    repository.listTerraformOutputs = async () => {
      throw transient;
    };

    await assert.rejects(
      createGitCicdReadinessService({ repository, planVerifier: createPlanVerifier() }).refresh({
        projectId: "project-1",
        userId: "user-1"
      }),
      (error: unknown) => error === transient
    );
  });

  await t.test("deployed resource query failure", async () => {
    const transient = new Error("database resource timeout");
    const repository = createRepository({ state: createRepositoryState({ readyContext: true }) });
    repository.listDeployedResources = async () => {
      throw transient;
    };

    await assert.rejects(
      createGitCicdReadinessService({ repository, planVerifier: createPlanVerifier() }).refresh({
        projectId: "project-1",
        userId: "user-1"
      }),
      (error: unknown) => error === transient
    );
  });
});

test("synchronizes a specific RUNNING deployment immediately after successful Apply results are stored", async () => {
  const runningDeployment = createDeployment({
    id: "running-deployment",
    status: "RUNNING",
    completedAt: null,
    approvedPlanArtifactId: "approved-running-plan"
  });
  const state = createRepositoryState({ readyContext: true });
  const service = createGitCicdReadinessService({
    repository: createRepository({
      deployments: [runningDeployment],
      plansByDeployment: new Map([
        [
          runningDeployment.id,
          [
            createPlan({
              id: "approved-running-plan",
              deploymentId: runningDeployment.id
            })
          ]
        ]
      ]),
      state
    }),
    planVerifier: createPlanVerifier(),
    now: () => new Date("2026-07-17T06:00:00.000Z")
  });

  const target = await service.synchronizeDeploymentTargetAfterSuccessfulApply({
    projectId: "project-1",
    deploymentId: runningDeployment.id,
    userId: "user-1"
  });

  assert.equal(target.projectId, "project-1");
  assert.equal(target.connectionId, "connection-1");
  assert.equal(target.runtimeTargetKind, "ecs_fargate");
  assert.equal(state.savedTargets.length, 1);
});

test("synchronizes a specific SUCCESS deployment after its Apply state is finalized", async () => {
  const deployment = createDeployment({ approvedPlanArtifactId: "plan-1" });
  const state = createRepositoryState({ readyContext: true });
  const service = createGitCicdReadinessService({
    repository: createRepository({ deployments: [deployment], state }),
    planVerifier: createPlanVerifier()
  });

  const target = await service.synchronizeDeploymentTargetAfterSuccessfulApply({
    projectId: "project-1",
    deploymentId: deployment.id,
    userId: "user-1"
  });

  assert.equal(target.runtimeTargetKind, "ecs_fargate");
  assert.equal(state.savedTargets.length, 1);
});

test("post-Apply synchronization rejects invalid project, deployment scope, status, and approved plan evidence", async (t) => {
  const cases: Array<{
    name: string;
    deployment: GitCicdReadinessDeploymentRecord;
    userId?: string;
    plans?: GitCicdReadinessPlanArtifactRecord[];
    expected: RegExp;
  }> = [
    {
      name: "user scope",
      deployment: createDeployment({ id: "running", status: "RUNNING", completedAt: null }),
      userId: "other-user",
      expected: /Project not found/
    },
    {
      name: "deployment status",
      deployment: createDeployment({ id: "pending", status: "PENDING", completedAt: null }),
      expected: /RUNNING or SUCCESS/
    },
    {
      name: "deployment project scope",
      deployment: createDeployment({ id: "other-project", projectId: "project-2" }),
      expected: /Deployment not found/
    },
    {
      name: "direct deployment source",
      deployment: createDeployment({ id: "gitops", source: "gitops" }),
      expected: /Deployment not found/
    },
    {
      name: "deployment scope",
      deployment: createDeployment({
        id: "application-only",
        status: "RUNNING",
        completedAt: null,
        scope: "application"
      }),
      expected: /infrastructure or full_stack/
    },
    {
      name: "deployment target kind",
      deployment: createDeployment({
        id: "static-target",
        status: "RUNNING",
        completedAt: null,
        targetKind: "static_site"
      }),
      expected: /ecs_fargate/
    },
    {
      name: "approved Apply plan",
      deployment: createDeployment({
        id: "destroy-plan",
        status: "RUNNING",
        completedAt: null,
        approvedPlanArtifactId: "approved-destroy"
      }),
      plans: [
        createPlan({
          id: "approved-destroy",
          deploymentId: "destroy-plan",
          operation: "destroy"
        }),
        createPlan({ id: "older-apply", deploymentId: "destroy-plan" })
      ],
      expected: /approved Apply Plan/
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const service = createGitCicdReadinessService({
        repository: createRepository({
          deployments: [candidate.deployment],
          plansByDeployment: new Map([[candidate.deployment.id, candidate.plans ?? [
            createPlan({ deploymentId: candidate.deployment.id })
          ]]]),
          state: createRepositoryState({ readyContext: true })
        }),
        planVerifier: createPlanVerifier()
      });

      await assert.rejects(
        service.synchronizeDeploymentTargetAfterSuccessfulApply({
          projectId: "project-1",
          deploymentId: candidate.deployment.id,
          userId: candidate.userId ?? "user-1"
        }),
        candidate.expected
      );
    });
  }
});

test("post-Apply synchronization rejects incomplete connection, build, output, and inventory evidence", async (t) => {
  const cases: Array<{
    name: string;
    configure(state: TestRepositoryState): void;
    expected: RegExp;
  }> = [
    {
      name: "verified connection",
      configure(state) {
        state.verifiedConnectionIds.clear();
      },
      expected: /verified AWS connection/
    },
    {
      name: "ready build environment",
      configure(state) {
        state.buildEnvironment = undefined;
      },
      expected: /ready build environment/
    },
    {
      name: "runtime outputs",
      configure(state) {
        state.outputs = state.outputs.filter(
          (output) => output.name !== "cloudfront_distribution_id"
        );
      },
      expected: /runtime outputs and inventory/
    },
    {
      name: "runtime inventory",
      configure(state) {
        state.resources = state.resources.filter(
          (resource) => resource.terraformType !== "aws_ecs_service"
        );
      },
      expected: /runtime outputs and inventory/
    }
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const deployment = createDeployment({ approvedPlanArtifactId: "plan-1" });
      const state = createRepositoryState({ readyContext: true });
      candidate.configure(state);
      const service = createGitCicdReadinessService({
        repository: createRepository({ deployments: [deployment], state }),
        planVerifier: createPlanVerifier()
      });

      await assert.rejects(
        service.synchronizeDeploymentTargetAfterSuccessfulApply({
          projectId: "project-1",
          deploymentId: deployment.id,
          userId: "user-1"
        }),
        candidate.expected
      );
    });
  }
});

function createDeployment(
  overrides: Partial<GitCicdReadinessDeploymentRecord> = {}
): GitCicdReadinessDeploymentRecord {
  return {
    id: "deployment-1",
    projectId: "project-1",
    terraformArtifactId: "terraform-artifact-1",
    awsConnectionId: "connection-1",
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    approvedPlanArtifactId: null,
    scope: "full_stack",
    targetKind: "ecs_fargate",
    status: "SUCCESS",
    source: "direct",
    completedAt: new Date("2026-07-17T03:00:00Z"),
    createdAt: new Date("2026-07-17T00:00:00Z"),
    ...overrides
  };
}

function createPlan(
  overrides: Partial<GitCicdReadinessPlanArtifactRecord> = {}
): GitCicdReadinessPlanArtifactRecord {
  return {
    id: "plan-1",
    deploymentId: "deployment-1",
    terraformArtifactId: "terraform-artifact-1",
    terraformArtifactSha256,
    operation: "apply",
    objectKey: "deployments/deployment-1/plans/plan-1.tfplan",
    sha256: planSha256,
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: new Date("2026-07-17T01:00:00Z"),
    ...overrides
  };
}

function createPlanVerifier(body: Buffer = planBody) {
  return createDeploymentPlanArtifactVerifier({
    async downloadDeploymentPlanArtifact() {
      return body;
    }
  });
}

function createRepository(input: {
  deployments?: GitCicdReadinessDeploymentRecord[];
  releases?: GitCicdReadinessApplicationReleaseRecord[];
  createRelease?: (
    target: ProjectDeploymentTargetRecord
  ) => GitCicdReadinessApplicationReleaseRecord;
  plans?: GitCicdReadinessPlanArtifactRecord[];
  plansByDeployment?: Map<string, GitCicdReadinessPlanArtifactRecord[]>;
  state?: TestRepositoryState;
} = {}): GitCicdReadinessRepository {
  const deployments = input.deployments ?? [createDeployment()];
  const plansByDeployment =
    input.plansByDeployment ??
    new Map([[deployments[0]?.id ?? "deployment-1", input.plans ?? [createPlan()]]]);
  const state = input.state ?? createRepositoryState();

  const repository: GitCicdReadinessRepository = {
    async runInProjectSnapshot(_projectId, operation) {
      return operation(repository);
    },
    async findAccessibleProject(projectId, userId) {
      return projectId === "project-1" && userId === "user-1" ? { id: projectId } : undefined;
    },
    async findLatestSuccessfulDirectInfrastructureDeployment(projectId) {
      return deployments
        .filter(
          (deployment) =>
            deployment.projectId === projectId &&
            deployment.status === "SUCCESS" &&
            deployment.source === "direct" &&
            (deployment.scope === "infrastructure" || deployment.scope === "full_stack") &&
            deployment.completedAt !== null
        )
        .sort(compareTestDeploymentsNewestFirst)[0];
    },
    async findLatestSucceededDirectApplicationRelease(projectId) {
      if (input.releases) {
        return input.releases
          .filter((release) => release.projectId === projectId)
          .sort((left, right) =>
            (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0)
          )[0];
      }
      const target = state.targetRows.get(projectId);
      if (!target) return undefined;
      if (input.createRelease) return input.createRelease(target);
      const infrastructure = deployments
        .filter(
          (deployment) =>
            deployment.projectId === projectId &&
            (deployment.scope === "infrastructure" || deployment.scope === "full_stack")
        )
        .sort(compareTestDeploymentsNewestFirst)[0];
      if (!infrastructure) return undefined;
      return createEligibleRelease(target, {
        deploymentId: infrastructure.id,
        deploymentScope: infrastructure.scope === "full_stack" ? "full_stack" : "application"
      });
    },
    async findDirectDeploymentInProject(projectId, deploymentId) {
      return deployments.find(
        (deployment) =>
          deployment.projectId === projectId &&
          deployment.id === deploymentId &&
          deployment.source === "direct"
      );
    },
    async listPlanArtifacts(deploymentId) {
      return plansByDeployment.get(deploymentId) ?? [];
    },
    async findVerifiedConnection(connectionId, userId) {
      return state.verifiedConnectionIds.has(connectionId) && userId === "user-1"
        ? {
            id: connectionId,
            accountId: "123456789012",
            region: "ap-northeast-2"
          }
        : undefined;
    },
    async findActiveRepositoryWithMonitoring() {
      return state.repositoryMonitoring;
    },
    async findProjectDeploymentTarget(projectId) {
      return state.targetRows.get(projectId);
    },
    async findProjectBuildEnvironment() {
      return state.buildEnvironment;
    },
    async listTerraformOutputs() {
      return state.outputs;
    },
    async listDeployedResources() {
      return state.resources;
    },
    async saveReconciledDeploymentTarget(target) {
      state.savedTargets.push(target);
      const existing = state.targetRows.get(target.projectId);
      const saved: ProjectDeploymentTargetRecord = {
        ...target,
        createdAt: existing?.createdAt ?? target.updatedAt
      };
      state.targetRows.set(target.projectId, saved);
      return saved;
    }
  };

  return repository;
}

function createEligibleRelease(
  target: ProjectDeploymentTargetRecord,
  overrides: Partial<GitCicdReadinessApplicationReleaseRecord> = {}
): GitCicdReadinessApplicationReleaseRecord {
  const commitSha = target.confirmedBuildConfig?.confirmedCommitSha ?? "b".repeat(40);
  return {
    id: "release-1",
    projectId: target.projectId,
    deploymentId: "deployment-1",
    source: "direct",
    status: "succeeded",
    runtimeTargetKind: "ecs_fargate",
    deploymentTargetFingerprint: target.deploymentTargetFingerprint,
    commitSha,
    releaseCandidateId: "candidate-1",
    compositeDigest: {
      algorithm: "sha256",
      value: "1".repeat(64),
      apiOciDigest: "2".repeat(64),
      frontendManifestDigest: "3".repeat(64)
    },
    outputUrl: target.runtimeConfig?.outputUrl ?? null,
    healthEvidence: { state: "healthy" },
    frontendEvidence: {
      manifestObjectKey: "releases/release-1/manifest.json",
      manifestVersionId: "manifest-version-1",
      indexObjectKey: "index.html",
      indexVersionId: "index-version-1",
      invalidationId: "invalidation-1",
      commitMarker: commitSha
    },
    completedAt: new Date("2026-07-17T04:00:00Z"),
    deploymentScope: "full_stack",
    deploymentSource: "direct",
    deploymentStatus: "SUCCESS",
    deploymentCompletedAt: new Date("2026-07-17T04:00:00Z"),
    ...overrides
  };
}

type TestRepositoryState = {
  repositoryMonitoring: RepositoryMonitoringRecord | undefined;
  buildEnvironment: ProjectBuildEnvironmentRecord | undefined;
  targetRows: Map<string, ProjectDeploymentTargetRecord>;
  outputs: TerraformOutputRecord[];
  resources: DeployedResourceRecord[];
  savedTargets: SaveReconciledDeploymentTargetInput[];
  verifiedConnectionIds: Set<string>;
};

function createRepositoryState(input: {
  readyContext?: boolean;
  analysis?: RepositoryAnalysisAiHandoff;
  existingTarget?: ProjectDeploymentTargetRecord;
  outputs?: TerraformOutputRecord[];
} = {}): TestRepositoryState {
  const outputs = input.outputs ?? (input.readyContext ? createTerraformOutputs() : []);
  const resolvedOutputs = input.readyContext && outputs.length > 0
    ? tryResolveOutputs(outputs)
    : null;
  const targetRows = new Map<string, ProjectDeploymentTargetRecord>();
  if (input.existingTarget) targetRows.set(input.existingTarget.projectId, input.existingTarget);

  return {
    repositoryMonitoring: input.readyContext
      ? {
          id: "repository-1",
          owner: "jh-9999",
          name: "audience-live-check",
          analysisRevision: "b".repeat(40),
          analysisResult: input.analysis ?? createRepositoryAnalysis(1, { webInclusive: true }),
          defaultBranch: "main",
          monitorBranch: "main",
          enabled: true,
          validationStatus: "valid"
        }
      : undefined,
    buildEnvironment: input.readyContext
      ? {
          id: "build-environment-1",
          projectId: "project-1",
          awsConnectionId: "connection-1",
          sourceRepositoryUrl:
            "https://github.com/jh-9999/audience-live-check.git",
          codeBuildProjectName: "project-build",
          status: "ready",
          repositoryVerificationStatus: "verified",
          repositoryVerificationRequestedCommitSha: "b".repeat(40),
          repositoryVerificationResolvedCommitSha: "b".repeat(40),
          codeConnectionStatus: "AVAILABLE"
        }
      : undefined,
    targetRows,
    outputs,
    resources: resolvedOutputs ? createTerraformResources(resolvedOutputs) : [],
    savedTargets: [],
    verifiedConnectionIds: new Set(["connection-1"])
  };
}

function compareTestDeploymentsNewestFirst(
  left: GitCicdReadinessDeploymentRecord,
  right: GitCicdReadinessDeploymentRecord
): number {
  const completedDifference =
    (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0);
  return completedDifference || right.createdAt.getTime() - left.createdAt.getTime();
}

function createRepositoryAnalysis(
  dockerfileCount: number,
  options: { webInclusive?: boolean } = {}
): RepositoryAnalysisAiHandoff {
  const applicationUnits = options.webInclusive
    ? [
        {
          id: "app",
          rootPath: "apps/api",
          kind: "backend" as const,
          frameworks: ["Fastify"],
          evidencePaths: ["apps/api/Dockerfile"]
        },
        {
          id: "web",
          rootPath: "apps/web",
          kind: "frontend" as const,
          frameworks: ["Vite"],
          evidencePaths: ["apps/web/package.json"]
        }
      ]
    : [
        {
          id: "app",
          rootPath: "apps/api",
          kind: "backend" as const,
          frameworks: ["Fastify"],
          evidencePaths: ["apps/api/Dockerfile"]
        }
      ];
  const dockerfiles = Array.from({ length: dockerfileCount }, (_, index) => ({
    kind: "dockerfile" as const,
    path: index === 0 ? "apps/api/Dockerfile" : `services/worker-${index}/Dockerfile`,
    applicationUnitId: index === 0 ? "app" : null,
    signals: ["Dockerfile"]
  }));
  const webEvidence = options.webInclusive
    ? [
        {
          kind: "package_json" as const,
          path: "apps/web/package.json",
          applicationUnitId: "web",
          signals: ["Vite"]
        },
        {
          kind: "lockfile" as const,
          path: "apps/web/pnpm-lock.yaml",
          applicationUnitId: "web",
          signals: ["pnpm-lock.yaml"]
        },
        {
          kind: "static_output" as const,
          path: "apps/web/dist",
          applicationUnitId: "web",
          signals: ["Vite static build output"]
        }
      ]
    : [];

  return {
    status: "template_selected",
    templateId: "ecs-fargate-container-app",
    applicationUnits,
    evidence: [...dockerfiles, ...webEvidence],
    missingEvidence: [],
    selectionReasons: ["ECS Fargate evidence"]
  };
}

function createConfirmedBuildConfig(
  overrides: Partial<ConfirmedBuildConfig> = {}
): ConfirmedBuildConfig {
  const config: ConfirmedBuildConfig = {
    sourceRoot: "apps/api",
    evidence: [
      { kind: "dockerfile", path: "apps/api/Dockerfile" },
      { kind: "package_manifest", path: "apps/web/package.json" },
      { kind: "static_output", path: "apps/web/dist" }
    ],
    installPreset: "none",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "apps/api/Dockerfile",
    packageManifestPath: null,
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: "b".repeat(40),
    confirmedAt: "2026-07-17T04:00:00.000Z",
    ecsWeb: {
      api: {
        sourceRoot: "apps/api",
        dockerfilePath: "apps/api/Dockerfile",
        containerPort: 3000,
        healthCheckPath: "/health"
      },
      frontend: {
        sourceRoot: "apps/web",
        packageManifestPath: "apps/web/package.json",
        lockfilePath: "apps/web/pnpm-lock.yaml",
        packageManager: "pnpm",
        packageManagerVersion: "11.8.0",
        installPreset: "pnpm_frozen_lockfile",
        buildPreset: "pnpm_build",
        outputPath: "apps/web/dist"
      }
    }
  };
  return { ...config, ...overrides };
}

function createExistingTarget(
  confirmedBuildConfig: ConfirmedBuildConfig
): ProjectDeploymentTargetRecord {
  return {
    projectId: "project-1",
    provider: "aws",
    connectionId: "connection-1",
    region: "ap-northeast-2",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig,
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "old-build",
      ecrRepositoryName: "old-app",
      clusterName: "old-cluster",
      serviceName: "old-service",
      containerName: "old-container",
      outputUrl: null
    },
    runtimeTarget: null,
    deploymentTargetFingerprint: null,
    rolloutStrategy: "all_at_once",
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    updatedAt: new Date("2026-07-16T00:00:00.000Z")
  };
}

function createTerraformOutputs(): TerraformOutputRecord[] {
  const values: Record<string, unknown> = {
    cloudfront_url: "https://d111111abcdef8.cloudfront.net",
    cloudfront_domain_name: "d111111abcdef8.cloudfront.net",
    cloudfront_distribution_id: "E1234567890",
    static_bucket_name: "demo-web-assets",
    ecr_repository_name: "app",
    ecr_repository_arn: "arn:aws:ecr:ap-northeast-2:123456789012:repository/app",
    ecr_repository_url: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app",
    ecs_cluster_name: "app-cluster",
    ecs_service_name: "app-service",
    ecs_task_definition_family: "app-task",
    ecs_task_definition_arn:
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/app-task:1",
    ecs_task_role_arn: "arn:aws:iam::123456789012:role/app-task-role",
    ecs_execution_role_arn: "arn:aws:iam::123456789012:role/app-execution-role",
    ecs_container_name: "web",
    ecs_container_port: 3000,
    alb_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/1",
    alb_dns_name: "demo.ap-northeast-2.elb.amazonaws.com",
    target_group_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/1",
    api_origin_url: "http://demo.ap-northeast-2.elb.amazonaws.com",
    log_group_names: ["/ecs/demo"]
  };

  return Object.entries(values).map(([name, value]) => ({
    name,
    value,
    sensitive: false
  }));
}

function createTerraformResources(
  outputs: ReturnType<typeof resolveEcsFargateRuntimeOutputs>
): DeployedResourceRecord[] {
  const region = "ap-northeast-2";
  return [
    { terraformType: "aws_s3_bucket", resourceId: outputs.frontendBucketName, region },
    {
      terraformType: "aws_cloudfront_distribution",
      resourceId: outputs.cloudFrontDistributionId,
      region
    },
    { terraformType: "aws_ecr_repository", resourceId: outputs.ecrRepositoryName, region },
    {
      terraformType: "aws_ecs_cluster",
      resourceId: `arn:aws:ecs:${region}:123456789012:cluster/${outputs.clusterName}`,
      region
    },
    {
      terraformType: "aws_ecs_service",
      resourceId: `arn:aws:ecs:${region}:123456789012:service/${outputs.clusterName}/${outputs.serviceName}`,
      region
    },
    { terraformType: "aws_ecs_task_definition", resourceId: outputs.taskDefinitionArn, region },
    { terraformType: "aws_iam_role", resourceId: outputs.taskRoleArn, region },
    { terraformType: "aws_iam_role", resourceId: outputs.executionRoleArn, region },
    { terraformType: "aws_lb", resourceId: outputs.loadBalancerArn, region },
    { terraformType: "aws_lb_target_group", resourceId: outputs.targetGroupArn, region },
    ...outputs.logGroupNames.map((resourceId) => ({
      terraformType: "aws_cloudwatch_log_group",
      resourceId,
      region
    }))
  ];
}

function tryResolveOutputs(outputs: TerraformOutputRecord[]) {
  try {
    return resolveEcsFargateRuntimeOutputs(outputs);
  } catch {
    return null;
  }
}

function getReadinessItem(
  snapshot: GitCicdReadinessSnapshot,
  key: GitCicdReadinessItemKey
) {
  const item = snapshot.items.find((candidate) => candidate.key === key);
  assert.ok(item, `readiness item ${key} should exist`);
  return item;
}
