import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDeployment,
  DeploymentNotFoundError,
  getDeployment,
  type CreateDeploymentInput,
  type ArchitectureRecord,
  type DeploymentLogRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAssetRecord,
  type ProjectRecord,
  type TerraformArtifactRecord
} from "./deployment-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "99999999-9999-4999-8999-999999999999";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const workspaceId = "workspace-test";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

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
      name: "findTerraformArtifactById";
      terraformArtifactId: string;
    }
  | {
      name: "createDeployment";
      input: {
        id: string;
        projectId: string;
        architectureId: string;
        terraformArtifactId: string;
        status: "PENDING";
      };
    }
  | {
      name: "findDeploymentById";
      deploymentId: string;
    };

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
  deployment: DeploymentRecord | undefined;
  deployments: DeploymentRecord[] = [];
  logs: DeploymentLogRecord[] = [];

  async findProjectByWorkspace(candidateProjectId: string, candidateWorkspaceId: string) {
    this.calls.push({
      name: "findProjectByWorkspace",
      projectId: candidateProjectId,
      workspaceId: candidateWorkspaceId
    });

    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.workspaceId !== candidateWorkspaceId
    ) {
      return undefined;
    }

    return this.project;
  }

  async findArchitectureInProject(candidateArchitectureId: string, candidateProjectId: string) {
    this.calls.push({
      name: "findArchitectureInProject",
      architectureId: candidateArchitectureId,
      projectId: candidateProjectId
    });

    if (
      !this.architecture ||
      this.architecture.id !== candidateArchitectureId ||
      this.architecture.projectId !== candidateProjectId
    ) {
      return undefined;
    }

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

    if (!this.terraformArtifactById || this.terraformArtifactById.id !== candidateTerraformArtifactId) {
      return undefined;
    }

    return this.terraformArtifactById;
  }

  async createDeployment(input: Extract<RepositoryCall, { name: "createDeployment" }>["input"]) {
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

    if (this.deployment?.id !== candidateDeploymentId) {
      return undefined;
    }

    return this.deployment;
  }

  async listDeploymentsByProject() {
    return this.deployments;
  }

  updateDeploymentStatus: DeploymentRepository["updateDeploymentStatus"] = async (candidateDeploymentId, status) => {
    if (this.deployment?.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status };

    return this.deployment;
  };

  updateDeploymentPlan: DeploymentRepository["updateDeploymentPlan"] = async (candidateDeploymentId, input) => {
    if (this.deployment?.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async (candidateDeploymentId, input) => {
    if (this.deployment?.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input };

    return this.deployment;
  };

  failDeployment: DeploymentRepository["failDeployment"] = async (candidateDeploymentId, input) => {
    if (this.deployment?.id !== candidateDeploymentId) {
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

  async listDeploymentLogs() {
    return this.logs;
  }
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
    workspaceId,
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

function createInput(overrides: Partial<CreateDeploymentInput> = {}): CreateDeploymentInput {
  return {
    projectId,
    clientGeneratedWorkspaceId: workspaceId,
    architectureId,
    terraformArtifactId,
    ...overrides
  };
}

test("createDeployment verifies project, architecture, and terraform artifact ownership before creating a record", async () => {
  const repository = new FakeDeploymentRepository();

  const deployment = await createDeployment(createInput(), repository, () => deploymentId);

  assert.equal(deployment.id, deploymentId);
  assert.equal(deployment.status, "PENDING");
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
        id: deploymentId,
        projectId,
        architectureId,
        terraformArtifactId,
        status: "PENDING"
      }
    }
  ]);
});

test("createDeployment rejects a project that does not belong to the workspace", async () => {
  const repository = new FakeDeploymentRepository();

  await assert.rejects(
    () =>
      createDeployment(
        createInput({ clientGeneratedWorkspaceId: "wrong-workspace" }),
        repository,
        () => deploymentId
      ),
    new DeploymentNotFoundError("Project not found for workspace")
  );

  assert.deepEqual(repository.calls, [
    {
      name: "findProjectByWorkspace",
      projectId,
      workspaceId: "wrong-workspace"
    }
  ]);
});

test("createDeployment rejects an architecture from another project", async () => {
  const repository = new FakeDeploymentRepository();
  repository.architecture = createArchitectureRecord({ projectId: otherProjectId });

  await assert.rejects(
    () => createDeployment(createInput(), repository, () => deploymentId),
    new DeploymentNotFoundError("Architecture not found for workspace")
  );

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
    }
  ]);
});

test("createDeployment rejects an artifact that is not a terraform file for the requested project architecture", async () => {
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifact = createProjectAssetRecord({
    projectId: otherProjectId,
    assetType: "diagram_png"
  });

  await assert.rejects(
    () => createDeployment(createInput(), repository, () => deploymentId),
    new DeploymentNotFoundError("Terraform Artifact not found for workspace")
  );

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
});

test("getDeployment returns a deployment by id", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId);

  const deployment = await getDeployment(deploymentId, repository);

  assert.equal(deployment.id, deploymentId);
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);
});

test("getDeployment rejects an unknown deployment id", async () => {
  const repository = new FakeDeploymentRepository();

  await assert.rejects(
    () => getDeployment(deploymentId, repository),
    new DeploymentNotFoundError("Deployment not found")
  );
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);
});
