import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  ApiErrorResponse,
  TerraformGenerateResponse,
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

test("POST /api/terraform/validate returns diagnostics for an active user", async () => {
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
      terraformCode: `resource "aws_subnet" "public" {
  vpc_id = "aws_vpc.main.id"
}`
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.json() as TerraformValidateResponse).diagnostics[0]?.code,
    "terraform.quoted_reference"
  );

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
