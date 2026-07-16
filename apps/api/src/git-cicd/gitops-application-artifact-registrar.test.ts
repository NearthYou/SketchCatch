import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationArtifact, EcsGitOpsReleaseEvidence } from "@sketchcatch/types";
import type { ApplicationArtifactRegistryRepository } from "../artifacts/application-artifact-registry.js";
import {
  createGitOpsApplicationArtifactRegistrar,
  type GitOpsApplicationArtifactContextRepository
} from "./gitops-application-artifact-registrar.js";

const commitSha = "a".repeat(40);
const digest = "b".repeat(64);

test("GitOps v1 evidence registers its provider artifact through the shared claim boundary", async () => {
  let completedArtifact: ApplicationArtifact | undefined;
  const artifactRegistry = createClaimingRegistry((artifact) => {
    completedArtifact = artifact;
  });
  const registrar = createGitOpsApplicationArtifactRegistrar({
    contextRepository: createContextRepository(),
    artifactRegistry,
    createVerifier() {
      return {
        async verify(artifact) {
          return { outcome: "verified", digest: artifact.digest, location: artifact.location };
        }
      };
    },
    now: () => new Date("2026-07-16T00:00:00.000Z")
  });

  const artifact = await registrar.register({
    projectId: "project-1",
    pipelineRunId: "pipeline-1",
    commitSha,
    evidence: createEvidence()
  });

  assert.equal(artifact.id, "artifact-1");
  assert.equal(artifact.kind, "container_image");
  assert.equal(artifact.digest, digest);
  assert.equal(artifact.location.storageNamespace, "customer-api");
  assert.equal(completedArtifact?.projectId, "project-1");
});

test("GitOps v2 evidence must carry the same canonical fingerprint and provider metadata", async () => {
  const registrar = createGitOpsApplicationArtifactRegistrar({
    contextRepository: createContextRepository(),
    artifactRegistry: createClaimingRegistry(() => undefined),
    createVerifier() {
      return { async verify() { throw new Error("must not verify mismatched evidence"); } };
    }
  });
  const evidenceV1 = createEvidence();
  const evidenceV2 = {
    ...evidenceV1,
    schemaVersion: 2,
    artifact: {
      kind: "container_image",
      artifactFingerprint: "f".repeat(64),
      buildContractVersion: "application-artifact/v1",
      digestAlgorithm: "sha256",
      digest,
      location: {
        provider: "aws",
        accountId: "123456789012",
        region: "ap-northeast-2",
        storageNamespace: "customer-api",
        artifactReference: evidenceV1.imageUri,
        ownershipScope: "project:project-1"
      }
    }
  } satisfies EcsGitOpsReleaseEvidence;

  await assert.rejects(
    registrar.register({
      projectId: "project-1",
      pipelineRunId: "pipeline-1",
      commitSha,
      evidence: evidenceV2
    }),
    /fingerprint/i
  );
});

test("GitOps evidence cannot register an artifact outside the confirmed runtime namespace", async () => {
  const evidence = createEvidence();
  evidence.imageUri =
    `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/foreign-api@sha256:${digest}`;
  let verificationCalls = 0;
  const registrar = createGitOpsApplicationArtifactRegistrar({
    contextRepository: createContextRepository(),
    artifactRegistry: createClaimingRegistry(() => undefined),
    createVerifier() {
      return {
        async verify(artifact) {
          verificationCalls += 1;
          return { outcome: "verified", digest: artifact.digest, location: artifact.location };
        }
      };
    }
  });

  await assert.rejects(
    registrar.register({
      projectId: "project-1",
      pipelineRunId: "pipeline-1",
      commitSha,
      evidence
    }),
    /confirmed runtime namespace/i
  );
  assert.equal(verificationCalls, 0);
});

function createContextRepository(): GitOpsApplicationArtifactContextRepository {
  return {
    async findContext() {
      return {
        projectId: "project-1",
        sourceRepository: {
          id: "repository-1",
          provider: "github",
          owner: "NearthYou",
          name: "SketchCatch"
        },
        target: {
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
            confirmedAt: "2026-07-16T00:00:00.000Z"
          },
          runtimeConfig: {
            runtimeTargetKind: "ecs_fargate",
            codeBuildProjectName: "customer-api-build",
            ecrRepositoryName: "customer-api",
            clusterName: "customer-cluster",
            serviceName: "customer-api",
            containerName: "web",
            outputUrl: "https://api.example.com"
          }
        },
        connection: {
          accountId: "123456789012",
          roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
          externalId: "external-id",
          region: "ap-northeast-2"
        }
      };
    }
  };
}

function createClaimingRegistry(
  onComplete: (artifact: ApplicationArtifact) => void
): ApplicationArtifactRegistryRepository {
  return {
    async acquire(input) {
      return {
        outcome: "claimed",
        claim: {
          artifactId: "artifact-1",
          projectId: input.projectId,
          sourceRepositoryId: input.sourceRepositoryId,
          identity: input.identity,
          claimToken: "claim-token",
          leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs)
        }
      };
    },
    async invalidate() {},
    async renew(input) { return input.claim; },
    async complete(input) {
      const timestamp = input.completedAt.toISOString();
      const artifact: ApplicationArtifact = {
        id: input.claim.artifactId,
        projectId: input.claim.projectId,
        sourceRepositoryId: input.claim.sourceRepositoryId,
        ...input.claim.identity,
        digestAlgorithm: "sha256",
        digest: input.built.digest,
        location: input.built.location,
        status: "available",
        verifiedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      onComplete(artifact);
      return artifact;
    },
    async fail() {},
    async recordVerified(input) { return input.artifact; }
  };
}

function createEvidence(): Extract<EcsGitOpsReleaseEvidence, { schemaVersion: 1 }> {
  return {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha,
    imageDigest: `sha256:${digest}`,
    imageUri:
      `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/customer-api@sha256:${digest}`,
    clusterName: "customer-cluster",
    serviceName: "customer-api",
    containerName: "web",
    taskDefinitionArn: "task-definition",
    previousTaskDefinitionArn: "previous-task-definition",
    outputUrl: "https://api.example.com"
  };
}
