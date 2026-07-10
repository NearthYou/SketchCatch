import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import type {
  AwsConnection,
  DeployedResource,
  DeploymentBlockedBy,
  DeploymentFailureStage,
  DeploymentLiveProfile,
  DeploymentLogLevel,
  DeploymentPlanSummary,
  DeploymentStage,
  DeploymentStatus,
  TerraformOutput
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  architectures,
  awsConnections,
  deploymentLogs,
  deploymentPlanArtifacts,
  deployedResources,
  deployments,
  projectAssets,
  projects,
  terraformOutputs,
  touchUpdatedAt
} from "../db/schema.js";
import { maskDeploymentMessage } from "./log-masking.js";

export type DeploymentRecord = typeof deployments.$inferSelect;
export type DeploymentLogRecord = typeof deploymentLogs.$inferSelect;
export type DeploymentPlanArtifactRecord = typeof deploymentPlanArtifacts.$inferSelect;
export type DeployedResourceRecord = typeof deployedResources.$inferSelect;
export type TerraformOutputRecord = typeof terraformOutputs.$inferSelect;

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
  liveProfile?: DeploymentLiveProfile | undefined;
};

export type CreateDeploymentRecordInput = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string;
  liveProfile: DeploymentLiveProfile;
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

export type CreateDeploymentPlanArtifactRecordInput = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  terraformArtifactSha256: string;
  operation: "apply" | "destroy";
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
};

export type SaveDeploymentPlanInput = {
  deploymentId: string;
  planArtifact: CreateDeploymentPlanArtifactRecordInput;
  planSummary: DeploymentPlanSummary;
  isBlocked: boolean;
  blockedBy: DeploymentBlockedBy | null;
  blockedReason: string | null;
  terminalStatus?: "PENDING" | "SUCCESS" | "FAILED";
  failureStage?: DeploymentFailureStage | null;
  errorSummary?: string | null;
};

export type ApproveDeploymentInput = {
  approvedByUserId: string;
  approvedAt: Date;
  approvedTerraformArtifactId: string;
  approvedPlanArtifactId: string;
  approvedTerraformArtifactHash: string;
  approvedTfplanHash: string;
  approvedAwsAccountId: string;
  approvedAwsRegion: string;
  planSummary: DeploymentPlanSummary;
  status?: "PENDING" | "SUCCESS" | "FAILED";
  preserveFailureDetails?: boolean;
};

export type CreateDeployedResourceRecordInput = {
  id: string;
  deploymentId: string;
  terraformAddress: string;
  terraformType: string;
  providerName: string | null;
  resourceId: string | null;
  region: string;
};

export type CreateTerraformOutputRecordInput = {
  id: string;
  deploymentId: string;
  name: string;
  value: unknown | null;
  sensitive: boolean;
};

export type CompleteDeploymentApplyInput = {
  stateObjectKey: string | null;
  resultWarningSummary: string | null;
  resources: CreateDeployedResourceRecordInput[];
  outputs: CreateTerraformOutputRecordInput[];
};

export type CompleteDeploymentDestroyInput = {
  resultWarningSummary: string | null;
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
export type DeploymentProjectRecord = {
  project: ProjectRecord;
  deployment: DeploymentRecord;
};

export type RecoverInterruptedDeploymentsInput = {
  excludeDeploymentIds?: readonly string[];
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
    awsConnectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnection | undefined>;
  createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord>;
  findDeploymentById(deploymentId: string): Promise<DeploymentRecord | undefined>;
  findDeploymentPlanArtifactById(
    planArtifactId: string
  ): Promise<DeploymentPlanArtifactRecord | undefined>;
  findRunningDeploymentInProject(projectId: string): Promise<DeploymentRecord | undefined>;

  listDeploymentProjectRows?(
    accessContext: ProjectAccessContext
  ): Promise<DeploymentProjectRecord[]>;
  listDeploymentsByProject(projectId: string): Promise<DeploymentRecord[]>;
  updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus
  ): Promise<DeploymentRecord | undefined>;
  markDeploymentInitRunning(deploymentId: string): Promise<DeploymentRecord | undefined>;
  markDeploymentPlanRunning(deploymentId: string): Promise<DeploymentRecord | undefined>;
  markDeploymentApplyRunning(deploymentId: string): Promise<DeploymentRecord | undefined>;
  markDeploymentDestroyRunning(deploymentId: string): Promise<DeploymentRecord | undefined>;
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
  saveDeploymentPlan(input: SaveDeploymentPlanInput): Promise<DeploymentRecord | undefined>;
  approveDeployment(
    deploymentId: string,
    input: ApproveDeploymentInput
  ): Promise<DeploymentRecord | undefined>;
  completeDeploymentApply(
    deploymentId: string,
    input: CompleteDeploymentApplyInput
  ): Promise<DeploymentRecord | undefined>;
  completeDeploymentDestroy(
    deploymentId: string,
    input: CompleteDeploymentDestroyInput
  ): Promise<DeploymentRecord | undefined>;
  failDeployment(
    deploymentId: string,
    input: {
      failureStage: DeploymentFailureStage;
      errorSummary: string;
      stateObjectKey?: string | null;
      resultWarningSummary?: string | null;
    }
  ): Promise<DeploymentRecord | undefined>;
  requestDeploymentCancellation(deploymentId: string): Promise<DeploymentRecord | undefined>;
  cancelDeployment(
    deploymentId: string,
    input: {
      errorSummary: string;
    }
  ): Promise<DeploymentRecord | undefined>;
  recoverInterruptedDeployments(
    input?: RecoverInterruptedDeploymentsInput
  ): Promise<DeploymentRecord[]>;
  createDeploymentLog(input: CreateDeploymentLogRecordInput): Promise<DeploymentLogRecord>;
  createDeploymentLogs(input: CreateDeploymentLogRecordInput[]): Promise<DeploymentLogRecord[]>;
  getNextDeploymentLogSequence(deploymentId: string): Promise<number>;
  listDeploymentLogs(
    deploymentId: string,
    options?: {
      afterSequence?: number;
      limit?: number;
    }
  ): Promise<DeploymentLogRecord[]>;
  listDeployedResources(deploymentId: string): Promise<DeployedResourceRecord[]>;
  listTerraformOutputs(deploymentId: string): Promise<TerraformOutputRecord[]>;
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

const clearDeploymentApprovalFields = {
  approvedAt: null,
  approvedByUserId: null,
  approvedTerraformArtifactId: null,
  approvedPlanArtifactId: null,
  approvedTerraformArtifactHash: null,
  approvedTfplanHash: null,
  approvedAwsAccountId: null,
  approvedAwsRegion: null
};

function createRunningDeploymentValues(activeStage: DeploymentStage) {
  return {
    status: "RUNNING" as const,
    activeStage,
    startedAt: sql`now()`,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    failureStage: null,
    errorSummary: null,
    ...touchUpdatedAt
  };
}

function createTerminalDeploymentValues(
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "DESTROYED"
) {
  return {
    status,
    activeStage: null,
    completedAt: sql`now()`,
    ...touchUpdatedAt
  };
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
            eq(projectAssets.assetType, "terraform_file"),
            eq(projectAssets.uploadStatus, "uploaded")
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
            eq(projectAssets.assetType, "terraform_file"),
            eq(projectAssets.uploadStatus, "uploaded")
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

    async findVerifiedAwsConnectionById(awsConnectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, awsConnectionId),
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

    async findDeploymentPlanArtifactById(planArtifactId) {
      const [planArtifact] = await db
        .select()
        .from(deploymentPlanArtifacts)
        .where(eq(deploymentPlanArtifacts.id, planArtifactId));

      return planArtifact;
    },

    async findRunningDeploymentInProject(projectId) {
      const [deployment] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.projectId, projectId), eq(deployments.status, "RUNNING")))
        .limit(1);

      return deployment;
    },

    async listDeploymentProjectRows(accessContext) {
      return db
        .select({
          project: projects,
          deployment: deployments
        })
        .from(deployments)
        .innerJoin(projects, eq(deployments.projectId, projects.id))
        .where(and(eq(projects.userId, accessContext.userId), eq(deployments.status, "SUCCESS")))
        .orderBy(
          desc(deployments.completedAt),
          desc(deployments.updatedAt),
          desc(deployments.createdAt)
        );
    },

    async listDeploymentsByProject(projectId) {
      return db
        .select()
        .from(deployments)
        .where(eq(deployments.projectId, projectId))
        .orderBy(desc(deployments.createdAt));
    },

    async updateDeploymentStatus(deploymentId, status) {
      const nextValues =
        status === "RUNNING"
          ? {
              ...createRunningDeploymentValues("init"),
              ...clearDeploymentApprovalFields
            }
          : { status, activeStage: null, ...touchUpdatedAt };
      const [deployment] = await db
        .update(deployments)
        .set(nextValues)
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async markDeploymentInitRunning(deploymentId) {
      try {
        const [deployment] = await db
          .update(deployments)
          .set({
            ...createRunningDeploymentValues("init"),
            ...clearDeploymentApprovalFields
          })
          .where(
            and(
              eq(deployments.id, deploymentId),
              inArray(deployments.status, ["PENDING", "FAILED"])
            )
          )
          .returning();

        return deployment;
      } catch (error) {
        if (isDeploymentProjectRunningUniqueViolation(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async markDeploymentPlanRunning(deploymentId) {
      try {
        const [deployment] = await db
          .update(deployments)
          .set({
            ...createRunningDeploymentValues("plan"),
            resultWarningSummary: null,
            ...clearDeploymentApprovalFields
          })
          .where(
            and(
              eq(deployments.id, deploymentId),
              inArray(deployments.status, ["PENDING", "FAILED", "SUCCESS"])
            )
          )
          .returning();

        return deployment;
      } catch (error) {
        if (isDeploymentProjectRunningUniqueViolation(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async markDeploymentInitSucceeded(deploymentId) {
      const [deployment] = await db
        .update(deployments)
        .set({
          ...createTerminalDeploymentValues("PENDING"),
          failureStage: null,
          errorSummary: null
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

    async markDeploymentApplyRunning(deploymentId) {
      try {
        const [deployment] = await db
          .update(deployments)
          .set({
            ...createRunningDeploymentValues("apply"),
            resultWarningSummary: null
          })
          .where(and(eq(deployments.id, deploymentId), eq(deployments.status, "PENDING")))
          .returning();

        return deployment;
      } catch (error) {
        if (isDeploymentProjectRunningUniqueViolation(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async markDeploymentDestroyRunning(deploymentId) {
      try {
        const [deployment] = await db
          .update(deployments)
          .set({
            ...createRunningDeploymentValues("destroy"),
            resultWarningSummary: null
          })
          .where(
            and(
              eq(deployments.id, deploymentId),
              inArray(deployments.status, ["SUCCESS", "FAILED"])
            )
          )
          .returning();

        return deployment;
      } catch (error) {
        if (isDeploymentProjectRunningUniqueViolation(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async saveDeploymentPlan(input) {
      return db.transaction(async (tx) => {
        await tx.insert(deploymentPlanArtifacts).values(input.planArtifact);
        const terminalStatus = input.terminalStatus ?? "PENDING";

        const [deployment] = await tx
          .update(deployments)
          .set({
            currentPlanArtifactId: input.planArtifact.id,
            ...createTerminalDeploymentValues(terminalStatus),
            planSummary: input.planSummary,
            isBlocked: input.isBlocked,
            blockedBy: input.blockedBy,
            blockedReason: input.blockedReason,
            failureStage: input.failureStage ?? null,
            errorSummary: input.errorSummary ?? null,
            ...clearDeploymentApprovalFields
          })
          .where(eq(deployments.id, input.deploymentId))
          .returning();

        if (!deployment) {
          throw new Error("Deployment plan could not be saved");
        }

        return deployment;
      });
    },

    async approveDeployment(deploymentId, input) {
      const nextValues = {
        approvedByUserId: input.approvedByUserId,
        approvedAt: input.approvedAt,
        approvedTerraformArtifactId: input.approvedTerraformArtifactId,
        approvedPlanArtifactId: input.approvedPlanArtifactId,
        approvedTerraformArtifactHash: input.approvedTerraformArtifactHash,
        approvedTfplanHash: input.approvedTfplanHash,
        approvedAwsAccountId: input.approvedAwsAccountId,
        approvedAwsRegion: input.approvedAwsRegion,
        planSummary: input.planSummary,
        isBlocked: false,
        blockedBy: null,
        blockedReason: null,
        ...(input.preserveFailureDetails ? {} : { failureStage: null, errorSummary: null }),
        status: input.status ?? "PENDING",
        activeStage: null,
        ...touchUpdatedAt
      };
      const [deployment] = await db
        .update(deployments)
        .set(nextValues)
        .where(
          and(
            eq(deployments.id, deploymentId),
            eq(deployments.currentPlanArtifactId, input.approvedPlanArtifactId),
            inArray(deployments.status, ["PENDING", "SUCCESS", "FAILED"])
          )
        )
        .returning();

      return deployment;
    },

    async completeDeploymentApply(deploymentId, input) {
      return db.transaction(async (tx) => {
        await tx.delete(deployedResources).where(eq(deployedResources.deploymentId, deploymentId));
        await tx.delete(terraformOutputs).where(eq(terraformOutputs.deploymentId, deploymentId));

        if (input.resources.length > 0) {
          await tx.insert(deployedResources).values(input.resources);
        }

        if (input.outputs.length > 0) {
          await tx.insert(terraformOutputs).values(input.outputs);
        }

        const [deployment] = await tx
          .update(deployments)
          .set({
            ...createTerminalDeploymentValues("SUCCESS"),
            stateObjectKey: input.stateObjectKey,
            resultWarningSummary: input.resultWarningSummary,
            failureStage: null,
            errorSummary: null
          })
          .where(eq(deployments.id, deploymentId))
          .returning();

        if (!deployment) {
          throw new Error("Deployment apply could not be completed");
        }

        return deployment;
      });
    },

    async completeDeploymentDestroy(deploymentId, input) {
      return db.transaction(async (tx) => {
        await tx.delete(deployedResources).where(eq(deployedResources.deploymentId, deploymentId));
        await tx.delete(terraformOutputs).where(eq(terraformOutputs.deploymentId, deploymentId));

        const [deployment] = await tx
          .update(deployments)
          .set({
            ...createTerminalDeploymentValues("DESTROYED"),
            currentPlanArtifactId: null,
            stateObjectKey: null,
            resultWarningSummary: input.resultWarningSummary,
            failureStage: null,
            errorSummary: null,
            ...clearDeploymentApprovalFields
          })
          .where(eq(deployments.id, deploymentId))
          .returning();

        if (!deployment) {
          throw new Error("Deployment destroy could not be completed");
        }

        return deployment;
      });
    },

    async failDeployment(deploymentId, input) {
      const [deployment] = await db
        .update(deployments)
        .set({
          ...createTerminalDeploymentValues("FAILED"),
          failedAt: sql`now()`,
          ...input,
          ...clearDeploymentApprovalFields
        })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async requestDeploymentCancellation(deploymentId) {
      const [deployment] = await db
        .update(deployments)
        .set({
          cancelRequestedAt: sql`now()`,
          ...touchUpdatedAt
        })
        .where(and(eq(deployments.id, deploymentId), eq(deployments.status, "RUNNING")))
        .returning();

      return deployment;
    },

    async cancelDeployment(deploymentId, input) {
      const [deployment] = await db
        .update(deployments)
        .set({
          ...createTerminalDeploymentValues("CANCELLED"),
          cancelledAt: sql`now()`,
          failureStage: null,
          errorSummary: input.errorSummary,
          ...clearDeploymentApprovalFields
        })
        .where(eq(deployments.id, deploymentId))
        .returning();

      return deployment;
    },

    async recoverInterruptedDeployments(input) {
      const excludeDeploymentIds = [...(input?.excludeDeploymentIds ?? [])];
      const recoveryFilter =
        excludeDeploymentIds.length > 0
          ? and(eq(deployments.status, "RUNNING"), notInArray(deployments.id, excludeDeploymentIds))
          : eq(deployments.status, "RUNNING");
      const runningDeployments = await db.select().from(deployments).where(recoveryFilter);

      const recoveredDeployments: DeploymentRecord[] = [];

      for (const deployment of runningDeployments) {
        const failureStage = deployment.activeStage ?? "apply";
        const [recoveredDeployment] = await db
          .update(deployments)
          .set({
            ...createTerminalDeploymentValues("FAILED"),
            failedAt: sql`now()`,
            failureStage,
            errorSummary: createInterruptedDeploymentSummary(failureStage),
            ...clearDeploymentApprovalFields
          })
          .where(eq(deployments.id, deployment.id))
          .returning();

        if (recoveredDeployment) {
          recoveredDeployments.push(recoveredDeployment);
        }
      }

      return recoveredDeployments;
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

    async listDeploymentLogs(deploymentId, options = {}) {
      const conditions = [eq(deploymentLogs.deploymentId, deploymentId)];

      if (options.afterSequence !== undefined) {
        conditions.push(gt(deploymentLogs.sequence, options.afterSequence));
      }

      const query = db
        .select()
        .from(deploymentLogs)
        .where(and(...conditions))
        .orderBy(asc(deploymentLogs.sequence));

      return options.limit === undefined ? query : query.limit(options.limit);
    },

    async listDeployedResources(deploymentId) {
      return db
        .select()
        .from(deployedResources)
        .where(eq(deployedResources.deploymentId, deploymentId))
        .orderBy(asc(deployedResources.terraformAddress));
    },

    async listTerraformOutputs(deploymentId) {
      return db
        .select()
        .from(terraformOutputs)
        .where(eq(terraformOutputs.deploymentId, deploymentId))
        .orderBy(asc(terraformOutputs.name));
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
    input.awsConnectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new DeploymentNotFoundError("Verified AWS connection not found");
  }

  return repository.createDeployment({
    id: generateId(),
    projectId: input.projectId,
    architectureId: input.architectureId,
    terraformArtifactId: input.terraformArtifactId,
    awsConnectionId: awsConnection.id,
    liveProfile: input.liveProfile ?? "practice",
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

export async function listRecentSuccessfulDeploymentProjects(
  input: { accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeploymentProjectRecord[]> {
  if (!repository.listDeploymentProjectRows) {
    throw new Error("Deployment repository does not support deployment project listing");
  }

  const rows = await repository.listDeploymentProjectRows(input.accessContext);

  return selectRecentSuccessfulDeploymentProjects(rows);
}

export function selectRecentSuccessfulDeploymentProjects(
  rows: readonly DeploymentProjectRecord[]
): DeploymentProjectRecord[] {
  const seenProjectIds = new Set<string>();

  return [...rows]
    .filter(({ deployment }) => deployment.status === "SUCCESS")
    .sort(compareDeploymentProjectRecordDesc)
    .filter(({ project }) => {
      if (seenProjectIds.has(project.id)) {
        return false;
      }

      seenProjectIds.add(project.id);
      return true;
    });
}

export async function listDeploymentLogs(
  input: { deploymentId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeploymentLogRecord[]> {
  await getDeployment(input, repository);

  return repository.listDeploymentLogs(input.deploymentId);
}

export async function listDeployedResources(
  input: { deploymentId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeployedResource[]> {
  await getDeployment(input, repository);

  return repository.listDeployedResources(input.deploymentId).then((resources) =>
    resources.map((resource) => ({
      id: resource.id,
      deploymentId: resource.deploymentId,
      terraformAddress: resource.terraformAddress,
      terraformType: resource.terraformType,
      providerName: resource.providerName,
      resourceId: resource.resourceId,
      region: resource.region,
      createdAt: resource.createdAt.toISOString()
    }))
  );
}

export async function listTerraformOutputs(
  input: { deploymentId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<TerraformOutput[]> {
  await getDeployment(input, repository);

  return repository.listTerraformOutputs(input.deploymentId).then((outputs) =>
    outputs.map((output) => ({
      id: output.id,
      deploymentId: output.deploymentId,
      name: output.name,
      value: output.sensitive ? null : output.value,
      sensitive: output.sensitive,
      createdAt: output.createdAt.toISOString()
    }))
  );
}

export async function requestDeploymentCancellation(
  input: { deploymentId: string; accessContext: ProjectAccessContext },
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const deployment = await getDeployment(input, repository);

  if (deployment.status !== "RUNNING") {
    throw new DeploymentConflictError("Only running deployments can be cancelled");
  }

  const updatedDeployment = await repository.requestDeploymentCancellation(deployment.id);

  if (!updatedDeployment) {
    throw new DeploymentConflictError("Deployment cancellation could not be requested");
  }

  return updatedDeployment;
}

export async function recoverInterruptedDeployments(
  repository: DeploymentRepository,
  input?: RecoverInterruptedDeploymentsInput
): Promise<DeploymentRecord[]> {
  return repository.recoverInterruptedDeployments(input);
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

function createInterruptedDeploymentSummary(stage: DeploymentStage): string {
  if (stage === "apply") {
    return "Deployment was interrupted while Terraform apply was running. AWS resources may have been partially changed; verify resources before retry.";
  }

  return `Deployment was interrupted while Terraform ${stage} was running and was marked failed before retry.`;
}

function compareDeploymentProjectRecordDesc(
  left: DeploymentProjectRecord,
  right: DeploymentProjectRecord
): number {
  return (
    getDeploymentDeployedAt(right.deployment).getTime() -
    getDeploymentDeployedAt(left.deployment).getTime()
  );
}

export function getDeploymentDeployedAt(deployment: DeploymentRecord): Date {
  return deployment.completedAt ?? deployment.updatedAt ?? deployment.createdAt;
}

function isDeploymentProjectRunningUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") {
      return false;
    }

    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "23505" &&
      candidate.constraint === "deployments_project_running_unique"
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
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
