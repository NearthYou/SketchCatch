import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type {
  AwsConnection,
  AwsConnectionListResponse,
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnectionDeletionPreviewResponse,
  AwsRolePermissionSetup,
  CreateAwsConnectionResponse,
  SketchCatchCallerRoleSetup,
  TestAwsConnectionResponse,
  VerifyAwsConnectionResponse
} from "@sketchcatch/types";
import type { DeploymentStatus } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsCodeConnections,
  awsConnections,
  deployedResources,
  deploymentJobs,
  deployments,
  projectBuildEnvironments,
  projectDeploymentTargets,
  projectExecutionLeases
} from "../db/schema.js";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  AwsConnectionTestError,
  createAwsConnectionTester,
  getAwsAccountIdFromRoleArn,
  supportedAwsConnectionRegion,
  type AwsConnectionTester
} from "./aws-connection-test-service.js";

export const recommendedAwsConnectionRoleName = "SketchCatchTerraformExecutionRole";
export const recommendedCodeBuildPermissionsBoundaryName = "SketchCatchCodeBuildBoundary";
const callerAssumeRolePolicyName = "SketchCatchAssumeTerraformExecutionRole";
const defaultCloudFormationTemplateTokenTtlMs = 60 * 60 * 1000;
const awsConnectionRoleNameSuffixLength = 8;
const terraformFargateServiceActions = [
  "ecs:*",
  "ecr:*",
  "elasticloadbalancing:*",
  "cloudfront:*",
  "logs:*",
  "application-autoscaling:RegisterScalableTarget",
  "application-autoscaling:DeregisterScalableTarget",
  "application-autoscaling:DescribeScalableTargets",
  "application-autoscaling:PutScalingPolicy",
  "application-autoscaling:DeleteScalingPolicy",
  "application-autoscaling:DescribeScalingPolicies",
  "application-autoscaling:ListTagsForResource",
  "application-autoscaling:TagResource",
  "application-autoscaling:UntagResource"
] as const;
const directReleaseCodeBuildActions = [
  "codebuild:CreateProject",
  "codebuild:UpdateProject",
  "codebuild:DeleteProject",
  "codebuild:BatchGetProjects",
  "codebuild:StartBuild",
  "codebuild:BatchGetBuilds",
  "codebuild:StopBuild"
] as const;
const directReleaseCodeBuildResourcePatterns = [
  "arn:aws:codebuild:ap-northeast-2:*:project/sketchcatch-*",
  "arn:aws:codebuild:ap-northeast-2:*:build/sketchcatch-*:*"
] as const;
const terraformFargateIamActions = [
  "iam:CreateRole",
  "iam:DeleteRole",
  "iam:GetRole",
  "iam:UpdateAssumeRolePolicy",
  "iam:TagRole",
  "iam:UntagRole",
  "iam:ListRoleTags",
  "iam:ListRolePolicies",
  "iam:ListAttachedRolePolicies",
  "iam:ListInstanceProfilesForRole",
  "iam:GetPolicy",
  "iam:GetPolicyVersion",
  "iam:GetRolePolicy",
  "iam:PutRolePolicy",
  "iam:DeleteRolePolicy",
  "iam:PutRolePermissionsBoundary",
  "iam:DeleteRolePermissionsBoundary",
  "iam:AttachRolePolicy",
  "iam:DetachRolePolicy",
  "iam:PassRole",
  "iam:CreateServiceLinkedRole"
] as const;
const githubCodeConnectionActions = [
  "codeconnections:CreateConnection",
  "codeconnections:GetConnection",
  "codeconnections:ListConnections",
  "codeconnections:PassConnection",
  "codeconnections:UseConnection",
  "codeconnections:ListTagsForResource",
  "codeconnections:TagResource",
  "codeconnections:DeleteConnection",
  "codestar-connections:PassConnection",
  "codestar-connections:UseConnection"
] as const;

export type AwsConnectionRetentionPolicy = {
  maxUnverifiedConnectionsPerUser: number;
};

export const defaultAwsConnectionRetentionPolicy: AwsConnectionRetentionPolicy = {
  maxUnverifiedConnectionsPerUser: 5
};

export type AwsConnectionRecord = typeof awsConnections.$inferSelect;

export type CreateAwsConnectionInput = {
  accessContext: ProjectAccessContext;
  region: string;
  callerPrincipalArns: readonly string[];
};

export type CreateAwsConnectionRecordInput = {
  id: string;
  userId: string;
  externalId: string;
  region: string;
  status: "pending";
};

export type AwsConnectionRepository = {
  findAccessibleAwsConnection(
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  listAccessibleAwsConnections(accessContext: ProjectAccessContext): Promise<AwsConnectionRecord[]>;
  findVerifiedAwsConnectionByAccountId(
    accountId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  findAwsConnectionById(connectionId: string): Promise<AwsConnectionRecord | undefined>;
  hasDeploymentUsingAwsConnection(connectionId: string): Promise<boolean>;
  claimAccessibleAwsConnectionDeletion(
    connectionId: string,
    accessContext: ProjectAccessContext,
    now: Date
  ): Promise<
    | {
        connection: AwsConnectionRecord;
        claimed: boolean;
        blocked: boolean;
      }
    | undefined
  >;
  releaseAwsConnectionDeletionClaim(
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<void>;
  markAwsConnectionDeletionCleanupFailed?(
    connectionId: string,
    accessContext: ProjectAccessContext,
    errorSummary: string
  ): Promise<void>;
  deleteClaimedAwsConnection(
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  findManagedResources?(connectionId: string): Promise<AwsConnectionManagedResources>;
  createAwsConnection(input: CreateAwsConnectionRecordInput): Promise<AwsConnectionRecord>;
  deleteAccessibleAwsConnection(
    connectionId: string,
    accessContext: ProjectAccessContext
  ): Promise<AwsConnectionRecord | undefined>;
  updateAwsConnectionVerification(
    input: UpdateAwsConnectionVerificationInput
  ): Promise<AwsConnectionRecord | undefined>;
};

export type AwsConnectionManagedResources = {
  codeBuildProjects: Array<{
    projectId: string;
    projectName: string;
    serviceRoleArn: string;
  }>;
  codeConnectionArn: string | null;
};

export type CleanupAwsConnectionManagedResources = (input: {
  connection: AwsConnectionRecord;
  resources: AwsConnectionManagedResources;
}) => Promise<void>;

export type CreateAwsConnectionOptions = {
  generateId?: () => string;
  generateExternalId?: () => string;
};

export type VerifyAwsConnectionInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
  roleArn: string;
};

export type VerifyAwsConnectionCreatedRoleInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
  accountId: string;
};

export type TestStoredAwsConnectionInput = VerifyAwsConnectionInput;

export type DeleteAwsConnectionInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
  confirmedManagedCleanup: boolean;
  confirmationToken: string;
};

export type GetAwsConnectionDeletionPreviewInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
};

export type PruneStaleAwsConnectionsInput = {
  accessContext: ProjectAccessContext;
  protectedConnectionIds?: string[];
};

export type PruneStaleAwsConnectionsResult = {
  awsConnectionIdsDeleted: string[];
};

export type VerifyAwsConnectionOptions = {
  now?: () => Date;
};

export type GetAwsConnectionCloudFormationTemplateInput = {
  connectionId: string;
  accessContext: ProjectAccessContext;
  callerPrincipalArns: readonly string[];
};

export type GetAwsConnectionCloudFormationTemplateOptions = {
  now?: () => Date;
  tokenTtlMs?: number;
  cloudFormationTemplatePublisher?: AwsConnectionCloudFormationTemplatePublisher | undefined;
};

export type PublishAwsConnectionCloudFormationTemplateInput = {
  connectionId: string;
  stackName: string;
  templateBody: string;
  expiresInSeconds: number;
};

export type PublishAwsConnectionCloudFormationTemplateResult = {
  templateUrl: string;
};

export type AwsConnectionCloudFormationTemplatePublisher = (
  input: PublishAwsConnectionCloudFormationTemplateInput
) => Promise<PublishAwsConnectionCloudFormationTemplateResult>;

export type UpdateAwsConnectionVerificationInput = {
  connectionId: string;
  userId: string;
  accountId: string | null;
  roleArn: string;
  status: "verified" | "failed";
  lastVerifiedAt: Date | null;
};

export class AwsConnectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionNotFoundError";
  }
}

export class AwsConnectionVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionVerificationError";
  }
}

export class AwsConnectionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionConflictError";
  }
}

export class AwsConnectionDeleteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionDeleteConflictError";
  }
}

export class AwsConnectionDeletionConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionDeletionConfirmationError";
  }
}

export class AwsConnectionCloudFormationTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConnectionCloudFormationTemplateError";
  }
}

export function createPostgresAwsConnectionRepository(db: Database): AwsConnectionRepository {
  const hasBlockingDeployment = (connectionId: string, executor: Database = db) =>
    hasDeploymentUsingAwsConnection(executor, connectionId);

  return {
    async findAccessibleAwsConnection(connectionId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(eq(awsConnections.id, connectionId), eq(awsConnections.userId, accessContext.userId))
        );

      return awsConnection;
    },

    async listAccessibleAwsConnections(accessContext) {
      return db
        .select()
        .from(awsConnections)
        .where(eq(awsConnections.userId, accessContext.userId))
        .orderBy(desc(awsConnections.updatedAt), desc(awsConnections.createdAt));
    },

    async findVerifiedAwsConnectionByAccountId(accountId, accessContext) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.userId, accessContext.userId),
            eq(awsConnections.accountId, accountId),
            eq(awsConnections.status, "verified")
          )
        );

      return awsConnection;
    },

    async findAwsConnectionById(connectionId) {
      const [awsConnection] = await db
        .select()
        .from(awsConnections)
        .where(eq(awsConnections.id, connectionId));

      return awsConnection;
    },

    async hasDeploymentUsingAwsConnection(connectionId) {
      return hasBlockingDeployment(connectionId);
    },

    async claimAccessibleAwsConnectionDeletion(connectionId, accessContext, now) {
      return db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        const [connection] = await transaction
          .select()
          .from(awsConnections)
          .where(
            and(
              eq(awsConnections.id, connectionId),
              eq(awsConnections.userId, accessContext.userId)
            )
          )
          .for("update");
        if (!connection) return undefined;
        if (connection.deletionStartedAt && connection.deletionErrorSummary) {
          const [reclaimed] = await transaction
            .update(awsConnections)
            .set({ deletionErrorSummary: null, updatedAt: now })
            .where(
              and(
                eq(awsConnections.id, connectionId),
                eq(awsConnections.userId, accessContext.userId),
                eq(awsConnections.deletionStartedAt, connection.deletionStartedAt)
              )
            )
            .returning();
          return reclaimed
            ? { connection: reclaimed, claimed: true, blocked: false }
            : { connection, claimed: false, blocked: false };
        }
        if (connection.deletionStartedAt) {
          return { connection, claimed: false, blocked: false };
        }
        if (await hasBlockingDeployment(connectionId, tx)) {
          return { connection, claimed: false, blocked: true };
        }
        const [claimed] = await transaction
          .update(awsConnections)
          .set({ deletionStartedAt: now, updatedAt: now })
          .where(
            and(
              eq(awsConnections.id, connectionId),
              eq(awsConnections.userId, accessContext.userId),
              isNull(awsConnections.deletionStartedAt)
            )
          )
          .returning();
        return claimed
          ? { connection: claimed, claimed: true, blocked: false }
          : { connection, claimed: false, blocked: false };
      });
    },

    async releaseAwsConnectionDeletionClaim(connectionId, accessContext) {
      await db
        .update(awsConnections)
        .set({ deletionStartedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, accessContext.userId),
            isNotNull(awsConnections.deletionStartedAt)
          )
        );
    },

    async markAwsConnectionDeletionCleanupFailed(connectionId, accessContext, errorSummary) {
      await db
        .update(awsConnections)
        .set({ deletionErrorSummary: errorSummary.slice(0, 500), updatedAt: new Date() })
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, accessContext.userId),
            isNotNull(awsConnections.deletionStartedAt)
          )
        );
    },

    async deleteClaimedAwsConnection(connectionId, accessContext) {
      return db.transaction(async (transaction) => {
        await transaction
          .update(projectBuildEnvironments)
          .set({ status: "disconnected", lastVerifiedAt: null, updatedAt: new Date() })
          .where(eq(projectBuildEnvironments.awsConnectionId, connectionId));
        const [connection] = await transaction
          .delete(awsConnections)
          .where(
            and(
              eq(awsConnections.id, connectionId),
              eq(awsConnections.userId, accessContext.userId),
              isNotNull(awsConnections.deletionStartedAt)
            )
          )
          .returning();
        return connection;
      });
    },

    async findManagedResources(connectionId) {
      const [buildRows, codeConnectionRows] = await Promise.all([
        db
          .select({
            projectId: projectBuildEnvironments.projectId,
            projectName: projectBuildEnvironments.codeBuildProjectName,
            serviceRoleArn: projectBuildEnvironments.codeBuildServiceRoleArn
          })
          .from(projectBuildEnvironments)
          .where(eq(projectBuildEnvironments.awsConnectionId, connectionId)),
        db
          .select({ connectionArn: awsCodeConnections.connectionArn })
          .from(awsCodeConnections)
          .where(eq(awsCodeConnections.awsConnectionId, connectionId))
      ]);
      return {
        codeBuildProjects: buildRows,
        codeConnectionArn: codeConnectionRows[0]?.connectionArn ?? null
      };
    },

    async createAwsConnection(input) {
      const [awsConnection] = await db.insert(awsConnections).values(input).returning();

      if (!awsConnection) {
        throw new Error("AWS connection creation failed");
      }

      return awsConnection;
    },

    async deleteAccessibleAwsConnection(connectionId, accessContext) {
      return db.transaction(async (transaction) => {
        await transaction
          .update(projectBuildEnvironments)
          .set({ status: "disconnected", lastVerifiedAt: null, updatedAt: new Date() })
          .where(eq(projectBuildEnvironments.awsConnectionId, connectionId));
        const [awsConnection] = await transaction
          .delete(awsConnections)
          .where(
            and(
              eq(awsConnections.id, connectionId),
              eq(awsConnections.userId, accessContext.userId)
            )
          )
          .returning();
        return awsConnection;
      });
    },

    async updateAwsConnectionVerification(input) {
      const updatedAt = input.lastVerifiedAt ?? new Date();
      const [awsConnection] = await db
        .update(awsConnections)
        .set({
          accountId: input.accountId,
          roleArn: input.roleArn,
          status: input.status,
          lastVerifiedAt: input.lastVerifiedAt,
          updatedAt
        })
        .where(
          and(eq(awsConnections.id, input.connectionId), eq(awsConnections.userId, input.userId))
        )
        .returning();

      return awsConnection;
    }
  };
}

export function shouldBlockAwsConnectionDeletion(input: {
  status: DeploymentStatus;
  stateObjectKey: string | null;
  hasResources: boolean;
}): boolean {
  if (input.status === "DESTROYED" || input.status === "PENDING") return false;
  if (
    input.status === "RUNNING" ||
    input.status === "SUCCESS" ||
    input.status === "PARTIALLY_FAILED" ||
    input.status === "PARTIALLY_CANCELED"
  ) {
    return true;
  }
  return input.stateObjectKey !== null || input.hasResources;
}

async function hasDeploymentUsingAwsConnection(
  db: Database,
  connectionId: string
): Promise<boolean> {
  const [
    rows,
    activeLeaseRows,
    activeDeploymentJobRows,
    creatingCodeConnections,
    preparingBuildEnvironments
  ] = await Promise.all([
    db
      .select({
        id: deployments.id,
        status: deployments.status,
        stateObjectKey: deployments.stateObjectKey,
        deployedResourceId: deployedResources.id
      })
      .from(deployments)
      .leftJoin(deployedResources, eq(deployedResources.deploymentId, deployments.id))
      .where(eq(deployments.awsConnectionId, connectionId)),
    db
      .select({ projectId: projectExecutionLeases.projectId })
      .from(projectExecutionLeases)
      .innerJoin(
        projectDeploymentTargets,
        eq(projectDeploymentTargets.projectId, projectExecutionLeases.projectId)
      )
      .where(
        and(
          eq(projectDeploymentTargets.connectionId, connectionId),
          eq(projectExecutionLeases.status, "active")
        )
      ),
    db
      .select({ id: deploymentJobs.id })
      .from(deploymentJobs)
      .innerJoin(deployments, eq(deployments.id, deploymentJobs.deploymentId))
      .where(
        and(
          eq(deployments.awsConnectionId, connectionId),
          inArray(deploymentJobs.status, ["QUEUED", "DISPATCHING", "RUNNING"])
        )
      )
      .limit(1),
    db
      .select({ id: awsCodeConnections.id })
      .from(awsCodeConnections)
      .where(
        and(
          eq(awsCodeConnections.awsConnectionId, connectionId),
          eq(awsCodeConnections.status, "CREATING")
        )
      )
      .limit(1),
    db
      .select({ id: projectBuildEnvironments.id })
      .from(projectBuildEnvironments)
      .where(
        and(
          eq(projectBuildEnvironments.awsConnectionId, connectionId),
          eq(projectBuildEnvironments.status, "preparing")
        )
      )
      .limit(1)
  ]);

  const byDeployment = new Map<
    string,
    { status: DeploymentStatus; stateObjectKey: string | null; hasResources: boolean }
  >();
  for (const row of rows) {
    const current = byDeployment.get(row.id);
    byDeployment.set(row.id, {
      status: row.status,
      stateObjectKey: row.stateObjectKey,
      hasResources: current?.hasResources === true || row.deployedResourceId !== null
    });
  }
  return (
    activeLeaseRows.length > 0 ||
    activeDeploymentJobRows.length > 0 ||
    creatingCodeConnections.length > 0 ||
    preparingBuildEnvironments.length > 0 ||
    [...byDeployment.values()].some(shouldBlockAwsConnectionDeletion)
  );
}

export async function listAwsConnections(
  input: {
    accessContext: ProjectAccessContext;
  },
  repository: AwsConnectionRepository
): Promise<AwsConnectionListResponse> {
  const awsConnectionRows = await repository.listAccessibleAwsConnections(input.accessContext);

  return {
    awsConnections: awsConnectionRows
      .filter(
        (awsConnection) =>
          awsConnection.status === "verified" && awsConnection.deletionStartedAt === null
      )
      .map(toAwsConnection),
    cleanupRetries: awsConnectionRows
      .filter(
        (awsConnection) =>
          awsConnection.status === "verified" &&
          awsConnection.deletionStartedAt !== null &&
          awsConnection.deletionErrorSummary !== null
      )
      .map((awsConnection) => ({
        awsConnection: toAwsConnection(awsConnection)
      }))
  };
}

export async function createAwsConnection(
  input: CreateAwsConnectionInput,
  repository: AwsConnectionRepository,
  options: CreateAwsConnectionOptions = {}
): Promise<CreateAwsConnectionResponse> {
  const callerPrincipalArns = requireCallerPrincipalArns(input.callerPrincipalArns);
  const primaryCallerPrincipalArn = callerPrincipalArns[0];
  const generateId = options.generateId ?? randomUUID;
  const id = generateId();
  const externalId = options.generateExternalId?.() ?? createAwsExternalId(id);
  const roleName = createAwsConnectionRoleName(id);
  const awsConnection = await repository.createAwsConnection({
    id,
    userId: input.accessContext.userId,
    externalId,
    region: input.region,
    status: "pending"
  });
  const trustPolicyTemplate = createTrustPolicyTemplate({
    callerPrincipalArns,
    externalId
  });
  const permissionSetup = createInitialPermissionSetup();
  const callerRoleSetup = createCallerRoleSetup();

  return {
    awsConnection: toAwsConnection(awsConnection),
    callerPrincipalArn: primaryCallerPrincipalArn,
    recommendedRoleName: roleName,
    roleSetup: {
      roleName,
      trustedPrincipalArn: primaryCallerPrincipalArn,
      externalId,
      trustPolicy: trustPolicyTemplate,
      permissionSetup
    },
    callerRoleSetup,
    trustPolicyTemplate
  };
}

export async function getAwsConnectionDeletionPreview(
  input: GetAwsConnectionDeletionPreviewInput,
  repository: AwsConnectionRepository
): Promise<AwsConnectionDeletionPreviewResponse> {
  const connection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );
  if (!connection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }
  if (!repository.findManagedResources) {
    throw new AwsConnectionDeleteConflictError(
      "SketchCatch가 관리하는 빌드 리소스를 확인할 수 없어 AWS 연결 삭제를 중단했습니다."
    );
  }

  const [resources, hasBlockingDeployment] = await Promise.all([
    repository.findManagedResources(connection.id),
    repository.hasDeploymentUsingAwsConnection(connection.id)
  ]);
  const cleanupInProgress = Boolean(
    connection.deletionStartedAt && !connection.deletionErrorSummary
  );
  const blockerMessage = hasBlockingDeployment
    ? "실행 중이거나 아직 파기되지 않은 AWS 리소스 또는 Terraform state가 있습니다. 먼저 해당 프로젝트에서 AWS 리소스를 삭제해 주세요."
    : cleanupInProgress
      ? "AWS 연결 삭제가 이미 진행 중입니다."
      : null;

  return {
    connectionId: connection.id,
    canDelete: blockerMessage === null,
    blockerMessage,
    cleanupRetry: Boolean(connection.deletionStartedAt && connection.deletionErrorSummary),
    managedResources: {
      codeBuildProjects: resources.codeBuildProjects.map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        serviceRoleName: getRoleNameForDeletionPreview(project.serviceRoleArn),
        logGroupName: `/aws/codebuild/${project.projectName}`
      })),
      codeConnection: resources.codeConnectionArn !== null
    },
    preservedResources: ["CloudFormation Stack", "Terraform Execution Role"],
    confirmationToken: createAwsConnectionDeletionConfirmationToken(connection.id, resources)
  };
}

export async function deleteAwsConnection(
  input: DeleteAwsConnectionInput,
  repository: AwsConnectionRepository,
  options: { cleanupManagedResources?: CleanupAwsConnectionManagedResources } = {}
): Promise<void> {
  if (!input.confirmedManagedCleanup) {
    throw new AwsConnectionDeletionConfirmationError(
      "삭제될 SketchCatch 관리 리소스를 확인한 뒤 삭제에 동의해 주세요."
    );
  }

  const preview = await getAwsConnectionDeletionPreview(input, repository);
  if (!preview.canDelete) {
    throw new AwsConnectionDeleteConflictError(
      preview.blockerMessage ?? "AWS 연결을 삭제할 수 없습니다."
    );
  }
  if (!matchesDeletionConfirmationToken(input.confirmationToken, preview.confirmationToken)) {
    throw new AwsConnectionDeletionConfirmationError(
      "삭제 대상이 변경되었습니다. 삭제 미리보기를 다시 확인해 주세요."
    );
  }

  const deletionClaim = await repository.claimAccessibleAwsConnectionDeletion(
    input.connectionId,
    input.accessContext,
    new Date()
  );

  if (!deletionClaim) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }
  if (deletionClaim.blocked) {
    throw new AwsConnectionDeleteConflictError(
      "실행 중이거나 아직 파기되지 않은 AWS 리소스 또는 Terraform state가 있어 연결을 삭제할 수 없습니다. 먼저 해당 프로젝트에서 AWS 리소스를 삭제해 주세요."
    );
  }
  if (!deletionClaim.claimed) {
    throw new AwsConnectionDeleteConflictError("AWS 연결 삭제가 이미 진행 중입니다.");
  }

  if (!repository.findManagedResources) {
    await repository.releaseAwsConnectionDeletionClaim(
      deletionClaim.connection.id,
      input.accessContext
    );
    throw new AwsConnectionDeleteConflictError(
      "SketchCatch가 관리하는 빌드 리소스를 확인할 수 없어 AWS 연결 삭제를 중단했습니다."
    );
  }

  const managedResources = await repository.findManagedResources(deletionClaim.connection.id);
  const currentConfirmationToken = createAwsConnectionDeletionConfirmationToken(
    deletionClaim.connection.id,
    managedResources
  );
  if (!matchesDeletionConfirmationToken(input.confirmationToken, currentConfirmationToken)) {
    await repository.releaseAwsConnectionDeletionClaim(
      deletionClaim.connection.id,
      input.accessContext
    );
    throw new AwsConnectionDeletionConfirmationError(
      "삭제 대상이 변경되었습니다. 삭제 미리보기를 다시 확인해 주세요."
    );
  }

  try {
    if (options.cleanupManagedResources) {
      await options.cleanupManagedResources({
        connection: deletionClaim.connection,
        resources: managedResources
      });
    }

    const deletedConnection = await repository.deleteClaimedAwsConnection(
      deletionClaim.connection.id,
      input.accessContext
    );
    if (!deletedConnection) {
      throw new AwsConnectionNotFoundError("AWS connection not found");
    }
  } catch (error) {
    await repository.markAwsConnectionDeletionCleanupFailed?.(
      deletionClaim.connection.id,
      input.accessContext,
      error instanceof Error ? error.message : "AWS managed cleanup failed"
    );
    throw error;
  }
}

function createAwsConnectionDeletionConfirmationToken(
  connectionId: string,
  resources: AwsConnectionManagedResources
): string {
  const canonicalResources = {
    connectionId,
    codeBuildProjects: resources.codeBuildProjects
      .map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        serviceRoleArn: project.serviceRoleArn
      }))
      .sort((left, right) =>
        `${left.projectId}:${left.projectName}:${left.serviceRoleArn}`.localeCompare(
          `${right.projectId}:${right.projectName}:${right.serviceRoleArn}`
        )
      ),
    codeConnectionArn: resources.codeConnectionArn
  };
  return createHash("sha256").update(JSON.stringify(canonicalResources)).digest("hex");
}

function matchesDeletionConfirmationToken(candidate: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(candidate) || candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(expected, "utf8"));
}

function getRoleNameForDeletionPreview(roleArn: string): string {
  const roleName = roleArn.split("/").at(-1);
  return roleName && roleName.length > 0 ? roleName : "확인 불가";
}

export async function pruneStaleAwsConnections(
  input: PruneStaleAwsConnectionsInput,
  repository: AwsConnectionRepository,
  policy: AwsConnectionRetentionPolicy = defaultAwsConnectionRetentionPolicy
): Promise<PruneStaleAwsConnectionsResult> {
  const awsConnectionRows = await repository.listAccessibleAwsConnections(input.accessContext);
  const protectedConnectionIds = new Set(input.protectedConnectionIds ?? []);

  for (const awsConnection of awsConnectionRows) {
    if (awsConnection.status === "verified") {
      protectedConnectionIds.add(awsConnection.id);
      continue;
    }

    if (await repository.hasDeploymentUsingAwsConnection(awsConnection.id)) {
      protectedConnectionIds.add(awsConnection.id);
    }
  }

  const awsConnectionsToDelete = selectPrunableAwsConnections({
    awsConnections: awsConnectionRows,
    policy,
    protectedConnectionIds
  });
  const awsConnectionIdsDeleted: string[] = [];

  for (const awsConnection of awsConnectionsToDelete) {
    const deletedAwsConnection = await repository.deleteAccessibleAwsConnection(
      awsConnection.id,
      input.accessContext
    );

    if (deletedAwsConnection) {
      awsConnectionIdsDeleted.push(deletedAwsConnection.id);
    }
  }

  return {
    awsConnectionIdsDeleted
  };
}

export function selectPrunableAwsConnections({
  awsConnections: awsConnectionRows,
  policy = defaultAwsConnectionRetentionPolicy,
  protectedConnectionIds = new Set()
}: {
  awsConnections: AwsConnectionRecord[];
  policy?: AwsConnectionRetentionPolicy;
  protectedConnectionIds?: ReadonlySet<string>;
}): AwsConnectionRecord[] {
  const unusedUnverifiedConnections = [...awsConnectionRows]
    .sort(compareAwsConnectionsForRetention)
    .filter(
      (awsConnection) =>
        awsConnection.status !== "verified" && !protectedConnectionIds.has(awsConnection.id)
    );

  return unusedUnverifiedConnections.slice(policy.maxUnverifiedConnectionsPerUser);
}

export function createAwsExternalId(connectionId: string): string {
  return `sc_conn_${connectionId}_${randomBytes(24).toString("base64url")}`;
}

export function toAwsConnection(row: AwsConnectionRecord): AwsConnection {
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

export async function verifyAwsConnection(
  input: VerifyAwsConnectionInput,
  repository: AwsConnectionRepository,
  tester: AwsConnectionTester = createAwsConnectionTester(),
  options: VerifyAwsConnectionOptions = {}
): Promise<VerifyAwsConnectionResponse> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  assertRecommendedAwsConnectionRoleArn(input.roleArn, awsConnection.id);

  const expectedAccountId = getAwsAccountIdFromRoleArn(input.roleArn);
  const existingVerifiedAccountConnection = await repository.findVerifiedAwsConnectionByAccountId(
    expectedAccountId,
    input.accessContext
  );

  if (
    existingVerifiedAccountConnection &&
    existingVerifiedAccountConnection.id !== awsConnection.id
  ) {
    if (
      existingVerifiedAccountConnection.deletionStartedAt !== null &&
      existingVerifiedAccountConnection.deletionErrorSummary !== null
    ) {
      throw new AwsConnectionConflictError(
        "같은 AWS 계정의 이전 연결 정리가 완료되지 않았습니다. 이전 연결 정리를 재시도해 주세요."
      );
    }
    throw new AwsConnectionConflictError("이미 연결된 AWS 계정입니다.");
  }

  const now = options.now ?? (() => new Date());
  const markFailed = async (accountId: string | null) => {
    await repository.updateAwsConnectionVerification({
      connectionId: awsConnection.id,
      userId: awsConnection.userId,
      accountId,
      roleArn: input.roleArn,
      status: "failed",
      lastVerifiedAt: null
    });
  };

  if (awsConnection.region !== supportedAwsConnectionRegion) {
    await markFailed(null);
    throw new AwsConnectionVerificationError("AWS connection region must be ap-northeast-2");
  }

  if (awsConnection.externalId.trim().length === 0) {
    await markFailed(null);
    throw new AwsConnectionVerificationError("AWS connection external ID is missing");
  }

  let result: Awaited<ReturnType<AwsConnectionTester["testConnection"]>>;

  try {
    result = await tester.testConnection({
      roleArn: input.roleArn,
      externalId: awsConnection.externalId,
      region: awsConnection.region
    });
  } catch (error) {
    await markFailed(null);

    if (error instanceof AwsConnectionTestError) {
      throw error;
    }

    throw new AwsConnectionTestError("AWS Role connection test failed");
  }

  if (result.accountId !== expectedAccountId) {
    await markFailed(result.accountId);
    throw new AwsConnectionVerificationError("AWS Role account mismatch");
  }

  const verifiedAt = now();
  let updatedConnection: AwsConnectionRecord | undefined;
  try {
    updatedConnection = await repository.updateAwsConnectionVerification({
      connectionId: awsConnection.id,
      userId: awsConnection.userId,
      accountId: result.accountId,
      roleArn: input.roleArn,
      status: "verified",
      lastVerifiedAt: verifiedAt
    });
  } catch (error) {
    if (isVerifiedAccountUniqueViolation(error)) {
      throw new AwsConnectionConflictError("이미 연결된 AWS 계정입니다.");
    }
    throw error;
  }

  if (!updatedConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  return {
    ok: true,
    accountId: result.accountId,
    callerArn: result.callerArn,
    region: result.region,
    awsConnection: toAwsConnection(updatedConnection)
  };
}

function isVerifiedAccountUniqueViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "23505" &&
      candidate.constraint === "aws_connections_user_verified_account_unique"
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

export async function verifyAwsConnectionCreatedRole(
  input: VerifyAwsConnectionCreatedRoleInput,
  repository: AwsConnectionRepository,
  tester: AwsConnectionTester = createAwsConnectionTester(),
  options: VerifyAwsConnectionOptions = {}
): Promise<VerifyAwsConnectionResponse> {
  return verifyAwsConnection(
    {
      connectionId: input.connectionId,
      accessContext: input.accessContext,
      roleArn: createRecommendedAwsConnectionRoleArn(input.accountId, input.connectionId)
    },
    repository,
    tester,
    options
  );
}

export async function testStoredAwsConnection(
  input: TestStoredAwsConnectionInput,
  repository: AwsConnectionRepository,
  tester: AwsConnectionTester = createAwsConnectionTester()
): Promise<TestAwsConnectionResponse> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  assertRecommendedAwsConnectionRoleArn(input.roleArn, awsConnection.id);

  if (awsConnection.region !== supportedAwsConnectionRegion) {
    throw new AwsConnectionVerificationError("AWS connection region must be ap-northeast-2");
  }

  if (awsConnection.externalId.trim().length === 0) {
    throw new AwsConnectionVerificationError("AWS connection external ID is missing");
  }

  let result: TestAwsConnectionResponse;

  try {
    result = await tester.testConnection({
      roleArn: input.roleArn,
      externalId: awsConnection.externalId,
      region: awsConnection.region
    });
  } catch (error) {
    if (error instanceof AwsConnectionTestError) {
      throw error;
    }

    throw new AwsConnectionTestError("AWS Role connection test failed");
  }
  const expectedAccountId = getAwsAccountIdFromRoleArn(input.roleArn);

  if (result.accountId !== expectedAccountId) {
    throw new AwsConnectionVerificationError("AWS Role account mismatch");
  }

  return result;
}

export async function getAwsConnectionCloudFormationTemplate(
  input: GetAwsConnectionCloudFormationTemplateInput,
  repository: AwsConnectionRepository,
  options: GetAwsConnectionCloudFormationTemplateOptions = {}
): Promise<AwsConnectionCloudFormationTemplateResponse> {
  const awsConnection = await repository.findAccessibleAwsConnection(
    input.connectionId,
    input.accessContext
  );

  if (!awsConnection) {
    throw new AwsConnectionNotFoundError("AWS connection not found");
  }

  assertAwsConnectionCanRenderCloudFormationTemplate(awsConnection);

  const roleName = createAwsConnectionRoleName(awsConnection.id);
  const stackName = createAwsConnectionStackName(awsConnection.id);
  const templateBody = createAwsConnectionCloudFormationTemplateBody({
    roleName,
    callerPrincipalArns: requireCallerPrincipalArns(input.callerPrincipalArns),
    externalId: awsConnection.externalId
  });
  const inlineTemplateResponse: AwsConnectionCloudFormationTemplateResponse = {
    roleName,
    stackName,
    region: awsConnection.region,
    capabilities: ["CAPABILITY_NAMED_IAM"],
    templateBody,
    templateUrl: null,
    templateUrlExpiresAt: null,
    launchStackUrl: null,
    manualTemplateFallbackAvailable: true
  };

  // 로컬 개발 URL은 CloudFormation 콘솔이 접근할 수 없으므로 S3 URL 대신 인라인 템플릿을 유지합니다.
  if (!options.cloudFormationTemplatePublisher) {
    return inlineTemplateResponse;
  }

  const now = options.now ?? (() => new Date());
  const tokenTtlMs = options.tokenTtlMs ?? defaultCloudFormationTemplateTokenTtlMs;
  const expiresInSeconds = Math.floor(tokenTtlMs / 1000);
  const templateUrlExpiresAt = new Date(now().getTime() + tokenTtlMs);
  let templateUrl: string;

  try {
    const publishedTemplate = await options.cloudFormationTemplatePublisher({
      connectionId: awsConnection.id,
      stackName,
      templateBody,
      expiresInSeconds
    });

    templateUrl = publishedTemplate.templateUrl;
  } catch {
    return inlineTemplateResponse;
  }

  return {
    roleName,
    stackName,
    region: awsConnection.region,
    capabilities: ["CAPABILITY_NAMED_IAM"],
    templateBody,
    templateUrl,
    templateUrlExpiresAt: templateUrlExpiresAt.toISOString(),
    manualTemplateFallbackAvailable: false,
    launchStackUrl: createAwsConnectionLaunchStackUrl({
      region: awsConnection.region,
      stackName,
      templateUrl
    })
  };
}

function createTrustPolicyTemplate(input: {
  callerPrincipalArns: readonly string[];
  externalId: string;
}): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          AWS: [...input.callerPrincipalArns]
        },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": input.externalId
          }
        }
      }
    ]
  };
}

function createInitialPermissionSetup(): AwsRolePermissionSetup {
  return {
    verificationActions: ["sts:GetCallerIdentity"],
    initialPolicyDocument: null,
    terraformPolicyDocument: createTerraformApplyPolicyDocument()
  };
}

function createTerraformApplyPolicyDocument(): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "ec2:*",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: "s3:*",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: terraformFargateServiceActions,
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: directReleaseCodeBuildActions,
        Resource: directReleaseCodeBuildResourcePatterns
      },
      {
        Effect: "Allow",
        Action: githubCodeConnectionActions,
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: terraformFargateIamActions,
        Resource: "*"
      },
      {
        Effect: "Deny",
        Action: ["iam:CreateRole", "iam:PutRolePermissionsBoundary"],
        Resource: "arn:aws:iam::*:role/SketchCatchCodeBuild-*",
        Condition: {
          StringNotLike: {
            "iam:PermissionsBoundary":
              "arn:aws:iam::*:policy/SketchCatchCodeBuildBoundary*"
          }
        }
      },
      {
        Effect: "Deny",
        Action: "iam:CreateRole",
        Resource: "arn:aws:iam::*:role/SketchCatchCodeBuild-*",
        Condition: {
          StringNotEquals: {
            "aws:RequestTag/ManagedBy": "SketchCatch"
          }
        }
      },
      {
        Effect: "Deny",
        Action: "iam:PassRole",
        Resource: "arn:aws:iam::*:role/SketchCatchCodeBuild-*",
        Condition: {
          StringNotEquals: {
            "iam:PassedToService": "codebuild.amazonaws.com"
          }
        }
      },
      {
        Effect: "Allow",
        Action: [
          "ce:GetCostAndUsage",
          "ce:GetDimensionValues",
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeScalingActivities",
          "ec2:DescribeInstances",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetHealth",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "ecs:DescribeServices",
          "logs:FilterLogEvents"
        ],
        Resource: "*"
      }
    ]
  };
}

function createCallerRoleSetup(): SketchCatchCallerRoleSetup {
  const assumableRoleArnPattern = `arn:aws:iam::*:role/${recommendedAwsConnectionRoleName}*`;
  const assumableRoleArnResources = [
    `arn:aws:iam::*:role/${recommendedAwsConnectionRoleName}`,
    `arn:aws:iam::*:role/${recommendedAwsConnectionRoleName}-*`
  ];

  return {
    policyName: callerAssumeRolePolicyName,
    assumableRoleArnPattern,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Resource: assumableRoleArnResources
        }
      ]
    }
  };
}

function assertAwsConnectionCanRenderCloudFormationTemplate(
  awsConnection: AwsConnectionRecord
): void {
  if (awsConnection.region !== supportedAwsConnectionRegion) {
    throw new AwsConnectionCloudFormationTemplateError(
      "AWS connection region must be ap-northeast-2"
    );
  }

  if (awsConnection.externalId.trim().length === 0) {
    throw new AwsConnectionCloudFormationTemplateError("AWS connection external ID is missing");
  }
}

export function isRecommendedAwsConnectionRoleArn(roleArn: string): boolean {
  const roleName = getRoleNameFromRecommendedAwsConnectionRoleArn(roleArn);

  return roleName !== null && isAllowedAwsConnectionRoleName(roleName);
}

export function createRecommendedAwsConnectionRoleArn(
  accountId: string,
  connectionId?: string
): string {
  const trimmedAccountId = accountId.trim();

  if (!/^\d{12}$/.test(trimmedAccountId)) {
    throw new AwsConnectionVerificationError("AWS account ID must be 12 digits");
  }

  const roleName = connectionId
    ? createAwsConnectionRoleName(connectionId)
    : recommendedAwsConnectionRoleName;

  return `arn:aws:iam::${trimmedAccountId}:role/${roleName}`;
}

export function createAwsConnectionRoleName(connectionId: string): string {
  const suffix = connectionId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, awsConnectionRoleNameSuffixLength);

  if (suffix.length < awsConnectionRoleNameSuffixLength) {
    throw new AwsConnectionVerificationError("AWS connection ID is invalid");
  }

  return `${recommendedAwsConnectionRoleName}-${suffix}`;
}

export function createCodeBuildPermissionsBoundaryName(connectionId: string): string {
  const roleName = createAwsConnectionRoleName(connectionId);
  const suffix = roleName.slice(-(awsConnectionRoleNameSuffixLength + 1));

  return `${recommendedCodeBuildPermissionsBoundaryName}${suffix}`;
}

function assertRecommendedAwsConnectionRoleArn(roleArn: string, connectionId?: string): void {
  const roleName = getRoleNameFromRecommendedAwsConnectionRoleArn(roleArn);

  if (!roleName || !isAllowedAwsConnectionRoleName(roleName)) {
    throw new AwsConnectionVerificationError(
      `AWS Role ARN must use ${recommendedAwsConnectionRoleName} or ${recommendedAwsConnectionRoleName}-<connection>`
    );
  }

  if (!connectionId || roleName === recommendedAwsConnectionRoleName) {
    return;
  }

  const expectedRoleName = createAwsConnectionRoleName(connectionId);

  if (roleName !== expectedRoleName) {
    throw new AwsConnectionVerificationError(
      `AWS Role ARN must use ${recommendedAwsConnectionRoleName} or ${expectedRoleName}`
    );
  }
}

function getRoleNameFromRecommendedAwsConnectionRoleArn(roleArn: string): string | null {
  const match = /^arn:aws:iam::\d{12}:role\/([\w+=,.@/-]+)$/.exec(roleArn);

  return match?.[1] ?? null;
}

function isAllowedAwsConnectionRoleName(roleName: string): boolean {
  return (
    roleName === recommendedAwsConnectionRoleName ||
    new RegExp(`^${recommendedAwsConnectionRoleName}-[a-z0-9]{8}$`).test(roleName)
  );
}

function createAwsConnectionStackName(connectionId: string): string {
  return `sketchcatch-aws-connection-${connectionId.slice(0, 8)}`;
}

function createAwsConnectionCloudFormationTemplateBody(input: {
  roleName: string;
  callerPrincipalArns: readonly string[];
  externalId: string;
}): string {
  const roleName = yamlDoubleQuote(input.roleName);
  const roleNameSuffix = input.roleName.slice(-(awsConnectionRoleNameSuffixLength + 1));
  const codeBuildPermissionsBoundaryName = yamlDoubleQuote(
    `${recommendedCodeBuildPermissionsBoundaryName}${roleNameSuffix}`
  );
  const callerPrincipalArns = input.callerPrincipalArns.map(
    (callerPrincipalArn) => `                - ${yamlDoubleQuote(callerPrincipalArn)}`
  );
  const externalId = yamlDoubleQuote(input.externalId);

  return [
    'AWSTemplateFormatVersion: "2010-09-09"',
    "Description: SketchCatch AWS Role connection. Creates the IAM Role required for Terraform Plan and Apply.",
    "Resources:",
    "  SketchCatchTerraformExecutionRole:",
    "    Type: AWS::IAM::Role",
    "    Properties:",
    `      RoleName: ${roleName}`,
    "      AssumeRolePolicyDocument:",
    '        Version: "2012-10-17"',
    "        Statement:",
    "          - Effect: Allow",
    "            Principal:",
    "              AWS:",
    ...callerPrincipalArns,
    "            Action: sts:AssumeRole",
    "            Condition:",
    "              StringEquals:",
    `                sts:ExternalId: ${externalId}`,
    "      Tags:",
    "        - Key: ManagedBy",
    '          Value: "SketchCatch"',
    "        - Key: SketchCatchConnection",
    `          Value: ${externalId}`,
    "  SketchCatchCodeBuildBoundary:",
    "    Type: AWS::IAM::ManagedPolicy",
    "    Properties:",
    `      ManagedPolicyName: ${codeBuildPermissionsBoundaryName}`,
    "      Description: Maximum permissions for Repository-controlled CodeBuild jobs.",
    "      PolicyDocument:",
    '        Version: "2012-10-17"',
    "        Statement:",
    "          - Effect: Allow",
    "            Action:",
    "              - logs:CreateLogGroup",
    "              - logs:CreateLogStream",
    "              - logs:PutLogEvents",
    "            Resource:",
    '              - !Sub "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/*"',
    '              - !Sub "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/*:*"',
    "          - Effect: Allow",
    "            Action:",
    "              - codeconnections:GetConnection",
    "              - codeconnections:GetConnectionToken",
    "              - codeconnections:UseConnection",
    "              - codestar-connections:UseConnection",
    "            Resource:",
    '              - !Sub "arn:${AWS::Partition}:codeconnections:${AWS::Region}:${AWS::AccountId}:connection/*"',
    '              - !Sub "arn:${AWS::Partition}:codestar-connections:${AWS::Region}:${AWS::AccountId}:connection/*"',
    "  SketchCatchTerraformApplyPolicy:",
    "    Type: AWS::IAM::Policy",
    "    Properties:",
    '      PolicyName: !Sub "SketchCatchMvpTerraformApply-${AWS::StackName}"',
    "      Roles:",
    "        - !Ref SketchCatchTerraformExecutionRole",
    "      PolicyDocument:",
    '        Version: "2012-10-17"',
    "        Statement:",
    "          - Effect: Allow",
    "            Action: ec2:*",
    '            Resource: "*"',
    "          - Effect: Allow",
    "            Action: s3:*",
    '            Resource: "*"',
    "          - Effect: Allow",
    "            Action:",
    ...terraformFargateServiceActions.map((action) => `              - ${action}`),
    '            Resource: "*"',
    "          - Effect: Allow",
    "            Action:",
    ...directReleaseCodeBuildActions.map((action) => `              - ${action}`),
    "            Resource:",
    '              - !Sub "arn:${AWS::Partition}:codebuild:${AWS::Region}:${AWS::AccountId}:project/sketchcatch-*"',
    '              - !Sub "arn:${AWS::Partition}:codebuild:${AWS::Region}:${AWS::AccountId}:build/sketchcatch-*:*"',
    "          - Effect: Allow",
    "            Action:",
    ...githubCodeConnectionActions.map((action) => `              - ${action}`),
    '            Resource: "*"',
    "          - Effect: Allow",
    "            Action:",
    ...terraformFargateIamActions.map((action) => `              - ${action}`),
    '            Resource: "*"',
    "          - Effect: Deny",
    "            Action:",
    "              - iam:CreateRole",
    "              - iam:PutRolePermissionsBoundary",
    '            Resource: !Sub "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/SketchCatchCodeBuild-*"',
    "            Condition:",
    "              StringNotLike:",
    '                iam:PermissionsBoundary: !Sub "arn:${AWS::Partition}:iam::${AWS::AccountId}:policy/SketchCatchCodeBuildBoundary*"',
    "          - Effect: Deny",
    "            Action: iam:CreateRole",
    '            Resource: !Sub "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/SketchCatchCodeBuild-*"',
    "            Condition:",
    "              StringNotEquals:",
    '                aws:RequestTag/ManagedBy: "SketchCatch"',
    "          - Effect: Deny",
    "            Action: iam:PassRole",
    '            Resource: !Sub "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/SketchCatchCodeBuild-*"',
    "            Condition:",
    "              StringNotEquals:",
    '                iam:PassedToService: "codebuild.amazonaws.com"',
    "          - Effect: Allow",
    "            Action:",
    "              - ce:GetCostAndUsage",
    "              - ce:GetDimensionValues",
    "              - autoscaling:DescribeAutoScalingGroups",
    "              - autoscaling:DescribeScalingActivities",
    "              - ec2:DescribeInstances",
    "              - elasticloadbalancing:DescribeLoadBalancers",
    "              - elasticloadbalancing:DescribeTargetGroups",
    "              - elasticloadbalancing:DescribeTargetHealth",
    "              - cloudwatch:GetMetricData",
    "              - cloudwatch:GetMetricStatistics",
    "              - ecs:DescribeServices",
    "              - logs:FilterLogEvents",
    '            Resource: "*"',
    "Outputs:",
    "  RoleArn:",
    "    Description: Created role ARN for SketchCatch verification.",
    "    Value: !GetAtt SketchCatchTerraformExecutionRole.Arn",
    "  CodeBuildPermissionsBoundaryArn:",
    "    Description: Permissions boundary required for SketchCatch CodeBuild service roles.",
    "    Value: !Ref SketchCatchCodeBuildBoundary",
    ""
  ].join("\n");
}

function requireCallerPrincipalArns(callerPrincipalArns: readonly string[]): readonly [string, ...string[]] {
  const uniqueCallerPrincipalArns = [...new Set(callerPrincipalArns)];

  if (uniqueCallerPrincipalArns.length === 0) {
    throw new AwsConnectionCloudFormationTemplateError(
      "At least one SketchCatch AWS caller principal ARN is required"
    );
  }

  return uniqueCallerPrincipalArns as [string, ...string[]];
}

function createAwsConnectionLaunchStackUrl(input: {
  region: string;
  stackName: string;
  templateUrl: string;
}): string {
  const baseUrl = new URL("https://console.aws.amazon.com/cloudformation/home");
  baseUrl.searchParams.set("region", input.region);
  const quickCreateParams = new URLSearchParams({
    templateURL: input.templateUrl,
    stackName: input.stackName,
    capabilities: "CAPABILITY_NAMED_IAM"
  });

  return `${baseUrl.toString()}#/stacks/quickcreate?${quickCreateParams.toString()}`;
}

function yamlDoubleQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function compareAwsConnectionsForRetention(
  left: AwsConnectionRecord,
  right: AwsConnectionRecord
): number {
  const updatedAtDiff = right.updatedAt.getTime() - left.updatedAt.getTime();

  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}
