import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import {
  registerAwsImportAccessRoutes,
  type AwsImportAccessRouteService
} from "./aws-import-access.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const ownerId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";

test("all eight import-access routes require auth and expose only safe DTOs", async () => {
  const calls: string[] = [];
  const service = createRouteService(calls);
  const app = Fastify();
  await registerAwsImportAccessRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createService: () => service
  });
  const headers = { authorization: `Bearer ${await createAccessToken(ownerId)}` };
  const routes = [
    ["GET", ""],
    ["POST", "/manager/prepare"],
    ["POST", "/manager/check"],
    ["POST", "/policy/preview"],
    ["POST", "/policy/apply"],
    ["POST", "/check"],
    ["POST", "/cleanup/prepare"],
    ["POST", "/cleanup/check"]
  ] as const;

  for (const [method, suffix] of routes) {
    const unauthenticated = await app.inject({
      method,
      url: `/aws/connections/${connectionId}/import-access${suffix}`,
      ...(suffix === "/policy/apply"
        ? { payload: { approvalId: "secret", operationId: connectionId } }
        : {})
    });
    assert.equal(unauthenticated.statusCode, 401);

    const response = await app.inject({
      method,
      url: `/aws/connections/${connectionId}/import-access${suffix}`,
      headers,
      ...(suffix === "/policy/apply"
        ? { payload: { approvalId: "secret", operationId: connectionId } }
        : {})
    });
    assert.equal(response.statusCode, 200, `${method} ${suffix}: ${response.body}`);
    assert.equal(response.json().connectionId, connectionId);
    assert.equal(response.json().state.cleanupAvailable, true);
    assert.equal(
      response.json().managerTemplateUrl,
      suffix === "/manager/prepare"
        ? "https://private.example/manager-template?signature=short"
        : undefined
    );
    assert.doesNotMatch(
      response.body,
      /arn:aws|"Action"|PolicyDocument|TemplateBody|RequestId|serviceRole/u
    );
  }

  assert.deepEqual(calls, [
    "getState",
    "prepareManager",
    "checkManager",
    "previewPolicy",
    "applyPolicy",
    "checkImportReads",
    "prepareCleanup",
    "checkCleanup"
  ]);
  await app.close();
});

test("route returns not found instead of allowing another user's connection", async () => {
  const app = Fastify();
  await registerAwsImportAccessRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createService: () => ({
      ...createRouteService([]),
      async getState() {
        throw Object.assign(new Error("not found"), { name: "AwsImportAccessNotFoundError" });
      }
    })
  });

  const response = await app.inject({
    method: "GET",
    url: `/aws/connections/${connectionId}/import-access`,
    headers: { authorization: `Bearer ${await createAccessToken(ownerId)}` }
  });

  assert.equal(response.statusCode, 404, response.body);
  assert.deepEqual(response.json(), { error: "not_found", message: "AWS 연결을 찾을 수 없습니다." });
  await app.close();
});

test("commands reject caller-provided CloudFormation control fields", async () => {
  const calls: string[] = [];
  const app = Fastify();
  await registerAwsImportAccessRoutes(app, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createService: () => createRouteService(calls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/aws/connections/${connectionId}/import-access/manager/prepare`,
    headers: { authorization: `Bearer ${await createAccessToken(ownerId)}` },
    payload: {
      TemplateBody: "caller template",
      RoleARN: "caller role",
      StackName: "caller stack"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(calls, []);
  await app.close();
});

function createRouteService(calls: string[]): AwsImportAccessRouteService {
  const response = (operationId: string) => ({
    operationId,
    state: {
      connectionId,
      status: "policy_approval_required" as const,
      nextAction: "preview_policy" as const,
      cleanupAvailable: true,
      coreReady: false,
      limitedServiceLabels: [],
      lastCheckedAt: null,
      operationId,
      safeSummary: "가져오기 권한을 확인해 주세요."
    },
    nextAction: "preview_policy" as const
  });
  return {
    async getState() { calls.push("getState"); return response("state"); },
    async prepareManager() {
      calls.push("prepareManager");
      return {
        ...response("prepare"),
        consoleUrl: "https://ap-northeast-2.console.aws.amazon.com/cloudformation/home",
        managerTemplateUrl: "https://private.example/manager-template?signature=short"
      };
    },
    async checkManager() { calls.push("checkManager"); return response("manager"); },
    async previewPolicy() {
      calls.push("previewPolicy");
      return { ...response("preview"), approvalId: "single-use-secret" };
    },
    async applyPolicy() { calls.push("applyPolicy"); return response("apply"); },
    async checkImportReads() { calls.push("checkImportReads"); return response("reads"); },
    async prepareCleanup() { calls.push("prepareCleanup"); return response("cleanup-prepare"); },
    async checkCleanup() { calls.push("checkCleanup"); return response("cleanup-check"); }
  };
}

function createAuthDatabaseClient(): DatabaseClient {
  return {
    pool: {} as DatabaseClient["pool"],
    db: {
      select() {
        return {
          from() {
            return {
              where() {
                return Promise.resolve([{ id: ownerId, deletedAt: null }]);
              }
            };
          }
        };
      }
    } as unknown as DatabaseClient["db"]
  };
}
