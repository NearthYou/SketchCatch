import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorResponse } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { Database, DatabaseClient } from "../db/client.js";
import {
  architectures,
  deployedResources,
  deploymentPlanArtifacts,
  deployments,
  projectAssets,
  projects,
  users
} from "../db/schema.js";
import { defaultTerraformArtifactMaxBytes } from "../deployments/terraform-workspace.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";
process.env.S3_BUCKET_NAME = "sketchcatch-test-bucket";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const ACTIVE_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const ACTIVE_ARCHITECTURE_ID = "55555555-5555-4555-8555-555555555555";

type UserRow = typeof users.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ArchitectureRow = typeof architectures.$inferSelect;
type ProjectAssetRow = typeof projectAssets.$inferSelect;
type DeploymentRow = typeof deployments.$inferSelect;
type DeployedResourceRow = typeof deployedResources.$inferSelect;
type DeploymentPlanArtifactRow = typeof deploymentPlanArtifacts.$inferSelect;

test("GET /api/projects returns 401 for a deleted user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID, deletedAt: new Date() })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects",
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("GET /api/projects only returns projects owned by the active user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [
      makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID }),
      makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects",
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().projects.map((project: ProjectRow) => project.id),
    [ACTIVE_PROJECT_ID]
  );

  await app.close();
});

test("POST /api/projects creates a project for the active user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      name: "Owner project",
      description: "Created by active user"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().project.userId, ACTIVE_USER_ID);
  assert.equal(fakeDb.projectRows[0]?.userId, ACTIVE_USER_ID);

  await app.close();
});

test("GET /api/projects/:id returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${OTHER_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/architectures keeps Reverse Engineering scan and draft source", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/architectures`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      source: "imported",
      reverseEngineering: {
        sourceScanId: "scan-1",
        draftId: "draft-scan-1"
      },
      architectureJson: {
        nodes: [
          {
            id: "resource-vpc-main",
            type: "VPC",
            label: "Main VPC",
            positionX: 0,
            positionY: 0,
            config: {}
          }
        ],
        edges: []
      }
    }
  });
  const savedArchitecture = fakeDb.architectureRows[0];
  const savedNode = savedArchitecture?.architectureJson.nodes[0];

  assert.equal(response.statusCode, 201);
  assert.equal(savedNode?.config["reverseEngineeringSourceScanId"], "scan-1");
  assert.equal(savedNode?.config["reverseEngineeringDraftId"], "draft-scan-1");

  await app.close();
});

test("DELETE /api/projects/:id deletes a project owned by the active user", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/projects/${ACTIVE_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    deleted: true,
    cleanup: {
      failedObjectCount: 0,
      message: null,
      s3Status: "success"
    }
  });
  assert.equal(
    fakeDb.projectRows.some((project) => project.id === ACTIVE_PROJECT_ID),
    false
  );

  await app.close();
});

test("DELETE /api/projects/:id clears deployment plan pointers before deleting plan artifacts", async () => {
  const currentPlanArtifactId = "88888888-8888-4888-8888-888888888888";
  const approvedPlanArtifactId = "99999999-9999-4999-8999-999999999999";
  const deploymentId = "66666666-6666-4666-8666-666666666666";
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    deployments: [
      makeDeployment({
        approvedPlanArtifactId,
        currentPlanArtifactId,
        id: deploymentId,
        projectId: ACTIVE_PROJECT_ID
      })
    ],
    deploymentPlanArtifacts: [
      makeDeploymentPlanArtifact({
        deploymentId,
        id: currentPlanArtifactId
      }),
      makeDeploymentPlanArtifact({
        deploymentId,
        id: approvedPlanArtifactId,
        objectKey: "deployments/deployment-id/plans/approved.tfplan"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/projects/${ACTIVE_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      action: "delete_project"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(fakeDb.operationLog.slice(0, 2), [
    "update:deployments",
    "delete:deploymentPlanArtifacts"
  ]);
  assert.equal(fakeDb.clearedDeploymentPlanPointers.length, 1);
  assert.deepEqual(fakeDb.clearedDeploymentPlanPointers[0], {
    approvedPlanArtifactId: null,
    currentPlanArtifactId: null,
    id: deploymentId
  });

  await app.close();
});

test("DELETE /api/projects/:id reports S3 cleanup failures but still deletes records", async () => {
  const deletedObjectKeys: string[] = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectAssets: [
      makeProjectAsset({
        objectKey: "projects/project-id/diagram.png",
        projectId: ACTIVE_PROJECT_ID
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectDeletionStorage: {
      async deleteObject(objectKey) {
        deletedObjectKeys.push(objectKey);
        throw new Error("S3 delete failed");
      }
    }
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/projects/${ACTIVE_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      action: "delete_project"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    deleted: true,
    cleanup: {
      failedObjectCount: 1,
      message: "일부 SketchCatch 산출물 정리에 실패했습니다.",
      s3Status: "failed"
    }
  });
  assert.deepEqual(deletedObjectKeys, ["projects/project-id/diagram.png"]);
  assert.equal(
    fakeDb.projectRows.some((project) => project.id === ACTIVE_PROJECT_ID),
    false
  );
  assert.equal(fakeDb.projectAssetRows.length, 0);

  await app.close();
});

test("GET /api/projects/:id/delete-preview reports planned deployments", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    deployments: [
      makeDeployment({
        currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
        projectId: ACTIVE_PROJECT_ID,
        status: "PENDING"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/delete-preview`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().preview.mode, "planned");
  assert.deepEqual(response.json().preview.availableActions, ["delete_project"]);

  await app.close();
});

test("DELETE /api/projects/:id returns conflict while a deployment is running", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    deployments: [
      makeDeployment({
        activeStage: "apply",
        projectId: ACTIVE_PROJECT_ID,
        status: "RUNNING"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/projects/${ACTIVE_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      action: "delete_project"
    }
  });

  assert.equal(response.statusCode, 409);
  assertErrorResponse(response.json() as ApiErrorResponse, "conflict");
  assert.equal(
    fakeDb.projectRows.some((project) => project.id === ACTIVE_PROJECT_ID),
    true
  );

  await app.close();
});

test("DELETE /api/projects/:id returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/projects/${OTHER_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");
  assert.equal(
    fakeDb.projectRows.some((project) => project.id === OTHER_PROJECT_ID),
    true
  );

  await app.close();
});

test("POST /api/projects/:id/architectures returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${OTHER_PROJECT_ID}/architectures`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      architectureJson: {
        nodes: [],
        edges: []
      }
    }
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/assets/presigned-upload returns 404 for another user's project", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: OTHER_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: OTHER_PROJECT_ID, userId: OTHER_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${OTHER_PROJECT_ID}/assets/presigned-upload`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      assetType: "diagram_png",
      fileName: "diagram.png",
      contentType: "image/png"
    }
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/assets/presigned-upload rejects oversized Terraform uploads", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/presigned-upload`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      assetType: "terraform_file",
      fileName: "main.tf",
      contentType: "application/x-terraform",
      byteSize: defaultTerraformArtifactMaxBytes + 1
    }
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /Terraform file must be/);

  await app.close();
});

test("POST /api/projects/:id/assets/presigned-upload creates a pending asset upload", async () => {
  const uploadUrlRequests: Array<{
    bucketName: string;
    contentType: string;
    expiresInSeconds: number;
    objectKey: string;
  }> = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    architectures: [
      makeArchitecture({
        id: ACTIVE_ARCHITECTURE_ID,
        projectId: ACTIVE_PROJECT_ID
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: {
      async createUploadUrl(input) {
        uploadUrlRequests.push(input);
        return "https://s3.example.test/upload";
      },
      async deleteObject() {
        throw new Error("deleteObject should not run");
      },
      async objectExists() {
        throw new Error("objectExists should not run");
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/presigned-upload`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      architectureId: ACTIVE_ARCHITECTURE_ID,
      assetType: "terraform_file",
      fileName: "main.tf",
      contentType: "text/plain",
      byteSize: 12
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().asset.uploadStatus, "pending");
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "pending");
  assert.equal(response.json().upload.url, "https://s3.example.test/upload");
  assert.equal(uploadUrlRequests[0]?.bucketName, "sketchcatch-test-bucket");

  await app.close();
});

test("POST /api/projects/:id/assets/:assetId/confirm-upload marks an existing S3 object uploaded", async () => {
  const objectExistsRequests: Array<{
    bucketName: string;
    byteSize: number | null;
    objectKey: string;
  }> = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        uploadStatus: "pending"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: {
      async createUploadUrl() {
        throw new Error("createUploadUrl should not run");
      },
      async deleteObject() {
        throw new Error("deleteObject should not run");
      },
      async objectExists(input) {
        objectExistsRequests.push(input);
        return true;
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/confirm-upload`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().asset.uploadStatus, "uploaded");
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "uploaded");
  assert.deepEqual(objectExistsRequests, [
    {
      bucketName: "sketchcatch-test-bucket",
      byteSize: 1024,
      objectKey: "projects/project-id/diagram.png"
    }
  ]);

  await app.close();
});

test("POST /api/projects/:id/assets/:assetId/confirm-upload rejects a missing S3 object", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        uploadStatus: "pending"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: {
      async createUploadUrl() {
        throw new Error("createUploadUrl should not run");
      },
      async deleteObject() {
        throw new Error("deleteObject should not run");
      },
      async objectExists() {
        return false;
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/confirm-upload`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 409);
  assertErrorResponse(response.json() as ApiErrorResponse, "conflict");
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "pending");

  await app.close();
});

test("POST /api/projects/:id/assets/:assetId/abort-upload deletes only pending asset uploads", async () => {
  const deletedObjectKeys: string[] = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        uploadStatus: "pending"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: {
      async createUploadUrl() {
        throw new Error("createUploadUrl should not run");
      },
      async deleteObject(input) {
        deletedObjectKeys.push(input.objectKey);
      },
      async objectExists() {
        throw new Error("objectExists should not run");
      }
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/abort-upload`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 204);
  assert.deepEqual(deletedObjectKeys, ["projects/project-id/diagram.png"]);
  assert.equal(fakeDb.projectAssetRows.length, 0);

  await app.close();
});

function assertErrorResponse(
  body: ApiErrorResponse,
  expectedError: ApiErrorResponse["error"]
): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
  assert.equal(body.error, expectedError);
  assert.equal(typeof body.message, "string");
}

async function authHeaders(userId: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(userId)}`
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: ACTIVE_USER_ID,
    username: "demo",
    email: "demo@example.com",
    nickname: "Demo",
    passwordHash: "unused",
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    deletedAt: null,
    ...overrides
  };
}

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: ACTIVE_PROJECT_ID,
    userId: ACTIVE_USER_ID,
    name: "Project",
    description: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function makeArchitecture(overrides: Partial<ArchitectureRow> = {}): ArchitectureRow {
  return {
    id: ACTIVE_ARCHITECTURE_ID,
    projectId: ACTIVE_PROJECT_ID,
    version: 1,
    source: "manual",
    architectureJson: {
      nodes: [],
      edges: []
    },
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function makeProjectAsset(overrides: Partial<ProjectAssetRow> = {}): ProjectAssetRow {
  return {
    architectureId: null,
    assetType: "diagram_png",
    byteSize: 1024,
    contentType: "image/png",
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    fileName: "diagram.png",
    id: "44444444-4444-4444-8444-444444444444",
    objectKey: "projects/project-id/diagram.png",
    projectId: ACTIVE_PROJECT_ID,
    uploadStatus: "uploaded",
    ...overrides
  };
}

function makeDeploymentPlanArtifact(
  overrides: Partial<DeploymentPlanArtifactRow> = {}
): DeploymentPlanArtifactRow {
  return {
    accountId: "123456789012",
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    deploymentId: "66666666-6666-4666-8666-666666666666",
    id: "88888888-8888-4888-8888-888888888888",
    objectKey: "deployments/deployment-id/plans/current.tfplan",
    operation: "apply",
    region: "ap-northeast-2",
    sha256: "a".repeat(64),
    terraformArtifactId: "77777777-7777-4777-8777-777777777777",
    terraformArtifactSha256: "b".repeat(64),
    ...overrides
  };
}

function makeDeployment(overrides: Partial<DeploymentRow> = {}): DeploymentRow {
  return {
    activeStage: null,
    approvedAt: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    approvedByUserId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTerraformArtifactId: null,
    approvedTfplanHash: null,
    architectureId: "55555555-5555-4555-8555-555555555555",
    awsConnectionId: null,
    blockedBy: null,
    blockedReason: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    currentPlanArtifactId: null,
    errorSummary: null,
    failedAt: null,
    failureStage: null,
    id: "66666666-6666-4666-8666-666666666666",
    isBlocked: false,
    planSummary: null,
    projectId: ACTIVE_PROJECT_ID,
    resultWarningSummary: null,
    startedAt: null,
    stateObjectKey: null,
    status: "PENDING",
    terraformArtifactId: "77777777-7777-4777-8777-777777777777",
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

class ProjectRouteFakeDb {
  activeUserId: string;
  requestedProjectAssetId: string | undefined;
  requestedProjectId: string | undefined;
  userRows: UserRow[];
  projectRows: ProjectRow[];
  architectureRows: ArchitectureRow[];
  projectAssetRows: ProjectAssetRow[];
  deploymentRows: DeploymentRow[];
  deployedResourceRows: DeployedResourceRow[];
  deploymentPlanArtifactRows: DeploymentPlanArtifactRow[];
  clearedDeploymentPlanPointers: Array<
    Pick<DeploymentRow, "approvedPlanArtifactId" | "currentPlanArtifactId" | "id">
  >;
  operationLog: string[];
  client: DatabaseClient;

  constructor(data: {
    activeUserId: string;
    requestedProjectAssetId?: string;
    requestedProjectId?: string;
    users?: UserRow[];
    projects?: ProjectRow[];
    architectures?: ArchitectureRow[];
    projectAssets?: ProjectAssetRow[];
    deployments?: DeploymentRow[];
    deployedResources?: DeployedResourceRow[];
    deploymentPlanArtifacts?: DeploymentPlanArtifactRow[];
  }) {
    this.activeUserId = data.activeUserId;
    this.requestedProjectAssetId = data.requestedProjectAssetId;
    this.requestedProjectId = data.requestedProjectId;
    this.userRows = data.users ?? [];
    this.projectRows = data.projects ?? [];
    this.architectureRows = data.architectures ?? [];
    this.projectAssetRows = data.projectAssets ?? [];
    this.deploymentRows = data.deployments ?? [];
    this.deployedResourceRows = data.deployedResources ?? [];
    this.deploymentPlanArtifactRows = data.deploymentPlanArtifacts ?? [];
    this.clearedDeploymentPlanPointers = [];
    this.operationLog = [];
    this.client = {
      db: this.createDb() as Database,
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: (selection?: Record<string, unknown>) => ({
        from: (table: unknown) => new SelectQuery(() => this.selectRows(table, selection))
      }),
      insert: (table: unknown) => ({
        values: (values: Partial<ArchitectureRow> | Partial<ProjectAssetRow> | Partial<ProjectRow>) => ({
          returning: async () => {
            if (table === projects) {
              const project = makeProject(values as Partial<ProjectRow>);
              this.projectRows.push(project);

              return [project];
            }

            if (table === architectures) {
              const architecture = makeArchitecture(values as Partial<ArchitectureRow>);
              this.architectureRows.push(architecture);

              return [architecture];
            }

            if (table === projectAssets) {
              const asset = makeProjectAsset(values as Partial<ProjectAssetRow>);
              this.projectAssetRows.push(asset);

              return [asset];
            }

            return [values];
          }
        })
      }),
      update: (table: unknown) => ({
        set: (values: Partial<DeploymentRow> | Partial<ProjectAssetRow>) => ({
          where: () => {
            let updatedRows: unknown[] = [];

            if (table === deployments) {
              const deploymentValues = values as Partial<DeploymentRow>;

              this.operationLog.push("update:deployments");
              this.deploymentRows = this.deploymentRows.map((deployment) => {
                if (this.requestedProjectId && deployment.projectId !== this.requestedProjectId) {
                  return deployment;
                }

                const nextDeployment = { ...deployment };

                if ("approvedPlanArtifactId" in deploymentValues) {
                  nextDeployment.approvedPlanArtifactId =
                    deploymentValues.approvedPlanArtifactId ?? null;
                }

                if ("currentPlanArtifactId" in deploymentValues) {
                  nextDeployment.currentPlanArtifactId =
                    deploymentValues.currentPlanArtifactId ?? null;
                }

                return nextDeployment;
              });
              this.clearedDeploymentPlanPointers = this.deploymentRows
                .filter(
                  (deployment) =>
                    !this.requestedProjectId || deployment.projectId === this.requestedProjectId
                )
                .map((deployment) => ({
                  approvedPlanArtifactId: deployment.approvedPlanArtifactId,
                  currentPlanArtifactId: deployment.currentPlanArtifactId,
                  id: deployment.id
                }));
              updatedRows = this.deploymentRows;
            }

            if (table === projectAssets) {
              const nextProjectAssetRows: ProjectAssetRow[] = [];

              this.projectAssetRows = this.projectAssetRows.map((asset) => {
                const shouldUpdate =
                  (!this.requestedProjectId || asset.projectId === this.requestedProjectId) &&
                  (!this.requestedProjectAssetId || asset.id === this.requestedProjectAssetId);

                if (!shouldUpdate) {
                  return asset;
                }

                const nextAsset = {
                  ...asset,
                  ...(values as Partial<ProjectAssetRow>)
                };

                nextProjectAssetRows.push(nextAsset);

                return nextAsset;
              });
              updatedRows = nextProjectAssetRows;
            }

            return {
              returning: async () => updatedRows
            };
          }
        })
      }),
      delete: (table: unknown) => ({
        where: async () => {
          if (table === deploymentPlanArtifacts) {
            this.operationLog.push("delete:deploymentPlanArtifacts");
            this.deploymentPlanArtifactRows = [];
          }

          if (table === deployedResources) {
            this.deployedResourceRows = [];
          }

          if (table === deployments) {
            this.deploymentRows = this.deploymentRows.filter(
              (deployment) => deployment.projectId !== this.requestedProjectId
            );
          }

          if (table === projectAssets) {
            this.projectAssetRows = this.projectAssetRows.filter((asset) => {
              if (this.requestedProjectAssetId) {
                return !(
                  asset.projectId === this.requestedProjectId &&
                  asset.id === this.requestedProjectAssetId &&
                  asset.uploadStatus === "pending"
                );
              }

              return asset.projectId !== this.requestedProjectId;
            });
          }

          if (table === architectures) {
            this.architectureRows = this.architectureRows.filter(
              (architecture) => architecture.projectId !== this.requestedProjectId
            );
          }

          if (table === projects) {
            this.projectRows = this.projectRows.filter(
              (project) =>
                !(
                  project.userId === this.activeUserId &&
                  (!this.requestedProjectId || project.id === this.requestedProjectId)
                )
            );
          }

          return [];
        }
      }),
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(this.createDb())
    };
  }

  private selectRows(table: unknown, selection?: Record<string, unknown>): unknown[] {
    if (table === users) {
      return this.userRows.filter((user) => user.id === this.activeUserId);
    }

    if (table === projects) {
      return this.projectRows.filter(
        (project) =>
          project.userId === this.activeUserId &&
          (!this.requestedProjectId || project.id === this.requestedProjectId)
      );
    }

    if (table === architectures) {
      if (selection && "nextVersion" in selection) {
        return [{ nextVersion: 1 }];
      }

      return this.architectureRows.filter(
        (architecture) =>
          !this.requestedProjectId || architecture.projectId === this.requestedProjectId
      );
    }

    if (table === projectAssets) {
      return this.projectAssetRows.filter(
        (asset) =>
          (!this.requestedProjectId || asset.projectId === this.requestedProjectId) &&
          (!this.requestedProjectAssetId || asset.id === this.requestedProjectAssetId)
      );
    }

    if (table === deployments) {
      return this.deploymentRows.filter(
        (deployment) => !this.requestedProjectId || deployment.projectId === this.requestedProjectId
      );
    }

    if (table === deployedResources) {
      return this.deployedResourceRows;
    }

    if (table === deploymentPlanArtifacts) {
      return this.deploymentPlanArtifactRows;
    }

    return [];
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  orderBy(): Promise<unknown[]> {
    return Promise.resolve(this.resolveRows());
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}
