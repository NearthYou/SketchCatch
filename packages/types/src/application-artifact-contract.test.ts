import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_ARTIFACT_CONTRACT_VERSION,
  APPLICATION_ARTIFACT_KINDS,
  type ApplicationArtifact,
  type ApplicationArtifactEvidenceV2,
  type EcsGitOpsReleaseEvidence
} from "./index.js";

test("ApplicationArtifact contract exposes every provider-neutral artifact kind", () => {
  assert.equal(APPLICATION_ARTIFACT_CONTRACT_VERSION, "application-artifact/v1");
  assert.deepEqual(APPLICATION_ARTIFACT_KINDS, [
    "container_image",
    "lambda_zip",
    "codedeploy_bundle",
    "static_bundle",
    "kubernetes_manifest",
    "helm_chart",
    "machine_image"
  ]);
});

test("release evidence v2 links immutable artifact identity while v1 stays valid", () => {
  const artifactEvidence = {
    kind: "container_image",
    artifactFingerprint: "a".repeat(64),
    buildContractVersion: APPLICATION_ARTIFACT_CONTRACT_VERSION,
    digestAlgorithm: "sha256",
    digest: "b".repeat(64),
    location: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2",
      storageNamespace: "customer-api",
      artifactReference:
        "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/customer-api@sha256:" +
        "b".repeat(64),
      ownershipScope: "project:project-1"
    }
  } satisfies ApplicationArtifactEvidenceV2;

  const evidenceV2 = {
    schemaVersion: 2,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha: "c".repeat(40),
    imageDigest: "b".repeat(64),
    imageUri: artifactEvidence.location.artifactReference,
    clusterName: "cluster",
    serviceName: "service",
    containerName: "web",
    taskDefinitionArn: "task-definition",
    previousTaskDefinitionArn: "previous-task-definition",
    outputUrl: "https://example.com",
    artifact: artifactEvidence
  } satisfies EcsGitOpsReleaseEvidence;

  const evidenceV1 = {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha: "c".repeat(40),
    imageDigest: "b".repeat(64),
    imageUri: artifactEvidence.location.artifactReference,
    clusterName: "cluster",
    serviceName: "service",
    containerName: "web",
    taskDefinitionArn: "task-definition",
    previousTaskDefinitionArn: "previous-task-definition",
    outputUrl: "https://example.com"
  } satisfies EcsGitOpsReleaseEvidence;

  assert.equal(evidenceV2.schemaVersion, 2);
  assert.equal(evidenceV1.schemaVersion, 1);
});

test("ApplicationArtifact remains project-scoped metadata, separate from releases", () => {
  const artifact = {
    id: "artifact-1",
    projectId: "project-1",
    sourceRepositoryId: "repository-1",
    kind: "container_image",
    artifactFingerprint: "a".repeat(64),
    repositoryIdentity: "github:nearthyou/sketchcatch",
    commitSha: "c".repeat(40),
    buildConfigSha256: "d".repeat(64),
    buildContractVersion: APPLICATION_ARTIFACT_CONTRACT_VERSION,
    targetOs: "linux",
    targetArchitecture: "amd64",
    buildInputIdentitySha256: "e".repeat(64),
    digestAlgorithm: "sha256",
    digest: "b".repeat(64),
    location: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2",
      storageNamespace: "customer-api",
      artifactReference: "ecr://customer-api@sha256:digest",
      ownershipScope: "project:project-1"
    },
    status: "available",
    verifiedAt: "2026-07-16T00:00:00.000Z",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  } satisfies ApplicationArtifact;

  assert.equal(artifact.projectId, "project-1");
  assert.equal("bytes" in artifact, false);
});
