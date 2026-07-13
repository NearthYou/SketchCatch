import assert from "node:assert/strict";
import test from "node:test";
import type { LambdaGitOpsReleaseEvidence } from "@sketchcatch/types";
import {
  createAwsLambdaGitOpsCloudGateway,
  createLambdaGitOpsReleaseReconciler,
  LambdaGitOpsReleaseVerificationError,
  type LambdaGitOpsObservedState,
  type LambdaGitOpsReleaseRecord,
  type LambdaGitOpsReleaseRepository
} from "./lambda-gitops-release-reconciler.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const pipelineRunId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const artifactHex = "b".repeat(64);

test("Lambda reconciler persists a server-verified immutable alias release", async () => {
  const repository = new FakeLambdaReleaseRepository();
  const observed = createObservedState();
  const reconciler = createLambdaGitOpsReleaseReconciler({
    repository,
    gateway: { inspect: async () => observed },
    createId: () => "33333333-3333-4333-8333-333333333333",
    now: () => new Date("2026-07-14T01:00:00.000Z")
  });

  const release = await reconciler.reconcile({
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: "succeeded",
    startedAt: new Date("2026-07-14T00:59:00.000Z"),
    finishedAt: new Date("2026-07-14T01:00:00.000Z"),
    evidence: createEvidence()
  });

  assert.equal(release?.runtimeTargetKind, "lambda");
  assert.equal(release?.artifactDigest, artifactHex);
  assert.equal(release?.providerRevision?.resourceType, "lambda_alias");
  assert.equal(release?.providerRevision?.revisionId, "sketchcatch-api:live:42");
  assert.equal(release?.providerRevision?.metadata.deploymentConfigName, "CodeDeployDefault.LambdaAllAtOnce");
  assert.equal(release?.status, "succeeded");
  assert.deepEqual(release?.healthEvidence, {
    state: "healthy",
    aliasVersion: "42",
    publishedVersion: "42",
    deploymentStatus: "Succeeded",
    verifiedAt: "2026-07-14T01:00:00.000Z"
  });
});

test("Lambda reconciler records a failed deployment only after the previous alias is restored", async () => {
  const repository = new FakeLambdaReleaseRepository();
  const reconciler = createLambdaGitOpsReleaseReconciler({
    repository,
    gateway: {
      inspect: async () => createObservedState({ aliasVersion: "41", deploymentStatus: "Failed" })
    }
  });

  const release = await reconciler.reconcile({
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: "failed",
    startedAt: null,
    finishedAt: new Date("2026-07-14T01:00:00.000Z"),
    evidence: createEvidence({ outcome: "rolled_back", activeVersion: "41" })
  });

  assert.equal(release?.status, "rolled_back");
  assert.equal(release?.providerRevision?.revisionId, "sketchcatch-api:live:41");
  assert.deepEqual(release?.rollbackEvidence, {
    attemptedVersion: "42",
    restoredVersion: "41",
    deploymentId: "d-ABCDEFGHI",
    reason: "codedeploy_failure"
  });
});

test("Lambda reconciler records health failure only after the alias is explicitly restored", async () => {
  const reconciler = createLambdaGitOpsReleaseReconciler({
    repository: new FakeLambdaReleaseRepository(),
    gateway: {
      inspect: async () => createObservedState({ aliasVersion: "41" })
    }
  });

  const release = await reconciler.reconcile({
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: "failed",
    startedAt: null,
    finishedAt: null,
    evidence: createEvidence({ outcome: "failed", activeVersion: "41" })
  });

  assert.equal(release?.status, "failed");
  assert.equal(release?.providerRevision?.revisionId, "sketchcatch-api:live:41");
  assert.deepEqual(release?.rollbackEvidence, {
    attemptedVersion: "42",
    restoredVersion: "41",
    deploymentId: "d-ABCDEFGHI",
    reason: "health_check_failure"
  });
});

test("Lambda reconciler rejects target drift, non-AllAtOnce config, and incomplete rollback", async () => {
  for (const observed of [
    createObservedState({ deploymentConfigName: "CodeDeployDefault.LambdaCanary10Percent5Minutes" }),
    createObservedState({ rollbackEnabled: false }),
    createObservedState({ aliasVersion: "42", deploymentStatus: "Failed" })
  ]) {
    const reconciler = createLambdaGitOpsReleaseReconciler({
      repository: new FakeLambdaReleaseRepository(),
      gateway: { inspect: async () => observed }
    });
    await assert.rejects(
      reconciler.reconcile({
        projectId,
        pipelineRunId,
        commitSha,
        pipelineStatus: "failed",
        startedAt: null,
        finishedAt: null,
        evidence: createEvidence({ outcome: "rolled_back", activeVersion: "41" })
      }),
      LambdaGitOpsReleaseVerificationError
    );
  }
});

test("AWS Lambda gateway re-queries alias, version, deployment, and rollback policy then destroys clients", async () => {
  let destroyedClients = 0;
  const lambdaClient = {
    async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === "GetAliasCommand") {
        return { FunctionVersion: "42", RoutingConfig: { AdditionalVersionWeights: {} } };
      }
      return {
        Configuration: {
          Version: "42",
          CodeSha256: Buffer.from(artifactHex, "hex").toString("base64")
        }
      };
    },
    destroy() {
      destroyedClients += 1;
    }
  };
  const codeDeployClient = {
    async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === "GetDeploymentCommand") {
        return {
          deploymentInfo: {
            status: "Succeeded",
            deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
            applicationName: "sketchcatch-api",
            deploymentGroupName: "sketchcatch-api-live",
            computePlatform: "Lambda"
          }
        };
      }
      return {
        deploymentGroupInfo: {
          deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
          autoRollbackConfiguration: {
            enabled: true,
            events: ["DEPLOYMENT_FAILURE"]
          }
        }
      };
    },
    destroy() {
      destroyedClients += 1;
    }
  };
  const gateway = createAwsLambdaGitOpsCloudGateway({
    stsGateway: {
      async assumeRole() {
        return {
          accessKeyId: "test-access-key",
          secretAccessKey: "test-secret-key",
          sessionToken: "test-session-token",
          expiration: new Date("2026-07-14T02:00:00.000Z")
        };
      }
    },
    createLambdaClient: () => lambdaClient as never,
    createCodeDeployClient: () => codeDeployClient as never
  });

  const observed = await gateway.inspect({
    roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
    externalId: "external-id",
    region: "ap-northeast-2",
    functionName: "sketchcatch-api",
    aliasName: "live",
    publishedVersion: "42",
    codeDeployApplicationName: "sketchcatch-api",
    codeDeployDeploymentGroupName: "sketchcatch-api-live",
    deploymentId: "d-ABCDEFGHI"
  });

  assert.equal(observed.artifactDigest, artifactHex);
  assert.equal(observed.aliasVersion, "42");
  assert.equal(observed.computePlatform, "Lambda");
  assert.equal(destroyedClients, 2);
});

class FakeLambdaReleaseRepository implements LambdaGitOpsReleaseRepository {
  release: LambdaGitOpsReleaseRecord | null = null;

  async findVerificationTarget() {
    return {
      projectId,
      connection: {
        roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
        externalId: "external-id",
        region: "ap-northeast-2"
      },
      runtimeConfig: {
        runtimeTargetKind: "lambda" as const,
        functionLogicalId: "ApiFunction",
        functionName: "sketchcatch-api",
        aliasName: "live",
        codeDeployApplicationName: "sketchcatch-api",
        codeDeployDeploymentGroupName: "sketchcatch-api-live",
        outputUrl: "https://lambda.example.com"
      }
    };
  }

  async upsertRelease(input: LambdaGitOpsReleaseRecord) {
    this.release = input;
    return input;
  }
}

function createEvidence(
  overrides: Partial<LambdaGitOpsReleaseEvidence> = {}
): LambdaGitOpsReleaseEvidence {
  return {
    schemaVersion: 1,
    runtimeTargetKind: "lambda",
    outcome: "succeeded",
    commitSha,
    artifactDigest: `sha256:${artifactHex}`,
    artifactUri: `s3://sketchcatch-release/lambda/${commitSha}/${artifactHex}.zip`,
    functionName: "sketchcatch-api",
    aliasName: "live",
    publishedVersion: "42",
    previousVersion: "41",
    activeVersion: "42",
    deploymentId: "d-ABCDEFGHI",
    deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
    outputUrl: "https://lambda.example.com",
    ...overrides
  };
}

function createObservedState(
  overrides: Partial<LambdaGitOpsObservedState> = {}
): LambdaGitOpsObservedState {
  return {
    aliasVersion: "42",
    additionalVersionWeightCount: 0,
    publishedVersion: "42",
    artifactDigest: artifactHex,
    deploymentStatus: "Succeeded",
    deploymentConfigName: "CodeDeployDefault.LambdaAllAtOnce",
    codeDeployApplicationName: "sketchcatch-api",
    codeDeployDeploymentGroupName: "sketchcatch-api-live",
    computePlatform: "Lambda",
    rollbackEnabled: true,
    rollbackEvents: ["DEPLOYMENT_FAILURE"],
    ...overrides
  };
}
