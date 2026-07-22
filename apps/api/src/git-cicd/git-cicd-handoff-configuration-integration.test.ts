import assert from "node:assert/strict";
import test from "node:test";
import type {
  CreateGitCicdHandoffRecordInput,
  GitCicdHandoffApprovedDeploymentRecord,
  GitCicdHandoffApprovedPlanArtifactRecord,
  GitCicdHandoffProvider,
  GitCicdHandoffRecord,
  GitCicdHandoffRepository,
  GitCicdProviderCreateInput
} from "./git-cicd-handoff-service.js";
import {
  createGitCicdHandoff,
  GitCicdHandoffProviderConflictError,
  setupGitCicdHandoff
} from "./git-cicd-handoff-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const architectureId = "33333333-3333-4333-8333-333333333333";
const terraformArtifactId = "44444444-4444-4444-8444-444444444444";
const sourceRepositoryId = "55555555-5555-4555-8555-555555555555";
const sourceDeploymentId = "66666666-6666-4666-8666-666666666666";
const planId = "77777777-7777-4777-8777-777777777777";
const connectionId = "88888888-8888-4888-8888-888888888888";
const commitSha = "a".repeat(40);
const publicOutputUrl = "https://static.example.com";
const staleMessage =
  "CI/CD 설정이 변경되었습니다. Delivery 정보를 새로고침하고 다시 검토해 주세요.";

test("rejects an explicit stale RDS preview before invoking the provider", async () => {
  const fixture = createFixture();

  await withPublicBaseUrl(async () => {
    await assert.rejects(
      createGitCicdHandoff(
        {
          ...createInput(),
          rdsEnabled: false
        },
        fixture.repository,
        fixture.provider,
        () => "99999999-9999-4999-8999-999999999999",
        { planArtifactVerifier: { async verify() { return true; } } }
      ),
      (error: unknown) =>
        error instanceof GitCicdHandoffProviderConflictError &&
        error.name === "GitCicdHandoffConfigurationStaleError" &&
        error.code === "GIT_CICD_HANDOFF_CONFIGURATION_STALE" &&
        error.message === staleMessage
    );
  });

  assert.equal(fixture.providerInputs.length, 0);
});

test("rejects an explicit null Static Site URL when the server derives a URL", async () => {
  const fixture = createFixture();

  await withPublicBaseUrl(async () => {
    await assert.rejects(
      createGitCicdHandoff(
        {
          ...createInput(),
          staticSiteUrl: null
        },
        fixture.repository,
        fixture.provider,
        () => "99999999-9999-4999-8999-999999999999",
        { planArtifactVerifier: { async verify() { return true; } } }
      ),
      (error: unknown) =>
        error instanceof GitCicdHandoffProviderConflictError &&
        error.code === "GIT_CICD_HANDOFF_CONFIGURATION_STALE"
    );
  });

  assert.equal(fixture.providerInputs.length, 0);
});

test("rejects an explicit API Base URL when the server derives null", async () => {
  const fixture = createFixture();

  await withPublicBaseUrl(async () => {
    await assert.rejects(
      createGitCicdHandoff(
        {
          ...createInput(),
          apiBaseUrl: "https://stale-api.example.com"
        },
        fixture.repository,
        fixture.provider,
        () => "99999999-9999-4999-8999-999999999999",
        { planArtifactVerifier: { async verify() { return true; } } }
      ),
      (error: unknown) =>
        error instanceof GitCicdHandoffProviderConflictError &&
        error.code === "GIT_CICD_HANDOFF_CONFIGURATION_STALE"
    );
  });

  assert.equal(fixture.providerInputs.length, 0);
});

test("uses server-derived configuration when the request omits preview fields", async () => {
  const fixture = createFixture();

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      createInput(),
      fixture.repository,
      fixture.provider,
      () => "99999999-9999-4999-8999-999999999999",
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: createNoopSetupActions()
      }
    );
  });

  assert.equal(fixture.providerInputs.length, 1);
  assert.equal(fixture.providerInputs[0]?.rdsEnabled, true);
  assert.equal(fixture.providerInputs[0]?.staticSiteUrl, publicOutputUrl);
  assert.equal(fixture.providerInputs[0]?.apiBaseUrl, null);

  assert.equal(fixture.storedInputs.length, 1);
  assert.equal(fixture.storedInputs[0]?.staticSiteUrl, publicOutputUrl);
  assert.equal(fixture.storedInputs[0]?.apiBaseUrl, null);
  assert.equal(
    fixture.storedInputs[0]?.repositorySettingsPreview?.variables.SKETCHCATCH_RDS_ENABLED,
    "true"
  );
  assert.equal(
    fixture.storedInputs[0]?.repositorySettingsPreview?.variables.SKETCHCATCH_STATIC_SITE_URL,
    publicOutputUrl
  );
  assert.equal(
    fixture.storedInputs[0]?.repositorySettingsPreview?.variables.SKETCHCATCH_API_BASE_URL,
    ""
  );
});

test("accepts explicit false and null values when they exactly match the server preview", async () => {
  const fixture = createFixture({ withRds: false });

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      {
        ...createInput(),
        rdsEnabled: false,
        staticSiteUrl: publicOutputUrl,
        apiBaseUrl: null
      },
      fixture.repository,
      fixture.provider,
      () => "99999999-9999-4999-8999-999999999999",
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: createNoopSetupActions()
      }
    );
  });

  assert.equal(fixture.providerInputs.length, 1);
  assert.equal(fixture.providerInputs[0]?.rdsEnabled, false);
  assert.equal(fixture.providerInputs[0]?.staticSiteUrl, publicOutputUrl);
  assert.equal(fixture.providerInputs[0]?.apiBaseUrl, null);
});

test("stores a resumable draft before settings, AWS trust, and pull request setup", async () => {
  const fixture = createFixture();

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      createInput(),
      fixture.repository,
      fixture.provider,
      () => "99999999-9999-4999-8999-999999999999",
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: {
          async applyRepositorySettings() {
            fixture.events.push("repository-settings");
          },
          async applyAwsRoleDiff() {
            fixture.events.push("aws-role-diff");
          }
        }
      }
    );
  });

  assert.deepEqual(fixture.events, [
    "draft",
    "repository-settings",
    "aws-role-diff",
    "pull-request",
    "pr-created"
  ]);
  assert.equal(fixture.storedInputs[0]?.status, "draft");
  assert.equal(fixture.storedInputs[0]?.pullRequestUrl, null);
});

test("resumes the same accepted draft after an automatic setup failure", async () => {
  const fixture = createFixture();
  const handoffId = "99999999-9999-4999-8999-999999999999";

  await withPublicBaseUrl(async () => {
    await assert.rejects(
      createGitCicdHandoff(
        createInput(),
        fixture.repository,
        fixture.provider,
        () => handoffId,
        {
          planArtifactVerifier: { async verify() { return true; } },
          setupActions: {
            async applyRepositorySettings() {
              fixture.events.push("repository-settings-first");
            },
            async applyAwsRoleDiff() {
              fixture.events.push("aws-role-diff-failed");
              throw new Error("temporary AWS failure");
            }
          }
        }
      ),
      /temporary AWS failure/
    );

    fixture.events.length = 0;
    const result = await setupGitCicdHandoff(
      {
        handoffId,
        accessContext: { kind: "user", userId }
      },
      fixture.repository,
      fixture.provider,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: {
          async applyRepositorySettings() {
            fixture.events.push("repository-settings-retry");
          },
          async applyAwsRoleDiff() {
            fixture.events.push("aws-role-diff-retry");
          }
        }
      }
    );

    assert.equal(result.id, handoffId);
    assert.equal(result.userAcceptedChangeId, planId);
    assert.equal(result.status, "pr_created");
  });

  assert.equal(fixture.storedInputs.length, 1);
  assert.deepEqual(fixture.events, [
    "repository-settings-retry",
    "aws-role-diff-retry",
    "pull-request",
    "pr-created"
  ]);
});

test("reconciles settings and pull request again for an existing PR without new approval", async () => {
  const fixture = createFixture();
  const handoffId = "99999999-9999-4999-8999-999999999999";
  const setupActions = createNoopSetupActions();

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      createInput(),
      fixture.repository,
      fixture.provider,
      () => handoffId,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions
      }
    );

    fixture.events.length = 0;
    const result = await setupGitCicdHandoff(
      { handoffId, accessContext: { kind: "user", userId } },
      fixture.repository,
      fixture.provider,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: {
          async applyRepositorySettings() {
            fixture.events.push("repository-settings-reconcile");
          },
          async applyAwsRoleDiff() {
            fixture.events.push("aws-role-diff-reconcile");
          }
        }
      }
    );

    assert.equal(result.userAcceptedChangeId, planId);
    assert.equal(result.status, "pr_created");
  });

  assert.equal(fixture.storedInputs.length, 1);
  assert.equal(fixture.providerInputs.length, 2);
  assert.equal(fixture.providerInputs[0]?.expectedPullRequestHeadSha, null);
  assert.equal(fixture.providerInputs[1]?.expectedPullRequestHeadSha, "a".repeat(40));
  assert.deepEqual(fixture.events, [
    "repository-settings-reconcile",
    "aws-role-diff-reconcile",
    "pull-request",
    "pr-created"
  ]);
});

test("adds a stable retry token to the same accepted handoff after pipeline failure", async () => {
  const fixture = createFixture();
  const failedHandoffId = "99999999-9999-4999-8999-999999999999";

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      createInput(),
      fixture.repository,
      fixture.provider,
      () => failedHandoffId,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: createNoopSetupActions()
      }
    );
    await fixture.repository.updateHandoffStatus(failedHandoffId, {
      status: "pipeline_failed"
    });

    fixture.events.length = 0;
    const retried = await setupGitCicdHandoff(
      { handoffId: failedHandoffId, accessContext: { kind: "user", userId } },
      fixture.repository,
      fixture.provider,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: {
          async applyRepositorySettings() {
            fixture.events.push("repository-settings-retry-pr");
          },
          async applyAwsRoleDiff() {
            fixture.events.push("aws-role-diff-retry-pr");
          }
        }
      }
    );

    assert.equal(retried.id, failedHandoffId);
    assert.equal(retried.userAcceptedChangeId, planId);
    assert.equal(retried.status, "pr_created");
    assert.equal(fixture.providerInputs[1]?.handoffId, failedHandoffId);
    assert.match(
      fixture.providerInputs[1]?.setupRetryToken ?? "",
      new RegExp(`^${failedHandoffId}:[a-f0-9]{24}$`, "u")
    );

    const firstRetryToken = fixture.providerInputs[1]?.setupRetryToken;
    await fixture.repository.updateHandoffStatus(failedHandoffId, {
      status: "pipeline_failed"
    });
    fixture.events.length = 0;
    await setupGitCicdHandoff(
      { handoffId: failedHandoffId, accessContext: { kind: "user", userId } },
      fixture.repository,
      fixture.provider,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: {
          async applyRepositorySettings() {
            fixture.events.push("repository-settings-retry-pr");
          },
          async applyAwsRoleDiff() {
            fixture.events.push("aws-role-diff-retry-pr");
          }
        }
      }
    );
    assert.equal(fixture.providerInputs[2]?.setupRetryToken, firstRetryToken);
  });

  assert.equal(fixture.storedInputs.length, 1);
  assert.deepEqual(fixture.events, [
    "repository-settings-retry-pr",
    "aws-role-diff-retry-pr",
    "pull-request",
    "pr-created"
  ]);
});

test("backfills verified setup evidence for a legacy successful handoff without creating another PR", async () => {
  const fixture = createFixture();
  const handoffId = "99999999-9999-4999-8999-999999999999";
  let setupCalls = 0;

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      createInput(),
      fixture.repository,
      fixture.provider,
      () => handoffId,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: createNoopSetupActions()
      }
    );
    await fixture.repository.updateHandoffStatus(handoffId, {
      status: "pipeline_success"
    });

    const converged = await setupGitCicdHandoff(
      { handoffId, accessContext: { kind: "user", userId } },
      fixture.repository,
      fixture.provider,
      {
        setupActions: {
          async applyRepositorySettings(_input, repository) {
            setupCalls += 1;
            const current = await repository.findHandoffById(handoffId);
            assert.ok(current?.repositorySettingsPreview);
            await repository.updateHandoffAutomationMetadata?.(handoffId, {
              repositorySettingsPreview: {
                ...current.repositorySettingsPreview,
                applied: true,
                appliedAt: "2026-07-22T02:00:00.000Z",
                verified: true
              }
            });
          },
          async applyAwsRoleDiff(_input, repository) {
            setupCalls += 1;
            const current = await repository.findHandoffById(handoffId);
            assert.ok(current?.awsRoleDiff);
            await repository.updateHandoffAutomationMetadata?.(handoffId, {
              awsRoleDiff: {
                ...current.awsRoleDiff,
                appliedAt: "2026-07-22T02:00:00.000Z",
                verified: true
              }
            });
          }
        }
      }
    );

    assert.equal(converged.status, "pipeline_success");
    assert.equal(converged.repositorySettingsPreview?.verified, true);
    assert.equal(converged.awsRoleDiff?.verified, true);

    const unchanged = await setupGitCicdHandoff(
      { handoffId, accessContext: { kind: "user", userId } },
      fixture.repository,
      fixture.provider,
      {
        setupActions: {
          async applyRepositorySettings() {
            setupCalls += 1;
          },
          async applyAwsRoleDiff() {
            setupCalls += 1;
          }
        }
      }
    );

    assert.equal(unchanged.status, "pipeline_success");
  });

  assert.equal(setupCalls, 2);
  assert.equal(fixture.providerInputs.length, 1);
});

test("legacy setup skips AWS mutation when the handoff has no AWS trust diff", async () => {
  const fixture = createFixture();
  const handoffId = "99999999-9999-4999-8999-999999999999";
  let awsSetupCalls = 0;

  await withPublicBaseUrl(async () => {
    await createGitCicdHandoff(
      createInput(),
      fixture.repository,
      fixture.provider,
      () => handoffId,
      {
        planArtifactVerifier: { async verify() { return true; } },
        setupActions: createNoopSetupActions()
      }
    );
    await fixture.repository.updateHandoffAutomationMetadata?.(handoffId, {
      awsRoleDiff: null
    });
    await fixture.repository.updateHandoffStatus(handoffId, {
      status: "pipeline_success"
    });

    const converged = await setupGitCicdHandoff(
      { handoffId, accessContext: { kind: "user", userId } },
      fixture.repository,
      fixture.provider,
      {
        setupActions: {
          async applyRepositorySettings(_input, repository) {
            const current = await repository.findHandoffById(handoffId);
            assert.ok(current?.repositorySettingsPreview);
            await repository.updateHandoffAutomationMetadata?.(handoffId, {
              repositorySettingsPreview: {
                ...current.repositorySettingsPreview,
                applied: true,
                appliedAt: "2026-07-22T02:00:00.000Z",
                verified: true
              }
            });
          },
          async applyAwsRoleDiff() {
            awsSetupCalls += 1;
          }
        }
      }
    );

    assert.equal(converged.status, "pipeline_success");
    assert.equal(converged.repositorySettingsPreview?.verified, true);
    assert.equal(converged.awsRoleDiff, null);
  });

  assert.equal(awsSetupCalls, 0);
  assert.equal(fixture.providerInputs.length, 1);
});

function createInput() {
  return {
    projectId,
    accessContext: { kind: "user" as const, userId },
    architectureId,
    terraformArtifactId,
    sourceRepositoryId,
    sourceDeploymentId,
    userAcceptedChangeId: planId
  };
}

function createNoopSetupActions() {
  return {
    async applyRepositorySettings() {},
    async applyAwsRoleDiff() {}
  };
}

function createFixture(input: { withRds?: boolean } = {}) {
  const providerInputs: GitCicdProviderCreateInput[] = [];
  const storedInputs: CreateGitCicdHandoffRecordInput[] = [];
  const events: string[] = [];
  let storedHandoff: GitCicdHandoffRecord | undefined;
  const target = createStaticSiteTarget();
  const deployment = createDeployment();
  const plan = createPlan();

  const repository = {
    async findAccessibleProject() {
      return { id: projectId, name: "Preview Project" };
    },
    async findArchitectureInProject() {
      return {
        id: architectureId,
        architectureJson: {
          nodes: input.withRds === false ? [] : [
            {
              id: "database-1",
              type: "RDS",
              positionX: 0,
              positionY: 0,
              config: { terraformResourceType: "aws_db_instance" }
            }
          ],
          edges: []
        }
      };
    },
    async findTerraformArtifactForArchitecture() {
      return {
        id: terraformArtifactId,
        projectId,
        architectureId,
        assetType: "terraform_file",
        uploadStatus: "uploaded",
        objectKey: "projects/project-1/terraform/main.tf",
        fileName: "main.tf",
        contentType: "text/plain"
      };
    },
    async findActiveSourceRepository() {
      return createSourceRepository();
    },
    async findRepositoryAnalysisTarget() {
      return { sourceRepositoryId };
    },
    async findMonitoringConfig() {
      return {
        sourceRepositoryId,
        enabled: true,
        monitorBranch: "main",
        appPath: { mode: "repository_root", path: "." },
        infraPath: { mode: "subdirectory", path: "infra" },
        validationStatus: "valid"
      };
    },
    async findProjectDeploymentTarget() {
      return target;
    },
    async findLatestSucceededDirectApplicationRelease() {
      return undefined;
    },
    async listSuccessfulDirectDeploymentsForHandoff() {
      return [deployment];
    },
    async listPlanArtifactsForHandoff() {
      return [plan];
    },
    async createHandoff(input: CreateGitCicdHandoffRecordInput) {
      storedInputs.push(input);
      events.push("draft");
      storedHandoff = {
        ...input,
        createdAt: new Date("2026-07-22T01:00:00.000Z"),
        updatedAt: new Date("2026-07-22T01:00:00.000Z")
      } as GitCicdHandoffRecord;
      return storedHandoff;
    },
    async findHandoffById() {
      return storedHandoff;
    },
    async updateHandoffStatus(_handoffId: string, update: Record<string, unknown>) {
      events.push("pr-created");
      storedHandoff = {
        ...storedHandoff,
        ...update
      } as GitCicdHandoffRecord;
      return storedHandoff;
    },
    async updateHandoffAutomationMetadata(
      _handoffId: string,
      update: {
        repositorySettingsPreview?: GitCicdHandoffRecord["repositorySettingsPreview"];
        awsRoleDiff?: GitCicdHandoffRecord["awsRoleDiff"];
      }
    ) {
      storedHandoff = {
        ...storedHandoff,
        ...update
      } as GitCicdHandoffRecord;
      return storedHandoff;
    }
  } as unknown as GitCicdHandoffRepository;

  const provider: GitCicdHandoffProvider = {
    async createHandoff(input) {
      events.push("pull-request");
      providerInputs.push(input);
      return {
        repositoryProvider: "github",
        pullRequestUrl: "https://github.com/sketchcatch/example/pull/1",
        pullRequestNumber: 1,
        pullRequestHeadSha: "a".repeat(40),
        pipelineRunUrl: null,
        status: "pr_created",
        statusMessage: null
      };
    }
  };

  return { events, provider, providerInputs, repository, storedInputs };
}

function createSourceRepository() {
  return {
    id: sourceRepositoryId,
    projectId,
    provider: "github" as const,
    status: "active" as const,
    githubInstallationId: "installation-1",
    githubRepositoryId: "repository-1",
    owner: "sketchcatch",
    name: "example",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/sketchcatch/example",
    analysisRevision: null,
    analysisResult: null,
    analyzedAt: null,
    repositoryAnalysisRevision: commitSha,
    repositoryAnalysisResult: {
      repositoryUrl: "https://github.com/sketchcatch/example",
      repositoryRevision: commitSha,
      defaultBranch: "main",
      availableBranches: ["main"],
      evidenceFiles: [],
      detectedSignals: [],
      recommendedTemplateId: null,
      recommendationReason: "",
      aiHandoff: {
        status: "template_selection_failed" as const,
        templateId: null,
        mismatchReasons: [],
        applicationUnits: [],
        evidence: [{ kind: "static_output" as const, path: "dist" }],
        missingEvidence: []
      }
    }
  };
}

function createStaticSiteTarget() {
  return {
    projectId,
    provider: "aws" as const,
    connectionId,
    region: "ap-northeast-2",
    runtimeTargetKind: "static_site" as const,
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [{ kind: "static_output" as const, path: "dist" }],
      installPreset: "npm_ci" as const,
      buildPreset: "static_export" as const,
      artifactOutputPath: "dist",
      runtimeEntrypoint: null,
      healthCheckPath: null,
      dockerfilePath: null,
      packageManifestPath: "package.json",
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: "dist",
      exactSemVerTag: null,
      manifestVersion: null,
      confirmedCommitSha: commitSha,
      confirmedAt: "2026-07-22T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "static_site" as const,
      hostingBucketName: "preview-project-site",
      cloudFrontDistributionId: "E1234567890",
      cloudFrontOriginId: "preview-project-origin",
      outputUrl: publicOutputUrl
    },
    runtimeTarget: null,
    deploymentTargetFingerprint: null,
    rolloutStrategy: "all_at_once" as const,
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    updatedAt: new Date("2026-07-22T00:00:00.000Z"),
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatch",
    awsAccountId: "123456789012"
  };
}

function createDeployment(): GitCicdHandoffApprovedDeploymentRecord {
  return {
    id: sourceDeploymentId,
    projectId,
    architectureId,
    terraformArtifactId,
    awsConnectionId: connectionId,
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    scope: "full_stack",
    targetKind: "static_site",
    source: "direct",
    status: "SUCCESS",
    completedAt: new Date("2026-07-22T00:40:00.000Z"),
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    currentPlanArtifactId: planId,
    planSummary: null,
    approvedAt: new Date("2026-07-22T00:30:00.000Z"),
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planId
  };
}

function createPlan(): GitCicdHandoffApprovedPlanArtifactRecord {
  return {
    id: planId,
    deploymentId: sourceDeploymentId,
    terraformArtifactId,
    terraformArtifactSha256: "b".repeat(64),
    operation: "apply",
    objectKey: `deployments/${sourceDeploymentId}/plans/${planId}.json`,
    sha256: "c".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: new Date("2026-07-22T00:20:00.000Z")
  };
}

async function withPublicBaseUrl(run: () => Promise<void>): Promise<void> {
  const previousValue = process.env.SKETCHCATCH_PUBLIC_BASE_URL;
  process.env.SKETCHCATCH_PUBLIC_BASE_URL = "https://sketchcatch.example.com";
  try {
    await run();
  } finally {
    if (previousValue === undefined) {
      delete process.env.SKETCHCATCH_PUBLIC_BASE_URL;
    } else {
      process.env.SKETCHCATCH_PUBLIC_BASE_URL = previousValue;
    }
  }
}
