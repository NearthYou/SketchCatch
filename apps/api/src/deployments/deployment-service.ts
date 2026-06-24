import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type {
  DeploymentBlockedBy,
  DeploymentFailureStage,
  DeploymentLogLevel,
  DeploymentPlanSummary,
  DeploymentStage,
  DeploymentStatus
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { architectures, deploymentLogs, deployments, projectAssets, projects, touchUpdatedAt } from "../db/schema.js";

export type DeploymentRecord = typeof deployments.$inferSelect;
export type DeploymentLogRecord = typeof deploymentLogs.$inferSelect;

export type CreateDeploymentInput = {
  projectId: string;
  clientGeneratedWorkspaceId: string;
  architectureId: string;
  terraformArtifactId: string;
};

export type CreateDeploymentRecordInput = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  status: "PENDING";
};

export type DeploymentRepository = {
  findProjectByWorkspace(projectId: string, workspaceId: string): Promise<unknown | undefined>;
  findArchitectureInProject(architectureId: string, projectId: string): Promise<unknown | undefined>;
  findTerraformArtifactForArchitecture(
    terraformArtifactId: string,
    projectId: string,
    architectureId: string
  ): Promise<unknown | undefined>;
  createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord>;
  findDeploymentById(deploymentId: string): Promise<DeploymentRecord | undefined>;

  listDeploymentsByProject?(projectId: string): Promise<DeploymentRecord[]>;
  updateDeploymentStatus?(deploymentId: string, status: DeploymentStatus): Promise<DeploymentRecord | undefined>;
  updateDeploymentPlan?(
    deploymentId: string,
    input: {
      planSummary: DeploymentPlanSummary | null;
      isBlocked: boolean;
      blockedBy: DeploymentBlockedBy | null;
      blockedReason: string | null;
    }
  ): Promise<DeploymentRecord | undefined>;
  approveDeployment?(
    deploymentId: string,
    input: {
      approvedBy: string;
      approvedTerraformArtifactId: string;
      approvedAt: Date;
    }
  ): Promise<DeploymentRecord | undefined>;
  failDeployment?(
    deploymentId: string,
    input: {
      failureStage: DeploymentFailureStage;
      errorSummary: string;
    }
  ): Promise<DeploymentRecord | undefined>;
  createDeploymentLog?(input: {
    id: string;
    deploymentId: string;
    sequence: number;
    stage: DeploymentStage;
    level: DeploymentLogLevel;
    message: string;
    relatedResourceId: string | null;
  }): Promise<DeploymentLogRecord>;
  listDeploymentLogs?(deploymentId: string): Promise<DeploymentLogRecord[]>;
};

export class DeploymentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentNotFoundError";
  }
}

export function createPostgresDeploymentRepository(db: Database): DeploymentRepository {
  return {
    async findProjectByWorkspace(projectId, workspaceId) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));

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

      return terraformArtifact;
    },

    async createDeployment(input) {
      const [deployment] = await db.insert(deployments).values(input).returning();

      if (!deployment) {
        throw new Error("Deployment creation failed");
      }

      return deployment;
    },

    async findDeploymentById(deploymentId) {
      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, deploymentId));

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
  const project = await repository.findProjectByWorkspace(input.projectId, input.clientGeneratedWorkspaceId);

  if (!project) {
    throw new DeploymentNotFoundError("Project not found for workspace");
  }

  const architecture = await repository.findArchitectureInProject(input.architectureId, input.projectId);

  if (!architecture) {
    throw new DeploymentNotFoundError("Architecture not found for workspace");
  }

  const terraformArtifact = await repository.findTerraformArtifactForArchitecture(
    input.terraformArtifactId,
    input.projectId,
    input.architectureId
  );

  if (!terraformArtifact) {
    throw new DeploymentNotFoundError("Terraform Artifact not found for workspace");
  }

  return repository.createDeployment({
    id: generateId(),
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    status: "PENDING"
  });
}

export async function getDeployment(
  deploymentId: string,
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const deployment = await repository.findDeploymentById(deploymentId);

  if (!deployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return deployment;
}

export async function listProjectDeployments(
  input: { projectId: string; clientGeneratedWorkspaceId: string },
  repository: DeploymentRepository
): Promise<DeploymentRecord[]> {
  const project = await repository.findProjectByWorkspace(input.projectId, input.clientGeneratedWorkspaceId);

  if (!project) {
    throw new DeploymentNotFoundError("Project not found for workspace");
  }

  if (!repository.listDeploymentsByProject) {
    throw new Error("Deployment repository does not support project deployment listing");
  }

  return repository.listDeploymentsByProject(input.projectId);
}

export async function listDeploymentLogs(
  deploymentId: string,
  repository: DeploymentRepository
): Promise<DeploymentLogRecord[]> {
  await getDeployment(deploymentId, repository);

  if (!repository.listDeploymentLogs) {
    throw new Error("Deployment repository does not support deployment log listing");
  }

  return repository.listDeploymentLogs(deploymentId);
}