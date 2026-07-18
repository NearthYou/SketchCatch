import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../db/client.js";
import {
  awsConnections,
  architectures,
  deployedResources,
  deploymentJobs,
  deploymentLogs,
  deploymentPlanArtifacts,
  deployments,
  gitCicdHandoffs,
  projectAssets,
  projectDrafts,
  projectBuildEnvironments,
  projectExecutionLeases,
  projects,
  releaseCandidates,
  terraformOutputs
} from "../db/schema.js";
import {
  createProjectDeletePreview,
  deleteProjectRecords,
  ProjectDeletionManagedCleanupError,
  type ProjectDeleteSnapshot
} from "./project-deletion-service.js";

const projectId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const fixedDate = new Date("2026-06-24T00:00:00.000Z");

test("createProjectDeletePreview exposes both delete choices for one active deployment", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-success",
          resourceCount: 2,
          stateObjectKey: "deployments/deployment-success/state/terraform.tfstate",
          status: "SUCCESS"
        })
      ]
    })
  );

  assert.equal(preview.mode, "active_resources");
  assert.equal(preview.activeDeploymentId, "deployment-success");
  assert.equal(preview.activeResourceCount, 2);
  assert.deepEqual(preview.availableActions, ["destroy_then_delete", "delete_project_only"]);
});

test("createProjectDeletePreview does not offer destroy before Terraform state is available", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-success-without-state",
          resourceCount: 1,
          stateObjectKey: null,
          status: "SUCCESS"
        })
      ]
    })
  );

  assert.equal(preview.mode, "active_resources");
  assert.equal(preview.activeDeploymentId, null);
  assert.equal(preview.activeResourceCount, 1);
  assert.deepEqual(preview.availableActions, ["delete_project_only"]);
  assert.match(preview.message, /Terraform state/);
});

test("createProjectDeletePreview still offers destroy for application deployments without Terraform state", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "application-deployment",
          resourceCount: 1,
          scope: "application",
          stateObjectKey: null,
          status: "SUCCESS"
        })
      ]
    })
  );

  assert.equal(preview.activeDeploymentId, "application-deployment");
  assert.deepEqual(preview.availableActions, ["destroy_then_delete", "delete_project_only"]);
});

test("createProjectDeletePreview blocks deletion while a deployment is running", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          activeStage: "apply",
          id: "deployment-running",
          status: "RUNNING"
        })
      ]
    })
  );

  assert.equal(preview.mode, "blocked_running_deployment");
  assert.deepEqual(preview.availableActions, []);
});

test("createProjectDeletePreview blocks deletion while a project release lease is active", () => {
  const preview = createProjectDeletePreview(createSnapshot({ hasActiveExecutionLease: true }));

  assert.equal(preview.mode, "blocked_running_deployment");
  assert.deepEqual(preview.availableActions, []);
  assert.match(preview.message, /릴리즈|배포/);
});

test("createProjectDeletePreview blocks deletion while a deployment worker job is active", () => {
  const preview = createProjectDeletePreview(createSnapshot({ hasActiveDeploymentJob: true }));

  assert.equal(preview.mode, "blocked_running_deployment");
  assert.deepEqual(preview.availableActions, []);
  assert.match(preview.message, /릴리즈|배포/);
});

test("createProjectDeletePreview blocks automatic destroy when multiple deployments need cleanup", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-success",
          resourceCount: 1,
          status: "SUCCESS"
        }),
        createDeploymentSummary({
          id: "deployment-failed",
          stateObjectKey: "deployments/deployment-failed/state/terraform.tfstate",
          status: "FAILED"
        })
      ]
    })
  );

  assert.equal(preview.mode, "blocked_multiple_active_deployments");
  assert.deepEqual(preview.availableActions, ["delete_project_only"]);
});

test("createProjectDeletePreview treats failed state as cleaned up after a later destroy", () => {
  const failedAt = new Date("2026-06-24T00:00:00.000Z");
  const destroyedAt = new Date("2026-06-25T00:00:00.000Z");
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          completedAt: destroyedAt,
          createdAt: destroyedAt,
          id: "deployment-destroyed",
          status: "DESTROYED",
          updatedAt: destroyedAt
        }),
        createDeploymentSummary({
          createdAt: failedAt,
          id: "deployment-failed",
          stateObjectKey: "deployments/deployment-failed/state/terraform.tfstate",
          status: "FAILED",
          updatedAt: new Date("2026-06-26T00:00:00.000Z")
        })
      ]
    })
  );

  assert.equal(preview.mode, "deployment_history");
  assert.equal(preview.activeResourceCount, 0);
  assert.deepEqual(preview.availableActions, ["delete_project"]);
});

test("createProjectDeletePreview treats current plan pointers as planned projects", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          currentPlanArtifactId: "plan-artifact-id",
          id: "deployment-planned",
          status: "PENDING"
        })
      ]
    })
  );

  assert.equal(preview.mode, "planned");
  assert.equal(preview.hasPlanHistory, true);
  assert.deepEqual(preview.availableActions, ["delete_project"]);
});

test("createProjectDeletePreview treats destroyed deployments as deployment history", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-destroyed",
          status: "DESTROYED"
        })
      ]
    })
  );

  assert.equal(preview.mode, "deployment_history");
  assert.equal(preview.hasDeploymentHistory, true);
  assert.deepEqual(preview.availableActions, ["delete_project"]);
});

test("deleteProjectRecords removes Git/CI/CD handoffs before deleting referenced assets and architectures", async () => {
  const fakeDb = new FakeProjectDeletionDb({
    deployments: [
      {
        ...createDeploymentSummary({
          id: "deployment-destroyed",
          status: "DESTROYED"
        }),
        architectureId: "architecture-id",
        terraformArtifactId: "terraform-artifact-id"
      }
    ],
    projectAssets: [
      {
        id: "terraform-artifact-id",
        objectKey: "projects/project-id/artifacts/main.tf"
      }
    ]
  });

  const deletedObjectKeys: string[] = [];

  await deleteProjectRecords({
    action: "delete_project",
    db: fakeDb.db,
    deletionGuard: fakeDb.deletionGuard,
    projectId,
    storage: {
      async deleteObject(objectKey) {
        deletedObjectKeys.push(objectKey);
      }
    },
    userId
  });

  const handoffDeleteIndex = fakeDb.operations.indexOf("delete:git_cicd_handoffs");
  const deploymentDeleteIndex = fakeDb.operations.indexOf("delete:deployments");
  const assetDeleteIndex = fakeDb.operations.indexOf("delete:project_assets");
  const architectureDeleteIndex = fakeDb.operations.indexOf("delete:architectures");

  assert.deepEqual(deletedObjectKeys, [
    "deployments/deployment-destroyed/state/terraform.tfstate",
    "deployments/deployment-destroyed/terraform/.terraform.lock.hcl",
    "projects/project-id/artifacts/main.tf"
  ]);
  assert.notEqual(handoffDeleteIndex, -1);
  assert(handoffDeleteIndex < deploymentDeleteIndex);
  assert(handoffDeleteIndex < assetDeleteIndex);
  assert(handoffDeleteIndex < architectureDeleteIndex);
});

test("deleteProjectRecords removes every project and deployment artifact prefix before database rows", async () => {
  const fakeDb = new FakeProjectDeletionDb({
    deployments: [
      {
        ...createDeploymentSummary({
          id: "deployment-1",
          status: "DESTROYED"
        }),
        architectureId: "architecture-id",
        terraformArtifactId: "terraform-artifact-id"
      },
      {
        ...createDeploymentSummary({
          id: "deployment-2",
          status: "DESTROYED"
        }),
        architectureId: "architecture-id",
        terraformArtifactId: "terraform-artifact-id"
      }
    ]
  });
  const deletedPrefixes: string[] = [];

  await deleteProjectRecords({
    action: "delete_project",
    db: fakeDb.db,
    deletionGuard: fakeDb.deletionGuard,
    projectId,
    storage: {
      async deleteObject() {
        throw new Error("exact object deletion must be skipped when prefix deletion is supported");
      },
      async deletePrefix({ prefix }) {
        deletedPrefixes.push(prefix);
        fakeDb.operations.push(`delete-prefix:${prefix}`);
      }
    },
    userId
  });

  assert.deepEqual(deletedPrefixes, [
    `projects/${projectId}/`,
    "deployments/deployment-1/",
    "deployments/deployment-2/"
  ]);
  assert(
    fakeDb.operations.indexOf("delete-prefix:deployments/deployment-2/") <
      fakeDb.operations.indexOf("delete:projects")
  );
});

test("deleteProjectRecords preserves database rows when artifact prefix cleanup fails", async () => {
  const fakeDb = new FakeProjectDeletionDb({
    deployments: [
      createDeploymentSummary({
        id: "deployment-1",
        status: "DESTROYED"
      })
    ]
  });

  await assert.rejects(
    deleteProjectRecords({
      action: "delete_project",
      db: fakeDb.db,
      deletionGuard: fakeDb.deletionGuard,
      projectId,
      storage: {
        async deleteObject() {},
        async deletePrefix() {
          throw new Error("AccessDenied");
        }
      },
      userId
    }),
    /S3.*산출물/
  );

  assert.equal(fakeDb.operations.includes("delete:projects"), false);
  assert.equal(fakeDb.operations.includes("mark-cleanup-failed:projects"), true);
});

test("deleteProjectRecords preserves the storage error that caused managed cleanup to fail", async () => {
  const fakeDb = new FakeProjectDeletionDb({
    deployments: [
      createDeploymentSummary({
        id: "deployment-1",
        status: "DESTROYED"
      })
    ]
  });
  const storageError = new Error("AccessDenied");
  storageError.name = "AccessDenied";

  await assert.rejects(
    deleteProjectRecords({
      action: "delete_project",
      db: fakeDb.db,
      deletionGuard: fakeDb.deletionGuard,
      projectId,
      storage: {
        async deleteObject() {},
        async deletePrefix() {
          throw storageError;
        }
      },
      userId
    }),
    (error: unknown) => {
      assert(error instanceof ProjectDeletionManagedCleanupError);
      assert.equal(error.cause, storageError);
      return true;
    }
  );
});
test("deleteProjectRecords cleans the project CodeBuild environment before deleting database records", async () => {
  const fakeDb = new FakeProjectDeletionDb({
    awsConnections: [
      {
        id: "connection-1",
        userId,
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        externalId: "external-id",
        region: "ap-northeast-2"
      }
    ],
    projectBuildEnvironments: [
      {
        projectId,
        awsConnectionId: "connection-1",
        codeBuildProjectName: "sketchcatch-project-build",
        codeBuildServiceRoleArn: "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-project"
      }
    ]
  });

  await deleteProjectRecords({
    action: "delete_project",
    db: fakeDb.db,
    deletionGuard: fakeDb.deletionGuard,
    projectId,
    storage: { async deleteObject() {} },
    userId,
    async cleanupManagedResources(input) {
      fakeDb.operations.push("cleanup:managed-build-environment");
      assert.equal(input.resources.codeBuildProjects[0]?.projectName, "sketchcatch-project-build");
      assert.equal(input.resources.codeConnectionArn, null);
    }
  });

  assert(
    fakeDb.operations.indexOf("claim:projects") !== -1 &&
      fakeDb.operations.indexOf("claim:projects") <
        fakeDb.operations.indexOf("cleanup:managed-build-environment") &&
      fakeDb.operations.indexOf("cleanup:managed-build-environment") !== -1 &&
      fakeDb.operations.indexOf("cleanup:managed-build-environment") <
        fakeDb.operations.indexOf("delete:projects")
  );
});

test("deleteProjectRecords preserves project records when managed AWS cleanup fails", async () => {
  const fakeDb = new FakeProjectDeletionDb({
    awsConnections: [
      {
        id: "connection-1",
        userId,
        roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
        externalId: "external-id",
        region: "ap-northeast-2"
      }
    ],
    projectBuildEnvironments: [
      {
        projectId,
        awsConnectionId: "connection-1",
        codeBuildProjectName: "sketchcatch-project-build",
        codeBuildServiceRoleArn: "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-project"
      }
    ]
  });

  await assert.rejects(
    deleteProjectRecords({
      action: "delete_project",
      db: fakeDb.db,
      deletionGuard: fakeDb.deletionGuard,
      projectId,
      storage: { async deleteObject() {} },
      userId,
      async cleanupManagedResources() {
        throw new Error("AccessDenied");
      }
    }),
    /CodeBuild/i
  );

  assert.equal(fakeDb.operations.includes("delete:projects"), false);
  assert.equal(fakeDb.operations.includes("mark-cleanup-failed:projects"), true);
  assert.equal(fakeDb.operations.includes("release:projects"), false);

  await deleteProjectRecords({
    action: "delete_project",
    db: fakeDb.db,
    deletionGuard: fakeDb.deletionGuard,
    projectId,
    storage: { async deleteObject() {} },
    userId,
    async cleanupManagedResources() {}
  });
  assert.equal(fakeDb.operations.includes("delete:projects"), true);
});

test("deleteProjectRecords deletes immutable ReleaseCandidate object versions", async () => {
  const deletedVersions: string[] = [];
  const fakeDb = new FakeProjectDeletionDb({
    releaseCandidates: [
      {
        apiArchiveObjectKey: "deployments/deployment-1/release-candidates/candidate-1/api.tar",
        apiArchiveObjectVersionId: "api-v1",
        frontendArchiveObjectKey:
          "deployments/deployment-1/release-candidates/candidate-1/frontend.tar.zst",
        frontendArchiveObjectVersionId: "frontend-v1",
        frontendManifestObjectKey:
          "deployments/deployment-1/release-candidates/candidate-1/frontend-manifest.json",
        frontendManifestObjectVersionId: "frontend-manifest-v1",
        manifestObjectKey: "deployments/deployment-1/release-candidates/candidate-1/candidate.json",
        manifestObjectVersionId: "candidate-v1"
      }
    ]
  });

  await deleteProjectRecords({
    action: "delete_project",
    db: fakeDb.db,
    deletionGuard: fakeDb.deletionGuard,
    projectId,
    storage: {
      async deleteObject() {},
      async deleteObjectVersion(objectKey, versionId) {
        deletedVersions.push(`${objectKey}@${versionId}`);
      }
    },
    userId
  });

  assert.deepEqual(deletedVersions.sort(), [
    "deployments/deployment-1/release-candidates/candidate-1/api.tar@api-v1",
    "deployments/deployment-1/release-candidates/candidate-1/candidate.json@candidate-v1",
    "deployments/deployment-1/release-candidates/candidate-1/frontend-manifest.json@frontend-manifest-v1",
    "deployments/deployment-1/release-candidates/candidate-1/frontend.tar.zst@frontend-v1"
  ]);
});

function createSnapshot(overrides: Partial<ProjectDeleteSnapshot> = {}): ProjectDeleteSnapshot {
  return {
    candidateObjectVersions: [],
    deployments: [],
    hasActiveDeploymentJob: false,
    hasActiveExecutionLease: false,
    managedBuildEnvironment: null,
    planArtifacts: [],
    projectAssets: [],
    projectId,
    ...overrides
  };
}

const tableNames = new Map<unknown, string>([
  [architectures, "architectures"],
  [awsConnections, "aws_connections"],
  [deployedResources, "deployed_resources"],
  [deploymentJobs, "deployment_jobs"],
  [deploymentLogs, "deployment_logs"],
  [deploymentPlanArtifacts, "deployment_plan_artifacts"],
  [deployments, "deployments"],
  [gitCicdHandoffs, "git_cicd_handoffs"],
  [projectAssets, "project_assets"],
  [projectDrafts, "project_drafts"],
  [projectBuildEnvironments, "project_build_environments"],
  [projectExecutionLeases, "project_execution_leases"],
  [projects, "projects"],
  [releaseCandidates, "release_candidates"],
  [terraformOutputs, "terraform_outputs"]
]);

type FakeProjectDeletionDbInput = {
  awsConnections?: unknown[];
  deployments?: unknown[];
  projectBuildEnvironments?: unknown[];
  projectAssets?: unknown[];
  releaseCandidates?: unknown[];
};

class FakeProjectDeletionDb {
  readonly db: Database;
  readonly deletionGuard = {
    claim: async () => {
      this.operations.push("claim:projects");
      return { startedAt: fixedDate };
    },
    release: async () => {
      this.operations.push("release:projects");
    },
    markCleanupFailed: async () => {
      this.operations.push("mark-cleanup-failed:projects");
    }
  };
  readonly operations: string[] = [];

  constructor(private readonly input: FakeProjectDeletionDbInput = {}) {
    const fakeDb = {
      delete: (table: unknown) => this.createMutationBuilder("delete", table),
      select: () => ({
        from: (table: unknown) => {
          if (table === deployments) {
            return {
              where: () => ({
                orderBy: async () => this.input.deployments ?? []
              })
            };
          }

          return {
            where: async () => this.selectRowsForTable(table)
          };
        }
      }),
      transaction: async <T>(callback: (tx: Database) => Promise<T>) =>
        callback(fakeDb as unknown as Database),
      update: (table: unknown) => ({
        set: () => this.createMutationBuilder("update", table)
      })
    };

    this.db = fakeDb as unknown as Database;
  }

  private createMutationBuilder(operation: "delete" | "update", table: unknown) {
    return {
      where: async () => {
        this.operations.push(`${operation}:${getTableName(table)}`);
      }
    };
  }

  private selectRowsForTable(table: unknown): unknown[] {
    if (table === projects) {
      return [{ id: projectId }];
    }

    if (table === projectAssets) {
      return this.input.projectAssets ?? [];
    }

    if (table === projectBuildEnvironments) {
      return this.input.projectBuildEnvironments ?? [];
    }

    if (table === awsConnections) {
      return this.input.awsConnections ?? [];
    }

    if (table === releaseCandidates) {
      return this.input.releaseCandidates ?? [];
    }

    return [];
  }
}

function getTableName(table: unknown): string {
  const tableName = tableNames.get(table);

  if (!tableName) {
    throw new Error("Unexpected table in fake project deletion db");
  }

  return tableName;
}

function createDeploymentSummary(
  overrides: Partial<ProjectDeleteSnapshot["deployments"][number]> = {}
): ProjectDeleteSnapshot["deployments"][number] {
  return {
    activeStage: null,
    completedAt: null,
    createdAt: fixedDate,
    currentPlanArtifactId: null,
    failureStage: null,
    id: "deployment-id",
    resourceCount: 0,
    scope: "infrastructure",
    stateObjectKey: null,
    status: "PENDING",
    updatedAt: fixedDate,
    ...overrides
  };
}
