import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { projectDrafts, projects, users } from "../db/schema.js";
import { createBoardAutoOrganizeSourceFingerprint } from "../modules/projects/board-auto-organize-apply-service.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

type UserRow = typeof users.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type ProjectDraftRow = typeof projectDrafts.$inferSelect;

const draftDiagram: DiagramJson = {
  nodes: [
    {
      id: "node-vpc",
      type: "aws_vpc",
      kind: "resource",
      position: { x: 0, y: 0 },
      size: { width: 112, height: 108 },
      label: "VPC",
      locked: false,
      zIndex: 1,
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "vpc",
        fileName: "main",
        values: {
          cidrBlock: "10.0.0.0/16"
        }
      }
    }
  ],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

test("GET /api/projects/:id/draft restores the active user's diagramJson", async () => {
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["cache-control"] ?? "", /private, no-store/);
  assert.equal(response.json().draft.projectId, ACTIVE_PROJECT_ID);
  assert.equal(
    response.json().draft.diagramJson.nodes[0].parameters.values.cidrBlock,
    "10.0.0.0/16"
  );

  await app.close();
});

test("GET /api/projects/:id/draft 공개 응답은 과거 AWS 원본을 정리하고 일반 Board를 유지한다", async () => {
  const legacyLambdaArn =
    "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const legacyNodeId =
    "resource-arn-aws-lambda-ap-northeast-2-123456789012-function-orders-handler";
  const ordinaryNode: DiagramJson["nodes"][number] = {
    id: "design-client",
    type: "client",
    kind: "design",
    position: { x: 320, y: 0 },
    size: { width: 112, height: 108 },
    label: "Client",
    locked: false,
    zIndex: 2
  };
  const legacyDiagram: DiagramJson = {
    nodes: [
      {
        id: legacyNodeId,
        type: "unknown",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 112, height: 108 },
        label: "orders-handler",
        locked: false,
        zIndex: 1,
        metadata: {
          reverseEngineering: {
            source: "aws_scan",
            protectedValueKeys: ["providerResourceId", "providerResourceType"],
            editableValueKeys: ["displayName"]
          }
        },
        parameters: {
          resourceType: "unknown",
          resourceName:
            "resource_arn_aws_lambda_ap_northeast_2_123456789012_function_orders_handler",
          fileName: "main",
          invalid: true,
          values: {
            providerResourceType: "AWS::Lambda::Function",
            providerResourceId: legacyLambdaArn,
            functionName: "orders-handler",
            Environment: { Variables: { DATABASE_URL: "postgres://private" } },
            Role: "arn:aws:iam::123456789012:role/orders-runtime",
            KMSKeyArn: "arn:aws:kms:ap-northeast-2:123456789012:key/private",
            Layers: [{ Arn: "arn:aws:lambda:ap-northeast-2:123456789012:layer:private:1" }],
            analysisExcluded: true,
            reverseEngineeringSourceScanId: "scan-legacy",
            reverseEngineeringDraftId: "draft-legacy",
            reverseEngineeringSourceKind: "saved_scan"
          }
        }
      },
      ordinaryNode
    ],
    edges: [
      {
        id: `edge-${legacyNodeId}-design-client-uses`,
        sourceNodeId: legacyNodeId,
        targetNodeId: ordinaryNode.id,
        label: "uses"
      }
    ],
    variables: [
      {
        id: "lambda-binding",
        name: "lambda_binding",
        type: "string",
        value: "safe",
        source: "user",
        bindings: [{ nodeId: legacyNodeId, parameterKey: "functionName" }]
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const storedDiagram = structuredClone(legacyDiagram);
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ diagramJson: legacyDiagram, revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });
  const responseDiagram = response.json().draft.diagramJson as DiagramJson;
  const lambda = responseDiagram.nodes[0];

  assert.equal(response.statusCode, 200);
  assert.match(lambda?.id ?? "", /^resource-aws-ref-[a-f0-9]{24}$/u);
  assert.match(
    String(lambda?.parameters?.values["providerResourceId"]),
    /^aws-ref-[a-f0-9]{24}$/u
  );
  assert.equal(lambda?.parameters?.values["functionName"], "orders-handler");
  assert.equal(lambda?.parameters?.values["Environment"], undefined);
  assert.equal(lambda?.parameters?.values["Role"], undefined);
  assert.equal(lambda?.parameters?.values["KMSKeyArn"], undefined);
  assert.equal(lambda?.parameters?.values["Layers"], undefined);
  assert.equal(
    responseDiagram.edges[0]?.sourceNodeId,
    lambda?.id
  );
  assert.match(responseDiagram.edges[0]?.id ?? "", new RegExp(lambda?.id ?? "never"));
  assert.equal(responseDiagram.variables?.[0]?.bindings[0]?.nodeId, lambda?.id);
  assert.deepEqual(responseDiagram.nodes[1], ordinaryNode);
  assert.doesNotMatch(
    JSON.stringify(responseDiagram),
    /123456789012|resource-arn-aws-lambda|postgres:\/\/private/iu
  );
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, storedDiagram);

  await app.close();
});

test("공개 정리된 과거 AWS Draft로도 Board 자동 정리를 저장할 수 있다", async () => {
  const legacyNodeId =
    "resource-arn-aws-lambda-ap-northeast-2-123456789012-function-orders-handler";
  const legacyDiagram: DiagramJson = {
    nodes: [
      {
        id: legacyNodeId,
        type: "unknown",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 112, height: 108 },
        label: "orders-handler",
        locked: false,
        zIndex: 1,
        metadata: {
          reverseEngineering: {
            source: "aws_scan",
            protectedValueKeys: ["providerResourceId", "providerResourceType"],
            editableValueKeys: ["displayName"]
          }
        },
        parameters: {
          resourceType: "unknown",
          resourceName:
            "resource_arn_aws_lambda_ap_northeast_2_123456789012_function_orders_handler",
          fileName: "main",
          invalid: true,
          values: {
            providerResourceType: "AWS::Lambda::Function",
            providerResourceId:
              "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
            functionName: "orders-handler",
            Environment: { Variables: { TOKEN: "private" } },
            analysisExcluded: true,
            reverseEngineeringSourceScanId: "scan-legacy"
          }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ diagramJson: legacyDiagram, revision: 4 })]
  });
  const app = buildApp({ getDatabaseClient: () => fakeDb.client });
  const readResponse = await app.inject({
    method: "GET",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID)
  });
  const sourceDiagram = readResponse.json().draft.diagramJson as DiagramJson;
  const candidateDiagram = structuredClone(sourceDiagram);
  candidateDiagram.nodes[0]!.position = { x: 360, y: 180 };

  assert.match(sourceDiagram.nodes[0]?.id ?? "", /^resource-aws-ref-[a-f0-9]{24}$/u);

  const applyResponse = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft/auto-organize/apply`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      sessionId: "legacy-aws-auto-organize",
      candidateId: "arrangement-1",
      sourceDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(sourceDiagram),
      candidateDiagram,
      expectedRevision: 4,
      terraformFiles: []
    }
  });

  assert.equal(applyResponse.statusCode, 200, applyResponse.body);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, candidateDiagram);
  assert.equal(fakeDb.draftRows[0]?.revision, 5);

  await app.close();
});

test("PUT /api/projects/:id/draft upserts the active user's latest diagramJson", async () => {
  const authoritativeDiagram: DiagramJson = {
    ...draftDiagram,
    presentation: {
      geometryPolicy: "source-exact",
      terraformSourceFingerprint: '{"nodes":[{"id":"node-vpc"}],"edges":[]}'
    }
  };
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: authoritativeDiagram,
      expectedRevision: 4,
      terraformFiles: [
        { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "vpc" {}' },
        { fileName: "variables.tf", terraformCode: 'variable "cidr" { type = string }' }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().draft.revision, 5);
  assert.equal(fakeDb.draftRows[0]?.revision, 5);
  assert.equal(
    fakeDb.draftRows[0]?.diagramJson.presentation?.terraformSourceFingerprint,
    authoritativeDiagram.presentation?.terraformSourceFingerprint
  );
  assert.equal(
    response.json().draft.diagramJson.presentation.terraformSourceFingerprint,
    authoritativeDiagram.presentation?.terraformSourceFingerprint
  );
  assert.equal(fakeDb.draftRows[0]?.terraformFiles?.[1]?.fileName, "variables.tf");
  assert.equal(fakeDb.projectUpdated, true);

  await app.close();
});

test("PUT /api/projects/:id/draft preserves the revision when the saved draft is unchanged", async () => {
  const existingDraft = makeProjectDraft({ revision: 4 });
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [existingDraft]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: draftDiagram,
      expectedRevision: 4
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().draft.revision, 4);
  assert.equal(fakeDb.draftRows[0]?.revision, 4);
  assert.equal(fakeDb.projectUpdated, false);

  await app.close();
});

test("PUT /api/projects/:id/draft rejects an unchanged save when another tab wins after the read", async () => {
  const competingDiagram: DiagramJson = {
    ...draftDiagram,
    viewport: { x: 40, y: 0, zoom: 1 }
  };
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })],
    draftUpdatedBeforeNextUpdate: makeProjectDraft({
      diagramJson: competingDiagram,
      revision: 5
    })
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: draftDiagram,
      expectedRevision: 4
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().currentRevision, 5);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, competingDiagram);

  await app.close();
});

test("PUT /api/projects/:id/draft stores an empty board as the latest diagramJson", async () => {
  const emptyDiagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: emptyDiagram,
      expectedRevision: 4
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().draft.diagramJson, emptyDiagram);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, emptyDiagram);

  await app.close();
});

test("PUT /api/projects/:id/draft rejects a stale tab without replacing the latest draft", async () => {
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });
  const tabADiagram: DiagramJson = {
    ...draftDiagram,
    viewport: { x: 10, y: 0, zoom: 1 }
  };
  const tabBDiagram: DiagramJson = {
    ...draftDiagram,
    viewport: { x: 20, y: 0, zoom: 1 }
  };

  const firstSave = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: tabADiagram,
      expectedRevision: 4
    }
  });
  const staleSave = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: tabBDiagram,
      expectedRevision: 4
    }
  });

  assert.equal(firstSave.statusCode, 200);
  assert.equal(staleSave.statusCode, 409);
  assert.equal(staleSave.json().currentRevision, 5);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, tabADiagram);

  await app.close();
});

test("PUT /api/projects/:id/draft rejects a non-null revision when no server draft exists", async () => {
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: draftDiagram,
      expectedRevision: 4
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(fakeDb.draftRows.length, 0);

  await app.close();
});

test("PUT /api/projects/:id/draft does not overwrite a draft created during the first-save race", async () => {
  const competingDiagram: DiagramJson = {
    ...draftDiagram,
    viewport: { x: 30, y: 0, zoom: 1 }
  };
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    draftInsertedBeforeNextInsert: makeProjectDraft({
      diagramJson: competingDiagram,
      revision: 1
    })
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: draftDiagram,
      expectedRevision: null
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, competingDiagram);

  await app.close();
});

test("POST /api/projects/:id/draft/auto-organize/apply saves one visual-only candidate", async () => {
  const candidateDiagram = structuredClone(draftDiagram);
  candidateDiagram.nodes[0]!.position = { x: 360, y: 180 };
  const terraformFiles = [
    { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "vpc" {}' }
  ];
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4, terraformFiles })]
  });
  const app = buildApp({ getDatabaseClient: () => fakeDb.client });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft/auto-organize/apply`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      sessionId: "board-auto-session:source",
      candidateId: "arrangement-1",
      sourceDiagram: draftDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(draftDiagram),
      candidateDiagram,
      expectedRevision: 4,
      terraformFiles
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().draft.revision, 5);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, candidateDiagram);
  assert.equal(fakeDb.draftRows[0]?.terraformFiles?.[0]?.fileName, "main.tf");
  assert.equal(fakeDb.projectUpdated, true);

  await app.close();
});

test("POST /api/projects/:id/draft/auto-organize/apply rejects meaning changes without saving", async () => {
  const candidateDiagram = structuredClone(draftDiagram);
  candidateDiagram.nodes[0]!.parameters!.values.cidrBlock = "10.9.0.0/16";
  const originalDraft = makeProjectDraft({ revision: 4 });
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [originalDraft]
  });
  const app = buildApp({ getDatabaseClient: () => fakeDb.client });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft/auto-organize/apply`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      sessionId: "board-auto-session:source",
      candidateId: "arrangement-1",
      sourceDiagram: draftDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(draftDiagram),
      candidateDiagram,
      expectedRevision: 4,
      terraformFiles: []
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(fakeDb.draftRows[0]?.revision, 4);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, draftDiagram);
  assert.equal(fakeDb.projectUpdated, false);

  await app.close();
});

test("POST /api/projects/:id/draft/auto-organize/apply rejects a forged source at the current revision", async () => {
  const forgedSourceDiagram = structuredClone(draftDiagram);
  forgedSourceDiagram.nodes[0]!.parameters!.values.cidrBlock = "10.9.0.0/16";
  const forgedCandidateDiagram = structuredClone(forgedSourceDiagram);
  forgedCandidateDiagram.nodes[0]!.position = { x: 360, y: 180 };
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [makeProjectDraft({ revision: 4 })]
  });
  const app = buildApp({ getDatabaseClient: () => fakeDb.client });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft/auto-organize/apply`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      sessionId: "board-auto-session:forged",
      candidateId: "arrangement-1",
      sourceDiagram: forgedSourceDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(forgedSourceDiagram),
      candidateDiagram: forgedCandidateDiagram,
      expectedRevision: 4,
      terraformFiles: []
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(fakeDb.draftRows[0]?.revision, 4);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, draftDiagram);
  assert.equal(fakeDb.projectUpdated, false);

  await app.close();
});

test("POST /api/projects/:id/draft/auto-organize/apply cannot change Terraform files", async () => {
  const candidateDiagram = structuredClone(draftDiagram);
  candidateDiagram.nodes[0]!.position = { x: 360, y: 180 };
  const originalDraft = makeProjectDraft({
    revision: 4,
    terraformFiles: [
      { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "vpc" {}' }
    ]
  });
  const fakeDb = new ProjectDraftRouteFakeDb({
    users: [makeUser()],
    projects: [makeProject()],
    drafts: [originalDraft]
  });
  const app = buildApp({ getDatabaseClient: () => fakeDb.client });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${ACTIVE_PROJECT_ID}/draft/auto-organize/apply`,
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      sessionId: "board-auto-session:source",
      candidateId: "arrangement-1",
      sourceDiagram: draftDiagram,
      sourceFingerprint: createBoardAutoOrganizeSourceFingerprint(draftDiagram),
      candidateDiagram,
      expectedRevision: 4,
      terraformFiles: [
        { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "changed" {}' }
      ]
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(fakeDb.draftRows[0]?.revision, 4);
  assert.deepEqual(fakeDb.draftRows[0]?.diagramJson, draftDiagram);
  assert.deepEqual(fakeDb.draftRows[0]?.terraformFiles, originalDraft.terraformFiles);
  assert.equal(fakeDb.projectUpdated, false);

  await app.close();
});

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

function makeProjectDraft(overrides: Partial<ProjectDraftRow> = {}): ProjectDraftRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: ACTIVE_PROJECT_ID,
    diagramJson: draftDiagram,
    terraformFiles: null,
    revision: 1,
    serverSavedAt: new Date("2026-06-24T00:00:00.000Z"),
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

class ProjectDraftRouteFakeDb {
  userRows: UserRow[];
  projectRows: ProjectRow[];
  draftRows: ProjectDraftRow[];
  projectUpdated = false;
  draftInsertedBeforeNextInsert: ProjectDraftRow | null;
  draftUpdatedBeforeNextUpdate: ProjectDraftRow | null;
  client: DatabaseClient;

  constructor(data: {
    users?: UserRow[];
    projects?: ProjectRow[];
    drafts?: ProjectDraftRow[];
    draftInsertedBeforeNextInsert?: ProjectDraftRow;
    draftUpdatedBeforeNextUpdate?: ProjectDraftRow;
  }) {
    this.userRows = data.users ?? [];
    this.projectRows = data.projects ?? [];
    this.draftRows = data.drafts ?? [];
    this.draftInsertedBeforeNextInsert = data.draftInsertedBeforeNextInsert ?? null;
    this.draftUpdatedBeforeNextUpdate = data.draftUpdatedBeforeNextUpdate ?? null;
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
        values: (values: Partial<ProjectDraftRow>) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (table !== projectDrafts) {
                return [];
              }

              if (this.draftInsertedBeforeNextInsert) {
                this.draftRows[0] = this.draftInsertedBeforeNextInsert;
                this.draftInsertedBeforeNextInsert = null;
              }

              if (this.draftRows.length > 0) {
                return [];
              }

              const draft = makeProjectDraft(values);
              this.draftRows[0] = draft;
              return [draft];
            }
          }),
          onConflictDoUpdate: ({ set }: { set: Partial<ProjectDraftRow> }) => ({
            returning: async () => {
              if (table !== projectDrafts) {
                return [];
              }

              if (this.draftInsertedBeforeNextInsert) {
                this.draftRows[0] = this.draftInsertedBeforeNextInsert;
                this.draftInsertedBeforeNextInsert = null;
              }

              const draft = makeProjectDraft({
                ...values,
                ...set
              });
              this.draftRows[0] = draft;
              return [draft];
            }
          })
        })
      }),
      update: (table: unknown) => ({
        set: (set: Partial<ProjectDraftRow>) => ({
          where: () => {
            if (table === projects) {
              this.projectUpdated = true;
              return Promise.resolve([]);
            }

            return {
              returning: async () => {
                if (this.draftUpdatedBeforeNextUpdate) {
                  this.draftRows[0] = this.draftUpdatedBeforeNextUpdate;
                  this.draftUpdatedBeforeNextUpdate = null;
                }

                const currentDraft = this.draftRows[0];

                if (
                  table !== projectDrafts ||
                  !currentDraft ||
                  (set.revision !== currentDraft.revision &&
                    set.revision !== currentDraft.revision + 1)
                ) {
                  return [];
                }

                const draft = makeProjectDraft({
                  ...currentDraft,
                  ...set
                });
                this.draftRows[0] = draft;
                return [draft];
              }
            };
          }
        })
      })
    };
  }

  private selectRows(table: unknown, selection?: Record<string, unknown>): unknown[] {
    if (table === users) {
      return this.userRows;
    }

    if (table === projects) {
      return this.projectRows.filter((project) => project.userId === ACTIVE_USER_ID);
    }

    if (table === projectDrafts) {
      if (selection && "revision" in selection) {
        return this.draftRows.map((draft) => ({ revision: draft.revision }));
      }

      return this.draftRows;
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
