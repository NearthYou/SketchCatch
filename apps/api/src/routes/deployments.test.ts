import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { DatabaseClient } from "../db/client.js";
import type {
  CreateDeploymentRecordInput,
  DeploymentRecord,
  DeploymentRepository
} from "../deployments/deployment-service.js";
import { registerDeploymentRoutes } from "./deployments.js";

process.env.NODE_ENV = "test";

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

type RepositoryCall =
  | {
      name: "findProjectByWorkspace";
      projectId: string;
      workspaceId: string;
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
    };

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const workspaceId = "workspace-test";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

class FakeDeploymentRepository implements DeploymentRepository {
  readonly calls: RepositoryCall[] = [];
  project: unknown | undefined = { id: projectId, workspaceId };
  architecture: unknown | undefined = { id: architectureId, projectId };
  terraformArtifact: unknown | undefined = {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file"
  };
  deployment: DeploymentRecord | undefined = createDeploymentRecord(deploymentId);

  async findProjectByWorkspace(candidateProjectId: string, candidateWorkspaceId: string) {
    this.calls.push({
      name: "findProjectByWorkspace",
      projectId: candidateProjectId,
      workspaceId: candidateWorkspaceId
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
  ) {
    this.calls.push({
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId: candidateTerraformArtifactId,
      projectId: candidateProjectId,
      architectureId: candidateArchitectureId
    });

    return this.terraformArtifact;
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
}

async function buildDeploymentTestApp(repository: DeploymentRepository) {
  const app = Fastify({ logger: false });

  await app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: () =>
      ({
        db: {} as DatabaseClient["db"],
        pool: { end: async () => undefined } as DatabaseClient["pool"]
      }) satisfies DatabaseClient,
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

function createDeploymentBody() {
  return {
    clientGeneratedWorkspaceId: workspaceId,
    architectureId,
    terraformArtifactId
  };
}

test("POST /api/projects/:projectId/deployments returns a created deployment", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments`,
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
      name: "findProjectByWorkspace",
      projectId,
      workspaceId
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
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform Artifact not found for workspace"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findProjectByWorkspace",
      projectId,
      workspaceId
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
    url: `/api/deployments/${deploymentId}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal((response.json() as DeploymentResponse).deployment.id, deploymentId);
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
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
    url: `/api/deployments/${deploymentId}`
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
