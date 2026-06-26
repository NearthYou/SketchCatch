import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AwsConnection,
  DeploymentBlockedBy,
  DeploymentFailureStage,
  DeploymentLogLevel,
  DeploymentPlanSummary,
  DeploymentStage,
  DeploymentStatus
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  architectures,
  awsConnections,
  deploymentLogs,
  deployments,
  projectAssets,
  projects,
  touchUpdatedAt
} from "../db/schema.js";
import { maskDeploymentMessage } from "./log-masking.js";

export type DeploymentRecord = typeof deployments.$inferSelect;
export type DeploymentLogRecord = typeof deploymentLogs.$inferSelect;

export type ProjectAccessContext = {
  kind: "user";
  userId: string;
};

export type CreateDeploymentInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string;
};

export type CreateDeploymentRecordInput = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string;
  status: "PENDING";
};

export type AppendDeploymentLogInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: DeploymentStage;
  level: DeploymentLogLevel;
  message: string;
  relatedResourceId?: string | null;
};

export type AppendDeploymentLogLineInput = Omit<
  AppendDeploymentLogInput,
  "deploymentId" | "accessContext"
>;

export type AppendDeploymentLogsInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  logs: AppendDeploymentLogLineInput[];
};

export type CreateDeploymentLogRecordInput = {
  id: string;
  deploymentId: string;
  sequence: number;
  stage: DeploymentStage;
  level: DeploymentLogLevel;
  message: string;
  relatedResourceId: string | null;
};

export type ProjectRecord = typeof projects.$inferSelect;
export type ArchitectureRecord = typeof architectures.$inferSelect;
export type ProjectAssetRecord = typeof projectAssets.$inferSelect;
export type TerraformArtifactRecord = Pick<
  ProjectAssetRecord,
  "id" | "projectId" | "architectureId" | "objectKey" | "fileName" | "contentType"
> & {
  assetType: "terraform_file";
};

export type DeploymentRepository = {
  findAccessibleProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<ProjectRecord | undefined>;
  findArchitectureInProject(
    architectureId: string,
    projectId: string
  ): Promise<ArchitectureRecord | undefined>;
  findTerraformArtifactForArchitecture(
    terraformArtifactId: string,
    projectId: string,
    architectureId: string
  ): Promise<TerraformArtifactRecord | undefined>;
  findTerraformArtifactById(
    terraformArtifactId: string
  ): Promise<TerraformArtifactRecord | undefined>;
  findVerifiedAwsConnectionById(
    projectId: string,
    awsConnectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnection | undefined>;
  createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord>;
  findDeploymentById(deploymentId: string): Promise<DeploymentRecord | undefined>;

  listDeploymentsByProject(projectId: string): Promise<DeploymentRecord[]>;
  updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus
  ): Promise<DeploymentRecord | undefined>;
  markDeploymentInitRunning(deploymentId: string): Promise<DeploymentRecord | undefined>;
  markDeploymentInitSucceeded(deploymentId: string): Promise<DeploymentRecord | undefined>;
  updateDeploymentPlan(
    deploymentId: string,
    input: {
      planSummary: DeploymentPlanSummary | null;
      isBlocked: boolean;
      blockedBy: DeploymentBlockedBy | null;
      blockedReason: string | null;
    }
  ): Promise<DeploymentRecord | undefined>;
  approveDeployment(
    deploymentId: string,
    input: {
      approvedByUserId: string;
      approvedTerraformArtifactId: string;
      approvedAt: Date;
    }
  ): Promise<DeploymentRecord | undefined>;
  failDeployment(
    deploymentId: string,
    input: {
      failureStage: DeploymentFailureStage;
      errorSummary: string;
    }
  ): Promise<DeploymentRecord | undefined>;
  createDeploymentLog(input: CreateDeploymentLogRecordInput): Promise<DeploymentLogRecord>;
  createDeploymentLogs(input: CreateDeploymentLogRecordInput[]): Promise<DeploymentLogRecord[]>;
  getNextDeploymentLogSequence(deploymentId: string): Promise<number>;
  listDeploymentLogs(deploymentId: string): Promise<DeploymentLogRecord[]>;
};

export class DeploymentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentNotFoundError";
  }
}

export class DeploymentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentConflictError";
  }
}

export function createPostgresDeploymentRepository(db: Database): DeploymentRepository {
  return {
    async findAccessibleProject(projectId, accessContext) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, accessContext.userId)));

      return project;
    },

    async findArchitectureInProject(architectureId, projectId) {
      const [architecture] = await db
        .select()
        .from(architectures)
        .where(and(eq(architectures.id, architectureId), eq(architectures.projectId, projectId)));

      return architecture;
    },

    async findTerraformArtifactForArchitecture(terraformArtifactId, projectId, architectureId) {
      const [terraformArtifact] = await db
        .select()
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.id, terraformArtifactId),
            eq(projectAssets.projectId, projectId),
            eq(projectAssets.architectureId, architectureId),
            eq(projectAssets.assetType, "terraform_file")
          )
        );

      if (!terraformArtifact) {
        return undefined;
      }

      return {
        ...terraformArtifact,
        assetType: "terraform_file"
      };
    },

    async findTerraformArtifactById(terraformArtifactId) {
      const [terraformArtifact] = await db
        .select({
          id: projectAssets.id,
          projectId: projectAssets.projectId,
          architectureId: projectAssets.architectureId,
          assetType: projectAssets.assetType,
          objectKey: projectAssets.objectKey,
          fileName: projectAssets.fileName,
          contentType: projectAssets.contentType
        })
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.id, terraformArtifactId),
            eq(projectAssets.assetType, "terraform_file")
          )
        );

      if (!terraformArtifact) {
        return undefined;
      }

      return {
        ...terraformArtifact,
        assetType: "terraform_file"
      };
    },

    async findVerifiedAwsConnectionById(projectId, awsConnectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, awsConnectionId),
            eq(awsConnections.projectId, projectId),
            eq(awsConnections.userId, accessContext.userId),
            eq(awsConnections.status, "verified")
          )
        )
        .limit(1);

      return awsConnection ? toAwsConnection(awsConnection) : undefined;
    },

    async createDeployment(input) {
      const [deployment] = await db.insert(deployments).values(input).returning();

      if (!deployment) {
        throw new Error("Deployment creation failed");
      }

      return deployment;
    },

    async findDeploymentById(deploymentId) {
      const [deployment] = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId));

      return deployment;
    },

    async listDeploymentsByProject(projectId) {
      return db
        .select()
        .from(deployments)
        .where(eq(deployments.projectId, projectId))
        .orderBy(desc(deployments.createdAt));
    },

    async updateDeploymentStatus(deploymentId, status) {
      const [deployment] = await db
        .update(deployments)
        .set({ status, ...touchUpdatedAt })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async markDeploymentInitRunning(deploymentId) {
      const [deployment] = await db
        .update(deployments)
        .set({ status: "RUNNING", ...touchUpdatedAt })
        .where(
          and(eq(deployments.id, deploymentId), inArray(deployments.status, ["PENDING", "FAILED"]))
        )
        .returning();

      return deployment;
    },

    async markDeploymentInitSucceeded(deploymentId) {
      const [deployment] = await db
        .update(deployments)
        .set({
          status: "PENDING",
          failureStage: null,
          errorSummary: null,
          ...touchUpdatedAt
        })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async updateDeploymentPlan(deploymentId, input) {
      const [deployment] = await db
        .update(deployments)
        .set({ ...input, ...touchUpdatedAt })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async approveDeployment(deploymentId, input) {
      const [deployment] = await db
        .update(deployments)
        .set({ ...input, ...touchUpdatedAt })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async failDeployment(deploymentId, input) {
      const [deployment] = await db
        .update(deployments)
        .set({ status: "FAILED", ...input, ...touchUpdatedAt })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async createDeploymentLog(input) {
      const [deploymentLog] = await db.insert(deploymentLogs).values(input).returning();

      if (!deploymentLog) {
        throw new Error("Deployment log creation failed");
      }

      return deploymentLog;
    },

    async createDeploymentLogs(input) {
      if (input.length === 0) {
        return [];
      }

      return db.insert(deploymentLogs).values(input).returning();
    },

    async getNextDeploymentLogSequence(deploymentId) {
      const [row] = await db
        .select({
          nextSequence: sql<number>`coalesce(max(${deploymentLogs.sequence}), 0) + 1`
        })
        .from(deploymentLogs)
        .where(eq(deploymentLogs.deploymentId, deploymentId));

      return Number(row?.nextSequence ?? 1);
    },

    async listDeploymentLogs(deploymentId) {
      return db
        .select()
        .from(deploymentLogs)
        .where(eq(deploymentLogs.deploymentId, deploymentId))
        .orderBy(asc(deploymentLogs.sequence));
    }
  };
}

export async function createDeployment(
  input: CreateDeploymentInput,
  repository: DeploymentRepository,
  generateId: () => string = randomUUID
): Promise<DeploymentRecord> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  const architecture = await repository.findArchitectureInProject(
    input.architectureId,
    input.projectId
  );

  if (!architecture) {
    throw new DeploymentNotFoundError("Architecture not found for project");
  }

  const terraformArtifact = await repository.findTerraformArtifactForArchitecture(
    input.terraformArtifactId,
    input.projectId,
    input.architectureId
  );

  if (!terraformArtifact) {
    throw new DeploymentNotFoundError("Terraform artifact not found for project architecture");
  }

  const awsConnection = await repository.findVerifiedAwsConnectionById(
    input.projectId,
    input.awsConnectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new DeploymentNotFoundError("Verified AWS connection not found for project");
  }

  return repository.createDeployment({
    id: generateId(),
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    awsConnectionId: awsConnection.id,
    status: "PENDING"
  });
}

export async function getDeployment(
  input: { deploymentId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const deployment = await repository.findDeploymentById(input.deploymentId);

  if (!deployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  await requireAccessibleProject(
    deployment.projectId,
    input.accessContext,
    repository,
    "Deployment not found"
  );

  return deployment;
}

export async function listProjectDeployments(
  input: { projectId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeploymentRecord[]> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  return repository.listDeploymentsByProject(input.projectId);
}

export async function listDeploymentLogs(
  input: { deploymentId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeploymentLogRecord[]> {
  await getDeployment(input, repository);

  return repository.listDeploymentLogs(input.deploymentId);
}

export async function appendDeploymentLog(
  input: AppendDeploymentLogInput,
  repository: DeploymentRepository,
  generateId: () => string = randomUUID
): Promise<DeploymentLogRecord> {
  const [deploymentLog] = await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence: input.sequence,
          stage: input.stage,
          level: input.level,
          message: input.message,
          relatedResourceId: input.relatedResourceId ?? null
        }
      ]
    },
    repository,
    generateId
  );

  if (!deploymentLog) {
    throw new Error("Deployment log creation failed");
  }

  return deploymentLog;
}

export async function appendDeploymentLogs(
  input: AppendDeploymentLogsInput,
  repository: DeploymentRepository,
  generateId: () => string = randomUUID
): Promise<DeploymentLogRecord[]> {
  await getDeployment(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext
    },
    repository
  );

  if (input.logs.length === 0) {
    return [];
  }

  return repository.createDeploymentLogs(
    input.logs.map((log) => ({
      id: generateId(),
      deploymentId: input.deploymentId,
      sequence: log.sequence,
      stage: log.stage,
      level: log.level,
      message: maskDeploymentMessage(log.message),
      relatedResourceId: log.relatedResourceId ?? null
    }))
  );
}

function toAwsConnection(row: typeof awsConnections.$inferSelect): AwsConnection {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    accountId: row.accountId,
    roleArn: row.roleArn,
    externalId: row.externalId,
    region: row.region,
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function requireAccessibleProject(
  projectId: string,
  accessContext: ProjectAccessContext,
  repository: DeploymentRepository,
  message: string
): Promise<ProjectRecord> {
  const project = await repository.findAccessibleProject(projectId, accessContext);

  if (!project) {
    throw new DeploymentNotFoundError(message);
  }

  return project;
}
