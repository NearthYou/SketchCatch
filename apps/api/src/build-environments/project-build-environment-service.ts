import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type {
  ArchitectureJson,
  AwsCodeConnectionStatus,
  ConfirmedBuildConfig,
  EcsFargateRuntimeConfig,
  ProjectBuildEnvironmentResponse
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsCodeConnections,
  awsConnections,
  architectures,
  projectBuildEnvironments,
  projectDeploymentTargets,
  projectExecutionLeases,
  projects,
  sourceRepositories
} from "../db/schema.js";
import { createCodeBuildPermissionsBoundaryName } from "../aws-connections/aws-connection-service.js";
import { maskDeploymentMessage } from "../deployments/log-masking.js";
import {
  resolveAwsDeploymentTargetIdentity
} from "../runtime-convergence/deployment-target-identity.js";
import {
  createProjectBuildCacheIdentity,
  type ProjectBuildCacheIdentity
} from "./project-build-cache.js";

export const projectBuildImage = "aws/codebuild/standard:7.0";
export const projectBuildComputeType = "BUILD_GENERAL1_SMALL";

export type ProjectBuildEnvironmentPreparationContext = {
  projectId: string;
  sourceRepository: {
    id: string;
    owner: string;
    name: string;
  } | null;
  awsConnection: {
    id: string;
    accountId: string;
    roleArn: string;
    externalId: string;
    region: string;
  } | null;
  codeConnection: {
    id: string;
    connectionArn: string | null;
    status: AwsCodeConnectionStatus;
  } | null;
  confirmedBuildConfig: ConfirmedBuildConfig | null;
};

export type ProjectBuildEnvironmentRecord = typeof projectBuildEnvironments.$inferSelect;

export type SaveProjectBuildEnvironmentInput = Omit<
  ProjectBuildEnvironmentRecord,
  "createdAt"
> & { createdAt?: Date };

export type ProjectBuildEnvironmentRepository = {
  findPreparationContext(
    projectId: string,
    userId: string
  ): Promise<ProjectBuildEnvironmentPreparationContext | undefined>;
  findByProjectId(projectId: string): Promise<ProjectBuildEnvironmentRecord | undefined>;
  findRemovalContext(
    projectId: string,
    userId: string
  ): Promise<{
    environment: ProjectBuildEnvironmentRecord;
    awsConnection: NonNullable<ProjectBuildEnvironmentPreparationContext["awsConnection"]>;
  } | undefined>;
  hasActiveExecution(projectId: string): Promise<boolean>;
  synchronizeEcsRuntimeConfig(input: {
    architectureId: string;
    codeBuildProjectName: string;
    projectId: string;
    userId: string;
  }): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
  save(input: SaveProjectBuildEnvironmentInput): Promise<ProjectBuildEnvironmentRecord>;
};

export type ProjectBuildEnvironmentRemoval = {
  projectId: string;
  awsConnection: NonNullable<ProjectBuildEnvironmentPreparationContext["awsConnection"]>;
  codeBuildProjectName: string;
  codeBuildServiceRoleName: string;
  codeBuildServiceRoleArn: string;
  permissionsBoundaryArn: string;
};

export type DesiredProjectBuildEnvironment = {
  projectId: string;
  awsConnection: NonNullable<ProjectBuildEnvironmentPreparationContext["awsConnection"]>;
  awsCodeConnectionId: string;
  codeConnectionArn: string;
  codeBuildProjectName: string;
  codeBuildServiceRoleName: string;
  codeBuildServiceRoleArn: string;
  permissionsBoundaryArn: string;
  sourceRepositoryUrl: string;
  image: typeof projectBuildImage;
  computeType: typeof projectBuildComputeType;
  buildCache: ProjectBuildCacheIdentity;
  confirmedCommitSha: string;
  runtimeFingerprint: string;
};

export type ProjectBuildEnvironmentVerification = {
  verified: boolean;
  statusReason: string | null;
};

export type ProjectRepositoryAccessVerification = {
  verified: boolean;
  requestedCommitSha: string;
  resolvedCommitSha: string | null;
  buildArn: string | null;
  statusReason: string | null;
};

export type ProjectBuildEnvironmentGateway = {
  reconcile(
    input: DesiredProjectBuildEnvironment
  ): Promise<ProjectBuildEnvironmentVerification>;
  verify(
    input: DesiredProjectBuildEnvironment
  ): Promise<ProjectBuildEnvironmentVerification>;
  verifyRepositoryAccess(
    input: DesiredProjectBuildEnvironment,
    requestedCommitSha: string
  ): Promise<ProjectRepositoryAccessVerification>;
  remove?(input: ProjectBuildEnvironmentRemoval): Promise<void>;
};

export type ProjectBuildEnvironmentServiceOptions = {
  generateId?: () => string;
  now?: () => Date;
};

export type ProjectBuildEnvironmentErrorCode =
  | "PROJECT_NOT_FOUND"
  | "SOURCE_REPOSITORY_REQUIRED"
  | "AWS_CONNECTION_REQUIRED"
  | "CODECONNECTION_REQUIRED"
  | "BUILD_CONFIG_REQUIRED"
  | "BUILD_ENVIRONMENT_NOT_FOUND"
  | "BUILD_ENVIRONMENT_DELETE_BLOCKED"
  | "BUILD_ENVIRONMENT_DELETE_FAILED"
  | "BUILD_ENVIRONMENT_PREPARE_FAILED"
  | "REPOSITORY_ACCESS_VERIFICATION_REQUIRED";

export class ProjectBuildEnvironmentError extends Error {
  constructor(
    readonly code: ProjectBuildEnvironmentErrorCode,
    message: string,
    readonly statusCode = 409
  ) {
    super(message);
    this.name = "ProjectBuildEnvironmentError";
  }
}

export function createPostgresProjectBuildEnvironmentRepository(
  db: Database
): ProjectBuildEnvironmentRepository {
  return {
    async findPreparationContext(projectId, userId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, userId),
            isNull(projects.deletionStartedAt)
          )
        );
      if (!project) return undefined;

      const [sourceRepository] = await db
        .select({
          id: sourceRepositories.id,
          owner: sourceRepositories.owner,
          name: sourceRepositories.name
        })
        .from(sourceRepositories)
        .where(
          and(
            eq(sourceRepositories.projectId, projectId),
            eq(sourceRepositories.provider, "github"),
            eq(sourceRepositories.status, "active")
          )
        );

      const [awsConnection] = await db
        .select({
          id: awsConnections.id,
          accountId: awsConnections.accountId,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region,
          confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig
        })
        .from(projectDeploymentTargets)
        .innerJoin(
          awsConnections,
          eq(awsConnections.id, projectDeploymentTargets.connectionId)
        )
        .where(
          and(
            eq(projectDeploymentTargets.projectId, projectId),
            eq(awsConnections.userId, userId),
            eq(awsConnections.status, "verified"),
            isNull(awsConnections.deletionStartedAt),
            isNotNull(awsConnections.accountId),
            isNotNull(awsConnections.roleArn)
          )
        );

      const normalizedAwsConnection =
        awsConnection?.accountId && awsConnection.roleArn
          ? {
              id: awsConnection.id,
              accountId: awsConnection.accountId,
              roleArn: awsConnection.roleArn,
              externalId: awsConnection.externalId,
              region: awsConnection.region
            }
          : null;
      const [codeConnection] = normalizedAwsConnection
        ? await db
            .select({
              id: awsCodeConnections.id,
              connectionArn: awsCodeConnections.connectionArn,
              status: awsCodeConnections.status
            })
            .from(awsCodeConnections)
            .where(eq(awsCodeConnections.awsConnectionId, normalizedAwsConnection.id))
        : [];

      return {
        projectId: project.id,
        sourceRepository: sourceRepository ?? null,
        awsConnection: normalizedAwsConnection,
        codeConnection: codeConnection ?? null,
        confirmedBuildConfig: awsConnection?.confirmedBuildConfig ?? null
      };
    },

    async findByProjectId(projectId) {
      const [environment] = await db
        .select()
        .from(projectBuildEnvironments)
        .where(eq(projectBuildEnvironments.projectId, projectId));
      return environment;
    },

    async findRemovalContext(projectId, userId) {
      const [row] = await db
        .select({
          projectId: projects.id,
          environment: projectBuildEnvironments,
          accountId: awsConnections.accountId,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region,
          awsConnectionId: awsConnections.id
        })
        .from(projects)
        .innerJoin(
          projectBuildEnvironments,
          eq(projectBuildEnvironments.projectId, projects.id)
        )
        .innerJoin(
          awsConnections,
          eq(awsConnections.id, projectBuildEnvironments.awsConnectionId)
        )
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, userId),
            isNull(projects.deletionStartedAt),
            eq(awsConnections.userId, userId),
            isNotNull(awsConnections.accountId),
            isNotNull(awsConnections.roleArn)
          )
        );
      if (!row?.accountId || !row.roleArn) return undefined;
      return {
        environment: row.environment,
        awsConnection: {
          id: row.awsConnectionId,
          accountId: row.accountId,
          roleArn: row.roleArn,
          externalId: row.externalId,
          region: row.region
        }
      };
    },

    async hasActiveExecution(projectId) {
      const [lease] = await db
        .select({ projectId: projectExecutionLeases.projectId })
        .from(projectExecutionLeases)
        .where(
          and(
            eq(projectExecutionLeases.projectId, projectId),
            eq(projectExecutionLeases.status, "active")
          )
        )
        .limit(1);
      return Boolean(lease);
    },

    async synchronizeEcsRuntimeConfig(input) {
      await db.transaction(async (transaction) => {
        const [row] = await transaction
          .select({
            accountId: awsConnections.accountId,
            architectureJson: architectures.architectureJson,
            confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
            deploymentTargetFingerprint:
              projectDeploymentTargets.deploymentTargetFingerprint,
            region: projectDeploymentTargets.region,
            runtimeConfig: projectDeploymentTargets.runtimeConfig,
            runtimeTarget: projectDeploymentTargets.runtimeTarget,
            runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind
          })
          .from(projects)
          .innerJoin(
            architectures,
            and(
              eq(architectures.id, input.architectureId),
              eq(architectures.projectId, projects.id)
            )
          )
          .innerJoin(
            projectDeploymentTargets,
            eq(projectDeploymentTargets.projectId, projects.id)
          )
          .innerJoin(
            awsConnections,
            eq(awsConnections.id, projectDeploymentTargets.connectionId)
          )
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.userId, input.userId),
              isNull(projects.deletionStartedAt)
            )
          )
          .for("update");

        if (
          row?.runtimeTargetKind !== "ecs_fargate" ||
          row.runtimeConfig?.runtimeTargetKind !== "ecs_fargate" ||
          !row.confirmedBuildConfig ||
          !row.accountId
        ) {
          throw new ProjectBuildEnvironmentError(
            "BUILD_CONFIG_REQUIRED",
            "승인된 ECS Fargate 배포 타깃을 확인할 수 없습니다."
          );
        }

        const runtimeConfig = synchronizeEcsFargateRuntimeConfigWithArchitecture(
          row.runtimeConfig,
          row.architectureJson,
          input.codeBuildProjectName
        );
        const identity = resolveAwsDeploymentTargetIdentity({
          projectId: input.projectId,
          accountId: row.accountId,
          region: row.region,
          runtimeConfig,
          healthCheckPath: row.confirmedBuildConfig.healthCheckPath
        });
        if (
          isDeepStrictEqual(runtimeConfig, row.runtimeConfig) &&
          isDeepStrictEqual(identity.target, row.runtimeTarget) &&
          identity.deploymentTargetFingerprint === row.deploymentTargetFingerprint
        ) {
          return;
        }

        await transaction
          .update(projectDeploymentTargets)
          .set({
            runtimeConfig,
            runtimeTarget: identity.target,
            deploymentTargetFingerprint: identity.deploymentTargetFingerprint,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(projectDeploymentTargets.projectId, input.projectId),
              eq(projectDeploymentTargets.runtimeTargetKind, "ecs_fargate")
            )
          );
      });
    },

    async deleteByProjectId(projectId) {
      await db
        .delete(projectBuildEnvironments)
        .where(eq(projectBuildEnvironments.projectId, projectId));
    },

    async save(input) {
      return db.transaction(async (transaction) => {
        const [codeConnection] = input.awsCodeConnectionId
          ? await transaction
              .select({ status: awsCodeConnections.status })
              .from(awsCodeConnections)
              .where(eq(awsCodeConnections.id, input.awsCodeConnectionId))
              .for("key share")
          : [];
        if (input.awsCodeConnectionId && codeConnection?.status !== "AVAILABLE") {
          throw new ProjectBuildEnvironmentError(
            "CODECONNECTION_REQUIRED",
            "사용 가능한 GitHub 빌드 연결이 필요합니다."
          );
        }
        const createdAt = input.createdAt ?? input.updatedAt;
        const [environment] = await transaction
          .insert(projectBuildEnvironments)
          .values({ ...input, createdAt })
          .onConflictDoUpdate({
            target: projectBuildEnvironments.projectId,
            set: {
              awsConnectionId: input.awsConnectionId,
              awsCodeConnectionId: input.awsCodeConnectionId,
              codeBuildProjectName: input.codeBuildProjectName,
              codeBuildServiceRoleArn: input.codeBuildServiceRoleArn,
              permissionsBoundaryArn: input.permissionsBoundaryArn,
              sourceRepositoryUrl: input.sourceRepositoryUrl,
              runtimeFingerprint: input.runtimeFingerprint,
              status: input.status,
              lastVerifiedAt: input.lastVerifiedAt,
              repositoryVerificationStatus: input.repositoryVerificationStatus,
              repositoryVerificationRequestedCommitSha:
                input.repositoryVerificationRequestedCommitSha,
              repositoryVerificationResolvedCommitSha:
                input.repositoryVerificationResolvedCommitSha,
              repositoryVerificationBuildArn: input.repositoryVerificationBuildArn,
              repositoryVerificationStatusReason: input.repositoryVerificationStatusReason,
              repositoryVerifiedAt: input.repositoryVerifiedAt,
              updatedAt: input.updatedAt
            }
          })
          .returning();
        if (!environment) throw new Error("Project build environment was not saved");
        return environment;
      });
    }
  };
}

export async function prepareProjectBuildEnvironment(
  input: { projectId: string; userId: string; architectureId?: string },
  repository: ProjectBuildEnvironmentRepository,
  gateway: ProjectBuildEnvironmentGateway,
  options: ProjectBuildEnvironmentServiceOptions = {}
): Promise<ProjectBuildEnvironmentResponse> {
  const context = await requirePreparationContext(input, repository);
  const desired = createDesiredProjectBuildEnvironment(context);
  if (input.architectureId) {
    await repository.synchronizeEcsRuntimeConfig({
      architectureId: input.architectureId,
      codeBuildProjectName: desired.codeBuildProjectName,
      projectId: input.projectId,
      userId: input.userId
    });
  }
  const existing = await repository.findByProjectId(input.projectId);
  const now = options.now?.() ?? new Date();
  const confirmedCommitSha = desired.confirmedCommitSha.toLowerCase();
  const preserveRepositoryVerification =
    existing?.runtimeFingerprint === desired.runtimeFingerprint &&
    existing.repositoryVerificationStatus === "verified" &&
    existing.repositoryVerificationRequestedCommitSha?.toLowerCase() === confirmedCommitSha &&
    existing.repositoryVerificationResolvedCommitSha?.toLowerCase() === confirmedCommitSha &&
    Boolean(existing.repositoryVerificationBuildArn) &&
    Boolean(existing.repositoryVerifiedAt);
  const repositoryVerification = preserveRepositoryVerification
    ? {
        repositoryVerificationStatus: existing.repositoryVerificationStatus,
        repositoryVerificationRequestedCommitSha:
          existing.repositoryVerificationRequestedCommitSha,
        repositoryVerificationResolvedCommitSha:
          existing.repositoryVerificationResolvedCommitSha,
        repositoryVerificationBuildArn: existing.repositoryVerificationBuildArn,
        repositoryVerificationStatusReason: existing.repositoryVerificationStatusReason,
        repositoryVerifiedAt: existing.repositoryVerifiedAt
      }
    : {
        repositoryVerificationStatus: "not_checked" as const,
        repositoryVerificationRequestedCommitSha: null,
        repositoryVerificationResolvedCommitSha: null,
        repositoryVerificationBuildArn: null,
        repositoryVerificationStatusReason: null,
        repositoryVerifiedAt: null
      };

  const preparing = await repository.save({
    id: existing?.id ?? options.generateId?.() ?? randomUUID(),
    projectId: input.projectId,
    awsConnectionId: context.awsConnection.id,
    awsCodeConnectionId: context.codeConnection.id,
    codeBuildProjectName: desired.codeBuildProjectName,
    codeBuildServiceRoleArn: desired.codeBuildServiceRoleArn,
    permissionsBoundaryArn: desired.permissionsBoundaryArn,
    sourceRepositoryUrl: desired.sourceRepositoryUrl,
    runtimeFingerprint: desired.runtimeFingerprint,
    status: "preparing",
    lastVerifiedAt: null,
    ...repositoryVerification,
    ...(existing ? { createdAt: existing.createdAt } : {}),
    updatedAt: now
  });

  let verification: ProjectBuildEnvironmentVerification;
  try {
    await requirePreparationContext(input, repository);
    verification = await gateway.reconcile(desired);
    await requirePreparationContext(input, repository);
  } catch (error) {
    await repository.save({
      ...preparing,
      status: "verification_failed",
      lastVerifiedAt: null,
      updatedAt: now
    });
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_PREPARE_FAILED",
      `AWS 빌드 환경을 준비하지 못했습니다: ${safeAwsPreparationError(error)}`,
      502
    );
  }
  const saved = await repository.save({
    id: preparing.id,
    projectId: input.projectId,
    awsConnectionId: context.awsConnection.id,
    awsCodeConnectionId: context.codeConnection.id,
    codeBuildProjectName: desired.codeBuildProjectName,
    codeBuildServiceRoleArn: desired.codeBuildServiceRoleArn,
    permissionsBoundaryArn: desired.permissionsBoundaryArn,
    sourceRepositoryUrl: desired.sourceRepositoryUrl,
    runtimeFingerprint: desired.runtimeFingerprint,
    status: verification.verified ? "ready" : "verification_failed",
    lastVerifiedAt: verification.verified ? now : null,
    ...repositoryVerification,
    createdAt: preparing.createdAt,
    updatedAt: now
  });
  return { buildEnvironment: toProjectBuildEnvironment(saved) };
}

function safeAwsPreparationError(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) return "AWS 요청이 실패했습니다.";
  return maskDeploymentMessage(error.message)
    .replace(/[\r\n\t]+/gu, " ")
    .slice(0, 500);
}

export async function getProjectBuildEnvironment(
  input: { projectId: string; userId: string },
  repository: ProjectBuildEnvironmentRepository
): Promise<ProjectBuildEnvironmentResponse> {
  const context = await repository.findPreparationContext(input.projectId, input.userId);
  if (!context) {
    throw new ProjectBuildEnvironmentError("PROJECT_NOT_FOUND", "Project not found", 404);
  }
  const environment = await repository.findByProjectId(input.projectId);
  return { buildEnvironment: environment ? toProjectBuildEnvironment(environment) : null };
}

export async function verifyProjectBuildEnvironment(
  input: { projectId: string; userId: string },
  repository: ProjectBuildEnvironmentRepository,
  gateway: ProjectBuildEnvironmentGateway,
  options: Pick<ProjectBuildEnvironmentServiceOptions, "now"> = {}
): Promise<ProjectBuildEnvironmentResponse> {
  const context = await requirePreparationContext(input, repository);
  const existing = await repository.findByProjectId(input.projectId);
  if (!existing) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_NOT_FOUND",
      "Project build environment has not been prepared",
      404
    );
  }
  const desired = createDesiredProjectBuildEnvironment(context);
  const verification = await gateway.verify(desired);
  const now = options.now?.() ?? new Date();
  const saved = await repository.save({
    ...existing,
    awsConnectionId: context.awsConnection.id,
    awsCodeConnectionId: context.codeConnection.id,
    codeBuildProjectName: desired.codeBuildProjectName,
    codeBuildServiceRoleArn: desired.codeBuildServiceRoleArn,
    permissionsBoundaryArn: desired.permissionsBoundaryArn,
    sourceRepositoryUrl: desired.sourceRepositoryUrl,
    runtimeFingerprint: desired.runtimeFingerprint,
    status: verification.verified ? "ready" : "verification_failed",
    lastVerifiedAt: verification.verified ? now : null,
    updatedAt: now
  });
  return { buildEnvironment: toProjectBuildEnvironment(saved) };
}

export async function verifyProjectRepositoryAccess(
  input: { projectId: string; userId: string },
  repository: ProjectBuildEnvironmentRepository,
  gateway: ProjectBuildEnvironmentGateway,
  options: Pick<ProjectBuildEnvironmentServiceOptions, "now"> = {}
): Promise<ProjectBuildEnvironmentResponse> {
  const context = await requirePreparationContext(input, repository);
  const existing = await repository.findByProjectId(input.projectId);
  if (!existing || existing.status !== "ready") {
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_NOT_FOUND",
      "Prepare a ready project build environment before verifying repository access",
      404
    );
  }
  const desired = createDesiredProjectBuildEnvironment(context);
  if (existing.runtimeFingerprint !== desired.runtimeFingerprint) {
    throw new ProjectBuildEnvironmentError(
      "REPOSITORY_ACCESS_VERIFICATION_REQUIRED",
      "The project build environment changed and must be prepared again"
    );
  }

  const requestedCommitSha = context.confirmedBuildConfig.confirmedCommitSha.toLowerCase();
  let verification: ProjectRepositoryAccessVerification;
  try {
    const environmentVerification = await gateway.verify(desired);
    verification = environmentVerification.verified
      ? await gateway.verifyRepositoryAccess(desired, requestedCommitSha)
      : {
          verified: false,
          requestedCommitSha,
          resolvedCommitSha: null,
          buildArn: null,
          statusReason:
            environmentVerification.statusReason ??
            "The CodeBuild project no longer matches the approved Repository and connection"
        };
  } catch (error) {
    verification = {
      verified: false,
      requestedCommitSha,
      resolvedCommitSha: null,
      buildArn: null,
      statusReason: `CodeBuild repository checkout failed: ${safeAwsPreparationError(error)}`
    };
  }
  const resolvedCommitCandidate = verification.resolvedCommitSha?.toLowerCase() ?? null;
  const resolvedCommitSha =
    resolvedCommitCandidate && /^([0-9a-f]{40}|[0-9a-f]{64})$/u.test(resolvedCommitCandidate)
      ? resolvedCommitCandidate
      : null;
  const exactCommitVerified =
    verification.verified &&
    verification.requestedCommitSha.toLowerCase() === requestedCommitSha &&
    resolvedCommitSha === requestedCommitSha &&
    Boolean(verification.buildArn);
  const now = options.now?.() ?? new Date();
  const statusReason = exactCommitVerified
    ? null
    : verification.statusReason ??
      "CodeBuild checkout commit did not match the confirmed repository commit";
  const saved = await repository.save({
    ...existing,
    repositoryVerificationStatus: exactCommitVerified ? "verified" : "failed",
    repositoryVerificationRequestedCommitSha: requestedCommitSha,
    repositoryVerificationResolvedCommitSha: resolvedCommitSha,
    repositoryVerificationBuildArn: verification.buildArn,
    repositoryVerificationStatusReason: statusReason,
    repositoryVerifiedAt: exactCommitVerified ? now : null,
    updatedAt: now
  });
  return { buildEnvironment: toProjectBuildEnvironment(saved) };
}

export async function deleteProjectBuildEnvironment(
  input: { projectId: string; userId: string },
  repository: ProjectBuildEnvironmentRepository,
  gateway: ProjectBuildEnvironmentGateway
): Promise<void> {
  const existing = await repository.findByProjectId(input.projectId);
  if (!existing) {
    const context = await repository.findPreparationContext(input.projectId, input.userId);
    if (!context) {
      throw new ProjectBuildEnvironmentError("PROJECT_NOT_FOUND", "Project not found", 404);
    }
    return;
  }
  const context = await repository.findRemovalContext(input.projectId, input.userId);
  if (!context || context.environment.id !== existing.id) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_DELETE_FAILED",
      "AWS 연결이 변경되어 빌드 환경 소유권을 확인할 수 없습니다. AWS 연결을 다시 확인해 주세요."
    );
  }
  if (await repository.hasActiveExecution(input.projectId)) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_DELETE_BLOCKED",
      "현재 앱 빌드 또는 배포가 진행 중입니다. 완료하거나 취소한 뒤 빌드 환경을 삭제해 주세요."
    );
  }
  if (!gateway.remove) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_DELETE_FAILED",
      "빌드 환경 정리 기능을 사용할 수 없습니다."
    );
  }
  const roleName = existing.codeBuildServiceRoleArn.split("/").at(-1);
  if (!roleName) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_DELETE_FAILED",
      "CodeBuild service role 이름을 확인할 수 없습니다."
    );
  }
  try {
    await gateway.remove({
      projectId: input.projectId,
      awsConnection: context.awsConnection,
      codeBuildProjectName: existing.codeBuildProjectName,
      codeBuildServiceRoleName: roleName,
      codeBuildServiceRoleArn: existing.codeBuildServiceRoleArn,
      permissionsBoundaryArn: existing.permissionsBoundaryArn
    });
    await repository.deleteByProjectId(input.projectId);
  } catch (error) {
    if (error instanceof ProjectBuildEnvironmentError) throw error;
    throw new ProjectBuildEnvironmentError(
      "BUILD_ENVIRONMENT_DELETE_FAILED",
      `AWS 빌드 환경을 삭제하지 못했습니다: ${safeAwsPreparationError(error)}`,
      502
    );
  }
}

async function requirePreparationContext(
  input: { projectId: string; userId: string },
  repository: ProjectBuildEnvironmentRepository
): Promise<RequiredPreparationContext> {
  const context = await repository.findPreparationContext(input.projectId, input.userId);
  if (!context) {
    throw new ProjectBuildEnvironmentError("PROJECT_NOT_FOUND", "Project not found", 404);
  }
  if (!context.sourceRepository) {
    throw new ProjectBuildEnvironmentError(
      "SOURCE_REPOSITORY_REQUIRED",
      "An active GitHub source repository is required"
    );
  }
  if (!context.awsConnection) {
    throw new ProjectBuildEnvironmentError(
      "AWS_CONNECTION_REQUIRED",
      "A verified AWS connection must be selected for this project"
    );
  }
  if (
    !context.codeConnection ||
    context.codeConnection.status !== "AVAILABLE" ||
    !context.codeConnection.connectionArn
  ) {
    throw new ProjectBuildEnvironmentError(
      "CODECONNECTION_REQUIRED",
      "The selected AWS connection needs an available GitHub CodeConnection"
    );
  }
  if (!context.confirmedBuildConfig?.ecsWeb) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_CONFIG_REQUIRED",
      "A confirmed ECS web build configuration is required"
    );
  }
  return context as RequiredPreparationContext;
}

type RequiredPreparationContext = ProjectBuildEnvironmentPreparationContext & {
  sourceRepository: NonNullable<ProjectBuildEnvironmentPreparationContext["sourceRepository"]>;
  awsConnection: NonNullable<ProjectBuildEnvironmentPreparationContext["awsConnection"]>;
  codeConnection: NonNullable<ProjectBuildEnvironmentPreparationContext["codeConnection"]> & {
    connectionArn: string;
  };
  confirmedBuildConfig: ConfirmedBuildConfig & {
    ecsWeb: NonNullable<ConfirmedBuildConfig["ecsWeb"]>;
  };
};

export function createDesiredProjectBuildEnvironment(
  context: RequiredPreparationContext
): DesiredProjectBuildEnvironment {
  const projectSuffix = context.projectId.replaceAll("-", "").slice(0, 8).toLowerCase();
  const codeBuildProjectName = createProjectCodeBuildProjectName(context.projectId);
  const codeBuildServiceRoleName = `SketchCatchCodeBuild-${projectSuffix}`;
  const codeBuildServiceRoleArn = `arn:aws:iam::${context.awsConnection.accountId}:role/${codeBuildServiceRoleName}`;
  const permissionsBoundaryArn = `arn:aws:iam::${context.awsConnection.accountId}:policy/${createCodeBuildPermissionsBoundaryName(context.awsConnection.id)}`;
  const repositoryName = context.sourceRepository.name.replace(/\.git$/iu, "");
  const sourceRepositoryUrl = `https://github.com/${context.sourceRepository.owner}/${repositoryName}.git`;
  const buildCache = createProjectBuildCacheIdentity({
    projectId: context.projectId,
    accountId: context.awsConnection.accountId,
    region: context.awsConnection.region
  });
  const fingerprintInput = {
    projectId: context.projectId,
    codeBuildProjectName,
    codeBuildServiceRoleArn,
    permissionsBoundaryArn,
    sourceRepositoryUrl,
    codeConnectionArn: context.codeConnection.connectionArn,
    image: projectBuildImage,
    computeType: projectBuildComputeType,
    buildCache,
    confirmedCommitSha: context.confirmedBuildConfig.confirmedCommitSha.toLowerCase(),
    buildConfig: context.confirmedBuildConfig.ecsWeb
  } as const;
  const runtimeFingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintInput))
    .digest("hex");
  return {
    ...fingerprintInput,
    awsConnection: context.awsConnection,
    awsCodeConnectionId: context.codeConnection.id,
    codeBuildServiceRoleName,
    runtimeFingerprint
  };
}

export function createProjectCodeBuildProjectName(projectId: string): string {
  const projectSuffix = projectId.replaceAll("-", "").slice(0, 8).toLowerCase();
  return `sketchcatch-${projectSuffix}-build`;
}

export function synchronizeEcsFargateRuntimeConfigWithArchitecture(
  current: EcsFargateRuntimeConfig,
  architectureJson: ArchitectureJson,
  codeBuildProjectName: string
): EcsFargateRuntimeConfig {
  const ecrConfig = getSingleArchitectureResourceConfig(
    architectureJson,
    "ECR_REPOSITORY"
  );
  const clusterConfig = getSingleArchitectureResourceConfig(architectureJson, "ECS_CLUSTER");
  const serviceConfig = getSingleArchitectureResourceConfig(architectureJson, "ECS_SERVICE");
  const loadBalancer = readArchitectureBlock(serviceConfig, "loadBalancer");
  const containerPort = readArchitecturePositiveInteger(loadBalancer, "containerPort");
  const ecrRepositoryName = readArchitectureString(ecrConfig, "name");
  const clusterName = readArchitectureString(clusterConfig, "name");
  const serviceName = readArchitectureString(serviceConfig, "name");
  const containerName = readArchitectureString(loadBalancer, "containerName");

  if (
    !codeBuildProjectName.trim() ||
    !ecrRepositoryName ||
    !clusterName ||
    !serviceName ||
    !containerName ||
    containerPort === null
  ) {
    throw new ProjectBuildEnvironmentError(
      "BUILD_CONFIG_REQUIRED",
      "승인된 Board에서 ECR, ECS cluster, ECS service, container 좌표를 하나씩 확인할 수 없습니다."
    );
  }
  const coordinates = {
    ecrRepositoryName,
    clusterName,
    serviceName,
    containerName,
    containerPort
  };

  const infrastructureCoordinatesChanged =
    current.ecrRepositoryName !== coordinates.ecrRepositoryName ||
    current.clusterName !== coordinates.clusterName ||
    current.serviceName !== coordinates.serviceName ||
    current.containerName !== coordinates.containerName ||
    current.containerPort !== coordinates.containerPort;

  if (!infrastructureCoordinatesChanged) {
    return current.codeBuildProjectName === codeBuildProjectName
      ? current
      : { ...current, codeBuildProjectName };
  }

  return {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName,
    ...coordinates,
    outputUrl: null
  };
}

function getSingleArchitectureResourceConfig(
  architectureJson: ArchitectureJson,
  resourceType: ArchitectureJson["nodes"][number]["type"]
): Record<string, unknown> | null {
  const matches = architectureJson.nodes.filter((node) => node.type === resourceType);
  return matches.length === 1 ? matches[0]?.config ?? null : null;
}

function readArchitectureBlock(
  values: Record<string, unknown> | null,
  key: string
): Record<string, unknown> | null {
  const value = values?.[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    value[0] &&
    typeof value[0] === "object" &&
    !Array.isArray(value[0])
  ) {
    return value[0] as Record<string, unknown>;
  }
  return null;
}

function readArchitectureString(values: Record<string, unknown> | null, key: string): string {
  const value = values?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readArchitecturePositiveInteger(
  values: Record<string, unknown> | null,
  key: string
): number | null {
  const value = values?.[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function toProjectBuildEnvironment(
  record: ProjectBuildEnvironmentRecord
): NonNullable<ProjectBuildEnvironmentResponse["buildEnvironment"]> {
  return {
    id: record.id,
    projectId: record.projectId,
    awsConnectionId: record.awsConnectionId,
    awsCodeConnectionId: record.awsCodeConnectionId,
    codeBuildProjectName: record.codeBuildProjectName,
    codeBuildServiceRoleArn: record.codeBuildServiceRoleArn,
    permissionsBoundaryArn: record.permissionsBoundaryArn,
    sourceRepositoryUrl: record.sourceRepositoryUrl,
    runtimeFingerprint: record.runtimeFingerprint,
    status: record.status,
    lastVerifiedAt: record.lastVerifiedAt?.toISOString() ?? null,
    repositoryVerificationStatus: record.repositoryVerificationStatus,
    repositoryVerificationRequestedCommitSha:
      record.repositoryVerificationRequestedCommitSha,
    repositoryVerificationResolvedCommitSha:
      record.repositoryVerificationResolvedCommitSha,
    repositoryVerificationBuildArn: record.repositoryVerificationBuildArn,
    repositoryVerificationStatusReason: record.repositoryVerificationStatusReason,
    repositoryVerifiedAt: record.repositoryVerifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}
