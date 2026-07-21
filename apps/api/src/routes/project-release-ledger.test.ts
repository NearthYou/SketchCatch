import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";
import { ZodError } from "zod";

import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  ProjectReleaseLedgerRepository,
  SaveProjectDeploymentTargetInput
} from "../releases/project-release-ledger-service.js";
import { registerProjectReleaseLedgerRoutes } from "./project-release-ledger.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "project-release-ledger-route-test-secret-at-least-32-characters";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";

test("deployment target stores generic validated runtime Secret names", async (t) => {
  const savedInputs: SaveProjectDeploymentTargetInput[] = [];
  const app = await createTestApp(savedInputs);
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/deployment-target`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
    payload: createEcsWebTargetPayload(["API_TOKEN", "SESSION_SECRET"])
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    savedInputs[0]?.confirmedBuildConfig.ecsWeb?.api.requiredRuntimeSecrets,
    ["API_TOKEN", "SESSION_SECRET"]
  );
  assert.deepEqual(
    response.json().target.confirmedBuildConfig.ecsWeb.api.requiredRuntimeSecrets,
    ["API_TOKEN", "SESSION_SECRET"]
  );
});

test("deployment target rejects unsafe runtime Secret names and more than 32 names", async (t) => {
  const savedInputs: SaveProjectDeploymentTargetInput[] = [];
  const app = await createTestApp(savedInputs);
  t.after(() => app.close());
  const authorization = `Bearer ${await createAccessToken(userId)}`;
  const invalidNameSets = [
    ["api_token"],
    ["API-TOKEN"],
    ["1API_TOKEN"],
    ["API TOKEN"],
    ["API_TOKEN=value"],
    ["A".repeat(129)],
    Array.from({ length: 33 }, (_, index) => `SECRET_${index}`)
  ];

  for (const requiredRuntimeSecrets of invalidNameSets) {
    const response = await app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/deployment-target`,
      headers: { authorization },
      payload: createEcsWebTargetPayload(requiredRuntimeSecrets)
    });

    assert.equal(response.statusCode, 400);
  }
  assert.equal(savedInputs.length, 0);
});

async function createTestApp(savedInputs: SaveProjectDeploymentTargetInput[]) {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "bad_request", message: error.message });
    }
    throw error;
  });
  await app.register(registerProjectReleaseLedgerRoutes, {
    prefix: "/api",
    getDatabaseClient: createAuthDatabaseClient,
    createRepository: () => createRepository(savedInputs)
  });
  return app;
}

function createRepository(
  savedInputs: SaveProjectDeploymentTargetInput[]
): ProjectReleaseLedgerRepository {
  return {
    async findAccessibleProject() {
      return { id: projectId };
    },
    async findVerifiedConnection() {
      return { id: connectionId, accountId: "123456789012", region: "ap-northeast-2" };
    },
    async findProjectDeploymentTarget() {
      return undefined;
    },
    async saveProjectDeploymentTarget(input) {
      savedInputs.push(input);
      return { ...input, createdAt: input.updatedAt };
    },
    async findDeploymentInProject() {
      return undefined;
    },
    async findPipelineRunInProject() {
      return undefined;
    },
    async createApplicationRelease() {
      throw new Error("not used");
    },
    async findAvailableApplicationArtifact() {
      return undefined;
    },
    async listProjectApplicationArtifacts() {
      return [];
    },
    async listProjectApplicationReleases() {
      return [];
    },
    async findProjectApplicationRelease() {
      return undefined;
    }
  };
}

function createAuthDatabaseClient(): DatabaseClient {
  const query = {
    from() {
      return {
        where() {
          return Promise.resolve([{ id: userId, deletedAt: null }]);
        }
      };
    }
  };

  return {
    db: {
      select() {
        return query;
      }
    } as unknown as DatabaseClient["db"],
    pool: { end: async () => undefined } as DatabaseClient["pool"]
  };
}

function createEcsWebTargetPayload(requiredRuntimeSecrets: string[]) {
  return {
    provider: "aws",
    connectionId,
    region: "ap-northeast-2",
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: null,
      manifestVersion: null,
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: "2026-07-22T00:00:00.000Z",
      ecsWeb: {
        api: {
          sourceRoot: "apps/api",
          dockerfilePath: "apps/api/Dockerfile",
          containerPort: 8080,
          healthCheckPath: "/health",
          requiredRuntimeSecrets
        },
        frontend: {
          sourceRoot: "apps/web",
          packageManifestPath: "apps/web/package.json",
          lockfilePath: "pnpm-lock.yaml",
          packageManager: "pnpm",
          packageManagerVersion: "11.8.0",
          installPreset: "pnpm_frozen_lockfile",
          buildPreset: "pnpm_build",
          outputPath: "apps/web/dist"
        }
      }
    },
    runtimeConfig: {
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "app-build",
      ecrRepositoryName: "app",
      clusterName: "cluster",
      serviceName: "service",
      containerName: "app",
      outputUrl: "https://app.example.com"
    },
    rolloutStrategy: "all_at_once"
  };
}
