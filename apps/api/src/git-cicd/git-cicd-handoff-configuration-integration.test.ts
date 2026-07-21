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
  GitCicdHandoffProviderConflictError
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
      { planArtifactVerifier: { async verify() { return true; } } }
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
      { planArtifactVerifier: { async verify() { return true; } } }
    );
  });

  assert.equal(fixture.providerInputs.length, 1);
  assert.equal(fixture.providerInputs[0]?.rdsEnabled, false);
  assert.equal(fixture.providerInputs[0]?.staticSiteUrl, publicOutputUrl);
  assert.equal(fixture.providerInputs[0]?.apiBaseUrl, null);
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

function createFixture(input: { withRds?: boolean } = {}) {
  const providerInputs: GitCicdProviderCreateInput[] = [];
  const storedInputs: CreateGitCicdHandoffRecordInput[] = [];
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
      return {
        ...input,
        createdAt: new Date("2026-07-22T01:00:00.000Z"),
        updatedAt: new Date("2026-07-22T01:00:00.000Z")
      } as GitCicdHandoffRecord;
    }
  } as unknown as GitCicdHandoffRepository;

  const provider: GitCicdHandoffProvider = {
    async createHandoff(input) {
      providerInputs.push(input);
      return {
        repositoryProvider: "github",
        pullRequestUrl: "https://github.com/sketchcatch/example/pull/1",
        pipelineRunUrl: null,
        status: "pr_created",
        statusMessage: null
      };
    }
  };

  return { provider, providerInputs, repository, storedInputs };
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
