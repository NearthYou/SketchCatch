import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  projectDrafts,
  projects,
  reverseEngineeringScanPreviews,
  reverseEngineeringScans,
  users
} from "../db/schema.js";
import { defaultTerraformArtifactMaxBytes } from "../deployments/terraform-workspace.js";
import { createFilesystemProjectAssetStorage } from "../projects/filesystem-project-asset-storage.js";
import type { ProjectAssetStorage } from "../projects/project-asset-storage.js";
import { createPublicReverseEngineeringPreviewResult } from "../reverse-engineering/reverse-engineering-preview-claim-service.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const ACTIVE_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const ACTIVE_ARCHITECTURE_ID = "55555555-5555-4555-8555-555555555555";
const REVERSE_ENGINEERING_PREVIEW_ID = "99999999-9999-4999-8999-999999999999";

type UserRow = typeof users.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ArchitectureRow = typeof architectures.$inferSelect;
type ProjectDraftRow = typeof projectDrafts.$inferSelect;
type ProjectAssetRow = typeof projectAssets.$inferSelect;
type DeploymentRow = typeof deployments.$inferSelect;
type DeployedResourceRow = typeof deployedResources.$inferSelect;
type DeploymentPlanArtifactRow = typeof deploymentPlanArtifacts.$inferSelect;
type ReverseEngineeringPreviewRow = typeof reverseEngineeringScanPreviews.$inferSelect;
type ReverseEngineeringScanRow = typeof reverseEngineeringScans.$inferSelect;

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

test("POST /api/projects/reverse-engineering atomically creates Project, Draft, and Snapshot", async () => {
  const preview = makeReverseEngineeringPreview();
  const payload = createReverseEngineeringProjectPayload();
  const publicResult = createPublicReverseEngineeringPreviewResult(preview);
  assert.deepEqual(
    payload.architectureJson.nodes[0]?.config,
    publicResult.reverseEngineeringDraft.architectureJson.nodes[0]?.config
  );
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    reverseEngineeringScanPreviews: [preview],
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/reverse-engineering",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload
  });

  assert.equal(response.statusCode, 201, response.body);
  assert.equal(fakeDb.projectRows.length, 1);
  assert.equal(fakeDb.projectDraftRows.length, 1);
  assert.equal(fakeDb.architectureRows.length, 1);
  assert.equal(fakeDb.projectDraftRows[0]?.projectId, fakeDb.projectRows[0]?.id);
  assert.equal(fakeDb.projectDraftRows[0]?.revision, 1);
  assert.equal(fakeDb.architectureRows[0]?.projectId, fakeDb.projectRows[0]?.id);
  assert.equal(fakeDb.architectureRows[0]?.source, "imported");
  const persistedScanId = fakeDb.reverseEngineeringScanRows[0]?.id;
  const persistedDraftId = fakeDb.projectDraftRows[0]?.id;
  assert.notEqual(persistedScanId, REVERSE_ENGINEERING_PREVIEW_ID);
  assert.equal(
    fakeDb.projectDraftRows[0]?.diagramJson.nodes[0]?.parameters?.values[
      "reverseEngineeringSourceScanId"
    ],
    persistedScanId
  );
  assert.equal(
    fakeDb.projectDraftRows[0]?.diagramJson.nodes[1]?.parameters?.values[
      "reverseEngineeringSourceScanId"
    ],
    "previous-scan"
  );
  assert.equal(
    fakeDb.projectDraftRows[0]?.diagramJson.nodes[0]?.parameters?.values[
      "reverseEngineeringSourceKind"
    ],
    "saved_scan"
  );
  assert.equal(
    fakeDb.architectureRows[0]?.architectureJson.nodes[0]?.config[
      "reverseEngineeringSourceScanId"
    ],
    persistedScanId
  );
  assert.equal(
    fakeDb.architectureRows[0]?.architectureJson.nodes[1]?.config[
      "reverseEngineeringSourceScanId"
    ],
    "previous-scan"
  );
  assert.equal(
    fakeDb.architectureRows[0]?.architectureJson.nodes[0]?.config[
      "reverseEngineeringSourceKind"
    ],
    "saved_scan"
  );
  assert.equal(
    fakeDb.architectureRows[0]?.architectureJson.nodes[0]?.config[
      "reverseEngineeringDraftId"
    ],
    persistedDraftId
  );
  assert.equal(response.json().draft.id, persistedDraftId);
  assert.equal(
    response.json().architecture.architectureJson.nodes[0]?.config[
      "reverseEngineeringSourceScanId"
    ],
    persistedScanId
  );
  assert.equal(response.json().draft.revision, 1);
  assert.equal(response.json().architecture.source, "imported");

  await app.close();
});

test("POST /api/projects/reverse-engineering rolls back every row and retries without duplicates", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    failArchitectureInsert: true,
    reverseEngineeringScanPreviews: [makeReverseEngineeringPreview()],
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });
  const request = {
    method: "POST" as const,
    url: "/api/projects/reverse-engineering",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: createReverseEngineeringProjectPayload()
  };

  const failedResponse = await app.inject(request);

  assert.equal(failedResponse.statusCode, 500, failedResponse.body);
  assert.equal(fakeDb.projectRows.length, 0);
  assert.equal(fakeDb.projectDraftRows.length, 0);
  assert.equal(fakeDb.architectureRows.length, 0);
  assert.equal(fakeDb.reverseEngineeringScanRows.length, 0);
  assert.equal(fakeDb.reverseEngineeringPreviewRows[0]?.claimedAt, null);

  fakeDb.failArchitectureInsert = false;
  const retryResponse = await app.inject(request);

  assert.equal(retryResponse.statusCode, 201, retryResponse.body);
  assert.equal(fakeDb.projectRows.length, 1);
  assert.equal(fakeDb.projectDraftRows.length, 1);
  assert.equal(fakeDb.architectureRows.length, 1);
  assert.equal(fakeDb.reverseEngineeringScanRows.length, 1);
  assert.notEqual(fakeDb.reverseEngineeringPreviewRows[0]?.claimedAt, null);

  await app.close();
});

test("POST /api/projects/reverse-engineering hides another user's preview", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    reverseEngineeringScanPreviews: [
      makeReverseEngineeringPreview({ userId: OTHER_USER_ID })
    ],
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/reverse-engineering",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: createReverseEngineeringProjectPayload()
  });

  assert.equal(response.statusCode, 404, response.body);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");
  assert.equal(fakeDb.projectRows.length, 0);
  assert.equal(fakeDb.reverseEngineeringScanRows.length, 0);

  await app.close();
});

test("POST /api/projects/reverse-engineering rejects an expired preview", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    reverseEngineeringScanPreviews: [
      makeReverseEngineeringPreview({ expiresAt: new Date("2020-01-01T00:00:00.000Z") })
    ],
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/reverse-engineering",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: createReverseEngineeringProjectPayload()
  });

  assert.equal(response.statusCode, 409, response.body);
  assertErrorResponse(response.json() as ApiErrorResponse, "conflict");
  assert.equal(fakeDb.projectRows.length, 0);
  assert.equal(fakeDb.reverseEngineeringPreviewRows[0]?.claimedAt, null);

  await app.close();
});

test("POST /api/projects/reverse-engineering consumes a preview only once", async () => {
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    reverseEngineeringScanPreviews: [makeReverseEngineeringPreview()],
    users: [makeUser({ id: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });
  const request = {
    method: "POST" as const,
    url: "/api/projects/reverse-engineering",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: createReverseEngineeringProjectPayload()
  };

  const firstResponse = await app.inject(request);
  const replayResponse = await app.inject(request);

  assert.equal(firstResponse.statusCode, 201, firstResponse.body);
  assert.equal(replayResponse.statusCode, 409, replayResponse.body);
  assertErrorResponse(replayResponse.json() as ApiErrorResponse, "conflict");
  assert.equal(fakeDb.projectRows.length, 1);
  assert.equal(fakeDb.reverseEngineeringScanRows.length, 1);

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

test("GET /api/projects/:id 공개 응답은 과거 AWS Snapshot을 정리하고 일반 Architecture를 유지한다", async () => {
  const legacyLambdaArn =
    "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const legacyNodeId =
    "resource-arn-aws-lambda-ap-northeast-2-123456789012-function-orders-handler";
  const ordinaryNode = {
    id: "design-client",
    type: "UNKNOWN" as const,
    label: "Client",
    positionX: 320,
    positionY: 0,
    config: { diagramKind: "design", note: "ordinary architecture stays exact" }
  };
  const legacyArchitecture = makeArchitecture({
    source: "imported",
    architectureJson: {
      nodes: [
        {
          id: legacyNodeId,
          type: "LAMBDA",
          label: "orders-handler",
          positionX: 0,
          positionY: 0,
          config: {
            providerResourceType: "AWS::Lambda::Function",
            providerResourceId: legacyLambdaArn,
            functionName: "orders-handler",
            Environment: { Variables: { TOKEN: "private-token" } },
            Role: "arn:aws:iam::123456789012:role/orders-runtime",
            analysisExcluded: true,
            reverseEngineeringSourceScanId: "scan-legacy",
            reverseEngineeringDraftId: "draft-legacy",
            reverseEngineeringSourceKind: "saved_scan"
          }
        },
        ordinaryNode
      ],
      edges: [
        {
          id: `edge-${legacyNodeId}-design-client-uses`,
          sourceId: legacyNodeId,
          targetId: ordinaryNode.id,
          label: "uses"
        }
      ]
    }
  });
  const storedArchitecture = structuredClone(legacyArchitecture.architectureJson);
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    architectures: [legacyArchitecture]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });
  const responseArchitecture = response.json().architectures[0].architectureJson;
  const lambda = responseArchitecture.nodes[0];

  assert.equal(response.statusCode, 200);
  assert.match(lambda.id, /^resource-aws-ref-[a-f0-9]{24}$/u);
  assert.match(lambda.config.providerResourceId, /^aws-ref-[a-f0-9]{24}$/u);
  assert.equal(lambda.config.functionName, "orders-handler");
  assert.equal(lambda.config.Environment, undefined);
  assert.equal(lambda.config.Role, undefined);
  assert.equal(responseArchitecture.edges[0].sourceId, lambda.id);
  assert.match(responseArchitecture.edges[0].id, new RegExp(lambda.id));
  assert.deepEqual(responseArchitecture.nodes[1], ordinaryNode);
  assert.doesNotMatch(
    JSON.stringify(responseArchitecture),
    /123456789012|resource-arn-aws-lambda|private-token/iu
  );
  assert.deepEqual(fakeDb.architectureRows[0]?.architectureJson, storedArchitecture);

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
        draftId: "draft-scan-1",
        sourceNodeIds: ["resource-vpc-main"],
        sourceKind: "saved_scan"
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
          },
          {
            id: "resource-vpc-existing",
            type: "VPC",
            label: "Existing VPC",
            positionX: 240,
            positionY: 0,
            config: {
              reverseEngineeringSourceScanId: "previous-scan",
              reverseEngineeringDraftId: "previous-draft",
              reverseEngineeringSourceKind: "saved_scan"
            }
          }
        ],
        edges: []
      }
    }
  });
  const savedArchitecture = fakeDb.architectureRows[0];
  const savedNode = savedArchitecture?.architectureJson.nodes[0];
  const existingNode = savedArchitecture?.architectureJson.nodes[1];

  assert.equal(response.statusCode, 201);
  assert.equal(savedNode?.config["reverseEngineeringSourceScanId"], "scan-1");
  assert.equal(savedNode?.config["reverseEngineeringDraftId"], "draft-scan-1");
  assert.equal(savedNode?.config["reverseEngineeringSourceKind"], "saved_scan");
  assert.equal(existingNode?.config["reverseEngineeringSourceScanId"], "previous-scan");

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

  assert.equal(response.statusCode, 200, response.body);
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

test("DELETE /api/projects/:id deletes records when internal artifact cleanup fails", async () => {
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
      message:
        "프로젝트 기록은 삭제됐지만 일부 SketchCatch 내부 S3 산출물 정리에 실패했습니다. 이 경고는 클라우드 리소스가 남았다는 의미가 아닙니다.",
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

test("DELETE /api/projects/:id delegates prefix cleanup to Project asset storage", async () => {
  const deletedPrefixes: string[] = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectAssets: [
      makeProjectAsset({
        objectKey: "projects/project-id/thumbnail.webp",
        projectId: ACTIVE_PROJECT_ID
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async deleteObject() {
        throw new Error("exact object deletion should not run");
      },
      async deletePrefix(input) {
        deletedPrefixes.push(input.prefix);
      }
    })
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/projects/${ACTIVE_PROJECT_ID}`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: { action: "delete_project" }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(deletedPrefixes, [`projects/${ACTIVE_PROJECT_ID}/`]);

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
    projectAssetStorage: createProjectAssetStorageStub()
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
  assert.equal(
    response.json().upload.url,
    `/api/projects/${ACTIVE_PROJECT_ID}/assets/${response.json().asset.id}/upload-content`
  );

  await app.close();
});

test("PUT /api/projects/:id/assets/:assetId/upload-content uploads Terraform artifact through API", async () => {
  const terraformCode = "resource \"aws_s3_bucket\" \"site\" {}\n";
  const putObjectRequests: Array<Parameters<ProjectAssetStorage["putObject"]>[0]> = [];
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
        assetType: "terraform_file",
        contentType: "text/plain",
        byteSize: new TextEncoder().encode(terraformCode).byteLength,
        uploadStatus: "pending"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject(input) {
        putObjectRequests.push(input);
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "text/plain"
    },
    payload: terraformCode
  });

  assert.equal(response.statusCode, 204);
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "uploaded");
  assert.equal(putObjectRequests.length, 1);
  assert.match(putObjectRequests[0]?.objectKey ?? "", /^projects\/project-id\/\.attempt-/u);
  assert.equal(fakeDb.projectAssetRows[0]?.objectKey, putObjectRequests[0]?.objectKey);
  assert.equal(putObjectRequests[0]?.contentType, "text/plain");
  assert.equal(putObjectRequests[0]?.body, terraformCode);

  await app.close();
});

test("concurrent Terraform uploads keep DB metadata aligned with the winning stored object", async () => {
  const firstTerraformCode = 'resource "aws_s3_bucket" "first" {}\n';
  const secondTerraformCode = 'resource "aws_s3_bucket" "second" {}\n';
  const storedObjects = new Map<string, Buffer | string>();
  let releaseWrites: (() => void) | undefined;
  const bothWritesStarted = new Promise<void>((resolve) => {
    releaseWrites = resolve;
  });
  let writeCount = 0;
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
        assetType: "terraform_file",
        contentType: "text/plain",
        byteSize: null,
        uploadStatus: "pending"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject(input) {
        storedObjects.set(input.objectKey, input.body);
        writeCount += 1;

        if (writeCount === 2) {
          releaseWrites?.();
        }

        await bothWritesStarted;
      },
      async deleteObject(input) {
        storedObjects.delete(input.objectKey);
      }
    })
  });
  const upload = async (payload: string) =>
    app.inject({
      method: "PUT",
      url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
      headers: {
        ...(await authHeaders(ACTIVE_USER_ID)),
        "content-type": "text/plain"
      },
      payload
    });

  const responses = await Promise.all([
    upload(firstTerraformCode),
    upload(secondTerraformCode)
  ]);
  const confirmedAsset = fakeDb.projectAssetRows[0];

  assert.deepEqual(
    responses.map((response) => response.statusCode).sort((left, right) => left - right),
    [204, 409]
  );
  assert.equal(confirmedAsset?.uploadStatus, "uploaded");
  assert.equal(storedObjects.size, 1);
  assert.ok(confirmedAsset?.objectKey.includes("/.attempt-"));
  const winningBody = storedObjects.get(confirmedAsset?.objectKey ?? "");

  assert.ok(winningBody === firstTerraformCode || winningBody === secondTerraformCode);
  assert.equal(confirmedAsset?.byteSize, Buffer.byteLength(winningBody));

  await app.close();
});

test("PUT Terraform upload stores server-verified Reverse Engineering imports in the canonical bundle", async () => {
  const providersTerraformCode = 'terraform { required_version = ">= 1.5.0" }\n';
  const mainTerraformCode = 'resource "aws_s3_bucket" "existing_bucket" {}\n';
  const terraformCode = `${providersTerraformCode.trim()}\n\n${mainTerraformCode.trim()}`;
  const persistedTerraformFiles = [
    { fileName: "providers.tf", terraformCode: providersTerraformCode },
    { fileName: "main.tf", terraformCode: mainTerraformCode }
  ];
  const expectedImportCode = [
    "import {",
    "  to = aws_s3_bucket.existing_bucket",
    '  id = "existing-bucket"',
    "}",
    ""
  ].join("\n");
  const expectedBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      ...persistedTerraformFiles,
      { fileName: "imports.tf", terraformCode: expectedImportCode }
    ]
  });
  const putObjectRequests: Array<Parameters<ProjectAssetStorage["putObject"]>[0]> = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectDrafts: [makeReverseEngineeringProjectDraft(persistedTerraformFiles)],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        architectureId: ACTIVE_ARCHITECTURE_ID,
        assetType: "terraform_file",
        fileName: "main.tf",
        contentType: "text/plain",
        byteSize: Buffer.byteLength(terraformCode),
        uploadStatus: "pending"
      })
    ],
    reverseEngineeringScans: [makeReverseEngineeringScan()]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject(input) {
        putObjectRequests.push(input);
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "text/plain"
    },
    payload: terraformCode
  });

  assert.equal(response.statusCode, 204);
  assert.equal(putObjectRequests.length, 1);
  assert.match(putObjectRequests[0]?.objectKey ?? "", /^projects\/project-id\/\.attempt-/u);
  assert.equal(fakeDb.projectAssetRows[0]?.objectKey, putObjectRequests[0]?.objectKey);
  assert.equal(
    putObjectRequests[0]?.contentType,
    "application/vnd.sketchcatch.terraform-files+json"
  );
  assert.equal(putObjectRequests[0]?.body, expectedBundle);
  assert.equal(fakeDb.projectAssetRows[0]?.fileName, "terraform-files.json");
  assert.equal(
    fakeDb.projectAssetRows[0]?.contentType,
    "application/vnd.sketchcatch.terraform-files+json"
  );
  assert.equal(fakeDb.projectAssetRows[0]?.byteSize, Buffer.byteLength(expectedBundle));

  await app.close();
});

test("PUT Terraform upload rejects arbitrary bytes for a sourced Reverse Engineering draft with no import targets", async () => {
  const persistedTerraformFiles = [
    {
      fileName: "providers.tf",
      terraformCode: 'terraform { required_version = ">= 1.5.0" }\n'
    },
    {
      fileName: "main.tf",
      terraformCode: 'resource "aws_s3_bucket" "existing_bucket" {}\n'
    }
  ];
  const browserContent = 'resource "aws_s3_bucket" "forged" {}\n';
  let putObjectRan = false;
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectDrafts: [makeReverseEngineeringProjectDraft(persistedTerraformFiles)],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        architectureId: ACTIVE_ARCHITECTURE_ID,
        assetType: "terraform_file",
        fileName: "main.tf",
        contentType: "text/plain",
        byteSize: Buffer.byteLength(browserContent),
        uploadStatus: "pending"
      })
    ],
    reverseEngineeringScans: [makeReverseEngineeringReferenceScan()]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject() {
        putObjectRan = true;
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "text/plain"
    },
    payload: browserContent
  });

  assert.equal(response.statusCode, 409);
  assert.equal(putObjectRan, false);
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "pending");

  await app.close();
});

test("PUT Terraform upload stores a sourced zero-target draft as a canonical base bundle", async () => {
  const providersTerraformCode = 'terraform { required_version = ">= 1.5.0" }\n';
  const mainTerraformCode = 'resource "aws_s3_bucket" "existing_bucket" {}\n';
  const persistedTerraformFiles = [
    { fileName: "providers.tf", terraformCode: providersTerraformCode },
    { fileName: "main.tf", terraformCode: mainTerraformCode }
  ];
  const browserContent = `${providersTerraformCode.trim()}\n\n${mainTerraformCode.trim()}`;
  const expectedBundle = JSON.stringify({
    schemaVersion: 1,
    files: persistedTerraformFiles
  });
  const putObjectRequests: Array<Parameters<ProjectAssetStorage["putObject"]>[0]> = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectDrafts: [makeReverseEngineeringProjectDraft(persistedTerraformFiles)],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        architectureId: ACTIVE_ARCHITECTURE_ID,
        assetType: "terraform_file",
        fileName: "main.tf",
        contentType: "text/plain",
        byteSize: Buffer.byteLength(browserContent),
        uploadStatus: "pending"
      })
    ],
    reverseEngineeringScans: [makeReverseEngineeringReferenceScan()]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject(input) {
        putObjectRequests.push(input);
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "text/plain"
    },
    payload: browserContent
  });

  assert.equal(response.statusCode, 204);
  assert.equal(putObjectRequests.length, 1);
  assert.match(putObjectRequests[0]?.objectKey ?? "", /^projects\/project-id\/\.attempt-/u);
  assert.equal(fakeDb.projectAssetRows[0]?.objectKey, putObjectRequests[0]?.objectKey);
  assert.equal(
    putObjectRequests[0]?.contentType,
    "application/vnd.sketchcatch.terraform-files+json"
  );
  assert.equal(putObjectRequests[0]?.body, expectedBundle);
  assert.equal(fakeDb.projectAssetRows[0]?.fileName, "terraform-files.json");
  assert.equal(
    fakeDb.projectAssetRows[0]?.contentType,
    "application/vnd.sketchcatch.terraform-files+json"
  );
  assert.equal(fakeDb.projectAssetRows[0]?.byteSize, Buffer.byteLength(expectedBundle));

  await app.close();
});

test("PUT Terraform upload allows user-owned import blocks and imports.tf for ordinary projects", async () => {
  const scenarios = [
    {
      fileName: "main.tf",
      terraformCode: [
        'resource "aws_s3_bucket" "existing" {}',
        'import { to = aws_s3_bucket.existing id = "existing-bucket" }',
        ""
      ].join("\n")
    },
    {
      fileName: "imports.tf",
      terraformCode: [
        'resource "aws_s3_bucket" "existing" {}',
        'import { to = aws_s3_bucket.existing id = "existing-bucket" }',
        ""
      ].join("\n")
    }
  ];

  for (const scenario of scenarios) {
    const putObjectRequests: Array<Parameters<ProjectAssetStorage["putObject"]>[0]> = [];
    const fakeDb = new ProjectRouteFakeDb({
      activeUserId: ACTIVE_USER_ID,
      requestedProjectAssetId: ACTIVE_ASSET_ID,
      requestedProjectId: ACTIVE_PROJECT_ID,
      users: [makeUser({ id: ACTIVE_USER_ID })],
      projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
      projectDrafts: [
        makeProjectDraft({
          terraformFiles: [
            { fileName: scenario.fileName, terraformCode: scenario.terraformCode }
          ]
        })
      ],
      projectAssets: [
        makeProjectAsset({
          id: ACTIVE_ASSET_ID,
          projectId: ACTIVE_PROJECT_ID,
          architectureId: ACTIVE_ARCHITECTURE_ID,
          assetType: "terraform_file",
          fileName: scenario.fileName,
          contentType: "text/plain",
          byteSize: Buffer.byteLength(scenario.terraformCode),
          uploadStatus: "pending"
        })
      ]
    });
    const app = buildApp({
      getDatabaseClient: () => fakeDb.client,
      projectAssetStorage: createProjectAssetStorageStub({
        async putObject(input) {
          putObjectRequests.push(input);
        }
      })
    });

    const response = await app.inject({
      method: "PUT",
      url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
      headers: {
        ...(await authHeaders(ACTIVE_USER_ID)),
        "content-type": "text/plain"
      },
      payload: scenario.terraformCode
    });

    assert.equal(response.statusCode, 204, scenario.fileName);
    assert.equal(putObjectRequests.length, 1);
    assert.match(putObjectRequests[0]?.objectKey ?? "", /^projects\/project-id\/\.attempt-/u);
    assert.equal(fakeDb.projectAssetRows[0]?.objectKey, putObjectRequests[0]?.objectKey);
    assert.equal(putObjectRequests[0]?.contentType, "text/plain");
    assert.equal(putObjectRequests[0]?.body, scenario.terraformCode);
    await app.close();
  }
});

test("PUT Terraform upload rejects browser-submitted import block content", async () => {
  const terraformCode = 'resource "aws_s3_bucket" "existing_bucket" {}\n';
  const browserContent = `${terraformCode}\nimport {\n  to = aws_s3_bucket.existing_bucket\n  id = "browser-forged-bucket"\n}\n`;
  let putObjectRan = false;
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectDrafts: [
      makeReverseEngineeringProjectDraft([{ fileName: "main.tf", terraformCode }])
    ],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        architectureId: ACTIVE_ARCHITECTURE_ID,
        assetType: "terraform_file",
        fileName: "main.tf",
        contentType: "text/plain",
        byteSize: Buffer.byteLength(browserContent),
        uploadStatus: "pending"
      })
    ],
    reverseEngineeringScans: [makeReverseEngineeringScan()]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject() {
        putObjectRan = true;
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "text/plain"
    },
    payload: browserContent
  });

  assert.equal(response.statusCode, 409);
  assert.equal(putObjectRan, false);
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "pending");

  await app.close();
});

test("PUT Terraform upload rejects import blocks persisted inside browser-controlled base files", async () => {
  const terraformCode = [
    'resource "aws_s3_bucket" "existing_bucket" {}',
    "",
    "import {",
    "  to = aws_s3_bucket.existing_bucket",
    '  id = "browser-forged-bucket"',
    "}",
    ""
  ].join("\n");
  let putObjectRan = false;
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectAssetId: ACTIVE_ASSET_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectDrafts: [
      makeReverseEngineeringProjectDraft([{ fileName: "main.tf", terraformCode }])
    ],
    projectAssets: [
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        architectureId: ACTIVE_ARCHITECTURE_ID,
        assetType: "terraform_file",
        fileName: "main.tf",
        contentType: "text/plain",
        byteSize: Buffer.byteLength(terraformCode),
        uploadStatus: "pending"
      })
    ],
    reverseEngineeringScans: [makeReverseEngineeringScan()]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject() {
        putObjectRan = true;
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "text/plain"
    },
    payload: terraformCode
  });

  assert.equal(response.statusCode, 400);
  assert.equal(putObjectRan, false);
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "pending");

  await app.close();
});

test("PUT /api/projects/:id/assets/:assetId/upload-content stores a captured WebP thumbnail", async () => {
  const thumbnailBytes = Buffer.from("RIFF\u0010\u0000\u0000\u0000WEBPVP8 captured-board", "binary");
  const putObjectRequests: Array<Parameters<ProjectAssetStorage["putObject"]>[0]> = [];
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
        assetType: "thumbnail",
        contentType: "image/webp",
        byteSize: thumbnailBytes.byteLength,
        uploadStatus: "pending"
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async putObject(input) {
        putObjectRequests.push(input);
      }
    })
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${ACTIVE_ASSET_ID}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "image/webp"
    },
    payload: thumbnailBytes
  });

  assert.equal(response.statusCode, 204);
  assert.equal(fakeDb.projectAssetRows[0]?.uploadStatus, "uploaded");
  assert.equal(putObjectRequests.length, 1);
  assert.equal(putObjectRequests[0]?.contentType, "image/webp");
  assert.deepEqual(putObjectRequests[0]?.body, thumbnailBytes);

  await app.close();
});

test("GET /api/projects/:id/thumbnail returns the latest authenticated Board capture", async () => {
  const thumbnailBytes = Buffer.from("RIFF\u0010\u0000\u0000\u0000WEBPVP8 captured-board", "binary");
  const thumbnailObjectKey = "projects/project-id/assets/thumbnail/latest-board.webp";
  const getObjectRequests: Array<Parameters<ProjectAssetStorage["getObject"]>[0]> = [];
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })],
    projectAssets: [
      makeProjectAsset({
        id: "11111111-1111-4111-8111-111111111111",
        projectId: ACTIVE_PROJECT_ID,
        assetType: "thumbnail",
        contentType: "image/webp",
        objectKey: "projects/project-id/assets/thumbnail/equal-time-older-board.webp",
        uploadStatus: "uploaded",
        createdAt: new Date("2026-07-13T00:00:00.000Z")
      }),
      makeProjectAsset({
        id: ACTIVE_ASSET_ID,
        projectId: ACTIVE_PROJECT_ID,
        assetType: "thumbnail",
        contentType: "image/webp",
        objectKey: thumbnailObjectKey,
        uploadStatus: "uploaded",
        createdAt: new Date("2026-07-13T00:00:00.000Z")
      }),
      makeProjectAsset({
        id: "33333333-3333-4333-8333-333333333333",
        projectId: ACTIVE_PROJECT_ID,
        assetType: "diagram_png",
        uploadStatus: "uploaded",
        createdAt: new Date("2026-07-12T00:00:00.000Z")
      })
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage: createProjectAssetStorageStub({
      async getObject(input) {
        getObjectRequests.push(input);
        return thumbnailBytes;
      }
    })
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/thumbnail`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^image\/webp/u);
  assert.match(response.headers["cache-control"] ?? "", /private/u);
  assert.deepEqual(response.rawPayload, thumbnailBytes);
  assert.deepEqual(getObjectRequests, [{ objectKey: thumbnailObjectKey }]);

  await app.close();
});

test("Project thumbnail upload and read share a real filesystem storage instance", async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sketchcatch-route-project-assets-"));
  const rootDirectory = await realpath(temporaryDirectory);
  t.after(async () => rm(rootDirectory, { force: true, recursive: true }));
  const projectAssetStorage = createFilesystemProjectAssetStorage({ rootDirectory });
  const thumbnailBytes = Buffer.from("RIFF\u0010\u0000\u0000\u0000WEBPVP8 route-capture", "binary");
  const fakeDb = new ProjectRouteFakeDb({
    activeUserId: ACTIVE_USER_ID,
    requestedProjectId: ACTIVE_PROJECT_ID,
    users: [makeUser({ id: ACTIVE_USER_ID })],
    projects: [makeProject({ id: ACTIVE_PROJECT_ID, userId: ACTIVE_USER_ID })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    projectAssetStorage
  });

  const pendingResponse = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/presigned-upload`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      assetType: "thumbnail",
      fileName: `${"b".repeat(250)}.webp`,
      contentType: "image/webp",
      byteSize: thumbnailBytes.byteLength
    }
  });
  const pendingAsset = pendingResponse.json().asset as ProjectAssetRow;

  const uploadResponse = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/assets/${pendingAsset.id}/upload-content`,
    headers: {
      ...(await authHeaders(ACTIVE_USER_ID)),
      "content-type": "image/webp"
    },
    payload: thumbnailBytes
  });
  const thumbnailResponse = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/thumbnail`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });
  const uploadedAsset = fakeDb.projectAssetRows.find((asset) => asset.id === pendingAsset.id);

  assert.equal(pendingResponse.statusCode, 201);
  assert.equal(uploadResponse.statusCode, 204);
  assert.equal(thumbnailResponse.statusCode, 200);
  assert.match(thumbnailResponse.headers["content-type"] ?? "", /^image\/webp/u);
  assert.deepEqual(thumbnailResponse.rawPayload, thumbnailBytes);
  assert.equal(
    await projectAssetStorage.objectExists({
      objectKey: uploadedAsset?.objectKey ?? "",
      byteSize: thumbnailBytes.byteLength
    }),
    true
  );

  await app.close();
});

test("GET /api/projects/:id/thumbnail hides captures owned by another user", async () => {
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
    url: `/api/projects/${OTHER_PROJECT_ID}/thumbnail`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("POST /api/projects/:id/assets/:assetId/confirm-upload marks an existing stored object uploaded", async () => {
  const objectExistsRequests: Array<Parameters<ProjectAssetStorage["objectExists"]>[0]> = [];
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
    projectAssetStorage: createProjectAssetStorageStub({
      async objectExists(input) {
        objectExistsRequests.push(input);
        return true;
      }
    })
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
      byteSize: 1024,
      objectKey: "projects/project-id/diagram.png"
    }
  ]);

  await app.close();
});

test("POST /api/projects/:id/assets/:assetId/confirm-upload rejects a missing stored object", async () => {
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
    projectAssetStorage: createProjectAssetStorageStub({
      async objectExists() {
        return false;
      }
    })
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
    projectAssetStorage: createProjectAssetStorageStub({
      async deleteObject(input) {
        deletedObjectKeys.push(input.objectKey);
      }
    })
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

function createProjectAssetStorageStub(
  overrides: Partial<ProjectAssetStorage> = {}
): ProjectAssetStorage {
  return {
    async putObject() {
      throw new Error("putObject should not run");
    },
    async getObject() {
      throw new Error("getObject should not run");
    },
    async deleteObject() {
      throw new Error("deleteObject should not run");
    },
    async objectExists() {
      throw new Error("objectExists should not run");
    },
    ...overrides
  };
}

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
    deletionStartedAt: null,
    deletionErrorSummary: null,
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

function makeProjectDraft(overrides: Partial<ProjectDraftRow> = {}): ProjectDraftRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId: ACTIVE_PROJECT_ID,
    diagramJson: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    terraformFiles: null,
    revision: 1,
    serverSavedAt: new Date("2026-06-24T00:00:00.000Z"),
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function makeReverseEngineeringProjectDraft(
  terraformFiles: NonNullable<ProjectDraftRow["terraformFiles"]>
): ProjectDraftRow {
  return makeProjectDraft({
    diagramJson: {
      nodes: [
        {
          id: "resource-existing-bucket",
          type: "aws_s3_bucket",
          kind: "resource",
          position: { x: 0, y: 0 },
          size: { width: 48, height: 48 },
          label: "existing-bucket",
          locked: false,
          zIndex: 1,
          parameters: {
            terraformBlockType: "resource",
            resourceType: "aws_s3_bucket",
            resourceName: "existing_bucket",
            fileName: "main",
            values: {
              importId: "browser-forged-bucket",
              reverseEngineeringSourceScanId: "scan-1",
              reverseEngineeringDraftId: "draft-scan-1",
              reverseEngineeringSourceKind: "saved_scan"
            }
          }
        }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    terraformFiles
  });
}

// gg: browser가 본 공개 draft identity와 source node만 claim 요청에 담습니다.
function createReverseEngineeringProjectPayload() {
  return {
    name: "Imported AWS project",
    reverseEngineering: {
      previewId: REVERSE_ENGINEERING_PREVIEW_ID,
      draftId: `draft-${REVERSE_ENGINEERING_PREVIEW_ID}`,
      sourceNodeIds: ["imported-vpc"],
    },
    diagramJson: {
      nodes: [
        {
          id: "imported-vpc",
          type: "aws_vpc",
          kind: "resource" as const,
          position: { x: 0, y: 0 },
          size: { width: 168, height: 96 },
          label: "Imported VPC",
          locked: false,
          zIndex: 1,
          parameters: {
            resourceType: "aws_vpc",
            resourceName: "imported",
            fileName: "main",
            values: {
              providerResourceType: "AWS::EC2::VPC",
              providerResourceId: "imported-vpc",
              analysisExcluded: false
            }
          }
        },
        {
          id: "existing-vpc",
          type: "aws_vpc",
          kind: "resource" as const,
          position: { x: 240, y: 0 },
          size: { width: 168, height: 96 },
          label: "Existing VPC",
          locked: false,
          zIndex: 1,
          parameters: {
            resourceType: "aws_vpc",
            resourceName: "existing",
            fileName: "main",
            values: {
              reverseEngineeringSourceScanId: "previous-scan",
              reverseEngineeringDraftId: "previous-draft"
            }
          }
        }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    architectureJson: {
      nodes: [
        {
          id: "imported-vpc",
          type: "VPC" as const,
          label: "Imported VPC",
          positionX: 0,
          positionY: 0,
          config: {
            providerResourceType: "AWS::EC2::VPC",
            providerResourceId: "imported-vpc",
            analysisExcluded: false
          }
        },
        {
          id: "existing-vpc",
          type: "VPC" as const,
          positionX: 240,
          positionY: 0,
          config: {
            reverseEngineeringSourceScanId: "previous-scan",
            reverseEngineeringDraftId: "previous-draft"
          }
        }
      ],
      edges: []
    }
  };
}

// gg: route integration test에서 owner의 unclaimed raw preview를 준비합니다.
function makeReverseEngineeringPreview(
  overrides: Partial<ReverseEngineeringPreviewRow> = {}
): ReverseEngineeringPreviewRow {
  const createdAt = new Date("2026-07-20T00:00:00.000Z");
  const architectureJson = {
    nodes: [
      {
        id: "imported-vpc",
        type: "VPC" as const,
        label: "Imported VPC",
        positionX: 0,
        positionY: 0,
        config: {
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "imported-vpc",
          analysisExcluded: false
        }
      }
    ],
    edges: []
  };
  const scan = {
    id: "scan-not-persisted",
    projectId: "project-not-persisted",
    awsConnectionId: null,
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["ALL" as const],
    status: "completed" as const,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    startedAt: createdAt.toISOString(),
    completedAt: createdAt.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  return {
    id: REVERSE_ENGINEERING_PREVIEW_ID,
    userId: ACTIVE_USER_ID,
    awsConnectionId: null,
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"],
    rawResult: {
      scan,
      discoveredResources: [
        {
          id: "imported-vpc",
          provider: "aws",
          providerResourceType: "AWS::EC2::VPC",
          providerResourceId: "imported-vpc",
          region: "ap-northeast-2",
          displayName: "Imported VPC",
          resourceType: "VPC",
          config: {},
          relationships: []
        }
      ],
      reverseEngineeringDraft: {
        id: "draft-scan-not-persisted",
        scanId: scan.id,
        architectureJson,
        protectedValueKeys: ["providerResourceId", "providerResourceType"],
        editableValueKeys: ["displayName", "description"],
        createdAt: createdAt.toISOString()
      },
      architectureJson,
      findings: [],
      analysisExclusions: [],
      importSuggestions: [],
      scanErrors: [],
      coverage: { status: "complete", unavailableServices: [] }
    },
    expiresAt: new Date("2099-07-20T00:30:00.000Z"),
    claimedAt: null,
    claimedProjectId: null,
    claimedScanId: null,
    claimedDraftId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function makeReverseEngineeringScan(
  overrides: Partial<ReverseEngineeringScanRow> = {}
): ReverseEngineeringScanRow {
  const createdAt = new Date("2026-07-20T00:00:00.000Z");
  const scan = {
    id: "scan-1",
    projectId: ACTIVE_PROJECT_ID,
    awsConnectionId: null,
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["ALL" as const],
    status: "completed" as const,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    startedAt: createdAt.toISOString(),
    completedAt: createdAt.toISOString(),
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
  const architectureJson = { nodes: [], edges: [] };

  return {
    id: scan.id,
    projectId: scan.projectId,
    awsConnectionId: null,
    provider: "aws",
    region: scan.region,
    resourceTypes: ["ALL"],
    status: "completed",
    result: {
      scan,
      discoveredResources: [
        {
          id: "resource-existing-bucket",
          provider: "aws",
          providerResourceType: "AWS::S3::Bucket",
          providerResourceId: "existing-bucket",
          region: "ap-northeast-2",
          displayName: "existing-bucket",
          resourceType: "S3",
          config: { bucket: "existing-bucket" },
          relationships: []
        }
      ],
      reverseEngineeringDraft: {
        id: "draft-scan-1",
        scanId: scan.id,
        architectureJson,
        protectedValueKeys: [],
        editableValueKeys: [],
        createdAt: createdAt.toISOString()
      },
      architectureJson,
      findings: [],
      analysisExclusions: [],
      importSuggestions: [
        {
          id: "import-resource-existing-bucket",
          resourceId: "resource-existing-bucket",
          status: "ready",
          handoffReady: true,
          terraformAddress: "aws_s3_bucket.existing_bucket",
          importCommand:
            "terraform import aws_s3_bucket.existing_bucket existing-bucket"
        }
      ],
      scanErrors: []
    },
    errorSummary: null,
    startedAt: createdAt,
    completedAt: createdAt,
    cancelRequestedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function makeReverseEngineeringReferenceScan(): ReverseEngineeringScanRow {
  const scan = makeReverseEngineeringScan();
  const result = scan.result!;

  return {
    ...scan,
    result: {
      ...result,
      discoveredResources: result.discoveredResources.map((resource) => ({
        ...resource,
        config: {
          ...resource.config,
          cloudFormationStackId: "arn:aws:cloudformation:ap-northeast-2:123456789012:stack/existing"
        }
      })),
      importSuggestions: []
    }
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
    stateBaselineDeploymentId: null,
    stateObjectKey: null,
    stateLineageSha256: null,
    stateSerial: null,
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
    approvedPreparedSnapshotHash: null,
    architectureId: "55555555-5555-4555-8555-555555555555",
    preparationKey: null,
    awsConnectionId: null,
    awsAccountIdSnapshot: null,
    awsRegionSnapshot: null,
    awsConnectionNameSnapshot: null,
    liveProfile: "demo_web_service",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
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
    preparedDraftRevision: null,
    preparedSnapshotHash: null,
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
  projectDraftRows: ProjectDraftRow[];
  architectureRows: ArchitectureRow[];
  projectAssetRows: ProjectAssetRow[];
  deploymentRows: DeploymentRow[];
  deployedResourceRows: DeployedResourceRow[];
  deploymentPlanArtifactRows: DeploymentPlanArtifactRow[];
  reverseEngineeringPreviewRows: ReverseEngineeringPreviewRow[];
  reverseEngineeringScanRows: ReverseEngineeringScanRow[];
  clearedDeploymentPlanPointers: Array<
    Pick<DeploymentRow, "approvedPlanArtifactId" | "currentPlanArtifactId" | "id">
  >;
  operationLog: string[];
  failArchitectureInsert: boolean;
  client: DatabaseClient;

  // gg: route 테스트에서 preview·Scan row까지 같은 fake transaction state로 보존합니다.
  constructor(data: {
    activeUserId: string;
    requestedProjectAssetId?: string;
    requestedProjectId?: string;
    users?: UserRow[];
    projects?: ProjectRow[];
    projectDrafts?: ProjectDraftRow[];
    architectures?: ArchitectureRow[];
    projectAssets?: ProjectAssetRow[];
    deployments?: DeploymentRow[];
    deployedResources?: DeployedResourceRow[];
    deploymentPlanArtifacts?: DeploymentPlanArtifactRow[];
    reverseEngineeringScanPreviews?: ReverseEngineeringPreviewRow[];
    reverseEngineeringScans?: ReverseEngineeringScanRow[];
    failArchitectureInsert?: boolean;
  }) {
    this.activeUserId = data.activeUserId;
    this.requestedProjectAssetId = data.requestedProjectAssetId;
    this.requestedProjectId = data.requestedProjectId;
    this.userRows = data.users ?? [];
    this.projectRows = data.projects ?? [];
    this.projectDraftRows = data.projectDrafts ?? [];
    this.architectureRows = data.architectures ?? [];
    this.projectAssetRows = data.projectAssets ?? [];
    this.deploymentRows = data.deployments ?? [];
    this.deployedResourceRows = data.deployedResources ?? [];
    this.deploymentPlanArtifactRows = data.deploymentPlanArtifacts ?? [];
    this.reverseEngineeringPreviewRows = data.reverseEngineeringScanPreviews ?? [];
    this.reverseEngineeringScanRows = data.reverseEngineeringScans ?? [];
    this.clearedDeploymentPlanPointers = [];
    this.operationLog = [];
    this.failArchitectureInsert = data.failArchitectureInsert ?? false;
    this.client = {
      db: this.createDb() as Database,
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  // gg: Project claim이 사용하는 select·insert·conditional update를 최소 Drizzle 모양으로 모사합니다.
  private createDb(): unknown {
    return {
      select: (selection?: Record<string, unknown>) => ({
        from: (table: unknown) =>
          new SelectQuery(
            () => this.selectRows(table, selection),
            table === reverseEngineeringScans
              ? () =>
                  this.selectRows(table, selection).map((scan) => ({
                    reverse_engineering_scans: scan
                  }))
              : undefined
          )
      }),
      insert: (table: unknown) => ({
        values: (
          values:
            | Partial<ArchitectureRow>
            | Partial<ProjectAssetRow>
            | Partial<ProjectDraftRow>
            | Partial<ProjectRow>
            | Partial<ReverseEngineeringScanRow>
        ) => ({
          returning: async () => {
            if (table === projects) {
              const project = makeProject(values as Partial<ProjectRow>);
              this.projectRows.push(project);

              return [project];
            }

            if (table === architectures) {
              if (this.failArchitectureInsert) {
                throw new Error("architecture insert failed");
              }

              const architecture = makeArchitecture(values as Partial<ArchitectureRow>);
              this.architectureRows.push(architecture);

              return [architecture];
            }

            if (table === projectDrafts) {
              const draft = makeProjectDraft(values as Partial<ProjectDraftRow>);
              this.projectDraftRows.push(draft);

              return [draft];
            }

            if (table === projectAssets) {
              const asset = makeProjectAsset(values as Partial<ProjectAssetRow>);
              this.projectAssetRows.push(asset);

              return [asset];
            }

            if (table === reverseEngineeringScans) {
              const scan = values as ReverseEngineeringScanRow;
              this.reverseEngineeringScanRows.push(scan);

              return [scan];
            }

            return [values];
          }
        })
      }),
      update: (table: unknown) => ({
        set: (
          values:
            | Partial<DeploymentRow>
            | Partial<ProjectAssetRow>
            | Partial<ProjectRow>
            | Partial<ReverseEngineeringPreviewRow>
        ) => ({
          where: () => {
            let updatedRows: unknown[] = [];

            if (table === projects) {
              const projectValues = values as Partial<ProjectRow>;

              this.projectRows = this.projectRows.map((project) => {
                const shouldUpdate =
                  project.userId === this.activeUserId &&
                  (!this.requestedProjectId || project.id === this.requestedProjectId);

                return shouldUpdate ? { ...project, ...projectValues } : project;
              });
              updatedRows = this.projectRows.filter(
                (project) =>
                  project.userId === this.activeUserId &&
                  (!this.requestedProjectId || project.id === this.requestedProjectId)
              );
            }

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
              const projectAssetValues = values as Partial<ProjectAssetRow>;
              const requiresPendingUpload =
                projectAssetValues.uploadStatus === "uploaded" &&
                typeof projectAssetValues.objectKey === "string";

              this.projectAssetRows = this.projectAssetRows.map((asset) => {
                const shouldUpdate =
                  (!this.requestedProjectId || asset.projectId === this.requestedProjectId) &&
                  (!this.requestedProjectAssetId || asset.id === this.requestedProjectAssetId) &&
                  (!requiresPendingUpload || asset.uploadStatus === "pending");

                if (!shouldUpdate) {
                  return asset;
                }

                const nextAsset = {
                  ...asset,
                  ...projectAssetValues
                };

                nextProjectAssetRows.push(nextAsset);

                return nextAsset;
              });
              updatedRows = nextProjectAssetRows;
            }

            if (table === reverseEngineeringScanPreviews) {
              const previewValues = values as Partial<ReverseEngineeringPreviewRow>;
              const nextPreviewRows: ReverseEngineeringPreviewRow[] = [];

              this.reverseEngineeringPreviewRows = this.reverseEngineeringPreviewRows.map(
                (preview) => {
                  const claimedAt = previewValues.claimedAt;
                  const shouldUpdate =
                    preview.userId === this.activeUserId &&
                    preview.claimedAt === null &&
                    claimedAt instanceof Date &&
                    preview.expiresAt > claimedAt;

                  if (!shouldUpdate) {
                    return preview;
                  }

                  const nextPreview = { ...preview, ...previewValues };
                  nextPreviewRows.push(nextPreview);
                  return nextPreview;
                }
              );
              updatedRows = nextPreviewRows;
            }

            return {
              returning: async (selection?: Record<string, unknown>) => {
                if (table === projects && selection && "startedAt" in selection) {
                  return (updatedRows as ProjectRow[]).map((project) => ({
                    startedAt: project.deletionStartedAt
                  }));
                }

                return updatedRows;
              }
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
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const projectRows = [...this.projectRows];
        const projectDraftRows = [...this.projectDraftRows];
        const architectureRows = [...this.architectureRows];
        const reverseEngineeringPreviewRows = structuredClone(
          this.reverseEngineeringPreviewRows
        );
        const reverseEngineeringScanRows = structuredClone(this.reverseEngineeringScanRows);

        try {
          return await callback(this.createDb());
        } catch (error) {
          this.projectRows = projectRows;
          this.projectDraftRows = projectDraftRows;
          this.architectureRows = architectureRows;
          this.reverseEngineeringPreviewRows = reverseEngineeringPreviewRows;
          this.reverseEngineeringScanRows = reverseEngineeringScanRows;
          throw error;
        }
      }
    };
  }

  // gg: preview 조회는 active user owner row만 반환해 404 소유권 계약을 재현합니다.
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

    if (table === projectDrafts) {
      return this.projectDraftRows.filter(
        (draft) => !this.requestedProjectId || draft.projectId === this.requestedProjectId
      );
    }

    if (table === projectAssets) {
      return this.projectAssetRows.filter(
        (asset) =>
          (!this.requestedProjectId || asset.projectId === this.requestedProjectId) &&
          (!this.requestedProjectAssetId || asset.id === this.requestedProjectAssetId)
      );
    }

    if (table === reverseEngineeringScanPreviews) {
      return this.reverseEngineeringPreviewRows.filter(
        (preview) => preview.userId === this.activeUserId
      );
    }

    if (table === reverseEngineeringScans) {
      return this.reverseEngineeringScanRows;
    }

    if (table === deployments) {
      const rows = this.deploymentRows.filter(
        (deployment) => !this.requestedProjectId || deployment.projectId === this.requestedProjectId
      );

      if (selection && Object.keys(selection).length === 1 && "id" in selection) {
        return rows.filter(
          (deployment) => deployment.status === "RUNNING" || deployment.activeStage !== null
        );
      }

      return rows;
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
  private joined = false;

  constructor(
    private readonly resolveRows: () => unknown[],
    private readonly resolveJoinedRows?: () => unknown[]
  ) {}

  where(): this {
    return this;
  }

  for(): this {
    return this;
  }

  innerJoin(): this {
    this.joined = true;
    return this;
  }

  limit(count: number): Promise<unknown[]> {
    return Promise.resolve(this.resolveRows().slice(0, count));
  }

  orderBy(): Promise<unknown[]> {
    return Promise.resolve(this.resolveRows());
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const rows = this.joined && this.resolveJoinedRows
      ? this.resolveJoinedRows()
      : this.resolveRows();
    return Promise.resolve(rows).then(onfulfilled, onrejected);
  }
}
