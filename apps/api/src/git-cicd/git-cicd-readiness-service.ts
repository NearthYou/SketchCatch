import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  type ApplicationReleaseStatus,
  type CompositeReleaseDigest,
  normalizeLegacyRuntimeDeploymentTarget,
  RUNTIME_CONVERGENCE_CONTRACT_VERSION,
  type ConfirmedBuildConfig,
  type DeploymentScope,
  type EcsFargateRuntimeConfig,
  type FrontendReleaseEvidence,
  type GitCicdReadinessAction,
  type GitCicdReadinessItem,
  type GitCicdReadinessSnapshot,
  type JsonValue,
  type PackageManagerKind,
  type ProjectDeploymentRuntimeConfig,
  type RepositoryAnalysisAiHandoff,
  type RuntimeDeploymentTarget,
  type RuntimeTargetKind
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  awsConnections,
  applicationReleases,
  deployedResources,
  deploymentPlanArtifacts,
  deployments,
  gitCicdMonitoringConfigs,
  projectBuildEnvironments,
  projectDeploymentTargets,
  projects,
  sourceRepositories,
  terraformOutputs
} from "../db/schema.js";
import {
  createS3DeploymentPlanArtifactStorage,
  type DeploymentPlanArtifactStorage
} from "../deployments/deployment-plan-artifact-storage.js";
import {
  assertEcsFargateRuntimeInventory,
  resolveEcsFargateRuntimeOutputs,
  type ResolvedEcsFargateRuntimeOutputs
} from "../deployments/ecs-fargate-output-reconciliation.js";
import {
  validateConfirmedBuildConfig,
  type ProjectDeploymentTargetRecord as ReleaseLedgerDeploymentTargetRecord,
  type SaveProjectDeploymentTargetInput
} from "../releases/project-release-ledger-service.js";
import { renderPreflightBuildspec } from "../releases/preflight-buildspec.js";
import { createDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";

export type GitCicdReadinessDeploymentRecord = {
  id: string;
  projectId: string;
  terraformArtifactId: string;
  awsConnectionId: string | null;
  approvedPlanArtifactId: string | null;
  scope: DeploymentScope;
  targetKind: RuntimeTargetKind | null;
  status: string;
  source: "direct" | "gitops";
  completedAt: Date | null;
  createdAt: Date;
};

export type GitCicdReadinessPlanArtifactRecord = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  terraformArtifactSha256: string | null;
  operation: "apply" | "destroy";
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
  createdAt: Date;
};

export type GitCicdReadinessApplicationReleaseRecord = {
  id: string;
  projectId: string;
  deploymentId: string | null;
  source: "direct" | "gitops";
  status: ApplicationReleaseStatus;
  runtimeTargetKind: RuntimeTargetKind;
  deploymentTargetFingerprint: string | null;
  commitSha: string;
  releaseCandidateId: string | null;
  compositeDigest: CompositeReleaseDigest | null;
  outputUrl: string | null;
  healthEvidence: JsonValue | null;
  frontendEvidence: FrontendReleaseEvidence | null;
  completedAt: Date | null;
  deploymentScope: DeploymentScope;
  deploymentSource: "direct" | "gitops";
  deploymentStatus: string;
  deploymentCompletedAt: Date | null;
};

export type VerifiedConnectionRecord = {
  id: string;
  accountId: string;
  region: string;
};

export type RepositoryMonitoringRecord = {
  id: string;
  analysisRevision: string | null;
  analysisResult: RepositoryAnalysisAiHandoff | null;
  defaultBranch: string;
  monitorBranch: string | null;
  enabled: boolean | null;
  validationStatus: "required" | "valid" | "invalid" | null;
};

export type ProjectDeploymentTargetRecord = ReleaseLedgerDeploymentTargetRecord;

export type ProjectBuildEnvironmentRecord = {
  id: string;
  projectId: string;
  awsConnectionId: string | null;
  codeBuildProjectName: string;
  status: "preparing" | "ready" | "verification_failed" | "disconnected";
};

export type TerraformOutputRecord = {
  name: string;
  value: unknown | null;
  sensitive: boolean;
};

export type DeployedResourceRecord = {
  terraformType: string;
  resourceId: string | null;
  region: string;
};

export type SaveReconciledDeploymentTargetInput = Omit<
  SaveProjectDeploymentTargetInput,
  "runtimeTargetKind" | "runtimeConfig" | "runtimeTarget" | "deploymentTargetFingerprint"
> & {
  runtimeTargetKind: "ecs_fargate";
  runtimeConfig: ProjectDeploymentRuntimeConfig;
  runtimeTarget: RuntimeDeploymentTarget;
  deploymentTargetFingerprint: string;
};

export type GitCicdReadinessRepository = {
  runInProjectSnapshot<T>(
    projectId: string,
    operation: (repository: GitCicdReadinessRepository) => Promise<T>
  ): Promise<T>;
  findAccessibleProject(
    projectId: string,
    userId: string
  ): Promise<{ id: string } | undefined>;
  findLatestSuccessfulDirectInfrastructureDeployment(
    projectId: string
  ): Promise<GitCicdReadinessDeploymentRecord | undefined>;
  findLatestSucceededDirectApplicationRelease(
    projectId: string
  ): Promise<GitCicdReadinessApplicationReleaseRecord | undefined>;
  findDirectDeploymentInProject(
    projectId: string,
    deploymentId: string
  ): Promise<GitCicdReadinessDeploymentRecord | undefined>;
  listPlanArtifacts(
    deploymentId: string
  ): Promise<GitCicdReadinessPlanArtifactRecord[]>;
  findVerifiedConnection(
    connectionId: string,
    userId: string
  ): Promise<VerifiedConnectionRecord | undefined>;
  findActiveRepositoryWithMonitoring(
    projectId: string
  ): Promise<RepositoryMonitoringRecord | undefined>;
  findProjectDeploymentTarget(
    projectId: string
  ): Promise<ProjectDeploymentTargetRecord | undefined>;
  findProjectBuildEnvironment(
    projectId: string
  ): Promise<ProjectBuildEnvironmentRecord | undefined>;
  listTerraformOutputs(deploymentId: string): Promise<TerraformOutputRecord[]>;
  listDeployedResources(deploymentId: string): Promise<DeployedResourceRecord[]>;
  saveReconciledDeploymentTarget(
    input: SaveReconciledDeploymentTargetInput
  ): Promise<ProjectDeploymentTargetRecord>;
};

export type GitCicdReadinessPlanVerifier = {
  verify(input: {
    deployment: GitCicdReadinessDeploymentRecord;
    plan: GitCicdReadinessPlanArtifactRecord;
    connection: VerifiedConnectionRecord;
  }): Promise<boolean>;
};

export class GitCicdReadinessNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitCicdReadinessNotFoundError";
  }
}

export class GitCicdReadinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitCicdReadinessValidationError";
  }
}

export class GitCicdReadinessRefreshError extends Error {
  override cause: unknown;

  constructor(message: string, options: { cause: unknown }) {
    super(message);
    this.name = "GitCicdReadinessRefreshError";
    this.cause = options.cause;
  }
}

export function createDeploymentPlanArtifactVerifier(
  storage: Pick<DeploymentPlanArtifactStorage, "downloadDeploymentPlanArtifact">
): GitCicdReadinessPlanVerifier {
  return {
    async verify({ deployment, plan, connection }) {
      if (
        plan.deploymentId !== deployment.id ||
        plan.terraformArtifactId !== deployment.terraformArtifactId ||
        !isSha256(plan.terraformArtifactSha256) ||
        plan.operation !== "apply" ||
        plan.accountId !== connection.accountId ||
        plan.region !== connection.region ||
        !isSha256(plan.sha256) ||
        !storage.downloadDeploymentPlanArtifact
      ) {
        return false;
      }

      try {
        const body = await storage.downloadDeploymentPlanArtifact({
          deploymentId: deployment.id,
          planArtifactId: plan.id,
          objectKey: plan.objectKey
        });
        return createHash("sha256").update(body).digest("hex") === plan.sha256;
      } catch (error) {
        if (isMissingPlanArtifactError(error)) return false;
        throw new GitCicdReadinessRefreshError(
          "Failed to download the deployment Apply Plan artifact",
          { cause: error }
        );
      }
    }
  };
}

export function createGitCicdReadinessService(options: {
  repository: GitCicdReadinessRepository;
  planVerifier?: GitCicdReadinessPlanVerifier;
  now?: () => Date;
}) {
  const planVerifier =
    options.planVerifier ??
    createDeploymentPlanArtifactVerifier(createS3DeploymentPlanArtifactStorage());
  const now = options.now ?? (() => new Date());

  return {
    async refresh(input: {
      projectId: string;
      userId: string;
    }): Promise<GitCicdReadinessSnapshot> {
      return options.repository.runInProjectSnapshot(input.projectId, async (repository) => {
        const project = await repository.findAccessibleProject(input.projectId, input.userId);
        if (!project) {
          throw new GitCicdReadinessNotFoundError("Project not found");
        }

        const deploymentEvidence = await inspectLatestSuccessfulDeployment(
          input,
          repository,
          planVerifier
        );
        const sourceRepository = await repository.findActiveRepositoryWithMonitoring(
          input.projectId
        );
        const buildEnvironment = await repository.findProjectBuildEnvironment(input.projectId);
        let target = await repository.findProjectDeploymentTarget(input.projectId);
        let targetReconciled = false;
        const checkedAt = now();
        const selection = toSelectedApplyPlan(deploymentEvidence);
        if (selection) {
          const reconciledTarget = await reconcileDeploymentTarget({
            projectId: input.projectId,
            selection,
            sourceRepository,
            buildEnvironment,
            currentTarget: target,
            repository,
            checkedAt
          });
          if (reconciledTarget) {
            target = reconciledTarget;
            targetReconciled = true;
          }
        }
        const targetConnection = target?.connectionId
          ? await repository.findVerifiedConnection(target.connectionId, input.userId)
          : undefined;
        const applicationRelease =
          await repository.findLatestSucceededDirectApplicationRelease(input.projectId);
        const initialApplicationReleaseReady = isEligibleInitialApplicationRelease({
          release: applicationRelease,
          infrastructureDeployment: deploymentEvidence.deployment,
          target
        });

        const items = createReadinessItems({
          deploymentEvidence,
          sourceRepository,
          buildEnvironment,
          target,
          targetConnection,
          targetReconciled,
          initialApplicationReleaseReady
        });
        const requiredActionCount = items.filter(
          (item) => item.status === "action_required"
        ).length;

        return {
          projectId: input.projectId,
          checkedAt: checkedAt.toISOString(),
          ready: requiredActionCount === 0,
          requiredActionCount,
          sourceDeploymentId: deploymentEvidence.deployment?.id ?? null,
          approvedApplyPlanArtifactId: deploymentEvidence.plan?.id ?? null,
          initialApplicationReleaseId: initialApplicationReleaseReady
            ? applicationRelease?.id ?? null
            : null,
          items
        };
      });
    },
    async synchronizeDeploymentTargetAfterSuccessfulApply(input: {
      projectId: string;
      deploymentId: string;
      userId: string;
    }): Promise<ProjectDeploymentTargetRecord> {
      return options.repository.runInProjectSnapshot(input.projectId, async (repository) => {
        const project = await repository.findAccessibleProject(input.projectId, input.userId);
        if (!project) throw new GitCicdReadinessNotFoundError("Project not found");

        const deployment = await repository.findDirectDeploymentInProject(
          input.projectId,
          input.deploymentId
        );
        requirePostApplyDeployment(deployment, input);
        if (!deployment.awsConnectionId) {
          throw new GitCicdReadinessValidationError(
            "Post-Apply synchronization requires a verified AWS connection"
          );
        }
        const connection = await repository.findVerifiedConnection(
          deployment.awsConnectionId,
          input.userId
        );
        if (!connection) {
          throw new GitCicdReadinessValidationError(
            "Post-Apply synchronization requires a verified AWS connection"
          );
        }
        const plan = await requireApprovedApplyPlan(
          deployment,
          connection,
          repository,
          planVerifier
        );
        const sourceRepository = await repository.findActiveRepositoryWithMonitoring(
          input.projectId
        );
        const buildEnvironment = await repository.findProjectBuildEnvironment(input.projectId);
        const currentTarget = await repository.findProjectDeploymentTarget(input.projectId);

        return requireReconciledDeploymentTarget({
          projectId: input.projectId,
          selection: { deployment, connection, plan },
          sourceRepository,
          buildEnvironment,
          currentTarget,
          repository,
          checkedAt: now()
        });
      });
    }
  };
}

export function createPostgresGitCicdReadinessRepository(
  db: Database
): GitCicdReadinessRepository {
  const repository = createRepositoryQueries(db);

  return {
    ...repository,
    async runInProjectSnapshot(projectId, operation) {
      return retrySerializationConflict(() =>
        db.transaction(
          async (transaction) => {
            await transaction
              .select({ id: projects.id })
              .from(projects)
              .where(eq(projects.id, projectId))
              .for("update");
            const snapshotRepository = createRepositoryQueries(transaction);
            return operation({
              ...snapshotRepository,
              async runInProjectSnapshot(_nestedProjectId, nestedOperation) {
                return nestedOperation(snapshotRepository);
              }
            });
          },
          { isolationLevel: "repeatable read" }
        )
      );
    }
  };
}

async function retrySerializationConflict<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 2 || !isPostgresSerializationFailure(error)) throw error;
    }
  }
}

function isPostgresSerializationFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "40001"
  );
}

type ReadinessDatabase = Pick<Database, "select" | "insert">;

function createRepositoryQueries(db: ReadinessDatabase): GitCicdReadinessRepository {
  const repository: GitCicdReadinessRepository = {
    async runInProjectSnapshot(_projectId, operation) {
      return operation(repository);
    },
    async findAccessibleProject(projectId, userId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      return project;
    },
    async findLatestSuccessfulDirectInfrastructureDeployment(projectId) {
      const [deployment] = await db
        .select({
          id: deployments.id,
          projectId: deployments.projectId,
          terraformArtifactId: deployments.terraformArtifactId,
          awsConnectionId: deployments.awsConnectionId,
          approvedPlanArtifactId: deployments.approvedPlanArtifactId,
          scope: deployments.scope,
          targetKind: deployments.targetKind,
          status: deployments.status,
          source: deployments.source,
          completedAt: deployments.completedAt,
          createdAt: deployments.createdAt
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            eq(deployments.status, "SUCCESS"),
            eq(deployments.source, "direct"),
            inArray(deployments.scope, ["infrastructure", "full_stack"]),
            isNotNull(deployments.completedAt)
          )
        )
        .orderBy(desc(deployments.completedAt), desc(deployments.createdAt))
        .limit(1);
      return deployment;
    },
    async findLatestSucceededDirectApplicationRelease(projectId) {
      const [release] = await db
        .select({
          id: applicationReleases.id,
          projectId: applicationReleases.projectId,
          deploymentId: applicationReleases.deploymentId,
          source: applicationReleases.source,
          status: applicationReleases.status,
          runtimeTargetKind: applicationReleases.runtimeTargetKind,
          deploymentTargetFingerprint: applicationReleases.deploymentTargetFingerprint,
          commitSha: applicationReleases.commitSha,
          releaseCandidateId: applicationReleases.releaseCandidateId,
          compositeDigest: applicationReleases.compositeDigest,
          outputUrl: applicationReleases.outputUrl,
          healthEvidence: applicationReleases.healthEvidence,
          frontendEvidence: applicationReleases.frontendEvidence,
          completedAt: applicationReleases.completedAt,
          deploymentScope: deployments.scope,
          deploymentSource: deployments.source,
          deploymentStatus: deployments.status,
          deploymentCompletedAt: deployments.completedAt
        })
        .from(applicationReleases)
        .innerJoin(deployments, eq(deployments.id, applicationReleases.deploymentId))
        .where(
          and(
            eq(applicationReleases.projectId, projectId),
            eq(applicationReleases.source, "direct"),
            eq(applicationReleases.status, "succeeded"),
            eq(applicationReleases.runtimeTargetKind, "ecs_fargate"),
            isNotNull(applicationReleases.completedAt)
          )
        )
        .orderBy(
          desc(applicationReleases.completedAt),
          desc(applicationReleases.createdAt),
          desc(applicationReleases.id)
        )
        .limit(1);
      return release;
    },
    async findDirectDeploymentInProject(projectId, deploymentId) {
      const [deployment] = await db
        .select({
          id: deployments.id,
          projectId: deployments.projectId,
          terraformArtifactId: deployments.terraformArtifactId,
          awsConnectionId: deployments.awsConnectionId,
          approvedPlanArtifactId: deployments.approvedPlanArtifactId,
          scope: deployments.scope,
          targetKind: deployments.targetKind,
          status: deployments.status,
          source: deployments.source,
          completedAt: deployments.completedAt,
          createdAt: deployments.createdAt
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.id, deploymentId),
            eq(deployments.projectId, projectId),
            eq(deployments.source, "direct")
          )
        );
      return deployment;
    },
    async listPlanArtifacts(deploymentId) {
      return db
        .select({
          id: deploymentPlanArtifacts.id,
          deploymentId: deploymentPlanArtifacts.deploymentId,
          terraformArtifactId: deploymentPlanArtifacts.terraformArtifactId,
          terraformArtifactSha256: deploymentPlanArtifacts.terraformArtifactSha256,
          operation: deploymentPlanArtifacts.operation,
          objectKey: deploymentPlanArtifacts.objectKey,
          sha256: deploymentPlanArtifacts.sha256,
          accountId: deploymentPlanArtifacts.accountId,
          region: deploymentPlanArtifacts.region,
          createdAt: deploymentPlanArtifacts.createdAt
        })
        .from(deploymentPlanArtifacts)
        .where(eq(deploymentPlanArtifacts.deploymentId, deploymentId))
        .orderBy(desc(deploymentPlanArtifacts.createdAt), desc(deploymentPlanArtifacts.id));
    },
    async findVerifiedConnection(connectionId, userId) {
      const [connection] = await db
        .select({
          id: awsConnections.id,
          accountId: awsConnections.accountId,
          region: awsConnections.region
        })
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, userId),
            eq(awsConnections.status, "verified")
          )
        );
      return connection?.accountId
        ? { id: connection.id, accountId: connection.accountId, region: connection.region }
        : undefined;
    },
    async findActiveRepositoryWithMonitoring(projectId) {
      const [record] = await db
        .select({
          id: sourceRepositories.id,
          analysisRevision: sourceRepositories.analysisRevision,
          analysisResult: sourceRepositories.analysisResult,
          defaultBranch: sourceRepositories.defaultBranch,
          monitorBranch: gitCicdMonitoringConfigs.monitorBranch,
          enabled: gitCicdMonitoringConfigs.enabled,
          validationStatus: gitCicdMonitoringConfigs.validationStatus
        })
        .from(sourceRepositories)
        .leftJoin(
          gitCicdMonitoringConfigs,
          eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositories.id)
        )
        .where(
          and(
            eq(sourceRepositories.projectId, projectId),
            eq(sourceRepositories.status, "active"),
            eq(sourceRepositories.provider, "github")
          )
        );
      return record;
    },
    async findProjectDeploymentTarget(projectId) {
      const [target] = await db
        .select()
        .from(projectDeploymentTargets)
        .where(eq(projectDeploymentTargets.projectId, projectId));
      return target;
    },
    async findProjectBuildEnvironment(projectId) {
      const [environment] = await db
        .select({
          id: projectBuildEnvironments.id,
          projectId: projectBuildEnvironments.projectId,
          awsConnectionId: projectBuildEnvironments.awsConnectionId,
          codeBuildProjectName: projectBuildEnvironments.codeBuildProjectName,
          status: projectBuildEnvironments.status
        })
        .from(projectBuildEnvironments)
        .where(eq(projectBuildEnvironments.projectId, projectId));
      return environment;
    },
    async listTerraformOutputs(deploymentId) {
      return db
        .select({
          name: terraformOutputs.name,
          value: terraformOutputs.value,
          sensitive: terraformOutputs.sensitive
        })
        .from(terraformOutputs)
        .where(eq(terraformOutputs.deploymentId, deploymentId));
    },
    async listDeployedResources(deploymentId) {
      return db
        .select({
          terraformType: deployedResources.terraformType,
          resourceId: deployedResources.resourceId,
          region: deployedResources.region
        })
        .from(deployedResources)
        .where(eq(deployedResources.deploymentId, deploymentId));
    },
    async saveReconciledDeploymentTarget(input) {
      const [target] = await db
        .insert(projectDeploymentTargets)
        .values(input)
        .onConflictDoUpdate({
          target: projectDeploymentTargets.projectId,
          set: {
            provider: input.provider,
            connectionId: input.connectionId,
            region: input.region,
            runtimeTargetKind: input.runtimeTargetKind,
            confirmedBuildConfig: input.confirmedBuildConfig,
            runtimeConfig: input.runtimeConfig,
            runtimeTarget: input.runtimeTarget,
            deploymentTargetFingerprint: input.deploymentTargetFingerprint,
            rolloutStrategy: input.rolloutStrategy,
            updatedAt: input.updatedAt
          }
        })
        .returning();
      if (!target) throw new Error("Deployment target was not saved");
      return target;
    }
  };

  return repository;
}

type SelectedApplyPlan = {
  deployment: GitCicdReadinessDeploymentRecord;
  plan: GitCicdReadinessPlanArtifactRecord;
  connection: VerifiedConnectionRecord;
};

type DeploymentEvidence = {
  deployment: GitCicdReadinessDeploymentRecord | null;
  plan: GitCicdReadinessPlanArtifactRecord | null;
  connection: VerifiedConnectionRecord | null;
};

async function inspectLatestSuccessfulDeployment(
  input: { projectId: string; userId: string },
  repository: GitCicdReadinessRepository,
  planVerifier: GitCicdReadinessPlanVerifier
): Promise<DeploymentEvidence> {
  const deployment = await repository.findLatestSuccessfulDirectInfrastructureDeployment(
    input.projectId
  );
  if (!deployment || !isSuccessfulDirectInfrastructureDeployment(deployment)) {
    return { deployment: null, connection: null, plan: null };
  }
  if (!deployment.awsConnectionId) {
    return { deployment, connection: null, plan: null };
  }
  const connection = await repository.findVerifiedConnection(
    deployment.awsConnectionId,
    input.userId
  );
  if (!connection) return { deployment, connection: null, plan: null };

  const plans = await repository.listPlanArtifacts(deployment.id);
  const orderedPlans = prioritizeApprovedApplyPlan(
    plans,
    deployment.approvedPlanArtifactId
  );
  for (const plan of orderedPlans) {
    if (await planVerifier.verify({ deployment, plan, connection })) {
      return { deployment, connection, plan };
    }
  }
  return { deployment, connection, plan: null };
}

function toSelectedApplyPlan(evidence: DeploymentEvidence): SelectedApplyPlan | null {
  return evidence.deployment && evidence.connection && evidence.plan
    ? {
        deployment: evidence.deployment,
        connection: evidence.connection,
        plan: evidence.plan
      }
    : null;
}

async function reconcileDeploymentTarget(input: {
  projectId: string;
  selection: SelectedApplyPlan;
  sourceRepository: RepositoryMonitoringRecord | undefined;
  buildEnvironment: ProjectBuildEnvironmentRecord | undefined;
  currentTarget: ProjectDeploymentTargetRecord | undefined;
  repository: GitCicdReadinessRepository;
  checkedAt: Date;
}): Promise<ProjectDeploymentTargetRecord | null> {
  try {
    return await requireReconciledDeploymentTarget(input);
  } catch (error) {
    if (error instanceof GitCicdReadinessValidationError) return null;
    throw error;
  }
}

async function requireReconciledDeploymentTarget(input: {
  projectId: string;
  selection: SelectedApplyPlan;
  sourceRepository: RepositoryMonitoringRecord | undefined;
  buildEnvironment: ProjectBuildEnvironmentRecord | undefined;
  currentTarget: ProjectDeploymentTargetRecord | undefined;
  repository: GitCicdReadinessRepository;
  checkedAt: Date;
}): Promise<ProjectDeploymentTargetRecord> {
  const buildEnvironment = input.buildEnvironment;
  if (
    !buildEnvironment ||
    buildEnvironment.status !== "ready" ||
    buildEnvironment.awsConnectionId !== input.selection.connection.id
  ) {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires a ready build environment for the verified AWS connection"
    );
  }
  if (input.currentTarget && input.currentTarget.runtimeTargetKind !== "ecs_fargate") {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires an ecs_fargate deployment target"
    );
  }

  const outputRecords = await input.repository.listTerraformOutputs(
    input.selection.deployment.id
  );
  const deployedResources = await input.repository.listDeployedResources(
    input.selection.deployment.id
  );
  let outputs: ResolvedEcsFargateRuntimeOutputs;
  try {
    outputs = resolveEcsFargateRuntimeOutputs(outputRecords);
    assertEcsFargateRuntimeInventory(
      outputs,
      deployedResources,
      {
        accountId: input.selection.connection.accountId,
        region: input.selection.connection.region
      }
    );
  } catch {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires complete runtime outputs and inventory"
    );
  }

  const confirmedBuildConfig = input.currentTarget
    ? input.currentTarget.confirmedBuildConfig
    : createDeterministicBuildConfig({
        sourceRepository: input.sourceRepository,
        outputs,
        checkedAt: input.checkedAt
      });
  if (!confirmedBuildConfig) {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires deterministic build configuration evidence"
    );
  }
  requireValidEcsFargateBuildConfig(confirmedBuildConfig);

  const runtimeConfig = createEcsFargateRuntimeConfig(
    buildEnvironment,
    outputs
  );
  const runtimeTarget = normalizeLegacyRuntimeDeploymentTarget(runtimeConfig, {
    healthCheckPath: confirmedBuildConfig.healthCheckPath
  });
  const deploymentTargetIdentity = createDeploymentTargetIdentity({
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    scope: {
      projectId: input.projectId,
      provider: "aws",
      accountId: input.selection.connection.accountId,
      region: input.selection.connection.region
    },
    target: runtimeTarget
  });

  return input.repository.saveReconciledDeploymentTarget({
    projectId: input.projectId,
    provider: "aws",
    connectionId: input.selection.connection.id,
    region: input.selection.connection.region,
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig,
    runtimeConfig,
    runtimeTarget,
    deploymentTargetFingerprint: deploymentTargetIdentity.deploymentTargetFingerprint,
    rolloutStrategy: "all_at_once",
    updatedAt: input.checkedAt
  });
}

function createEcsFargateRuntimeConfig(
  buildEnvironment: ProjectBuildEnvironmentRecord,
  outputs: ResolvedEcsFargateRuntimeOutputs
): EcsFargateRuntimeConfig {
  return {
    runtimeTargetKind: "ecs_fargate",
    codeBuildProjectName: buildEnvironment.codeBuildProjectName,
    buildEnvironmentId: buildEnvironment.id,
    ecrRepositoryName: outputs.ecrRepositoryName,
    ecrRepositoryArn: outputs.ecrRepositoryArn,
    ecrRepositoryUrl: outputs.ecrRepositoryUrl,
    clusterName: outputs.clusterName,
    serviceName: outputs.serviceName,
    containerName: outputs.containerName,
    containerPort: outputs.containerPort,
    taskDefinitionFamily: outputs.taskDefinitionFamily,
    taskDefinitionArn: outputs.taskDefinitionArn,
    taskRoleArn: outputs.taskRoleArn,
    executionRoleArn: outputs.executionRoleArn,
    targetGroupArn: outputs.targetGroupArn,
    loadBalancerArn: outputs.loadBalancerArn,
    loadBalancerDnsName: outputs.loadBalancerDnsName,
    apiOriginUrl: outputs.apiOriginUrl,
    frontendBucketName: outputs.frontendBucketName,
    cloudFrontDistributionId: outputs.cloudFrontDistributionId,
    cloudFrontDomainName: outputs.cloudFrontDomainName,
    logGroupNames: outputs.logGroupNames,
    outputUrl: outputs.outputUrl
  };
}

function createDeterministicBuildConfig(input: {
  sourceRepository: RepositoryMonitoringRecord | undefined;
  outputs: ResolvedEcsFargateRuntimeOutputs;
  checkedAt: Date;
}): ConfirmedBuildConfig | null {
  const repository = input.sourceRepository;
  if (
    !hasValidMonitoringConfig(repository) ||
    !repository.analysisResult ||
    !repository.analysisRevision ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(repository.analysisRevision)
  ) {
    return null;
  }

  const analysis = repository.analysisResult;
  const dockerfiles = analysis.evidence.filter((evidence) => evidence.kind === "dockerfile");
  if (dockerfiles.length !== 1) return null;
  const dockerfile = dockerfiles[0];
  if (!dockerfile?.applicationUnitId || !isSafeRepositoryPath(dockerfile.path)) return null;
  const applicationUnits = analysis.applicationUnits.filter(
    (unit) => unit.id === dockerfile.applicationUnitId
  );
  if (applicationUnits.length !== 1) return null;
  const applicationUnit = applicationUnits[0];
  if (
    !applicationUnit ||
    !isSafeRepositoryPath(applicationUnit.rootPath) ||
    !isPathWithinRoot(dockerfile.path, applicationUnit.rootPath)
  ) {
    return null;
  }

  const hasRootPackageManifest = analysis.evidence.some(
    (evidence) => evidence.kind === "package_json" && evidence.path === "package.json"
  );
  const apiSourceRoot =
    hasRootPackageManifest && dockerfile.path.includes("/")
      ? "."
      : applicationUnit.rootPath;

  const base: ConfirmedBuildConfig = {
    sourceRoot: apiSourceRoot,
    evidence: [{ kind: "dockerfile", path: dockerfile.path }],
    installPreset: "none",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: dockerfile.path,
    packageManifestPath: null,
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: repository.analysisRevision.toLowerCase(),
    confirmedAt: input.checkedAt.toISOString()
  };

  const webUnits = analysis.applicationUnits.filter(
    (unit) => unit.kind === "frontend" || unit.kind === "fullstack"
  );
  if (webUnits.length !== 1) return null;
  const webUnit = webUnits[0];
  if (!webUnit || !isSafeRepositoryPath(webUnit.rootPath)) return null;
  const packageManifests = analysis.evidence.filter(
    (evidence) =>
      evidence.kind === "package_json" && evidence.applicationUnitId === webUnit.id
  );
  const lockfile = selectFrontendLockfile(
    analysis.evidence.filter((evidence) => evidence.kind === "lockfile"),
    webUnit.id,
    webUnit.rootPath
  );
  const staticOutputs = analysis.evidence.filter(
    (evidence) =>
      evidence.kind === "static_output" && evidence.applicationUnitId === webUnit.id
  );
  if (
    packageManifests.length !== 1 ||
    !lockfile ||
    staticOutputs.length !== 1
  ) {
    return null;
  }
  const packageManifest = packageManifests[0];
  const staticOutput = staticOutputs[0];
  if (
    !packageManifest ||
    !lockfile ||
    !staticOutput ||
    !isPathWithinRoot(packageManifest.path, webUnit.rootPath) ||
    !isValidFrontendLockfile(lockfile, webUnit.id, webUnit.rootPath) ||
    !isPathWithinRoot(staticOutput.path, webUnit.rootPath)
  ) {
    return null;
  }
  const packageManager = resolvePackageManager(lockfile.path);
  if (!packageManager) return null;
  const presets = packageManagerPresets[packageManager];

  return {
    ...base,
    evidence: [
      ...base.evidence,
      { kind: "package_manifest", path: packageManifest.path },
      { kind: "static_output", path: staticOutput.path }
    ],
    packageManifestPath: packageManifest.path,
    ecsWeb: {
      api: {
        sourceRoot: apiSourceRoot,
        dockerfilePath: dockerfile.path,
        containerPort: input.outputs.containerPort,
        healthCheckPath: "/health"
      },
      frontend: {
        sourceRoot: webUnit.rootPath,
        packageManifestPath: packageManifest.path,
        lockfilePath: lockfile.path,
        packageManager,
        packageManagerVersion: presets.version,
        installPreset: presets.install,
        buildPreset: presets.build,
        outputPath: staticOutput.path
      }
    }
  };
}

function selectFrontendLockfile(
  lockfiles: RepositoryAnalysisAiHandoff["evidence"],
  applicationUnitId: string,
  sourceRoot: string
): RepositoryAnalysisAiHandoff["evidence"][number] | null {
  const scoped = lockfiles.filter(
    (evidence) =>
      evidence.applicationUnitId === applicationUnitId &&
      isPathWithinRoot(evidence.path, sourceRoot)
  );
  if (scoped.length > 0) return scoped.length === 1 ? scoped[0]! : null;

  const root = lockfiles.filter(
    (evidence) =>
      evidence.applicationUnitId === null &&
      isSafeRepositoryPath(evidence.path) &&
      !evidence.path.includes("/")
  );
  return root.length === 1 ? root[0]! : null;
}

function isValidFrontendLockfile(
  lockfile: RepositoryAnalysisAiHandoff["evidence"][number],
  applicationUnitId: string,
  sourceRoot: string
): boolean {
  return (
    (lockfile.applicationUnitId === applicationUnitId &&
      isPathWithinRoot(lockfile.path, sourceRoot)) ||
    (lockfile.applicationUnitId === null &&
      isSafeRepositoryPath(lockfile.path) &&
      !lockfile.path.includes("/"))
  );
}

function requireValidEcsFargateBuildConfig(config: ConfirmedBuildConfig): void {
  try {
    assertCompleteEcsWebBuildConfig(config);
    validateConfirmedBuildConfig("ecs_fargate", config);
    renderPreflightBuildspec(config);
  } catch {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires a valid ECS web build configuration"
    );
  }
}

function assertCompleteEcsWebBuildConfig(config: ConfirmedBuildConfig): void {
  const ecsWeb = config.ecsWeb;
  if (!ecsWeb) throw new Error("ECS web build configuration is required");
  const { api, frontend } = ecsWeb;
  if (
    !api.sourceRoot ||
    !api.dockerfilePath ||
    !Number.isInteger(api.containerPort) ||
    !api.healthCheckPath ||
    !frontend.sourceRoot ||
    !frontend.packageManifestPath ||
    !frontend.lockfilePath ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(
      frontend.packageManagerVersion
    ) ||
    !frontend.outputPath ||
    config.dockerfilePath !== api.dockerfilePath ||
    !config.evidence.some(
      (evidence) =>
        evidence.kind === "dockerfile" && evidence.path === api.dockerfilePath
    ) ||
    !config.evidence.some(
      (evidence) =>
        evidence.kind === "package_manifest" &&
        evidence.path === frontend.packageManifestPath
    ) ||
    !config.evidence.some(
      (evidence) =>
        evidence.kind === "static_output" && evidence.path === frontend.outputPath
    )
  ) {
    throw new Error("ECS web build configuration is incomplete");
  }
}

function hasValidEcsFargateBuildConfig(
  config: ConfirmedBuildConfig | null | undefined
): config is ConfirmedBuildConfig {
  if (!config) return false;
  try {
    requireValidEcsFargateBuildConfig(config);
    return true;
  } catch {
    return false;
  }
}

const packageManagerPresets = {
  npm: { version: "10.9.2", install: "npm_ci", build: "npm_build" },
  pnpm: {
    version: "11.8.0",
    install: "pnpm_frozen_lockfile",
    build: "pnpm_build"
  },
  yarn: {
    version: "1.22.22",
    install: "yarn_frozen_lockfile",
    build: "yarn_build"
  }
} as const;

function resolvePackageManager(path: string): PackageManagerKind | null {
  const fileName = path.split("/").at(-1)?.toLowerCase();
  if (fileName === "pnpm-lock.yaml") return "pnpm";
  if (fileName === "package-lock.json" || fileName === "npm-shrinkwrap.json") return "npm";
  if (fileName === "yarn.lock") return "yarn";
  return null;
}

function createReadinessItems(input: {
  deploymentEvidence: DeploymentEvidence;
  sourceRepository: RepositoryMonitoringRecord | undefined;
  buildEnvironment: ProjectBuildEnvironmentRecord | undefined;
  target: ProjectDeploymentTargetRecord | undefined;
  targetConnection: VerifiedConnectionRecord | undefined;
  targetReconciled: boolean;
  initialApplicationReleaseReady: boolean;
}): GitCicdReadinessItem[] {
  const monitoringReady = hasValidMonitoringConfig(input.sourceRepository);
  const targetMissingKeys: GitCicdReadinessItem["missingKeys"] = [];
  const deploymentConnection = input.deploymentEvidence.connection;
  const targetConnectionReady = !input.target
    ? true
    : Boolean(
        input.targetConnection &&
          deploymentConnection &&
          input.targetConnection.id === deploymentConnection.id &&
          input.target.connectionId === deploymentConnection.id &&
          input.target.region === input.targetConnection.region
      );
  if (!deploymentConnection || !targetConnectionReady) {
    targetMissingKeys.push("aws_connection");
  }
  if (
    !hasValidEcsFargateBuildConfig(input.target?.confirmedBuildConfig) ||
    input.buildEnvironment?.status !== "ready" ||
    input.buildEnvironment.awsConnectionId !== deploymentConnection?.id
  ) {
    targetMissingKeys.push("build_config");
  }
  if (
    !input.targetReconciled ||
    input.target?.runtimeTargetKind !== "ecs_fargate" ||
    input.target.runtimeConfig?.runtimeTargetKind !== "ecs_fargate" ||
    input.target.runtimeTarget?.adapterKind !== "ecs_service_fargate" ||
    !isSha256(input.target.deploymentTargetFingerprint)
  ) {
    targetMissingKeys.push("runtime_config");
  }
  if (
    !input.targetReconciled ||
    !hasSafeOutputUrl(input.target?.runtimeConfig?.outputUrl)
  ) {
    targetMissingKeys.push("output_url");
  }

  const items: GitCicdReadinessItem[] = [
    createReadinessItem({
      key: "approved_apply_plan",
      label: "승인된 Apply Plan",
      ready: input.deploymentEvidence.plan !== null,
      action: "approve_apply_plan"
    }),
    createReadinessItem({
      key: "initial_application_release",
      label: "최초 앱 배포",
      ready: input.initialApplicationReleaseReady,
      action: "deploy_initial_application",
      recommendedDeploymentScope: input.deploymentEvidence.plan ? "application" : "full_stack"
    }),
    createReadinessItem({
      key: "source_repository",
      label: "소스 저장소",
      ready: input.sourceRepository !== undefined,
      action: "select_repository"
    }),
    createReadinessItem({
      key: "monitoring_config",
      label: "모니터링 설정",
      ready: monitoringReady,
      action: "confirm_monitoring_config"
    }),
    {
      key: "deployment_target",
      label: "배포 타깃",
      status: targetMissingKeys.length === 0 ? "ready" : "action_required",
      completedCount: 4 - targetMissingKeys.length,
      totalCount: 4,
      missingKeys: targetMissingKeys,
      action: resolveDeploymentTargetAction(targetMissingKeys)
    }
  ];

  return items;
}

function createReadinessItem(input: {
  key: Exclude<GitCicdReadinessItem["key"], "deployment_target">;
  label: string;
  ready: boolean;
  action: Exclude<GitCicdReadinessAction, "select_aws_connection" | "confirm_build_config" | "inspect_runtime_outputs" | "inspect_output_url">;
  recommendedDeploymentScope?: "application" | "full_stack" | undefined;
}): GitCicdReadinessItem {
  return {
    key: input.key,
    label: input.label,
    status: input.ready ? "ready" : "action_required",
    missingKeys: [],
    action: input.ready ? null : input.action,
    ...(input.recommendedDeploymentScope
      ? { recommendedDeploymentScope: input.recommendedDeploymentScope }
      : {})
  };
}

function resolveDeploymentTargetAction(
  missingKeys: GitCicdReadinessItem["missingKeys"]
): GitCicdReadinessAction | null {
  if (missingKeys.includes("aws_connection")) return "select_aws_connection";
  if (missingKeys.includes("build_config")) return "confirm_build_config";
  if (missingKeys.includes("runtime_config")) return "inspect_runtime_outputs";
  if (missingKeys.includes("output_url")) return "inspect_output_url";
  return null;
}

function hasValidMonitoringConfig(
  repository: RepositoryMonitoringRecord | undefined
): repository is RepositoryMonitoringRecord {
  return Boolean(
    repository?.enabled &&
      repository.validationStatus === "valid" &&
      repository.monitorBranch?.trim()
  );
}

function hasSafeOutputUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

function isSafeRepositoryPath(path: string): boolean {
  if (path === ".") return true;
  if (!path || path.length > 512 || path.includes("\0")) return false;
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return false;
  return normalized.split("/").every((segment) => segment.length > 0 && segment !== "..");
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  if (!isSafeRepositoryPath(path) || !isSafeRepositoryPath(rootPath)) return false;
  const normalizedPath = path.replaceAll("\\", "/");
  const normalizedRoot = rootPath.replaceAll("\\", "/");
  return (
    normalizedRoot === "." ||
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function requirePostApplyDeployment(
  deployment: GitCicdReadinessDeploymentRecord | undefined,
  input: { projectId: string; deploymentId: string }
): asserts deployment is GitCicdReadinessDeploymentRecord {
  if (
    !deployment ||
    deployment.id !== input.deploymentId ||
    deployment.projectId !== input.projectId ||
    deployment.source !== "direct"
  ) {
    throw new GitCicdReadinessNotFoundError("Deployment not found");
  }
  if (deployment.status !== "RUNNING" && deployment.status !== "SUCCESS") {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires a RUNNING or SUCCESS deployment"
    );
  }
  if (deployment.scope !== "infrastructure" && deployment.scope !== "full_stack") {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires infrastructure or full_stack scope"
    );
  }
  if (deployment.targetKind !== "ecs_fargate") {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires an ecs_fargate deployment"
    );
  }
}

async function requireApprovedApplyPlan(
  deployment: GitCicdReadinessDeploymentRecord,
  connection: VerifiedConnectionRecord,
  repository: GitCicdReadinessRepository,
  planVerifier: GitCicdReadinessPlanVerifier
): Promise<GitCicdReadinessPlanArtifactRecord> {
  const plan = (await repository.listPlanArtifacts(deployment.id)).find(
    (candidate) => candidate.id === deployment.approvedPlanArtifactId
  );
  if (
    !plan ||
    plan.operation !== "apply" ||
    !(await planVerifier.verify({ deployment, plan, connection }))
  ) {
    throw new GitCicdReadinessValidationError(
      "Post-Apply synchronization requires the exact approved Apply Plan artifact"
    );
  }
  return plan;
}

function isMissingPlanArtifactError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (candidate.$metadata?.httpStatusCode === 404) return true;
  for (const code of [candidate.name, candidate.code, candidate.Code]) {
    if (code === "NoSuchKey" || code === "NotFound") {
      return true;
    }
  }
  return false;
}

function isSuccessfulDirectInfrastructureDeployment(
  deployment: GitCicdReadinessDeploymentRecord
): boolean {
  return (
    deployment.status === "SUCCESS" &&
    deployment.source === "direct" &&
    (deployment.scope === "infrastructure" || deployment.scope === "full_stack") &&
    deployment.targetKind === "ecs_fargate" &&
    deployment.completedAt !== null
  );
}

export function isEligibleInitialApplicationRelease(input: {
  release: GitCicdReadinessApplicationReleaseRecord | undefined;
  infrastructureDeployment: GitCicdReadinessDeploymentRecord | null;
  target: ProjectDeploymentTargetRecord | undefined;
}): boolean {
  const release = input.release;
  const infrastructure = input.infrastructureDeployment;
  const target = input.target;
  const buildConfig = target?.confirmedBuildConfig;
  const frontend = release?.frontendEvidence;
  const health = asRecord(release?.healthEvidence);
  const sameDeployment = release?.deploymentId === infrastructure?.id;
  const validDeploymentScope = sameDeployment
    ? release?.deploymentScope === "full_stack"
    : release?.deploymentScope === "application";

  return Boolean(
    release &&
      infrastructure &&
      target &&
      buildConfig &&
      release.projectId === target.projectId &&
      release.source === "direct" &&
      release.status === "succeeded" &&
      release.runtimeTargetKind === "ecs_fargate" &&
      release.completedAt &&
      release.deploymentId &&
      release.deploymentSource === "direct" &&
      release.deploymentStatus === "SUCCESS" &&
      release.deploymentCompletedAt &&
      validDeploymentScope &&
      isSha256(release.deploymentTargetFingerprint) &&
      release.deploymentTargetFingerprint === target.deploymentTargetFingerprint &&
      release.commitSha === buildConfig.confirmedCommitSha &&
      release.outputUrl === target.runtimeConfig?.outputUrl &&
      hasSafeOutputUrl(release.outputUrl) &&
      release.releaseCandidateId &&
      hasValidCompositeDigest(release.compositeDigest) &&
      health?.["state"] === "healthy" &&
      frontend &&
      frontend.commitMarker === release.commitSha &&
      hasNonEmptyString(frontend.manifestVersionId) &&
      hasNonEmptyString(frontend.indexVersionId) &&
      hasNonEmptyString(frontend.invalidationId)
  );
}

function hasValidCompositeDigest(value: CompositeReleaseDigest | null): boolean {
  return Boolean(
    value &&
      value.algorithm === "sha256" &&
      isSha256(value.value) &&
      isSha256(value.apiOciDigest) &&
      isSha256(value.frontendManifestDigest)
  );
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function prioritizeApprovedApplyPlan(
  plans: GitCicdReadinessPlanArtifactRecord[],
  approvedPlanArtifactId: string | null
): GitCicdReadinessPlanArtifactRecord[] {
  const applyPlans = plans
    .filter((plan) => plan.operation === "apply")
    .sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id, "en")
    );
  const approved = applyPlans.find((plan) => plan.id === approvedPlanArtifactId);
  return approved
    ? [approved, ...applyPlans.filter((plan) => plan.id !== approved.id)]
    : applyPlans;
}

function isSha256(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{64}$/i.test(value);
}
