import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  ArchitectureRecord,
  DeploymentPlanArtifactRecord,
  DeploymentRecord,
  ProjectAssetRecord
} from "./deployment-service.js";
import {
  createProjectDeploymentStoragePrunePlan,
  defaultDeploymentRetentionPolicy,
  isDeploymentRecordPrunable,
  selectPrunableArchitectureSnapshots,
  selectPrunableProjectAssets
} from "./deployment-retention.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const awsConnectionId = "44444444-4444-4444-8444-444444444444";

test("deployment retention prunes only old records that cannot own live cleanup state", () => {
  const oldPending = createDeploymentRecord("00000000-0000-4000-8000-000000000003", {
    createdAt: date("2026-01-08")
  });
  const oldDestroyed = createDeploymentRecord("00000000-0000-4000-8000-000000000004", {
    createdAt: date("2026-01-07"),
    status: "DESTROYED"
  });
  const oldSuccess = createDeploymentRecord("00000000-0000-4000-8000-000000000005", {
    createdAt: date("2026-01-06"),
    stateObjectKey: "deployments/old-success/state/terraform.tfstate",
    status: "SUCCESS"
  });
  const oldFailedWithState = createDeploymentRecord("00000000-0000-4000-8000-000000000006", {
    createdAt: date("2026-01-05"),
    failureStage: "apply",
    stateObjectKey: "deployments/old-failed/state/terraform.tfstate",
    status: "FAILED"
  });
  const oldDestroyFailed = createDeploymentRecord("00000000-0000-4000-8000-000000000007", {
    createdAt: date("2026-01-04"),
    failureStage: "destroy",
    status: "FAILED"
  });
  const plan = createProjectDeploymentStoragePrunePlan(
    {
      architectures: [],
      deployments: [
        createDeploymentRecord("00000000-0000-4000-8000-000000000001", {
          createdAt: date("2026-01-10")
        }),
        createDeploymentRecord("00000000-0000-4000-8000-000000000002", {
          createdAt: date("2026-01-09"),
          status: "FAILED"
        }),
        oldPending,
        oldDestroyed,
        oldSuccess,
        oldFailedWithState,
        oldDestroyFailed
      ],
      planArtifacts: [
        createPlanArtifactRecord({
          deploymentId: oldPending.id,
          id: "10000000-0000-4000-8000-000000000003"
        }),
        createPlanArtifactRecord({
          deploymentId: oldDestroyed.id,
          id: "10000000-0000-4000-8000-000000000004"
        })
      ],
      projectAssets: []
    },
    {
      ...defaultDeploymentRetentionPolicy,
      maxDeploymentRecordsPerProject: 2
    }
  );

  assert.deepEqual(plan.deploymentIdsToDelete, [oldPending.id, oldDestroyed.id]);
  assert.ok(
    plan.objectKeysToDelete.includes(
      `deployments/${oldPending.id}/plans/10000000-0000-4000-8000-000000000003.tfplan`
    )
  );
  assert.ok(
    plan.objectKeysToDelete.includes(
      `deployments/${oldDestroyed.id}/plans/10000000-0000-4000-8000-000000000004.tfplan`
    )
  );
  assert.ok(
    plan.objectKeysToDelete.includes(`deployments/${oldPending.id}/state/terraform.tfstate`)
  );
  assert.ok(
    plan.objectKeysToDelete.includes(`deployments/${oldDestroyed.id}/terraform/.terraform.lock.hcl`)
  );
});

test("deployment retention prunes unreferenced terraform artifacts before unreferenced snapshots", () => {
  const protectedAssetId = "50000000-0000-4000-8000-000000000001";
  const planAssetId = "50000000-0000-4000-8000-000000000002";
  const unusedNewAssetId = "50000000-0000-4000-8000-000000000003";
  const unusedOldAssetId = "50000000-0000-4000-8000-000000000004";
  const protectedArchitectureId = "60000000-0000-4000-8000-000000000001";
  const imageArchitectureId = "60000000-0000-4000-8000-000000000002";
  const unusedNewArchitectureId = "60000000-0000-4000-8000-000000000003";
  const deletedAssetArchitectureId = "60000000-0000-4000-8000-000000000004";
  const unusedOldArchitectureId = "60000000-0000-4000-8000-000000000005";
  const deployment = createDeploymentRecord("70000000-0000-4000-8000-000000000001", {
    architectureId: protectedArchitectureId,
    terraformArtifactId: protectedAssetId
  });
  const plan = createProjectDeploymentStoragePrunePlan(
    {
      architectures: [
        createArchitectureRecord(protectedArchitectureId, date("2026-01-10")),
        createArchitectureRecord(imageArchitectureId, date("2026-01-09")),
        createArchitectureRecord(unusedNewArchitectureId, date("2026-01-08")),
        createArchitectureRecord(deletedAssetArchitectureId, date("2026-01-07")),
        createArchitectureRecord(unusedOldArchitectureId, date("2026-01-06"))
      ],
      deployments: [deployment],
      planArtifacts: [
        createPlanArtifactRecord({
          deploymentId: deployment.id,
          terraformArtifactId: planAssetId
        })
      ],
      projectAssets: [
        createProjectAssetRecord(protectedAssetId, date("2026-01-10"), {
          architectureId: protectedArchitectureId
        }),
        createProjectAssetRecord(planAssetId, date("2026-01-09")),
        createProjectAssetRecord(unusedNewAssetId, date("2026-01-08")),
        createProjectAssetRecord(unusedOldAssetId, date("2026-01-07"), {
          architectureId: deletedAssetArchitectureId
        }),
        createProjectAssetRecord("50000000-0000-4000-8000-000000000005", date("2026-01-06"), {
          architectureId: imageArchitectureId,
          assetType: "diagram_png"
        })
      ]
    },
    {
      ...defaultDeploymentRetentionPolicy,
      maxUnusedArchitectureSnapshotsPerProject: 1,
      maxUnusedTerraformArtifactsPerProject: 1
    }
  );

  assert.deepEqual(plan.terraformArtifactIdsToDelete, [unusedOldAssetId]);
  assert.deepEqual(plan.architectureIdsToDelete, [
    deletedAssetArchitectureId,
    unusedOldArchitectureId
  ]);
  assert.ok(
    plan.objectKeysToDelete.includes(
      "projects/project/assets/terraform_file/50000000-0000-4000-8000-000000000004-main.tf"
    )
  );
});

test("deployment retention protects records that can still need cleanup", () => {
  assert.equal(
    isDeploymentRecordPrunable(createDeploymentRecord("80000000-0000-4000-8000-000000000001")),
    true
  );
  assert.equal(
    isDeploymentRecordPrunable(
      createDeploymentRecord("80000000-0000-4000-8000-000000000002", {
        status: "SUCCESS",
        stateObjectKey: "deployments/live/state/terraform.tfstate"
      })
    ),
    false
  );
  assert.equal(
    isDeploymentRecordPrunable(
      createDeploymentRecord("80000000-0000-4000-8000-000000000003", {
        failureStage: "apply",
        stateObjectKey: "deployments/partial/state/terraform.tfstate",
        status: "FAILED"
      })
    ),
    false
  );
  assert.equal(
    isDeploymentRecordPrunable(
      createDeploymentRecord("80000000-0000-4000-8000-000000000004", {
        failureStage: "destroy",
        status: "FAILED"
      })
    ),
    false
  );
  assert.equal(
    isDeploymentRecordPrunable(
      createDeploymentRecord("80000000-0000-4000-8000-000000000005", {
        activeStage: "plan",
        status: "RUNNING"
      })
    ),
    false
  );
});

test("asset and architecture retention keeps the newest unused rows and protected rows", () => {
  const protectedAssetIds = new Set(["asset-protected"]);
  const protectedArchitectureIds = new Set(["architecture-protected"]);

  assert.deepEqual(
    selectPrunableProjectAssets({
      assets: [
        createProjectAssetRecord("asset-protected", date("2026-01-10")),
        createProjectAssetRecord("asset-unused-new", date("2026-01-09")),
        createProjectAssetRecord("asset-unused-old", date("2026-01-08"))
      ],
      maxUnusedAssets: 1,
      protectedAssetIds
    }).map((asset) => asset.id),
    ["asset-unused-old"]
  );
  assert.deepEqual(
    selectPrunableArchitectureSnapshots({
      architectures: [
        createArchitectureRecord("architecture-protected", date("2026-01-10")),
        createArchitectureRecord("architecture-unused-new", date("2026-01-09")),
        createArchitectureRecord("architecture-unused-old", date("2026-01-08"))
      ],
      maxUnusedArchitectures: 1,
      protectedArchitectureIds
    }).map((architecture) => architecture.id),
    ["architecture-unused-old"]
  );
});

function createDeploymentRecord(
  id: string,
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id,
    projectId,
    architectureId,
    terraformArtifactId,
    awsConnectionId,
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
    currentPlanArtifactId: null,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: date("2026-01-01"),
    updatedAt: date("2026-01-01"),
    ...overrides
  };
}

function createPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  const id = overrides.id ?? "10000000-0000-4000-8000-000000000001";
  const deploymentId = overrides.deploymentId ?? "70000000-0000-4000-8000-000000000001";

  return {
    id,
    deploymentId,
    terraformArtifactId: overrides.terraformArtifactId ?? terraformArtifactId,
    terraformArtifactSha256: "b".repeat(64),
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${id}.tfplan`,
    sha256: "a".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: date("2026-01-01"),
    ...overrides
  };
}

function createProjectAssetRecord(
  id: string,
  createdAt: Date,
  overrides: Partial<ProjectAssetRecord> = {}
): ProjectAssetRecord {
  return {
    id,
    projectId,
    architectureId: null,
    assetType: "terraform_file",
    objectKey: `projects/project/assets/terraform_file/${id}-main.tf`,
    fileName: "main.tf",
    contentType: "text/plain",
    byteSize: 128,
    uploadStatus: "uploaded",
    createdAt,
    ...overrides
  };
}

function createArchitectureRecord(id: string, createdAt: Date): ArchitectureRecord {
  return {
    id,
    projectId,
    version: 1,
    source: "manual",
    architectureJson: {
      nodes: [],
      edges: []
    },
    createdAt
  };
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
