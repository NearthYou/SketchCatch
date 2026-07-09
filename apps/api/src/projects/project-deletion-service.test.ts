import { test } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../db/client.js";
import {
  architectures,
  deployedResources,
  deploymentLogs,
  deploymentPlanArtifacts,
  deployments,
  gitCicdHandoffs,
  projectAssets,
  projectDrafts,
  projects,
  terraformOutputs
} from "../db/schema.js";
import {
  createProjectDeletePreview,
  deleteProjectRecords,
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
    projectId,
    storage: {
      async deleteObject(objectKey) {
        deletedObjectKeys.push(objectKey);
      }
    },
    userId
  });

  const handoffDeleteIndex = fakeDb.operations.indexOf("delete:git_cicd_handoffs");
  const assetDeleteIndex = fakeDb.operations.indexOf("delete:project_assets");
  const architectureDeleteIndex = fakeDb.operations.indexOf("delete:architectures");

  assert.deepEqual(deletedObjectKeys, [
    "deployments/deployment-destroyed/state/terraform.tfstate",
    "deployments/deployment-destroyed/terraform/.terraform.lock.hcl",
    "projects/project-id/artifacts/main.tf"
  ]);
  assert.notEqual(handoffDeleteIndex, -1);
  assert(handoffDeleteIndex < assetDeleteIndex);
  assert(handoffDeleteIndex < architectureDeleteIndex);
});

function createSnapshot(
  overrides: Partial<ProjectDeleteSnapshot> = {}
): ProjectDeleteSnapshot {
  return {
    deployments: [],
    planArtifacts: [],
    projectAssets: [],
    projectId,
    ...overrides
  };
}

const tableNames = new Map<unknown, string>([
  [architectures, "architectures"],
  [deployedResources, "deployed_resources"],
  [deploymentLogs, "deployment_logs"],
  [deploymentPlanArtifacts, "deployment_plan_artifacts"],
  [deployments, "deployments"],
  [gitCicdHandoffs, "git_cicd_handoffs"],
  [projectAssets, "project_assets"],
  [projectDrafts, "project_drafts"],
  [projects, "projects"],
  [terraformOutputs, "terraform_outputs"]
]);

type FakeProjectDeletionDbInput = {
  deployments?: unknown[];
  projectAssets?: unknown[];
};

class FakeProjectDeletionDb {
  readonly db: Database;
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
    stateObjectKey: null,
    status: "PENDING",
    updatedAt: fixedDate,
    ...overrides
  };
}
