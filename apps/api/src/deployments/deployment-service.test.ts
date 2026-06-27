import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection } from "@sketchcatch/types";
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
  type ProjectAccessContext,
  type SaveDeploymentPlanInput,
  type TerraformArtifactRecord
} from "./deployment-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "99999999-9999-4999-8999-999999999999";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const userId = "55555555-5555-4555-8555-555555555555";
const otherUserId = "66666666-6666-4666-8666-666666666666";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

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
      input: {
        id: string;
        projectId: string;
        architectureId: string;
        terraformArtifactId: string;
        awsConnectionId: string;
        status: "PENDING";
      };
    }
  | {
      name: "findDeploymentById";
      deploymentId: string;
    }
  | {
      name: "saveDeploymentPlan";
      input: SaveDeploymentPlanInput;
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
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  deployment: DeploymentRecord | undefined;
  deployments: DeploymentRecord[] = [];
  logs: DeploymentLogRecord[] = [];

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.userId !== accessContext.userId
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

  markDeploymentInitRunning: DeploymentRepository["markDeploymentInitRunning"] = async (
    candidateDeploymentId
  ) => {
    if (this.deployment?.id !== candidateDeploymentId || this.deployment.status === "RUNNING") {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "RUNNING" };

    return this.deployment;
  };

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

  updateDeploymentStatus: DeploymentRepository["updateDeploymentStatus"] = async (
    candidateDeploymentId,
    status
  ) => {
    if (this.deployment?.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status };

    return this.deployment;
  };

  updateDeploymentPlan: DeploymentRepository["updateDeploymentPlan"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (this.deployment?.id !== candidateDeploymentId) {
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

    if (this.deployment?.id !== input.deploymentId) {
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
      errorSummary: null
    };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async (
    candidateDeploymentId,
    input
  ) => {
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

  markDeploymentInitSucceeded: DeploymentRepository["markDeploymentInitSucceeded"] = async (
    candidateDeploymentId
  ) => {
    if (this.deployment?.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "PENDING",
      failureStage: null,
      errorSummary: null
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

function createInput(overrides: Partial<CreateDeploymentInput> = {}): CreateDeploymentInput {
  return {
    projectId,
    accessContext: {
      kind: "user",
      userId
    },
    architectureId,
    terraformArtifactId,
    awsConnectionId,
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
        id: deploymentId,
        projectId,
        architectureId,
        terraformArtifactId,
        awsConnectionId,
        status: "PENDING"
      }
    }
  ]);
});

test("createDeployment rejects a project that is not accessible to the user", async () => {
  const repository = new FakeDeploymentRepository();

  await assert.rejects(
    () =>
      createDeployment(
        createInput({
          accessContext: {
            kind: "user",
            userId: otherUserId
          }
        }),
        repository,
        () => deploymentId
      ),
    new DeploymentNotFoundError("Project not found")
  );

  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId: otherUserId
      }
    }
  ]);
});

test("createDeployment rejects an architecture from another project", async () => {
  const repository = new FakeDeploymentRepository();
  repository.architecture = createArchitectureRecord({ projectId: otherProjectId });

  await assert.rejects(
    () => createDeployment(createInput(), repository, () => deploymentId),
    new DeploymentNotFoundError("Architecture not found for project")
  );

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
    new DeploymentNotFoundError("Terraform artifact not found for project architecture")
  );

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
});

test("createDeployment rejects an AWS connection that is not verified for the user", async () => {
  const repository = new FakeDeploymentRepository();
  repository.awsConnection = createVerifiedAwsConnection({ status: "pending" });

  await assert.rejects(
    () => createDeployment(createInput(), repository, () => deploymentId),
    new DeploymentNotFoundError("Verified AWS connection not found")
  );

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
    }
  ]);
});

test("getDeployment returns a deployment by id", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId);

  const deployment = await getDeployment(
    {
      deploymentId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    repository
  );

  assert.equal(deployment.id, deploymentId);
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
});

test("getDeployment rejects a deployment from a project that is not accessible to the user", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId);
  repository.project = createProjectRecord({ userId: otherUserId });

  await assert.rejects(
    () =>
      getDeployment(
        {
          deploymentId,
          accessContext: {
            kind: "user",
            userId
          }
        },
        repository
      ),
    new DeploymentNotFoundError("Deployment not found")
  );

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
});

test("getDeployment rejects an unknown deployment id", async () => {
  const repository = new FakeDeploymentRepository();

  await assert.rejects(
    () =>
      getDeployment(
        {
          deploymentId,
          accessContext: {
            kind: "user",
            userId
          }
        },
        repository
      ),
    new DeploymentNotFoundError("Deployment not found")
  );
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);
});
