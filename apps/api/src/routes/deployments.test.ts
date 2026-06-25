import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import { users } from "../db/schema.js";
import type {
  ArchitectureRecord,
  CreateDeploymentRecordInput,
  DeploymentLogRecord,
  DeploymentRecord,
  DeploymentRepository,
  ProjectAssetRecord,
  ProjectRecord,
  ProjectAccessContext,
  TerraformArtifactRecord
} from "../deployments/deployment-service.js";
import { registerDeploymentRoutes } from "./deployments.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

type DeploymentResponse = {
  deployment: {
    id: string;
    projectId: string;
    architectureId: string;
    terraformArtifactId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
};

type DeploymentListResponse = {
  deployments: DeploymentResponse["deployment"][];
};

type DeploymentLogsResponse = {
  logs: DeploymentLogRecord[];
};

type UserRecord = typeof users.$inferSelect;

type RepositoryCall =
  | {
      name: "findAccessibleProject";
      projectId: string;
      accessContext: ProjectAccessContext;
    }
  | {
      name: "findArchitectureInProject";
      architectureId: string;
      projectId: string;
    }
  | {
      name: "findTerraformArtifactForArchitecture";
      terraformArtifactId: string;
      projectId: string;
      architectureId: string;
    }
  | {
      name: "createDeployment";
      input: CreateDeploymentRecordInput;
    }
  | {
      name: "findDeploymentById";
      deploymentId: string;
    }
  | {
      name: "listDeploymentsByProject";
      projectId: string;
    }
  | {
      name: "listDeploymentLogs";
      deploymentId: string;
    };

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

class FakeDeploymentRepository implements DeploymentRepository {
  readonly calls: RepositoryCall[] = [];
  project: ProjectRecord | undefined = createProjectRecord();
  architecture: ArchitectureRecord | undefined = createArchitectureRecord();
  terraformArtifact: ProjectAssetRecord | undefined = createProjectAssetRecord();
  deployment: DeploymentRecord | undefined = createDeploymentRecord(deploymentId);
  deployments: DeploymentRecord[] = [createDeploymentRecord(deploymentId)];
  logs: DeploymentLogRecord[] = [];

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    return this.project;
  }

  async findArchitectureInProject(candidateArchitectureId: string, candidateProjectId: string) {
    this.calls.push({
      name: "findArchitectureInProject",
      architectureId: candidateArchitectureId,
      projectId: candidateProjectId
    });

    return this.architecture;
  }

  async findTerraformArtifactForArchitecture(
    candidateTerraformArtifactId: string,
    candidateProjectId: string,
    candidateArchitectureId: string
  ): Promise<TerraformArtifactRecord | undefined> {
    this.calls.push({
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId: candidateTerraformArtifactId,
      projectId: candidateProjectId,
      architectureId: candidateArchitectureId
    });

    if (
      !this.terraformArtifact ||
      this.terraformArtifact.id !== candidateTerraformArtifactId ||
      this.terraformArtifact.projectId !== candidateProjectId ||
      this.terraformArtifact.architectureId !== candidateArchitectureId ||
      this.terraformArtifact.assetType !== "terraform_file"
    ) {
      return undefined;
    }

    return {
      ...this.terraformArtifact,
      assetType: "terraform_file"
    };
  }

  async createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord> {
    this.calls.push({
      name: "createDeployment",
      input
    });

    this.deployment = createDeploymentRecord(input.id, input);

    return this.deployment;
  }

  async findDeploymentById(candidateDeploymentId: string) {
    this.calls.push({
      name: "findDeploymentById",
      deploymentId: candidateDeploymentId
    });

    return this.deployment;
  }

  async listDeploymentsByProject(candidateProjectId: string) {
    this.calls.push({
      name: "listDeploymentsByProject",
      projectId: candidateProjectId
    });

    return this.deployments;
  }

  updateDeploymentStatus: DeploymentRepository["updateDeploymentStatus"] = async (
    _deploymentId,
    status
  ) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status };

    return this.deployment;
  };

  updateDeploymentPlan: DeploymentRepository["updateDeploymentPlan"] = async (
    _deploymentId,
    input
  ) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async (_deploymentId, input) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input };

    return this.deployment;
  };

  failDeployment: DeploymentRepository["failDeployment"] = async (_deploymentId, input) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "FAILED", ...input };

    return this.deployment;
  };

  createDeploymentLog: DeploymentRepository["createDeploymentLog"] = async (input) => {
    const deploymentLog = { ...input, createdAt: fixedNow };

    this.logs.push(deploymentLog);

    return deploymentLog;
  };

  async listDeploymentLogs(candidateDeploymentId: string) {
    this.calls.push({
      name: "listDeploymentLogs",
      deploymentId: candidateDeploymentId
    });

    return this.logs;
  }
}

async function buildDeploymentTestApp(
  repository: DeploymentRepository,
  userRows: UserRecord[] = [createUserRecord()]
) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new DeploymentRouteFakeAuthDb(userRows);

  await app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createDeploymentRepository: () => repository
  });

  return app;
}

function createDeploymentRecord(
  id: string,
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id,
    projectId,
    architectureId,
    terraformArtifactId,
    status: "PENDING",
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedBy: null,
    approvedTerraformArtifactId: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    userId,
    name: "Test Project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createArchitectureRecord(overrides: Partial<ArchitectureRecord> = {}): ArchitectureRecord {
  return {
    id: architectureId,
    projectId,
    version: 1,
    source: "manual",
    architectureJson: {
      nodes: [],
      edges: []
    },
    createdAt: fixedNow,
    ...overrides
  };
}

function createProjectAssetRecord(overrides: Partial<ProjectAssetRecord> = {}): ProjectAssetRecord {
  return {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/terraform/main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform",
    byteSize: null,
    createdAt: fixedNow,
    ...overrides
  };
}

function createDeploymentBody() {
  return {
    architectureId,
    terraformArtifactId
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: userId,
    username: "deployment-user",
    email: "deployment@example.com",
    nickname: "Deployment User",
    passwordHash: "unused",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
    ...overrides
  };
}

function authHeaders(activeUserId = userId): Record<string, string> {
  return {
    authorization: `Bearer ${createAccessToken(activeUserId)}`
  };
}

class DeploymentRouteFakeAuthDb {
  client: DatabaseClient;

  constructor(private readonly userRows: UserRecord[]) {
    this.client = {
      db: this.createDb() as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => (table === users ? this.userRows : []))
      })
    };
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}

test("POST /api/projects/:projectId/deployments returns a created deployment", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments`,
    headers: authHeaders(),
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 201);

  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.projectId, projectId);
  assert.equal(body.deployment.architectureId, architectureId);
  assert.equal(body.deployment.terraformArtifactId, terraformArtifactId);
  assert.equal(body.deployment.status, "PENDING");
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "findArchitectureInProject",
      architectureId,
      projectId
    },
    {
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId,
      projectId,
      architectureId
    },
    {
      name: "createDeployment",
      input: {
        id: body.deployment.id,
        projectId,
        architectureId,
        terraformArtifactId,
        status: "PENDING"
      }
    }
  ]);

  await app.close();
});

test("POST /api/projects/:projectId/deployments maps ownership validation failures to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifact = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments`,
    headers: authHeaders(),
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform artifact not found for project architecture"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "findArchitectureInProject",
      architectureId,
      projectId
    },
    {
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId,
      projectId,
      architectureId
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId returns a deployment", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}`,
    headers: authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.equal((response.json() as DeploymentResponse).deployment.id, deploymentId);
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    },
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId maps missing deployments to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}`,
    headers: authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Deployment not found"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);

  await app.close();
});

test("GET /api/projects/:projectId/deployments returns project deployments", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/deployments`,
    headers: authHeaders()
  });

  assert.equal(response.statusCode, 200);

  const body = response.json() as DeploymentListResponse;
  assert.equal(body.deployments.length, 1);
  assert.equal(body.deployments[0]?.id, deploymentId);
  assert.equal(body.deployments[0]?.createdAt, fixedNow.toISOString());
  assert.equal(body.deployments[0]?.updatedAt, fixedNow.toISOString());
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "listDeploymentsByProject",
      projectId
    }
  ]);

  await app.close();
});

test("GET /api/projects/:projectId/deployments maps missing project ownership to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.project = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/deployments`,
    headers: authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Project not found"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId/logs returns an empty log list", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs`,
    headers: authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as DeploymentLogsResponse, {
    logs: []
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    },
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "listDeploymentLogs",
      deploymentId
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId/logs maps missing deployments to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs`,
    headers: authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Deployment not found"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);

  await app.close();
});
