import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationArtifact } from "@sketchcatch/types";
import {
  recordApplicationRelease,
  ReleaseLedgerConflictError,
  type ApplicationReleaseRecord,
  type CreateApplicationReleaseRecordInput,
  type ProjectReleaseLedgerRepository
} from "./project-release-ledger-service.js";

const projectId = "project-1";
const commitSha = "a".repeat(40);
const digest = "b".repeat(64);

test("ApplicationRelease rejects an artifact kind that does not match its runtime", async () => {
  let createCalls = 0;
  const repository = {
    async findAccessibleProject() { return { id: projectId }; },
    async findProjectDeploymentTarget() {
      return { provider: "aws", runtimeTargetKind: "ecs_fargate" };
    },
    async findPipelineRunInProject() { return { id: "pipeline-1" }; },
    async findAvailableApplicationArtifact() {
      return createArtifact("lambda_zip");
    },
    async createApplicationRelease(input: CreateApplicationReleaseRecordInput) {
      createCalls += 1;
      return {
        ...input,
        artifactDigestAlgorithm: "sha256"
      } as ApplicationReleaseRecord;
    }
  } as unknown as ProjectReleaseLedgerRepository;

  await assert.rejects(
    recordApplicationRelease(
      {
        projectId,
        userId: "user-1",
        artifactId: "artifact-1",
        deploymentId: null,
        pipelineRunId: "pipeline-1",
        source: "gitops",
        runtimeTargetKind: "ecs_fargate",
        versionEvidence: {
          exactSemVerTag: null,
          manifestVersion: null,
          commitSha
        },
        artifactDigest: digest,
        providerRevision: {
          provider: "aws",
          resourceType: "application_artifact",
          revisionId: "artifact-1",
          artifactReference: "provider://artifact-1",
          metadata: {}
        },
        outputUrl: "https://api.example.com",
        status: "succeeded",
        healthEvidence: { state: "healthy" },
        rollbackEvidence: null,
        startedAt: null,
        completedAt: new Date("2026-07-16T00:00:00.000Z")
      },
      repository
    ),
    ReleaseLedgerConflictError
  );
  assert.equal(createCalls, 0);
});

function createArtifact(kind: ApplicationArtifact["kind"]): ApplicationArtifact {
  const timestamp = "2026-07-16T00:00:00.000Z";
  return {
    id: "artifact-1",
    projectId,
    sourceRepositoryId: "repository-1",
    kind,
    artifactFingerprint: "c".repeat(64),
    repositoryIdentity: "github:nearthyou/sketchcatch",
    commitSha,
    buildConfigSha256: "d".repeat(64),
    buildContractVersion: "application-artifact/v1",
    targetOs: "linux",
    targetArchitecture: "amd64",
    buildInputIdentitySha256: "e".repeat(64),
    digestAlgorithm: "sha256",
    digest,
    location: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2",
      storageNamespace: "artifacts",
      artifactReference: "provider://artifact-1",
      ownershipScope: `project:${projectId}`
    },
    status: "available",
    verifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
