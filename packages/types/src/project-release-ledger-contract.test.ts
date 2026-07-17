import type {
  ApplicationRelease,
  ApplicationReleaseFailureStage,
  ConfirmedBuildConfig,
  DeploymentStatus,
  ProjectDeploymentTarget
} from "./index.js";

const confirmedBuildConfig = {
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
  exactSemVerTag: "v1.2.3",
  manifestVersion: "1.2.3",
  confirmedCommitSha: "a".repeat(40),
  confirmedAt: "2026-07-14T00:00:00.000Z",
  ecsWeb: {
    api: {
      sourceRoot: "apps/api",
      dockerfilePath: "Dockerfile",
      containerPort: 3000,
      healthCheckPath: "/health"
    },
    frontend: {
      sourceRoot: "apps/web",
      packageManifestPath: "apps/web/package.json",
      lockfilePath: "pnpm-lock.yaml",
      packageManager: "pnpm",
      packageManagerVersion: "11.8.0",
      installPreset: "pnpm_frozen_lockfile",
      buildPreset: "pnpm_build",
      outputPath: "apps/web/dist"
    }
  }
} satisfies ConfirmedBuildConfig;

export const projectDeploymentTargetContract = {
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  provider: "aws",
  connectionId: "abcdef12-3456-4789-8abc-def012345678",
  region: "ap-northeast-2",
  runtimeTargetKind: "ecs_fargate",
  confirmedBuildConfig,
  runtimeConfig: {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: "audience-live-check-app-build",
    buildEnvironmentId: null,
    ecrRepositoryName: "audience-live-check-app",
    ecrRepositoryArn: null,
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service",
    containerName: "web",
    containerPort: 3000,
    taskDefinitionFamily: null,
    targetGroupArn: null,
    apiOriginUrl: null,
    frontendBucketName: null,
    cloudFrontDistributionId: null,
    cloudFrontDomainName: null,
    outputUrl: null
  },
  runtimeTarget: null,
  deploymentTargetFingerprint: null,
  rolloutStrategy: "all_at_once",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z"
} satisfies ProjectDeploymentTarget;

export const applicationReleaseContract = {
  id: "87b22033-5f5e-474a-9aa5-47c5e0616d3c",
  projectId: projectDeploymentTargetContract.projectId,
  artifactId: null,
  deploymentId: null,
  pipelineRunId: "a2b8df3e-d52a-4663-b0ed-7729e7fb9dd1",
  source: "gitops",
  runtimeTargetKind: "ecs_fargate",
  runtimeAdapterKind: null,
  deploymentTargetFingerprint: null,
  convergenceOutcome: null,
  version: "v1.2.3",
  commitSha: confirmedBuildConfig.confirmedCommitSha,
  artifactDigestAlgorithm: "sha256",
  artifactDigest: "b".repeat(64),
  releaseCandidateId: "264a8742-aa6d-424c-a393-ea2101556c81",
  compositeDigest: {
    algorithm: "sha256",
    value: "b".repeat(64),
    apiOciDigest: "c".repeat(64),
    frontendManifestDigest: "d".repeat(64)
  },
  providerRevision: {
    provider: "aws",
    resourceType: "ecs_service",
    revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/api:42",
    artifactReference: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:abc",
    metadata: { desiredCount: 2 }
  },
  frontendEvidence: {
    manifestObjectKey: "releases/project/release/frontend-manifest.json",
    manifestVersionId: "manifest-version",
    indexObjectKey: "index.html",
    indexVersionId: "index-version",
    invalidationId: "I1234567890",
    commitMarker: confirmedBuildConfig.confirmedCommitSha
  },
  failureStage: null,
  baselineReleaseId: null,
  outputUrl: "https://api.example.com",
  status: "succeeded",
  healthEvidence: { state: "healthy", checkedAt: "2026-07-14T00:10:00.000Z" },
  rollbackEvidence: null,
  startedAt: "2026-07-14T00:00:00.000Z",
  completedAt: "2026-07-14T00:10:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:10:00.000Z"
} satisfies ApplicationRelease;

export const partiallyFailedDeploymentStatus =
  "PARTIALLY_FAILED" satisfies DeploymentStatus;

export const frontendActivationFailureStage =
  "frontend_activation" satisfies ApplicationReleaseFailureStage;
