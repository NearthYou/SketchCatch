import assert from "node:assert/strict";
import test from "node:test";
import {
  executeGitCicdHandoffWithVerifiedInitialRelease,
  GitCicdInitialApplicationReleaseRequiredError,
  type GitCicdHandoffApprovedDeploymentRecord,
  type GitCicdHandoffApprovedPlanArtifactRecord,
  type GitCicdHandoffDeploymentTargetRecord,
  type GitCicdHandoffRepository
} from "./git-cicd-handoff-service.js";
import type { GitCicdReadinessApplicationReleaseRecord } from "./git-cicd-readiness-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const deploymentId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";
const commitSha = "a".repeat(40);
const fingerprint = "b".repeat(64);
const outputUrl = "https://d111111abcdef8.cloudfront.net";

test("blocks CI/CD provider invocation when the initial application release is missing", async () => {
  const target = createTarget();
  const repository = createRepository(target, undefined);
  let providerCalls = 0;

  await assert.rejects(
    executeGitCicdHandoffWithVerifiedInitialRelease(
      createInput(target),
      repository,
      { async verify() { return true; } },
      async () => {
        providerCalls += 1;
        return "created";
      }
    ),
    (error: unknown) =>
      error instanceof GitCicdInitialApplicationReleaseRequiredError &&
      error.code === "GIT_CICD_INITIAL_APPLICATION_RELEASE_REQUIRED" &&
      error.message === "최초 앱 배포를 완료한 뒤 CI/CD 설치 PR을 생성해 주세요."
  );
  assert.equal(providerCalls, 0);
});

test("invokes the provider only after revalidating the current target and initial release", async () => {
  const target = createTarget();
  const repository = createRepository(target, createRelease());
  let providerCalls = 0;

  const result = await executeGitCicdHandoffWithVerifiedInitialRelease(
    createInput(target),
    repository,
    { async verify() { return true; } },
    async (evidence) => {
      providerCalls += 1;
      return evidence.deployment.id;
    }
  );

  assert.equal(result, deploymentId);
  assert.equal(providerCalls, 1);
});

test("does not apply the ECS initial release gate to other runtime handoffs", async () => {
  const target = {
    ...createTarget(),
    runtimeTargetKind: "lambda"
  } as unknown as GitCicdHandoffDeploymentTargetRecord;
  const repository = createRepository(target, undefined);
  let providerCalls = 0;

  const result = await executeGitCicdHandoffWithVerifiedInitialRelease(
    createInput(target),
    repository,
    { async verify() { return true; } },
    async () => {
      providerCalls += 1;
      return "created";
    }
  );

  assert.equal(result, "created");
  assert.equal(providerCalls, 1);
});

function createInput(target: GitCicdHandoffDeploymentTargetRecord) {
  return {
    projectId,
    architectureId: "44444444-4444-4444-8444-444444444444",
    terraformArtifactId: "55555555-5555-4555-8555-555555555555",
    sourceDeploymentId: deploymentId,
    userAcceptedChangeId: planId,
    userId: "66666666-6666-4666-8666-666666666666",
    connectionId: "77777777-7777-4777-8777-777777777777",
    accountId: "123456789012",
    region: "ap-northeast-2",
    expectedTarget: target
  };
}

function createRepository(
  target: GitCicdHandoffDeploymentTargetRecord,
  release: GitCicdReadinessApplicationReleaseRecord | undefined
): Pick<
  GitCicdHandoffRepository,
  | "listSuccessfulDirectDeploymentsForHandoff"
  | "listPlanArtifactsForHandoff"
  | "findProjectDeploymentTarget"
  | "findLatestSucceededDirectApplicationRelease"
> {
  return {
    async listSuccessfulDirectDeploymentsForHandoff() {
      return [createDeployment()];
    },
    async listPlanArtifactsForHandoff() {
      return [createPlan()];
    },
    async findProjectDeploymentTarget() {
      return target;
    },
    async findLatestSucceededDirectApplicationRelease() {
      return release;
    }
  };
}

function createDeployment(): GitCicdHandoffApprovedDeploymentRecord {
  return {
    id: deploymentId,
    projectId,
    architectureId: "44444444-4444-4444-8444-444444444444",
    terraformArtifactId: "55555555-5555-4555-8555-555555555555",
    awsConnectionId: "77777777-7777-4777-8777-777777777777",
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    scope: "full_stack",
    targetKind: "ecs_fargate",
    source: "direct",
    status: "SUCCESS",
    completedAt: new Date("2026-07-17T01:00:00Z"),
    createdAt: new Date("2026-07-17T00:00:00Z"),
    currentPlanArtifactId: planId,
    planSummary: null,
    approvedAt: new Date("2026-07-17T00:30:00Z"),
    approvedByUserId: "66666666-6666-4666-8666-666666666666",
    approvedTerraformArtifactId: "55555555-5555-4555-8555-555555555555",
    approvedPlanArtifactId: planId
  };
}

function createPlan(): GitCicdHandoffApprovedPlanArtifactRecord {
  return {
    id: planId,
    deploymentId,
    terraformArtifactId: "55555555-5555-4555-8555-555555555555",
    terraformArtifactSha256: "c".repeat(64),
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planId}.tfplan`,
    sha256: "d".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: new Date("2026-07-17T00:20:00Z")
  };
}

function createTarget(): GitCicdHandoffDeploymentTargetRecord {
  return {
    projectId,
    provider: "aws",
    connectionId: "77777777-7777-4777-8777-777777777777",
    region: "ap-northeast-2",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: null,
      confirmedCommitSha: commitSha,
      confirmedAt: "2026-07-17T00:00:00.000Z"
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "app-build",
      ecrRepositoryName: "app",
      clusterName: "cluster",
      serviceName: "service",
      containerName: "web",
      outputUrl
    },
    runtimeTarget: null,
    deploymentTargetFingerprint: fingerprint,
    rolloutStrategy: "all_at_once",
    createdAt: new Date("2026-07-17T00:00:00Z"),
    updatedAt: new Date("2026-07-17T00:00:00Z"),
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatch",
    awsAccountId: "123456789012"
  };
}

function createRelease(): GitCicdReadinessApplicationReleaseRecord {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    projectId,
    deploymentId,
    source: "direct",
    status: "succeeded",
    runtimeTargetKind: "ecs_fargate",
    deploymentTargetFingerprint: fingerprint,
    commitSha,
    releaseCandidateId: "99999999-9999-4999-8999-999999999999",
    compositeDigest: {
      algorithm: "sha256",
      value: "1".repeat(64),
      apiOciDigest: "2".repeat(64),
      frontendManifestDigest: "3".repeat(64)
    },
    outputUrl,
    healthEvidence: { state: "healthy" },
    frontendEvidence: {
      manifestObjectKey: "release/manifest.json",
      manifestVersionId: "manifest-version",
      indexObjectKey: "index.html",
      indexVersionId: "index-version",
      invalidationId: "invalidation-id",
      commitMarker: commitSha
    },
    completedAt: new Date("2026-07-17T02:00:00Z"),
    deploymentScope: "full_stack",
    deploymentSource: "direct",
    deploymentStatus: "SUCCESS",
    deploymentCompletedAt: new Date("2026-07-17T02:00:00Z")
  };
}
