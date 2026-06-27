import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { AwsConnection } from "@sketchcatch/types";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  RunDeploymentInitInput,
  RunDeploymentInitResult
} from "../deployments/deployment-init-service.js";
import type {
  RunDeploymentPlanInput,
  RunDeploymentPlanResult
} from "../deployments/deployment-plan-service.js";
import type { ApproveDeploymentPlanInput } from "../deployments/deployment-approval-service.js";
import { users } from "../db/schema.js";
import {
  type ApproveDeploymentInput,
  type ArchitectureRecord,
  type CreateDeploymentRecordInput,
  type SaveDeploymentPlanInput,
  type DeploymentPlanArtifactRecord,
  type DeploymentLogRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext,
  type ProjectAssetRecord,
  type ProjectRecord,
  type TerraformArtifactRecord
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
    awsConnectionId: string | null;
    currentPlanArtifactId: string | null;
    status: string;
    planSummary: unknown;
    isBlocked: boolean;
    blockedBy: string | null;
    blockedReason: string | null;
    failureStage: string | null;
    errorSummary: string | null;
    approvedAt: string | null;
    approvedByUserId: string | null;
    approvedTerraformArtifactId: string | null;
    approvedPlanArtifactId: string | null;
    approvedTerraformArtifactHash: string | null;
    approvedTfplanHash: string | null;
    approvedAwsAccountId: string | null;
    approvedAwsRegion: string | null;
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
      name: "findTerraformArtifactById";
      terraformArtifactId: string;
    }
  | {
      name: "findVerifiedAwsConnectionById";
      awsConnectionId: string;
      accessContext: ProjectAccessContext;
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
    }
  | {
      name: "markDeploymentInitSucceeded";
      deploymentId: string;
    }
  | {
      name: "markDeploymentInitRunning";
      deploymentId: string;
    }
  | {
      name: "saveDeploymentPlan";
      input: SaveDeploymentPlanInput;
    }
  | {
      name: "findDeploymentPlanArtifactById";
      planArtifactId: string;
    }
  | {
      name: "approveDeployment";
      deploymentId: string;
      input: ApproveDeploymentInput;
    };

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const userId = "55555555-5555-4555-8555-555555555555";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

type TerraformArtifactRecordReference = {
  id: string;
  projectId: string;
  architectureId: string | null;
  assetType: "terraform_file";
  objectKey: string;
  fileName: string;
  contentType: string;
};

class FakeDeploymentRepository implements DeploymentRepository {
  readonly calls: RepositoryCall[] = [];
  project: ProjectRecord | undefined = createProjectRecord();
  architecture: ArchitectureRecord | undefined = createArchitectureRecord();
  terraformArtifact: ProjectAssetRecord | undefined = createProjectAssetRecord();
  terraformArtifactById: TerraformArtifactRecordReference | undefined = {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/terraform/main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform"
  };
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  deployment: DeploymentRecord | undefined = createDeploymentRecord(deploymentId);
  planArtifact: DeploymentPlanArtifactRecord | undefined = createDeploymentPlanArtifactRecord();
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

  async findTerraformArtifactById(candidateTerraformArtifactId: string) {
    this.calls.push({
      name: "findTerraformArtifactById",
      terraformArtifactId: candidateTerraformArtifactId
    });

    if (
      !this.terraformArtifactById ||
      this.terraformArtifactById.id !== candidateTerraformArtifactId
    ) {
      return undefined;
    }

    return this.terraformArtifactById;
  }

  async findVerifiedAwsConnectionById(
    candidateAwsConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    this.calls.push({
      name: "findVerifiedAwsConnectionById",
      awsConnectionId: candidateAwsConnectionId,
      accessContext
    });

    if (
      !this.awsConnection ||
      this.awsConnection.id !== candidateAwsConnectionId ||
      this.awsConnection.userId !== accessContext.userId ||
      this.awsConnection.status !== "verified"
    ) {
      return undefined;
    }

    return this.awsConnection;
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

  async findDeploymentPlanArtifactById(candidatePlanArtifactId: string) {
    this.calls.push({
      name: "findDeploymentPlanArtifactById",
      planArtifactId: candidatePlanArtifactId
    });

    if (!this.planArtifact || this.planArtifact.id !== candidatePlanArtifactId) {
      return undefined;
    }

    return this.planArtifact;
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

    this.deployment = {
      ...this.deployment,
      status,
      ...(status === "RUNNING" ? clearDeploymentApprovalSnapshot() : {})
    };

    return this.deployment;
  };

  markDeploymentInitRunning: DeploymentRepository["markDeploymentInitRunning"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentInitRunning",
      deploymentId: candidateDeploymentId
    });

    if (
      !this.deployment ||
      this.deployment.id !== candidateDeploymentId ||
      this.deployment.status === "RUNNING"
    ) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      ...clearDeploymentApprovalSnapshot()
    };

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

  saveDeploymentPlan: DeploymentRepository["saveDeploymentPlan"] = async (input) => {
    this.calls.push({
      name: "saveDeploymentPlan",
      input
    });

    if (!this.deployment || this.deployment.id !== input.deploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      currentPlanArtifactId: input.planArtifact.id,
      status: "PENDING",
      planSummary: input.planSummary,
      isBlocked: input.isBlocked,
      blockedBy: input.blockedBy,
      blockedReason: input.blockedReason,
      failureStage: null,
      errorSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async (candidateDeploymentId, input) => {
    this.calls.push({
      name: "approveDeployment",
      deploymentId: candidateDeploymentId,
      input
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      ...input,
      status: "PENDING",
      isBlocked: false,
      blockedBy: null,
      blockedReason: null,
      failureStage: null,
      errorSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  failDeployment: DeploymentRepository["failDeployment"] = async (_deploymentId, input) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "FAILED", ...input };

    return this.deployment;
  };

  markDeploymentInitSucceeded: DeploymentRepository["markDeploymentInitSucceeded"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentInitSucceeded",
      deploymentId: candidateDeploymentId
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "PENDING",
      failureStage: null,
      errorSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  createDeploymentLog: DeploymentRepository["createDeploymentLog"] = async (input) => {
    const deploymentLog = { ...input, createdAt: fixedNow };

    this.logs.push(deploymentLog);

    return deploymentLog;
  };

  createDeploymentLogs: DeploymentRepository["createDeploymentLogs"] = async (input) => {
    const deploymentLogs = input.map((log) => ({ ...log, createdAt: fixedNow }));

    this.logs.push(...deploymentLogs);

    return deploymentLogs;
  };

  async getNextDeploymentLogSequence(candidateDeploymentId: string) {
    const maxSequence = this.logs
      .filter((log) => log.deploymentId === candidateDeploymentId)
      .reduce((max, log) => Math.max(max, log.sequence), 0);

    return maxSequence + 1;
  }

  async listDeploymentLogs(candidateDeploymentId: string) {
    this.calls.push({
      name: "listDeploymentLogs",
      deploymentId: candidateDeploymentId
    });

    return this.logs;
  }
}

type DeploymentRouteTestOptions = {
  runDeploymentInit?: (
    input: RunDeploymentInitInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentInitResult>;
  runDeploymentPlan?: (
    input: RunDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentPlanResult>;
  approveDeploymentPlan?: (
    input: ApproveDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<DeploymentRecord>;
  userRows?: UserRecord[];
};

async function buildDeploymentTestApp(
  repository: DeploymentRepository,
  routeOptions: DeploymentRouteTestOptions = {}
) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new DeploymentRouteFakeAuthDb(routeOptions.userRows ?? [createUserRecord()]);

  await app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createDeploymentRepository: () => repository,
    ...(routeOptions.runDeploymentInit ? { runDeploymentInit: routeOptions.runDeploymentInit } : {}),
    ...(routeOptions.runDeploymentPlan ? { runDeploymentPlan: routeOptions.runDeploymentPlan } : {}),
    ...(routeOptions.approveDeploymentPlan
      ? { approveDeploymentPlan: routeOptions.approveDeploymentPlan }
      : {})
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
    awsConnectionId,
    currentPlanArtifactId: null,
    status: "PENDING",
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function clearDeploymentApprovalSnapshot(): Pick<
  DeploymentRecord,
  | "approvedAt"
  | "approvedByUserId"
  | "approvedTerraformArtifactId"
  | "approvedPlanArtifactId"
  | "approvedTerraformArtifactHash"
  | "approvedTfplanHash"
  | "approvedAwsAccountId"
  | "approvedAwsRegion"
> {
  return {
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null
  };
}

function createDeploymentPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  return {
    id: planArtifactId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256: "c".repeat(64),
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: "a".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: fixedNow,
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

function createVerifiedAwsConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: awsConnectionId,
    userId,
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "sc_conn_77777777-7777-4777-8777-777777777777_random",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-06-26T00:00:00.000Z",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides
  };
}

function createDeploymentBody() {
  return {
    architectureId,
    terraformArtifactId,
    awsConnectionId
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

async function authHeaders(activeUserId = userId): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(activeUserId)}`
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
    headers: await authHeaders(),
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 201);

  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.projectId, projectId);
  assert.equal(body.deployment.architectureId, architectureId);
  assert.equal(body.deployment.terraformArtifactId, terraformArtifactId);
  assert.equal(body.deployment.awsConnectionId, awsConnectionId);
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
      name: "findVerifiedAwsConnectionById",
      awsConnectionId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "createDeployment",
      input: {
        id: body.deployment.id,
        projectId,
        architectureId,
        terraformArtifactId,
        awsConnectionId,
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
    headers: await authHeaders(),
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
  repository.deployment = createDeploymentRecord(deploymentId, {
    approvedByUserId: userId
  });
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.approvedByUserId, userId);
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
    headers: await authHeaders()
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

test("POST /api/deployments/:deploymentId/init starts Terraform init in the background", async () => {
  const repository = new FakeDeploymentRepository();
  const initCalls: Array<{ deploymentId: string; accessContext: ProjectAccessContext }> = [];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      initCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "PENDING",
          failureStage: null,
          errorSummary: null
        }),
        terraform: {
          command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
          exitCode: 0,
          stdout: "Terraform has been successfully initialized!",
          stderr: "",
          timedOut: false
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.deepEqual(initCalls, [
    {
      deploymentId,
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("POST /api/deployments/:deploymentId/init maps missing deployments to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async () => {
      throw new Error("background init should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Deployment not found"
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/init returns accepted when background Terraform init fails", async () => {
  const repository = new FakeDeploymentRepository();
  const initCalls: string[] = [];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async (input) => {
      initCalls.push(input.deploymentId);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "FAILED",
          failureStage: "init",
          errorSummary: "Error: provider install failed"
        }),
        terraform: {
          command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
          exitCode: 1,
          stdout: "Initializing the backend...",
          stderr: "Error: provider install failed",
          timedOut: false
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.deepEqual(initCalls, [deploymentId]);

  await app.close();
});

test("POST /api/deployments/:deploymentId/init rejects a deployment that is already running", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING"
  });
  let initStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async () => {
      initStarted = true;
      throw new Error("background init should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Deployment init is already running"
  });
  assert.equal(initStarted, false);
  assert.equal(repository.deployment.status, "RUNNING");

  await app.close();
});

test("POST /api/deployments/:deploymentId/init maps missing Terraform artifacts to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifactById = undefined;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async () => {
      throw new Error("background init should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform artifact not found for deployment"
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/plan starts Terraform plan in the background", async () => {
  const repository = new FakeDeploymentRepository();
  const planCalls: RunDeploymentPlanInput[] = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "c".repeat(64),
    approvedTfplanHash: "a".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentPlan: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      planCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "PENDING",
          currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
          planSummary: {
            createCount: 1,
            updateCount: 0,
            deleteCount: 0,
            replaceCount: 0,
            blocked: true,
            warnings: []
          },
          isBlocked: true,
          blockedBy: "missing_approval",
          blockedReason: "Terraform Plan requires user approval before apply"
        }),
        terraform: {
          init: null,
          validate: null,
          plan: null,
          showJson: null
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/plan`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.approvedAt, null);
  assert.equal(body.deployment.approvedByUserId, null);
  assert.equal(body.deployment.approvedTerraformArtifactId, null);
  assert.equal(body.deployment.approvedPlanArtifactId, null);
  assert.equal(body.deployment.approvedTerraformArtifactHash, null);
  assert.equal(body.deployment.approvedTfplanHash, null);
  assert.equal(body.deployment.approvedAwsAccountId, null);
  assert.equal(body.deployment.approvedAwsRegion, null);
  assert.deepEqual(planCalls, [
    {
      deploymentId,
      startedFromStatus: "PENDING",
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("POST /api/deployments/:deploymentId/plan rejects a deployment that is already running", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING"
  });
  let planStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentPlan: async () => {
      planStarted = true;
      throw new Error("background plan should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/plan`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Deployment plan is already running"
  });
  assert.equal(planStarted, false);
  assert.equal(repository.deployment.status, "RUNNING");

  await app.close();
});

test("POST /api/deployments/:deploymentId/approve approves the current plan", async () => {
  const repository = new FakeDeploymentRepository();
  const approveCalls: Array<{ deploymentId: string; accessContext: ProjectAccessContext }> = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
    currentPlanArtifactId: planArtifactId,
    planSummary: {
      createCount: 1,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: true,
      warnings: []
    },
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Plan requires user approval before apply"
  });
  const app = await buildDeploymentTestApp(repository, {
    approveDeploymentPlan: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      approveCalls.push(input);

      return createDeploymentRecord(input.deploymentId, {
        currentPlanArtifactId: planArtifactId,
        planSummary: {
          createCount: 1,
          updateCount: 0,
          deleteCount: 0,
          replaceCount: 0,
          blocked: false,
          warnings: []
        },
        isBlocked: false,
        blockedBy: null,
        blockedReason: null,
        approvedAt: fixedNow,
        approvedByUserId: userId,
        approvedTerraformArtifactId: terraformArtifactId,
        approvedPlanArtifactId: planArtifactId,
        approvedTerraformArtifactHash: "a".repeat(64),
        approvedTfplanHash: "b".repeat(64),
        approvedAwsAccountId: "123456789012",
        approvedAwsRegion: "ap-northeast-2"
      });
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/approve`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.isBlocked, false);
  assert.equal(body.deployment.approvedByUserId, userId);
  assert.equal(body.deployment.approvedTerraformArtifactId, terraformArtifactId);
  assert.equal(body.deployment.approvedPlanArtifactId, planArtifactId);
  assert.equal(body.deployment.approvedTerraformArtifactHash, "a".repeat(64));
  assert.equal(body.deployment.approvedTfplanHash, "b".repeat(64));
  assert.equal(body.deployment.approvedAwsAccountId, "123456789012");
  assert.equal(body.deployment.approvedAwsRegion, "ap-northeast-2");
  assert.deepEqual(approveCalls, [
    {
      deploymentId,
      accessContext: {
        kind: "user",
        userId
      }
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
    headers: await authHeaders()
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
    headers: await authHeaders()
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
    headers: await authHeaders()
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
    headers: await authHeaders()
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
