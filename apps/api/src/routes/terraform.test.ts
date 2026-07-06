import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApiErrorResponse,
  TerraformGenerateResponse,
  TerraformSyncToDiagramResponse,
  TerraformValidateRequest,
  TerraformValidateResponse
} from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ACTIVE_USER_ID = "11111111-1111-4111-8111-111111111111";

test("POST /api/terraform/generate returns Terraform code for an active user", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "node-1",
            type: "aws_vpc",
            kind: "resource",
            label: "main_vpc",
            metadata: {
              parentAreaNodeId: "area-1"
            },
            parameters: {
              resourceType: "aws_vpc",
              resourceName: "main",
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
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as TerraformGenerateResponse, {
    terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
  });

  await app.close();
});

test("POST /api/terraform/generate accepts Region and AZ area resource parameters", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "region-1",
            type: "aws_region",
            kind: "resource",
            label: "Region",
            parameters: {
              resourceType: "aws_region",
              resourceName: "ap_northeast_2",
              fileName: "main",
              values: {
                awsRegion: "ap-northeast-2"
              }
            }
          },
          {
            id: "az-1",
            type: "aws_availability_zone",
            kind: "resource",
            label: "AZ",
            metadata: {
              parentAreaNodeId: "region-1"
            },
            parameters: {
              resourceType: "aws_availability_zone",
              resourceName: "ap_northeast_2a",
              fileName: "main",
              values: {
                awsAvailabilityZone: "ap-northeast-2a"
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
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as TerraformGenerateResponse, {
    terraformCode: ""
  });

  await app.close();
});

test("POST /api/terraform/generate rejects legacy awsRegion metadata", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "node-1",
            type: "aws_vpc",
            kind: "resource",
            label: "main_vpc",
            metadata: {
              awsRegion: "ap-northeast-2"
            },
            parameters: {
              resourceType: "aws_vpc",
              resourceName: "main",
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
      }
    }
  });

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json() as ApiErrorResponse, "bad_request");

  await app.close();
});

test("POST /api/terraform/generate returns 401 without auth", async () => {
  const fakeDb = new AuthOnlyFakeDb({ users: [] });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    payload: {
      diagramJson: {
        nodes: [],
        edges: [],
        viewport: {
          x: 0,
          y: 0,
          zoom: 1
        }
      }
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("POST /api/terraform/generate returns 400 for an invalid body", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: []
      }
    }
  });

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json() as ApiErrorResponse, "bad_request");

  await app.close();
});

test("POST /api/terraform/generate rejects unsafe Terraform resource names", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "node-1",
            type: "aws_instance",
            kind: "resource",
            label: "web",
            parameters: {
              resourceType: "aws_instance",
              resourceName: `web" {\n}\nresource "aws_s3_bucket" "owned`,
              fileName: "main",
              values: {
                ami: "ami-1234567890abcdef0"
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
      }
    }
  });

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json() as ApiErrorResponse, "bad_request");

  await app.close();
});

test("POST /api/terraform/generate maps Terraform render errors to 400 responses", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/generate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "node-1",
            type: "aws_instance",
            kind: "resource",
            label: "web",
            parameters: {
              resourceType: "aws_instance",
              resourceName: "web",
              fileName: "main",
              values: {
                [`ami"\nresource "aws_s3_bucket" "owned"`]: "ami-1234567890abcdef0"
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
      }
    }
  });

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json() as ApiErrorResponse, "bad_request");

  await app.close();
});

test("POST /api/terraform/validate forwards validation input to the injected service", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  let capturedRequest: TerraformValidateRequest | null = null;
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    validateTerraformPreviewCode: async (input) => {
      capturedRequest = input;
      return {
        diagnostics: []
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "main.tf",
          terraformCode: `resource "aws_vpc" "main" {}`
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as TerraformValidateResponse, {
    diagnostics: []
  });
  assert.deepEqual(capturedRequest, {
    terraformCode: "",
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: `resource "aws_vpc" "main" {}`
      }
    ]
  });

  await app.close();
});

test("POST /api/terraform/validate returns Terraform CLI diagnostics before static fallback", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const commands: string[][] = [];
  const writtenMainFiles: string[] = [];
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    runTerraformCliValidation: async (workdir, args) => {
      commands.push([...args]);

      if (args[0] === "init") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false
        };
      }

      const mainFile = await readFile(join(workdir, "main.tf"), "utf8");
      writtenMainFiles.push(mainFile);

      return {
        exitCode: 1,
        stdout: JSON.stringify({
          valid: false,
          diagnostics: [
            {
              severity: "error",
              summary: "Unsupported argument",
              detail: "An argument named \"unknown_argument\" is not expected here.",
              range: {
                filename: "main.tf",
                start: {
                  line: 2,
                  column: 3,
                  byte: 29
                },
                end: {
                  line: 2,
                  column: 19,
                  byte: 45
                }
              }
            }
          ]
        }),
        stderr: "",
        timedOut: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "main",
          terraformCode: `resource "aws_vpc" "main" {
  unknown_argument = true
}`
        }
      ]
    }
  });

  const body = response.json() as TerraformValidateResponse;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(commands, [
    ["init", "-backend=false", "-input=false", "-no-color"],
    ["validate", "-json"]
  ]);
  assert.deepEqual(writtenMainFiles, [
    `resource "aws_vpc" "main" {
  unknown_argument = true
}`
  ]);
  assert.deepEqual(body.diagnostics, [
    {
      severity: "error",
      code: "terraform.cli.validate",
      message: "Unsupported argument: An argument named \"unknown_argument\" is not expected here.",
      sourceFileName: "main.tf",
      line: 2
    }
  ]);

  await app.close();
});

test("POST /api/terraform/validate falls back to static diagnostics when CLI execution fails", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const commands: string[][] = [];
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    runTerraformCliValidation: async (_workdir, args) => {
      commands.push([...args]);

      return {
        exitCode: 127,
        stdout: "",
        stderr: "terraform executable not found",
        timedOut: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: `resource "aws_s3_bucket" "logs" {
  bucket = "logs",
}`
    }
  });

  const body = response.json() as TerraformValidateResponse;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(commands, [["init", "-backend=false", "-input=false", "-no-color"]]);
  assert.equal(body.diagnostics[0]?.code, "terraform.trailing_comma");
  assert.equal(body.diagnostics[0]?.sourceFileName, "main.tf");

  await app.close();
});

test("POST /api/terraform/validate falls back to static diagnostics when CLI workspace preparation fails", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    runTerraformCliValidation: async () => {
      throw new Error("runner should not be called");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "../main",
          terraformCode: `resource "aws_s3_bucket" "logs" {
  bucket = "logs",
}`
        }
      ]
    }
  });

  const body = response.json() as TerraformValidateResponse;

  assert.equal(response.statusCode, 200);
  assert.equal(body.diagnostics[0]?.code, "terraform.trailing_comma");

  await app.close();
});

test("POST /api/terraform/validate masks secret-like Terraform CLI diagnostics", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    runTerraformCliValidation: async (_workdir, args) => {
      if (args[0] === "init") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false
        };
      }

      return {
        exitCode: 1,
        stdout: JSON.stringify({
          valid: false,
          diagnostics: [
            {
              severity: "error",
              summary: "Invalid provider configuration",
              detail: "AWS_SECRET_ACCESS_KEY=temporary-secret-access-key cannot be used here.",
              range: {
                filename: "main.tf",
                start: {
                  line: 1
                }
              }
            }
          ]
        }),
        stderr: "",
        timedOut: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: `provider "aws" {}`
    }
  });

  const body = response.json() as TerraformValidateResponse;
  const message = body.diagnostics[0]?.message ?? "";

  assert.equal(response.statusCode, 200);
  assert.equal(message.includes("temporary-secret-access-key"), false);
  assert.match(message, /\[REDACTED\]/);

  await app.close();
});

test("POST /api/terraform/validate rejects legacy validation mode fields", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      mode: "full",
      projectId: "project-1",
      terraformCode: `resource "aws_vpc" "main" {}`
    }
  });

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json() as ApiErrorResponse, "bad_request");

  await app.close();
});

test("POST /api/terraform/validate/prepare remains removed", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate/prepare",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      projectId: "project-1",
      provider: "aws"
    }
  });

  assert.equal(response.statusCode, 404);

  await app.close();
});

async function authHeaders(userId: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(userId)}`
  };
}

function assertErrorResponse(response: ApiErrorResponse, error: ApiErrorResponse["error"]): void {
  assert.equal(response.error, error);
  assert.equal(typeof response.message, "string");
  assert.ok(response.message.length > 0);
}

type AuthOnlyFakeUser = {
  id: string;
  deletedAt: Date | null;
};

class AuthOnlyFakeDb {
  readonly client: DatabaseClient;
  private readonly users: AuthOnlyFakeUser[];

  constructor(options: { users: AuthOnlyFakeUser[] }) {
    this.users = options.users;
    this.client = {
      db: this as unknown as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  select(): {
    from: () => {
      where: () => Promise<AuthOnlyFakeUser[]>;
    };
  } {
    return {
      from: () => ({
        where: async () => this.users
      })
    };
  }
}

test("POST /api/terraform/validate returns CLI validation results for an active user", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    runTerraformCliValidation: async (_workdir, args) => {
      if (args[0] === "init") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false
        };
      }

      return {
        exitCode: 0,
        stdout: JSON.stringify({
          valid: true,
          diagnostics: []
        }),
        stderr: "",
        timedOut: false
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: `resource "aws_subnet" "public" {
  vpc_id = "aws_vpc.main.id"
}`
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual((response.json() as TerraformValidateResponse).diagnostics, []);

  await app.close();
});

test("POST /api/terraform/validate returns 401 without auth", async () => {
  const fakeDb = new AuthOnlyFakeDb({ users: [] });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    payload: {
      terraformCode: ""
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("POST /api/terraform/validate returns 400 for an invalid body", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/validate",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      terraformCode: 123
    }
  });

  assert.equal(response.statusCode, 400);
  assertErrorResponse(response.json() as ApiErrorResponse, "bad_request");

  await app.close();
});

test("POST /api/terraform/sync-to-diagram updates matching DiagramJson values", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/sync-to-diagram",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [
          {
            id: "node-1",
            type: "aws_vpc",
            kind: "resource",
            label: "main_vpc",
            metadata: {
              parentAreaNodeId: "area-1"
            },
            parameters: {
              resourceType: "aws_vpc",
              resourceName: "main",
              fileName: "main",
              values: {
                cidrBlock: "10.0.0.0/16"
              }
            }
          }
        ],
        edges: [
          {
            id: "edge-1",
            sourceNodeId: "node-1",
            targetNodeId: "node-2"
          }
        ],
        viewport: {
          x: 0,
          y: 0,
          zoom: 1
        }
      },
      terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}`
    }
  });

  const body = response.json() as TerraformSyncToDiagramResponse;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.diagnostics, []);
  assert.deepEqual(body.diagramJson.nodes[0]?.parameters?.values, {
    cidrBlock: "10.1.0.0/16"
  });
  assert.deepEqual(body.diagramJson.nodes[0]?.metadata, {
    parentAreaNodeId: "area-1"
  });
  assert.deepEqual(body.diagramJson.edges, [
    {
      id: "edge-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2"
    }
  ]);

  await app.close();
});

test("POST /api/terraform/sync-to-diagram accepts Terraform file inputs", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/sync-to-diagram",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson: {
        nodes: [],
        edges: [],
        viewport: {
          x: 0,
          y: 0,
          zoom: 1
        }
      },
      terraformCode: "",
      terraformFiles: [
        {
          fileName: "network.tf",
          terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`
        }
      ]
    }
  });

  const body = response.json() as TerraformSyncToDiagramResponse;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.diagnostics, []);
  assert.equal(body.proposals?.[0]?.kind, "create_candidate");
  assert.equal(body.proposals?.[0]?.sourceFileName, "network.tf");

  await app.close();
});

test("POST /api/terraform/sync-to-diagram treats provider-only input as no-op", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });
  const diagramJson = {
    nodes: [
      {
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        position: { x: 0, y: 0 },
        size: { width: 160, height: 96 },
        locked: false,
        zIndex: 0,
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
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

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/sync-to-diagram",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson,
      terraformCode: `provider "aws" {
  region = "ap-northeast-2"
}`
    }
  });

  const body = response.json() as TerraformSyncToDiagramResponse;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.diagnostics, []);
  assert.deepEqual(body.proposals, []);
  assert.deepEqual(body.diagramJson, diagramJson);

  await app.close();
});

test("POST /api/terraform/sync-to-diagram returns diagnostics without mutating on unsupported input", async () => {
  const fakeDb = new AuthOnlyFakeDb({
    users: [
      {
        id: ACTIVE_USER_ID,
        deletedAt: null
      }
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });
  const diagramJson = {
    nodes: [
      {
        id: "node-1",
        type: "aws_vpc",
        kind: "resource",
        label: "main_vpc",
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "main",
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

  const response = await app.inject({
    method: "POST",
    url: "/api/terraform/sync-to-diagram",
    headers: await authHeaders(ACTIVE_USER_ID),
    payload: {
      diagramJson,
      terraformCode: `resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"abc
}`
    }
  });

  const body = response.json() as TerraformSyncToDiagramResponse;

  assert.equal(response.statusCode, 200);
  assert.equal(body.diagnostics[0]?.code, "terraform.sync.trailing_tokens");
  assert.deepEqual(body.diagramJson.nodes[0]?.parameters?.values, {
    cidrBlock: "10.0.0.0/16"
  });

  await app.close();
});
