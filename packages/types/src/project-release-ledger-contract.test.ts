import type {
  ApplicationRelease,
  ConfirmedBuildConfig,
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
  confirmedAt: "2026-07-14T00:00:00.000Z"
} satisfies ConfirmedBuildConfig;

export const projectDeploymentTargetContract = {
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  provider: "aws",
  connectionId: "abcdef12-3456-4789-8abc-def012345678",
  region: "ap-northeast-2",
  runtimeTargetKind: "ecs_fargate",
  confirmedBuildConfig,
  rolloutStrategy: "all_at_once",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z"
} satisfies ProjectDeploymentTarget;

export const applicationReleaseContract = {
  id: "87b22033-5f5e-474a-9aa5-47c5e0616d3c",
  projectId: projectDeploymentTargetContract.projectId,
  deploymentId: null,
  pipelineRunId: "a2b8df3e-d52a-4663-b0ed-7729e7fb9dd1",
  source: "gitops",
  runtimeTargetKind: "ecs_fargate",
  version: "v1.2.3",
  commitSha: confirmedBuildConfig.confirmedCommitSha,
  artifactDigestAlgorithm: "sha256",
  artifactDigest: "b".repeat(64),
  providerRevision: {
    provider: "aws",
    resourceType: "ecs_service",
    revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/api:42",
    artifactReference: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:abc",
    metadata: { desiredCount: 2 }
  },
  outputUrl: "https://api.example.com",
  status: "succeeded",
  healthEvidence: { state: "healthy", checkedAt: "2026-07-14T00:10:00.000Z" },
  rollbackEvidence: null,
  startedAt: "2026-07-14T00:00:00.000Z",
  completedAt: "2026-07-14T00:10:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:10:00.000Z"
} satisfies ApplicationRelease;
