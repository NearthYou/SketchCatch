import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection } from "@sketchcatch/types";
import {
  DeploymentNotFoundError,
  type ArchitectureRecord,
  type CreateDeploymentRecordInput,
  type DeploymentPlanArtifactRecord,
  type DeploymentLogRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext,
  type ProjectRecord,
  type SaveDeploymentPlanInput,
  type TerraformArtifactRecord
} from "./deployment-service.js";
import { runDeploymentInit } from "./deployment-init-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
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
      name: "findDeploymentById";
      deploymentId: string;
    }
  | {
      name: "findDeploymentPlanArtifactById";
      planArtifactId: string;
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
      name: "updateDeploymentStatus";
      deploymentId: string;
      status: DeploymentRecord["status"];
    }
  | {
      name: "listDeploymentLogs";
      deploymentId: string;
    }
  | {
      name: "createDeploymentLog";
      input: Omit<DeploymentLogRecord, "createdAt">;
    }
  | {
      name: "createDeploymentLogs";
      input: Array<Omit<DeploymentLogRecord, "createdAt">>;
    }
  | {
      name: "getNextDeploymentLogSequence";
      deploymentId: string;
    }
  | {
      name: "markDeploymentInitSucceeded";
      deploymentId: string;
    }
  | {
      name: "saveDeploymentPlan";
      input: SaveDeploymentPlanInput;
    }
  | {
      name: "failDeployment";
      deploymentId: string;
      failureStage: NonNullable<DeploymentRecord["failureStage"]>;
      errorSummary: string;
    };

class FakeDeploymentRepository implements DeploymentRepository {
  readonly calls: RepositoryCall[] = [];
  project: ProjectRecord | undefined = createProjectRecord();
  deployment: DeploymentRecord | undefined = createDeploymentRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
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

  async findArchitectureInProject(): Promise<ArchitectureRecord | undefined> {
    return undefined;
  }

  async findTerraformArtifactForArchitecture(): Promise<TerraformArtifactRecord | undefined> {
    return undefined;
  }

  async findTerraformArtifactById(candidateTerraformArtifactId: string) {
    this.calls.push({
      name: "findTerraformArtifactById",
      terraformArtifactId: candidateTerraformArtifactId
    });

    if (!this.terraformArtifact || this.terraformArtifact.id !== candidateTerraformArtifactId) {
      return undefined;
    }

    return this.terraformArtifact;
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
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "RUNNING", updatedAt: fixedNow };

    return this.deployment;
  };

  async createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord> {
    this.deployment = createDeploymentRecord(input.id, input);

    return this.deployment;
  }

  async findDeploymentById(candidateDeploymentId: string) {
    this.calls.push({
      name: "findDeploymentById",
      deploymentId: candidateDeploymentId
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    return this.deployment;
  }

  async findDeploymentPlanArtifactById(candidatePlanArtifactId: string) {
    this.calls.push({
      name: "findDeploymentPlanArtifactById",
      planArtifactId: candidatePlanArtifactId
    });

    return createDeploymentPlanArtifactRecord({ id: candidatePlanArtifactId });
  }

  async listDeploymentsByProject(): Promise<DeploymentRecord[]> {
    return this.deployment ? [this.deployment] : [];
  }

  updateDeploymentStatus: DeploymentRepository["updateDeploymentStatus"] = async (
    candidateDeploymentId,
    status
  ) => {
    this.calls.push({
      name: "updateDeploymentStatus",
      deploymentId: candidateDeploymentId,
      status
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status, updatedAt: fixedNow };

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

  updateDeploymentPlan: DeploymentRepository["updateDeploymentPlan"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input, updatedAt: fixedNow };

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

  approveDeployment: DeploymentRepository["approveDeployment"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input, updatedAt: fixedNow };

    return this.deployment;
  };

  failDeployment: DeploymentRepository["failDeployment"] = async (candidateDeploymentId, input) => {
    this.calls.push({
      name: "failDeployment",
      deploymentId: candidateDeploymentId,
      failureStage: input.failureStage,
      errorSummary: input.errorSummary
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "FAILED",
      failureStage: input.failureStage,
      errorSummary: input.errorSummary,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  createDeploymentLog: DeploymentRepository["createDeploymentLog"] = async (input) => {
    this.calls.push({
      name: "createDeploymentLog",
      input
    });

    const deploymentLog = { ...input, createdAt: fixedNow };
    this.logs.push(deploymentLog);

    return deploymentLog;
  };

  createDeploymentLogs: DeploymentRepository["createDeploymentLogs"] = async (input) => {
    this.calls.push({
      name: "createDeploymentLogs",
      input
    });

    const deploymentLogs = input.map((log) => ({ ...log, createdAt: fixedNow }));
    this.logs.push(...deploymentLogs);

    return deploymentLogs;
  };

  async getNextDeploymentLogSequence(candidateDeploymentId: string) {
    this.calls.push({
      name: "getNextDeploymentLogSequence",
      deploymentId: candidateDeploymentId
    });

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

    return this.logs.filter((log) => log.deploymentId === candidateDeploymentId);
  }
}

function createDeploymentRecord(
  id = deploymentId,
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

function createDeploymentPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    deploymentId,
    terraformArtifactId,
    objectKey: "deployments/deployment-id/plans/plan-id.tfplan",
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

function createTerraformArtifactRecord(
  overrides: Partial<TerraformArtifactRecord> = {}
): TerraformArtifactRecord {
  return {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/assets/terraform_file/artifact-main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform",
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

function createAccessContext(): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}

test("runDeploymentInit restores the artifact, runs Terraform init, logs output, and returns status to PENDING", async () => {
  const repository = new FakeDeploymentRepository();
  const workspaceInputs: Array<{ objectKey: string; fileName?: string | null }> = [];
  const runnerWorkdirs: string[] = [];
  const runnerEnvs: Array<NodeJS.ProcessEnv | undefined> = [];
  let cleanupCalled = false;

  const result = await runDeploymentInit(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      prepareTerraformWorkspace: async (input) => {
        workspaceInputs.push(input);

        return {
          workdir: "C:/tmp/sketchcatch-terraform-success",
          mainFilePath: "C:/tmp/sketchcatch-terraform-success/main.tf",
          cleanup: async () => {
            cleanupCalled = true;
          }
        };
      },
      runTerraformInit: async (workdir, options) => {
        runnerWorkdirs.push(workdir);
        runnerEnvs.push(options?.env);

        return {
          command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
          exitCode: 0,
          stdout: "Initializing the backend...\nTerraform has been successfully initialized!\n",
          stderr: "",
          timedOut: false
        };
      },
      prepareTerraformAwsCredentialEnv: async (awsConnection) => {
        assert.equal(awsConnection.id, awsConnectionId);

        return {
          env: {
            AWS_ACCESS_KEY_ID: "temporary-access-key-id",
            AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
            AWS_SESSION_TOKEN: "temporary-session-token",
            AWS_REGION: "ap-northeast-2"
          },
          accountId: "123456789012",
          callerArn:
            "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-terraform",
          region: "ap-northeast-2"
        };
      }
    }
  );

  assert.equal(result.deployment.status, "PENDING");
  assert.equal(result.deployment.failureStage, null);
  assert.equal(result.deployment.errorSummary, null);
  assert.deepEqual(workspaceInputs, [
    {
      objectKey: "projects/project-id/assets/terraform_file/artifact-main.tf",
      fileName: "main.tf"
    }
  ]);
  assert.deepEqual(runnerWorkdirs, ["C:/tmp/sketchcatch-terraform-success"]);
  assert.deepEqual(runnerEnvs, [
    {
      AWS_ACCESS_KEY_ID: "temporary-access-key-id",
      AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
      AWS_SESSION_TOKEN: "temporary-session-token",
      AWS_REGION: "ap-northeast-2"
    }
  ]);
  assert.equal(cleanupCalled, true);
  assert.deepEqual(
    repository.logs.map((log) => ({
      sequence: log.sequence,
      stage: log.stage,
      level: log.level,
      message: log.message
    })),
    [
      {
        sequence: 1,
        stage: "init",
        level: "INFO",
        message: "Initializing the backend..."
      },
      {
        sequence: 2,
        stage: "init",
        level: "INFO",
        message: "Terraform has been successfully initialized!"
      }
    ]
  );
  assert(repository.calls.some((call) => call.name === "findDeploymentById"));
  assert(
    repository.calls.some(
      (call) =>
        call.name === "findAccessibleProject" &&
        call.projectId === projectId &&
        call.accessContext.userId === userId
    )
  );
  assert(repository.calls.some((call) => call.name === "findTerraformArtifactById"));
  assert(
    repository.calls.some(
      (call) =>
        call.name === "findVerifiedAwsConnectionById" &&
        call.awsConnectionId === awsConnectionId &&
        call.accessContext.userId === userId
    )
  );
  assert(
    repository.calls.some(
      (call) => call.name === "getNextDeploymentLogSequence" && call.deploymentId === deploymentId
    )
  );
  assert.equal(repository.calls.filter((call) => call.name === "createDeploymentLogs").length, 1);
  assert(!repository.calls.some((call) => call.name === "createDeploymentLog"));
  assert(!repository.calls.some((call) => call.name === "listDeploymentLogs"));
  assert(repository.calls.some((call) => call.name === "markDeploymentInitSucceeded"));
});

test("runDeploymentInit records failed init output, marks the deployment failed, and masks secret logs", async () => {
  const repository = new FakeDeploymentRepository();
  let cleanupCalled = false;

  const result = await runDeploymentInit(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-failure",
        mainFilePath: "C:/tmp/sketchcatch-terraform-failure/main.tf",
        cleanup: async () => {
          cleanupCalled = true;
        }
      }),
      runTerraformInit: async () => ({
        command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
        exitCode: 1,
        stdout: "Initializing the backend...\n",
        stderr: "Error: provider install failed\naws_secret_access_key = super-secret\n",
        timedOut: false
      }),
      prepareTerraformAwsCredentialEnv: async () => ({
        env: {
          AWS_ACCESS_KEY_ID: "temporary-access-key-id",
          AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
          AWS_SESSION_TOKEN: "temporary-session-token",
          AWS_REGION: "ap-northeast-2"
        },
        accountId: "123456789012",
        callerArn:
          "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-terraform",
        region: "ap-northeast-2"
      })
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "init");
  assert.equal(result.deployment.errorSummary, "Error: provider install failed");
  assert.equal(cleanupCalled, true);
  assert.deepEqual(
    repository.logs.map((log) => ({
      sequence: log.sequence,
      stage: log.stage,
      level: log.level,
      message: log.message
    })),
    [
      {
        sequence: 1,
        stage: "init",
        level: "INFO",
        message: "Initializing the backend..."
      },
      {
        sequence: 2,
        stage: "init",
        level: "ERROR",
        message: "Error: provider install failed"
      },
      {
        sequence: 3,
        stage: "init",
        level: "ERROR",
        message: "[REDACTED]"
      }
    ]
  );
  assert(repository.calls.some((call) => call.name === "failDeployment"));
});

test("runDeploymentInit masks secret values in terraform failure summaries", async () => {
  const repository = new FakeDeploymentRepository();

  const result = await runDeploymentInit(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-secret-summary",
        mainFilePath: "C:/tmp/sketchcatch-terraform-secret-summary/main.tf",
        cleanup: async () => undefined
      }),
      runTerraformInit: async () => ({
        command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
        exitCode: 1,
        stdout: "",
        stderr: "Error: AWS_SECRET_ACCESS_KEY=temporary-secret-access-key\n",
        timedOut: false
      }),
      prepareTerraformAwsCredentialEnv: async () => ({
        env: {
          AWS_ACCESS_KEY_ID: "temporary-access-key-id",
          AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
          AWS_SESSION_TOKEN: "temporary-session-token",
          AWS_REGION: "ap-northeast-2"
        },
        accountId: "123456789012",
        callerArn:
          "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-terraform",
        region: "ap-northeast-2"
      })
    }
  );

  assert.equal(result.deployment.errorSummary, "Error: [REDACTED]");
  assert.equal(result.deployment.errorSummary.includes("temporary-secret-access-key"), false);
});

test("runDeploymentInit requires a verified AWS connection before preparing the Terraform workspace", async () => {
  const repository = new FakeDeploymentRepository();
  repository.awsConnection = undefined;
  let workspacePrepared = false;
  let terraformRan = false;

  await assert.rejects(
    () =>
      runDeploymentInit(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          prepareTerraformWorkspace: async () => {
            workspacePrepared = true;
            throw new Error("workspace should not be prepared");
          },
          runTerraformInit: async () => {
            terraformRan = true;
            throw new Error("terraform should not run");
          },
          prepareTerraformAwsCredentialEnv: async () => {
            throw new Error("AWS credential env should not be prepared");
          }
        }
      ),
    new DeploymentNotFoundError("Verified AWS connection not found for deployment")
  );

  assert.equal(workspacePrepared, false);
  assert.equal(terraformRan, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.failureStage, "init");
  assert.equal(
    repository.deployment?.errorSummary,
    "Verified AWS connection not found for deployment"
  );
});

test("runDeploymentInit rejects an unknown deployment", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;

  await assert.rejects(
    () =>
      runDeploymentInit(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          prepareTerraformWorkspace: async () => {
            throw new Error("workspace should not be prepared");
          },
          runTerraformInit: async () => {
            throw new Error("terraform should not run");
          }
        }
      ),
    new DeploymentNotFoundError("Deployment not found")
  );
});

test("runDeploymentInit rejects a deployment from a project that is not accessible to the user", async () => {
  const repository = new FakeDeploymentRepository();
  repository.project = createProjectRecord({ userId: otherUserId });

  await assert.rejects(
    () =>
      runDeploymentInit(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          prepareTerraformWorkspace: async () => {
            throw new Error("workspace should not be prepared");
          },
          runTerraformInit: async () => {
            throw new Error("terraform should not run");
          }
        }
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

test("runDeploymentInit rejects a missing Terraform artifact", async () => {
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifact = undefined;

  await assert.rejects(
    () =>
      runDeploymentInit(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          prepareTerraformWorkspace: async () => {
            throw new Error("workspace should not be prepared");
          },
          runTerraformInit: async () => {
            throw new Error("terraform should not run");
          }
        }
      ),
    new DeploymentNotFoundError("Terraform artifact not found for deployment")
  );
});

test("runDeploymentInit marks the deployment failed when workspace preparation throws", async () => {
  const repository = new FakeDeploymentRepository();
  let terraformRan = false;

  await assert.rejects(
    () =>
      runDeploymentInit(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          prepareTerraformWorkspace: async () => {
            throw new Error("S3 download failed: token = not-real");
          },
          runTerraformInit: async () => {
            terraformRan = true;
            throw new Error("terraform should not run");
          },
          prepareTerraformAwsCredentialEnv: async () => ({
            env: {
              AWS_ACCESS_KEY_ID: "temporary-access-key-id",
              AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
              AWS_SESSION_TOKEN: "temporary-session-token",
              AWS_REGION: "ap-northeast-2"
            },
            accountId: "123456789012",
            callerArn:
              "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-terraform",
            region: "ap-northeast-2"
          })
        }
      ),
    /S3 download failed/
  );

  assert.equal(terraformRan, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.failureStage, "init");
  assert.equal(repository.deployment?.errorSummary, "S3 download failed: [REDACTED]");
  assert(
    repository.calls.some(
      (call) =>
        call.name === "failDeployment" &&
        call.deploymentId === deploymentId &&
        call.failureStage === "init" &&
        call.errorSummary === "S3 download failed: [REDACTED]"
    )
  );
});
