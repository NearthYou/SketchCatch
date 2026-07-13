import assert from "node:assert/strict";
import test from "node:test";
import type { Ec2AsgGitOpsReleaseEvidence } from "@sketchcatch/types";
import {
  createAwsEc2AsgGitOpsCloudGateway,
  createEc2AsgGitOpsReleaseReconciler,
  Ec2AsgGitOpsReleaseVerificationError,
  type Ec2AsgGitOpsObservedState,
  type Ec2AsgGitOpsReleaseRecord,
  type Ec2AsgGitOpsReleaseRepository
} from "./ec2-asg-gitops-release-reconciler.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const pipelineRunId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const artifactHex = "b".repeat(64);

test("EC2 ASG reconciler persists a server-verified immutable AllAtOnce release", async () => {
  const repository = new FakeEc2AsgReleaseRepository();
  const reconciler = createEc2AsgGitOpsReleaseReconciler({
    repository,
    gateway: { inspect: async () => createObservedState() },
    createId: () => "33333333-3333-4333-8333-333333333333",
    now: () => new Date("2026-07-14T01:00:00.000Z")
  });

  const release = await reconciler.reconcile(createReconcileInput());

  assert.equal(release?.runtimeTargetKind, "ec2_asg");
  assert.equal(release?.artifactDigest, artifactHex);
  assert.equal(release?.providerRevision?.resourceType, "codedeploy_deployment");
  assert.equal(release?.providerRevision?.revisionId, "d-CURRENT123");
  assert.equal(release?.providerRevision?.metadata.targetInstanceCount, 2);
  assert.equal(release?.status, "succeeded");
  assert.deepEqual(release?.healthEvidence, {
    state: "healthy",
    activeDeploymentId: "d-CURRENT123",
    activeDeploymentStatus: "Succeeded",
    targetInstanceCount: 2,
    succeededInstanceCount: 2,
    verifiedAt: "2026-07-14T01:00:00.000Z"
  });
});

test("EC2 ASG reconciler records CodeDeploy rollback only after the previous bundle is active", async () => {
  const reconciler = createEc2AsgGitOpsReleaseReconciler({
    repository: new FakeEc2AsgReleaseRepository(),
    gateway: {
      inspect: async () => createObservedState({
        originalDeploymentStatus: "Failed",
        originalRollbackDeploymentId: "d-ROLLBACK123",
        activeRevision: previousRevision
      })
    }
  });

  const release = await reconciler.reconcile(
    createReconcileInput({
      pipelineStatus: "failed",
      evidence: createEvidence({
        outcome: "rolled_back",
        failureReason: "codedeploy_failure",
        activeDeploymentId: "d-ROLLBACK123"
      })
    })
  );

  assert.equal(release?.status, "rolled_back");
  assert.equal(release?.providerRevision?.artifactReference, "s3://release-bucket/api/previous.zip");
  assert.deepEqual(release?.rollbackEvidence, {
    attemptedDeploymentId: "d-CURRENT123",
    restoredDeploymentId: "d-ROLLBACK123",
    restoredArtifactUri: "s3://release-bucket/api/previous.zip",
    restoredArtifactVersionId: "version-previous",
    reason: "codedeploy_failure"
  });
});

test("EC2 ASG reconciler records health failure only after explicit previous-bundle restoration", async () => {
  const reconciler = createEc2AsgGitOpsReleaseReconciler({
    repository: new FakeEc2AsgReleaseRepository(),
    gateway: {
      inspect: async () => createObservedState({ activeRevision: previousRevision })
    }
  });

  const release = await reconciler.reconcile(
    createReconcileInput({
      pipelineStatus: "failed",
      evidence: createEvidence({
        outcome: "failed",
        failureReason: "health_check_failure",
        activeDeploymentId: "d-HEALTHROLLBACK123"
      })
    })
  );

  assert.equal(release?.status, "failed");
  assert.equal(
    (release?.rollbackEvidence as { reason?: string } | null)?.reason,
    "health_check_failure"
  );
  assert.equal(release?.providerRevision?.revisionId, "d-HEALTHROLLBACK123");
});

test("EC2 ASG reconciler records partial instance failure after restoring the previous bundle", async () => {
  const reconciler = createEc2AsgGitOpsReleaseReconciler({
    repository: new FakeEc2AsgReleaseRepository(),
    gateway: {
      inspect: async () => createObservedState({
        activeRevision: previousRevision,
        originalSucceededInstanceIds: ["i-1"]
      })
    }
  });

  const release = await reconciler.reconcile(
    createReconcileInput({
      pipelineStatus: "failed",
      evidence: createEvidence({
        outcome: "failed",
        failureReason: "instance_failure",
        activeDeploymentId: "d-INSTANCEROLLBACK123"
      })
    })
  );

  assert.equal(release?.status, "failed");
  assert.equal(
    (release?.rollbackEvidence as { reason?: string } | null)?.reason,
    "instance_failure"
  );
  assert.equal(release?.providerRevision?.revisionId, "d-INSTANCEROLLBACK123");
});

test("EC2 ASG reconciler verifies the claimed explicit rollback reason against original instances", async () => {
  for (const testCase of [
    {
      evidence: createEvidence({
        outcome: "failed",
        failureReason: "instance_failure",
        activeDeploymentId: "d-ROLLBACK123"
      }),
      observed: createObservedState({ activeRevision: previousRevision })
    },
    {
      evidence: createEvidence({
        outcome: "failed",
        failureReason: "health_check_failure",
        activeDeploymentId: "d-ROLLBACK123"
      }),
      observed: createObservedState({
        activeRevision: previousRevision,
        originalSucceededInstanceIds: ["i-1"]
      })
    }
  ]) {
    const reconciler = createEc2AsgGitOpsReleaseReconciler({
      repository: new FakeEc2AsgReleaseRepository(),
      gateway: { inspect: async () => testCase.observed }
    });
    await assert.rejects(
      reconciler.reconcile(
        createReconcileInput({ pipelineStatus: "failed", evidence: testCase.evidence })
      ),
      Ec2AsgGitOpsReleaseVerificationError
    );
  }
});

test("EC2 ASG reconciler rejects partial instances, wrong ASG policy, and revision drift", async () => {
  for (const observed of [
    createObservedState({ succeededInstanceIds: ["i-1"] }),
    createObservedState({ deploymentGroupAutoScalingGroupNames: ["other-asg"] }),
    createObservedState({ deploymentConfigName: "CodeDeployDefault.HalfAtATime" }),
    createObservedState({ currentArtifactDigest: "c".repeat(64) }),
    createObservedState({ healthyInServiceInstanceIds: ["i-1"] })
  ]) {
    const reconciler = createEc2AsgGitOpsReleaseReconciler({
      repository: new FakeEc2AsgReleaseRepository(),
      gateway: { inspect: async () => observed }
    });
    await assert.rejects(
      reconciler.reconcile(createReconcileInput()),
      Ec2AsgGitOpsReleaseVerificationError
    );
  }
});

test("EC2 ASG reconciler wraps provider inspection failures", async () => {
  const reconciler = createEc2AsgGitOpsReleaseReconciler({
    repository: new FakeEc2AsgReleaseRepository(),
    gateway: {
      inspect: async () => {
        throw new Error("AWS timeout");
      }
    }
  });

  await assert.rejects(
    reconciler.reconcile(createReconcileInput()),
    (error: unknown) =>
      error instanceof Ec2AsgGitOpsReleaseVerificationError &&
      error.message === "Failed to inspect EC2/CodeDeploy release state: AWS timeout"
  );
});

test("AWS EC2 ASG gateway re-queries CodeDeploy, S3, and ASG instances then destroys clients", async () => {
  let destroyedClients = 0;
  let deploymentReads = 0;
  const codeDeployClient = {
    async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === "GetDeploymentCommand") {
        deploymentReads += 1;
        return {
          deploymentInfo: {
            status: "Succeeded",
            deploymentConfigName: "CodeDeployDefault.AllAtOnce",
            applicationName: "sketchcatch-api",
            deploymentGroupName: "sketchcatch-api-asg",
            computePlatform: "Server",
            revision: {
              revisionType: "S3",
              s3Location: currentRevision
            }
          }
        };
      }
      if (command.constructor.name === "GetDeploymentGroupCommand") {
        return {
          deploymentGroupInfo: {
            deploymentConfigName: "CodeDeployDefault.AllAtOnce",
            computePlatform: "Server",
            autoScalingGroups: [{ name: "sketchcatch-api-asg" }],
            autoRollbackConfiguration: { enabled: true, events: ["DEPLOYMENT_FAILURE"] }
          }
        };
      }
      if (command.constructor.name === "ListDeploymentInstancesCommand") {
        return { instancesList: ["i-1", "i-2"] };
      }
      return {
        instancesSummary: [
          { instanceId: "i-1", status: "Succeeded" },
          { instanceId: "i-2", status: "Succeeded" }
        ]
      };
    },
    destroy() {
      destroyedClients += 1;
    }
  };
  const autoScalingClient = {
    async send() {
      return {
        AutoScalingGroups: [
          {
            AutoScalingGroupName: "sketchcatch-api-asg",
            Instances: [
              { InstanceId: "i-1", LifecycleState: "InService", HealthStatus: "Healthy" },
              { InstanceId: "i-2", LifecycleState: "InService", HealthStatus: "Healthy" }
            ]
          }
        ]
      };
    },
    destroy() {
      destroyedClients += 1;
    }
  };
  const s3Client = {
    async send() {
      return { ChecksumSHA256: Buffer.from(artifactHex, "hex").toString("base64") };
    },
    destroy() {
      destroyedClients += 1;
    }
  };
  const gateway = createAwsEc2AsgGitOpsCloudGateway({
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
    createCodeDeployClient: () => codeDeployClient as never,
    createAutoScalingClient: () => autoScalingClient as never,
    createS3Client: () => s3Client as never
  });

  const observed = await gateway.inspect({
    roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
    externalId: "external-id",
    region: "ap-northeast-2",
    codeDeployApplicationName: "sketchcatch-api",
    codeDeployDeploymentGroupName: "sketchcatch-api-asg",
    autoScalingGroupName: "sketchcatch-api-asg",
    deploymentId: "d-CURRENT123",
    activeDeploymentId: "d-CURRENT123",
    artifactUri: `s3://release-bucket/api/${artifactHex}.zip`,
    artifactVersionId: "version-current"
  });

  assert.equal(observed.currentArtifactDigest, artifactHex);
  assert.deepEqual(observed.originalTargetInstanceIds, ["i-1", "i-2"]);
  assert.deepEqual(observed.originalSucceededInstanceIds, ["i-1", "i-2"]);
  assert.deepEqual(observed.targetInstanceIds, ["i-1", "i-2"]);
  assert.deepEqual(observed.succeededInstanceIds, ["i-1", "i-2"]);
  assert.equal(deploymentReads, 2);
  assert.equal(destroyedClients, 3);
});

const currentRevision = {
  bucket: "release-bucket",
  key: `api/${artifactHex}.zip`,
  version: "version-current",
  eTag: '"etag-current"',
  bundleType: "zip"
};

const previousRevision = {
  bucket: "release-bucket",
  key: "api/previous.zip",
  version: "version-previous",
  eTag: '"etag-previous"',
  bundleType: "zip"
};

function createObservedState(
  overrides: Partial<Ec2AsgGitOpsObservedState> = {}
): Ec2AsgGitOpsObservedState {
  return {
    originalDeploymentStatus: "Succeeded",
    activeDeploymentStatus: "Succeeded",
    originalRollbackDeploymentId: null,
    originalRevision: currentRevision,
    activeRevision: currentRevision,
    currentArtifactDigest: artifactHex,
    deploymentConfigName: "CodeDeployDefault.AllAtOnce",
    codeDeployApplicationName: "sketchcatch-api",
    codeDeployDeploymentGroupName: "sketchcatch-api-asg",
    computePlatform: "Server",
    deploymentGroupAutoScalingGroupNames: ["sketchcatch-api-asg"],
    rollbackEnabled: true,
    rollbackEvents: ["DEPLOYMENT_FAILURE"],
    originalTargetInstanceIds: ["i-1", "i-2"],
    originalSucceededInstanceIds: ["i-1", "i-2"],
    targetInstanceIds: ["i-1", "i-2"],
    succeededInstanceIds: ["i-1", "i-2"],
    healthyInServiceInstanceIds: ["i-1", "i-2"],
    ...overrides
  };
}

function createEvidence(
  overrides: Partial<Ec2AsgGitOpsReleaseEvidence> = {}
): Ec2AsgGitOpsReleaseEvidence {
  return {
    schemaVersion: 1,
    runtimeTargetKind: "ec2_asg",
    outcome: "succeeded",
    failureReason: null,
    commitSha,
    artifactDigest: `sha256:${artifactHex}`,
    artifactUri: `s3://release-bucket/api/${artifactHex}.zip`,
    artifactVersionId: "version-current",
    previousArtifactUri: "s3://release-bucket/api/previous.zip",
    previousArtifactVersionId: "version-previous",
    codeDeployApplicationName: "sketchcatch-api",
    codeDeployDeploymentGroupName: "sketchcatch-api-asg",
    autoScalingGroupName: "sketchcatch-api-asg",
    deploymentId: "d-CURRENT123",
    activeDeploymentId: "d-CURRENT123",
    deploymentConfigName: "CodeDeployDefault.AllAtOnce",
    targetInstanceCount: 2,
    succeededInstanceCount: 2,
    outputUrl: "https://ec2.example.com",
    ...overrides
  };
}

function createReconcileInput(overrides: {
  pipelineStatus?: "succeeded" | "failed";
  evidence?: Ec2AsgGitOpsReleaseEvidence;
} = {}) {
  return {
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: overrides.pipelineStatus ?? "succeeded",
    startedAt: new Date("2026-07-14T00:59:00.000Z"),
    finishedAt: new Date("2026-07-14T01:00:00.000Z"),
    evidence: overrides.evidence ?? createEvidence()
  };
}

class FakeEc2AsgReleaseRepository implements Ec2AsgGitOpsReleaseRepository {
  release: Ec2AsgGitOpsReleaseRecord | null = null;

  async findVerificationTarget() {
    return {
      projectId,
      connection: {
        roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
        externalId: "external-id",
        region: "ap-northeast-2"
      },
      runtimeConfig: {
        runtimeTargetKind: "ec2_asg" as const,
        codeDeployApplicationName: "sketchcatch-api",
        codeDeployDeploymentGroupName: "sketchcatch-api-asg",
        autoScalingGroupName: "sketchcatch-api-asg",
        outputUrl: "https://ec2.example.com"
      }
    };
  }

  async upsertRelease(input: Ec2AsgGitOpsReleaseRecord) {
    this.release = input;
    return input;
  }
}
