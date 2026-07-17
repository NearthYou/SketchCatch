import assert from "node:assert/strict";
import test from "node:test";
import type { EcsGitOpsReleaseEvidence, LambdaGitOpsReleaseEvidence } from "@sketchcatch/types";
import {
  GitOpsRuntimeConvergenceVerificationError,
  verifyGitOpsRuntimeConvergence
} from "./gitops-runtime-convergence.js";
import {
  EcsGitOpsReleaseVerificationError,
  createEcsGitOpsReleaseReconciler
} from "./ecs-gitops-release-reconciler.js";
import {
  LambdaGitOpsReleaseVerificationError,
  createLambdaGitOpsReleaseReconciler
} from "./lambda-gitops-release-reconciler.js";

const targetFingerprint = "b".repeat(64);
const artifactFingerprint = "c".repeat(64);
const digest = "d".repeat(64);
const evidence = createEvidence();

test("GitOps v3 convergence is accepted only against the persisted target and artifact", () => {
  assert.deepEqual(
    verifyGitOpsRuntimeConvergence({
      evidence,
      expectedAdapterKind: "ecs_service_fargate",
      expectedDeploymentTargetFingerprint: targetFingerprint
    }),
    {
      runtimeAdapterKind: "ecs_service_fargate",
      deploymentTargetFingerprint: targetFingerprint,
      convergenceOutcome: "already_active"
    }
  );

  assert.throws(
    () => verifyGitOpsRuntimeConvergence({
      evidence,
      expectedAdapterKind: "ecs_service_fargate",
      expectedDeploymentTargetFingerprint: "e".repeat(64)
    }),
    GitOpsRuntimeConvergenceVerificationError
  );
});

test("legacy GitOps evidence remains readable without claiming convergence", () => {
  assert.deepEqual(
    verifyGitOpsRuntimeConvergence({
      evidence: { ...evidence, schemaVersion: 1, artifact: undefined, convergence: undefined } as never,
      expectedAdapterKind: "ecs_service_fargate",
      expectedDeploymentTargetFingerprint: null
    }),
    {
      runtimeAdapterKind: null,
      deploymentTargetFingerprint: null,
      convergenceOutcome: null
    }
  );
});

test("v3 rollback evidence stays correlated without claiming successful convergence", () => {
  const rolledBack = {
    ...evidence,
    outcome: "rolled_back" as const,
    restoredTaskDefinitionArn:
      "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/app:1",
    convergence: {
      ...evidence.convergence,
      outcome: "rolled_out" as const,
      fallbackReason: "unhealthy" as const
    }
  };

  assert.deepEqual(
    verifyGitOpsRuntimeConvergence({
      evidence: rolledBack,
      expectedAdapterKind: "ecs_service_fargate",
      expectedDeploymentTargetFingerprint: targetFingerprint
    }),
    {
      runtimeAdapterKind: "ecs_service_fargate",
      deploymentTargetFingerprint: targetFingerprint,
      convergenceOutcome: null
    }
  );
});

test("ECS reconciler rejects convergence when the observed service is not healthy Fargate", async () => {
  const reconciler = createEcsGitOpsReleaseReconciler({
    repository: {
      async findVerificationTarget() {
        return {
          projectId: "project-1",
          connection: {
            roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
            externalId: "external-id",
            region: "ap-northeast-2"
          },
          runtimeConfig: {
            runtimeTargetKind: "ecs_fargate" as const,
            codeBuildProjectName: "app-build",
            ecrRepositoryName: "app",
            clusterName: "cluster",
            serviceName: "service",
            containerName: "web",
            outputUrl: "https://app.example.com"
          },
          deploymentTargetFingerprint: targetFingerprint
        };
      },
      async upsertRelease() {
        throw new Error("invalid observed state must not be persisted");
      }
    },
    gateway: {
      async inspect() {
        return {
          taskDefinitionArn: evidence.taskDefinitionArn,
          serviceStatus: "ACTIVE",
          desiredCount: 1,
          runningCount: 1,
          pendingCount: 0,
          deploymentCount: 1,
          fargateCapacity: false,
          minimumHealthyPercent: 0,
          maximumPercent: 100,
          circuitBreakerEnabled: true,
          circuitBreakerRollback: true,
          containerName: evidence.containerName,
          imageUri: evidence.imageUri,
          runtimeConvergenceMarker:
            `sketchcatch:artifact=${artifactFingerprint};target=${targetFingerprint}`
        };
      }
    }
  });

  await assert.rejects(
    () => reconciler.reconcile({
      projectId: "project-1",
      pipelineRunId: "pipeline-1",
      commitSha: evidence.commitSha,
      pipelineStatus: "succeeded",
      startedAt: null,
      finishedAt: new Date("2026-07-16T00:00:00.000Z"),
      evidence
    }),
    EcsGitOpsReleaseVerificationError
  );
});

test("Lambda reconciler rejects convergence when the published version is not healthy", async () => {
  const lambdaEvidence = createLambdaEvidence();
  const reconciler = createLambdaGitOpsReleaseReconciler({
    repository: {
      async findVerificationTarget() {
        return {
          projectId: "project-1",
          connection: {
            roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
            externalId: "external-id",
            region: "ap-northeast-2"
          },
          runtimeConfig: {
            runtimeTargetKind: "lambda" as const,
            functionLogicalId: "ApiFunction",
            functionName: "api-function",
            aliasName: "live",
            codeDeployApplicationName: "api-app",
            codeDeployDeploymentGroupName: "api-group",
            outputUrl: "https://lambda.example.com"
          },
          deploymentTargetFingerprint: targetFingerprint
        };
      },
      async upsertRelease() {
        throw new Error("unhealthy Lambda state must not be persisted");
      }
    },
    gateway: {
      async inspect() {
        return {
          aliasVersion: "2",
          additionalVersionWeightCount: 0,
          publishedVersion: "2",
          artifactDigest: digest,
          runtimeConvergenceMarker:
            `sketchcatch:artifact=${artifactFingerprint};target=${targetFingerprint}`,
          architecture: "x86_64",
          functionState: "Pending",
          lastUpdateStatus: "InProgress",
          deploymentStatus: "Succeeded",
          deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
          codeDeployApplicationName: "api-app",
          codeDeployDeploymentGroupName: "api-group",
          computePlatform: "Lambda",
          rollbackEnabled: true,
          rollbackEvents: ["DEPLOYMENT_FAILURE"]
        };
      }
    }
  });

  await assert.rejects(
    () => reconciler.reconcile({
      projectId: "project-1",
      pipelineRunId: "pipeline-lambda",
      commitSha: lambdaEvidence.commitSha,
      pipelineStatus: "succeeded",
      startedAt: null,
      finishedAt: new Date("2026-07-16T00:00:00.000Z"),
      evidence: lambdaEvidence
    }),
    LambdaGitOpsReleaseVerificationError
  );
});

function createEvidence(): Extract<EcsGitOpsReleaseEvidence, { schemaVersion: 3 }> {
  const imageUri = `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app@sha256:${digest}`;
  return {
    schemaVersion: 3,
    runtimeTargetKind: "ecs_fargate",
    outcome: "succeeded",
    commitSha: "a".repeat(40),
    imageDigest: `sha256:${digest}`,
    imageUri,
    clusterName: "cluster",
    serviceName: "service",
    containerName: "web",
    taskDefinitionArn: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/app:2",
    previousTaskDefinitionArn: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/app:1",
    outputUrl: "https://app.example.com",
    artifact: {
      kind: "container_image",
      artifactFingerprint,
      buildContractVersion: "application-artifact/v1",
      digestAlgorithm: "sha256",
      digest,
      location: {
        provider: "aws",
        accountId: "123456789012",
        region: "ap-northeast-2",
        storageNamespace: "app",
        artifactReference: imageUri,
        ownershipScope: "project:project-1"
      }
    },
    convergence: {
      contractVersion: "runtime-convergence/v1",
      adapterKind: "ecs_service_fargate",
      outcome: "already_active",
      deploymentTargetFingerprint: targetFingerprint,
      artifactFingerprint,
      artifactDigestAlgorithm: "sha256",
      artifactDigest: digest,
      providerStateVerifiedAt: "2026-07-16T00:00:00.000Z",
      fallbackReason: null
    }
  };
}

function createLambdaEvidence(): Extract<LambdaGitOpsReleaseEvidence, { schemaVersion: 3 }> {
  const artifactUri = `s3://release-bucket/lambda/${digest}.zip`;
  return {
    schemaVersion: 3,
    runtimeTargetKind: "lambda",
    outcome: "succeeded",
    commitSha: "a".repeat(40),
    artifactDigest: `sha256:${digest}`,
    artifactUri,
    functionName: "api-function",
    aliasName: "live",
    publishedVersion: "2",
    previousVersion: "1",
    activeVersion: "2",
    deploymentId: "d-ABC123",
    deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
    outputUrl: "https://lambda.example.com",
    artifact: {
      kind: "lambda_zip",
      artifactFingerprint,
      buildContractVersion: "application-artifact/v1",
      digestAlgorithm: "sha256",
      digest,
      location: {
        provider: "aws",
        accountId: "123456789012",
        region: "ap-northeast-2",
        storageNamespace: "release-bucket",
        artifactReference: artifactUri,
        ownershipScope: "project:project-1"
      }
    },
    convergence: {
      contractVersion: "runtime-convergence/v1",
      adapterKind: "lambda_alias",
      outcome: "rolled_out",
      deploymentTargetFingerprint: targetFingerprint,
      artifactFingerprint,
      artifactDigestAlgorithm: "sha256",
      artifactDigest: digest,
      providerStateVerifiedAt: "2026-07-16T00:00:00.000Z",
      fallbackReason: "target_mismatch"
    }
  };
}
