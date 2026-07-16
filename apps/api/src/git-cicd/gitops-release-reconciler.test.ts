import assert from "node:assert/strict";
import test from "node:test";
import type { EcsGitOpsReleaseEvidence } from "@sketchcatch/types";
import { ApplicationArtifactProviderVerificationError } from "../artifacts/application-artifact-registry.js";
import { createGitOpsReleaseReconciler } from "./gitops-release-reconciler.js";

test("GitOps release remains backward compatible when an unverified v1 artifact is not reusable", async () => {
  let receivedArtifactId: string | null | undefined;
  const ecs = {
    async reconcile(input: { artifactId?: string | null }) {
      receivedArtifactId = input.artifactId;
      return null;
    }
  };
  const reconciler = createGitOpsReleaseReconciler({
    ecs: ecs as never,
    lambda: ecs as never,
    ec2Asg: ecs as never,
    staticSite: ecs as never,
    artifactRegistrar: {
      async register() {
        throw new ApplicationArtifactProviderVerificationError(
          "provider ownership tag is unavailable"
        );
      }
    }
  });

  await reconciler.reconcile({
    projectId: "project-1",
    pipelineRunId: "pipeline-1",
    commitSha: "a".repeat(40),
    pipelineStatus: "succeeded",
    startedAt: null,
    finishedAt: null,
    evidence: createEvidence()
  });

  assert.equal(receivedArtifactId, null);
});

test("GitOps release links the provider-verified shared artifact", async () => {
  let receivedArtifactId: string | null | undefined;
  const runtime = {
    async reconcile(input: { artifactId?: string | null }) {
      receivedArtifactId = input.artifactId;
      return null;
    }
  };
  const reconciler = createGitOpsReleaseReconciler({
    ecs: runtime as never,
    lambda: runtime as never,
    ec2Asg: runtime as never,
    staticSite: runtime as never,
    artifactRegistrar: {
      async register() {
        const timestamp = "2026-07-16T00:00:00.000Z";
        return {
          id: "artifact-1",
          projectId: "project-1",
          sourceRepositoryId: "repository-1",
          kind: "container_image" as const,
          artifactFingerprint: "c".repeat(64),
          repositoryIdentity: "github:nearthyou/sketchcatch",
          commitSha: "a".repeat(40),
          buildConfigSha256: "d".repeat(64),
          buildContractVersion: "application-artifact/v1",
          targetOs: "linux",
          targetArchitecture: "amd64",
          buildInputIdentitySha256: "e".repeat(64),
          digestAlgorithm: "sha256" as const,
          digest: "b".repeat(64),
          location: {
            provider: "aws" as const,
            accountId: "123456789012",
            region: "ap-northeast-2",
            storageNamespace: "api",
            artifactReference: "ecr://api",
            ownershipScope: "project:project-1"
          },
          status: "available" as const,
          verifiedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      }
    }
  });

  await reconciler.reconcile({
    projectId: "project-1",
    pipelineRunId: "pipeline-1",
    commitSha: "a".repeat(40),
    pipelineStatus: "succeeded",
    startedAt: null,
    finishedAt: null,
    evidence: createEvidence()
  });

  assert.equal(receivedArtifactId, "artifact-1");
});

function createEvidence(): EcsGitOpsReleaseEvidence {
  const digest = "b".repeat(64);
  return {
    schemaVersion: 1,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha: "a".repeat(40),
    imageDigest: `sha256:${digest}`,
    imageUri: `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:${digest}`,
    clusterName: "cluster",
    serviceName: "service",
    containerName: "web",
    taskDefinitionArn: "task-definition",
    previousTaskDefinitionArn: "previous-task-definition",
    outputUrl: "https://api.example.com"
  };
}
