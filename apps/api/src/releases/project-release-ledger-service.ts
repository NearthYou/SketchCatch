import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type {
  ApplicationReleaseProviderRevision,
  ApplicationReleaseStatus,
  ConfirmedBuildConfig,
  DeploymentSource,
  JsonValue,
  ProjectDeploymentRuntimeConfig,
  PutProjectDeploymentTargetRequest,
  RuntimeTargetKind
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  awsConnections,
  deployments,
  gitCicdPipelineRuns,
  projectDeploymentTargets,
  projects
} from "../db/schema.js";
import {
  resolveApplicationReleaseVersion,
  type ApplicationReleaseVersionEvidence
} from "./application-release-identity.js";

export type ProjectDeploymentTargetRecord = typeof projectDeploymentTargets.$inferSelect;
export type ApplicationReleaseRecord = typeof applicationReleases.$inferSelect;

export type SaveProjectDeploymentTargetInput = {
  projectId: string;
  provider: "aws";
  connectionId: string;
  region: string;
  runtimeTargetKind: RuntimeTargetKind;
  confirmedBuildConfig: ConfirmedBuildConfig;
  runtimeConfig: ProjectDeploymentRuntimeConfig | null;
  rolloutStrategy: "all_at_once";
  updatedAt: Date;
};

export type CreateApplicationReleaseRecordInput = Omit<
  ApplicationReleaseRecord,
  "artifactDigestAlgorithm"
>;

export type ProjectReleaseLedgerRepository = {
  findAccessibleProject(projectId: string, userId: string): Promise<{ id: string } | undefined>;
  findVerifiedConnection(
    connectionId: string,
    userId: string
  ): Promise<{ id: string; region: string } | undefined>;
  findProjectDeploymentTarget(
    projectId: string
  ): Promise<ProjectDeploymentTargetRecord | undefined>;
  saveProjectDeploymentTarget(
    input: SaveProjectDeploymentTargetInput
  ): Promise<ProjectDeploymentTargetRecord>;
  findDeploymentInProject(
    deploymentId: string,
    projectId: string
  ): Promise<{ id: string } | undefined>;
  findPipelineRunInProject(
    pipelineRunId: string,
    projectId: string
  ): Promise<{ id: string } | undefined>;
  createApplicationRelease(
    input: CreateApplicationReleaseRecordInput
  ): Promise<ApplicationReleaseRecord>;
  listProjectApplicationReleases(projectId: string): Promise<ApplicationReleaseRecord[]>;
  findProjectApplicationRelease(
    projectId: string,
    releaseId: string
  ): Promise<ApplicationReleaseRecord | undefined>;
};

export class ReleaseLedgerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseLedgerNotFoundError";
  }
}

export class ReleaseLedgerValidationError extends Error {
  readonly statusCode = 400;
  readonly errorCode = "bad_request" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReleaseLedgerValidationError";
  }
}

export class ReleaseLedgerConflictError extends Error {
  readonly statusCode = 409;
  readonly errorCode = "conflict" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReleaseLedgerConflictError";
  }
}

export function createPostgresProjectReleaseLedgerRepository(
  db: Database
): ProjectReleaseLedgerRepository {
  return {
    async findAccessibleProject(projectId, userId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      return project;
    },
    async findVerifiedConnection(connectionId, userId) {
      const [connection] = await db
        .select({ id: awsConnections.id, region: awsConnections.region })
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, connectionId),
            eq(awsConnections.userId, userId),
            eq(awsConnections.status, "verified")
          )
        );
      return connection;
    },
    async findProjectDeploymentTarget(projectId) {
      const [target] = await db
        .select()
        .from(projectDeploymentTargets)
        .where(eq(projectDeploymentTargets.projectId, projectId));
      return target;
    },
    async saveProjectDeploymentTarget(input) {
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
            rolloutStrategy: input.rolloutStrategy,
            updatedAt: input.updatedAt
          }
        })
        .returning();
      return requireWrittenRecord(target, "Deployment target was not saved");
    },
    async findDeploymentInProject(deploymentId, projectId) {
      const [deployment] = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, projectId)));
      return deployment;
    },
    async findPipelineRunInProject(pipelineRunId, projectId) {
      const [pipelineRun] = await db
        .select({ id: gitCicdPipelineRuns.id })
        .from(gitCicdPipelineRuns)
        .where(
          and(
            eq(gitCicdPipelineRuns.id, pipelineRunId),
            eq(gitCicdPipelineRuns.projectId, projectId)
          )
        );
      return pipelineRun;
    },
    async createApplicationRelease(input) {
      return db.transaction(async (transaction) => {
        const [release] = await transaction
          .insert(applicationReleases)
          .values(input)
          .returning();
        const written = requireWrittenRecord(release, "Application release was not saved");

        if (input.deploymentId) {
          await transaction
            .update(deployments)
            .set({ releaseId: written.id, updatedAt: input.updatedAt })
            .where(
              and(
                eq(deployments.id, input.deploymentId),
                eq(deployments.projectId, input.projectId)
              )
            );
        }
        return written;
      });
    },
    async listProjectApplicationReleases(projectId) {
      return db
        .select()
        .from(applicationReleases)
        .where(eq(applicationReleases.projectId, projectId))
        .orderBy(desc(applicationReleases.createdAt), desc(applicationReleases.id))
        .limit(100);
    },
    async findProjectApplicationRelease(projectId, releaseId) {
      const [release] = await db
        .select()
        .from(applicationReleases)
        .where(
          and(
            eq(applicationReleases.projectId, projectId),
            eq(applicationReleases.id, releaseId)
          )
        );
      return release;
    }
  };
}

export async function getProjectDeploymentTarget(
  input: { projectId: string; userId: string },
  repository: ProjectReleaseLedgerRepository
): Promise<ProjectDeploymentTargetRecord | undefined> {
  await requireAccessibleProject(input, repository);
  return repository.findProjectDeploymentTarget(input.projectId);
}

export async function putProjectDeploymentTarget(
  input: {
    projectId: string;
    userId: string;
    target: PutProjectDeploymentTargetRequest;
  },
  repository: ProjectReleaseLedgerRepository,
  now: () => Date = () => new Date()
): Promise<ProjectDeploymentTargetRecord> {
  await requireAccessibleProject(input, repository);
  const connection = await repository.findVerifiedConnection(
    input.target.connectionId,
    input.userId
  );
  if (!connection) {
    throw new ReleaseLedgerNotFoundError("Verified cloud connection not found");
  }
  if (connection.region !== input.target.region) {
    throw new ReleaseLedgerValidationError(
      "Deployment target region must match the verified connection region."
    );
  }
  if (input.target.provider !== "aws" || input.target.rolloutStrategy !== "all_at_once") {
    throw new ReleaseLedgerValidationError("Unsupported deployment target configuration.");
  }
  if (!input.target.confirmedBuildConfig) {
    throw new ReleaseLedgerValidationError("Confirmed build configuration is required.");
  }
  validateConfirmedBuildConfig(
    input.target.runtimeTargetKind,
    input.target.confirmedBuildConfig
  );
  validateProjectDeploymentRuntimeConfig(
    input.target.runtimeTargetKind,
    input.target.runtimeConfig
  );

  return repository.saveProjectDeploymentTarget({
    projectId: input.projectId,
    provider: input.target.provider,
    connectionId: connection.id,
    region: connection.region,
    runtimeTargetKind: input.target.runtimeTargetKind,
    confirmedBuildConfig: input.target.confirmedBuildConfig,
    runtimeConfig: input.target.runtimeConfig,
    rolloutStrategy: input.target.rolloutStrategy,
    updatedAt: now()
  });
}

export async function listApplicationReleases(
  input: { projectId: string; userId: string },
  repository: ProjectReleaseLedgerRepository
): Promise<ApplicationReleaseRecord[]> {
  await requireAccessibleProject(input, repository);
  return repository.listProjectApplicationReleases(input.projectId);
}

export async function getApplicationRelease(
  input: { projectId: string; releaseId: string; userId: string },
  repository: ProjectReleaseLedgerRepository
): Promise<ApplicationReleaseRecord> {
  await requireAccessibleProject(input, repository);
  const release = await repository.findProjectApplicationRelease(
    input.projectId,
    input.releaseId
  );
  if (!release) throw new ReleaseLedgerNotFoundError("Application release not found");
  return release;
}

export type RecordApplicationReleaseInput = {
  projectId: string;
  userId: string;
  deploymentId: string | null;
  pipelineRunId: string | null;
  source: DeploymentSource;
  runtimeTargetKind: RuntimeTargetKind;
  versionEvidence: ApplicationReleaseVersionEvidence;
  artifactDigest: string;
  providerRevision: ApplicationReleaseProviderRevision | null;
  outputUrl: string | null;
  status: ApplicationReleaseStatus;
  healthEvidence: JsonValue | null;
  rollbackEvidence: JsonValue | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export async function recordApplicationRelease(
  input: RecordApplicationReleaseInput,
  repository: ProjectReleaseLedgerRepository,
  generateId: () => string = randomUUID,
  now: () => Date = () => new Date()
): Promise<ApplicationReleaseRecord> {
  await requireAccessibleProject(input, repository);
  const target = await repository.findProjectDeploymentTarget(input.projectId);
  if (!target) {
    throw new ReleaseLedgerConflictError("A confirmed project deployment target is required.");
  }
  if (target.runtimeTargetKind !== input.runtimeTargetKind) {
    throw new ReleaseLedgerConflictError("Release runtime does not match the project target.");
  }
  await validateReleaseReference(input, repository);
  if (!/^[0-9a-f]{64}$/.test(input.artifactDigest)) {
    throw new ReleaseLedgerValidationError("A lowercase SHA-256 artifact digest is required.");
  }
  validateReleaseEvidence(input, target.provider);

  let version: string;
  try {
    version = resolveApplicationReleaseVersion(input.versionEvidence);
  } catch (error) {
    throw new ReleaseLedgerValidationError(
      error instanceof Error ? error.message : "Invalid release version evidence."
    );
  }
  const timestamp = now();

  return repository.createApplicationRelease({
    id: generateId(),
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    pipelineRunId: input.pipelineRunId,
    source: input.source,
    runtimeTargetKind: input.runtimeTargetKind,
    version,
    commitSha: input.versionEvidence.commitSha.toLowerCase(),
    artifactDigest: input.artifactDigest,
    providerRevision: input.providerRevision,
    outputUrl: input.outputUrl,
    status: input.status,
    healthEvidence: input.healthEvidence,
    rollbackEvidence: input.rollbackEvidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function validateConfirmedBuildConfig(
  runtimeTargetKind: RuntimeTargetKind,
  config: ConfirmedBuildConfig
): void {
  const paths = [
    config.sourceRoot,
    ...config.evidence.map((item) => item.path),
    config.artifactOutputPath,
    config.dockerfilePath,
    config.packageManifestPath,
    config.samTemplatePath,
    config.appSpecPath,
    config.staticOutputPath
  ].filter((path): path is string => path !== null);
  if (paths.some((path) => !isSafeRepositoryPath(path))) {
    throw new ReleaseLedgerValidationError("Build evidence must use safe repository-relative paths.");
  }
  if (config.evidence.length === 0) {
    throw new ReleaseLedgerValidationError("At least one build evidence file is required.");
  }
  try {
    resolveApplicationReleaseVersion({
      exactSemVerTag: config.exactSemVerTag,
      manifestVersion: config.manifestVersion,
      commitSha: config.confirmedCommitSha
    });
  } catch (error) {
    throw new ReleaseLedgerValidationError(
      error instanceof Error ? error.message : "Invalid confirmed build evidence."
    );
  }
  if (!Number.isFinite(Date.parse(config.confirmedAt))) {
    throw new ReleaseLedgerValidationError("Build confirmation timestamp is invalid.");
  }

  const evidenceKinds = new Set(config.evidence.map((item) => item.kind));
  const staticOutputs = config.evidence.filter((item) => item.kind === "static_output");
  const validForRuntime =
    (runtimeTargetKind === "ecs_fargate" &&
      config.buildPreset === "docker_build" &&
      evidenceKinds.has("dockerfile") &&
      Boolean(config.dockerfilePath)) ||
    (runtimeTargetKind === "lambda" &&
      config.buildPreset === "sam_build" &&
      evidenceKinds.has("sam_template") &&
      Boolean(config.samTemplatePath)) ||
    (runtimeTargetKind === "ec2_asg" &&
      config.buildPreset === "codedeploy_bundle" &&
      evidenceKinds.has("appspec") &&
      Boolean(config.appSpecPath)) ||
    (runtimeTargetKind === "static_site" &&
      config.buildPreset === "static_export" &&
      config.installPreset !== "none" &&
      Boolean(config.staticOutputPath) &&
      config.artifactOutputPath === config.staticOutputPath &&
      staticOutputs.length === 1 &&
      staticOutputs[0]?.path === config.staticOutputPath);
  if (!validForRuntime) {
    throw new ReleaseLedgerValidationError(
      "Build evidence and preset do not match the selected runtime."
    );
  }
}

export function validateProjectDeploymentRuntimeConfig(
  runtimeTargetKind: RuntimeTargetKind,
  config: ProjectDeploymentRuntimeConfig | null
): void {
  const codeBuildNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{1,254}$/;
  if (runtimeTargetKind === "static_site") {
    if (!config || config.runtimeTargetKind !== "static_site") {
      throw new ReleaseLedgerValidationError(
        "Static site runtime configuration is required."
      );
    }
    const bucketPattern = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
    const distributionPattern = /^[A-Z0-9]{3,32}$/;
    const originPattern = /^[A-Za-z0-9._-]{1,128}$/;
    if (
      !codeBuildNamePattern.test(config.codeBuildProjectName ?? "") ||
      !bucketPattern.test(config.hostingBucketName) ||
      !distributionPattern.test(config.cloudFrontDistributionId) ||
      !originPattern.test(config.cloudFrontOriginId)
    ) {
      throw new ReleaseLedgerValidationError(
        "Static site runtime configuration contains an invalid resource name."
      );
    }
    validateRuntimeOutputUrl(config.outputUrl);
    return;
  }
  if (runtimeTargetKind === "ec2_asg") {
    if (!config || config.runtimeTargetKind !== "ec2_asg") {
      throw new ReleaseLedgerValidationError(
        "EC2 Auto Scaling runtime configuration is required."
      );
    }
    const codeDeployNamePattern = /^[A-Za-z0-9._+=,@-]{1,100}$/;
    const autoScalingGroupNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,254}$/;
    if (
      !codeBuildNamePattern.test(config.codeBuildProjectName ?? "") ||
      !codeDeployNamePattern.test(config.codeDeployApplicationName) ||
      !codeDeployNamePattern.test(config.codeDeployDeploymentGroupName) ||
      !autoScalingGroupNamePattern.test(config.autoScalingGroupName)
    ) {
      throw new ReleaseLedgerValidationError(
        "EC2 Auto Scaling runtime configuration contains an invalid resource name."
      );
    }
    validateRuntimeOutputUrl(config.outputUrl);
    return;
  }
  if (runtimeTargetKind === "lambda") {
    if (!config || config.runtimeTargetKind !== "lambda") {
      throw new ReleaseLedgerValidationError(
        "Lambda runtime configuration is required."
      );
    }
    const logicalIdPattern = /^[A-Za-z][A-Za-z0-9]{0,254}$/;
    const functionNamePattern = /^[A-Za-z0-9_-]{1,64}$/;
    const aliasPattern = /^(?!\$LATEST$)(?!\d+$)[A-Za-z0-9_-]{1,128}$/;
    const codeDeployNamePattern = /^[A-Za-z0-9._+=,@-]{1,100}$/;
    if (
      !codeBuildNamePattern.test(config.codeBuildProjectName ?? "") ||
      !logicalIdPattern.test(config.functionLogicalId) ||
      !functionNamePattern.test(config.functionName) ||
      !aliasPattern.test(config.aliasName) ||
      !codeDeployNamePattern.test(config.codeDeployApplicationName) ||
      !codeDeployNamePattern.test(config.codeDeployDeploymentGroupName)
    ) {
      throw new ReleaseLedgerValidationError(
        "Lambda runtime configuration contains an invalid resource name."
      );
    }
    validateRuntimeOutputUrl(config.outputUrl);
    return;
  }
  if (runtimeTargetKind !== "ecs_fargate") {
    if (config !== null) {
      throw new ReleaseLedgerValidationError(
        "Runtime configuration is not supported for the selected target."
      );
    }
    return;
  }
  if (!config || config.runtimeTargetKind !== "ecs_fargate") {
    throw new ReleaseLedgerValidationError(
      "ECS Fargate runtime configuration is required."
    );
  }

  const ecsNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,254}$/;
  const ecrRepositoryPattern = /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*)(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
  if (
    !codeBuildNamePattern.test(config.codeBuildProjectName) ||
    config.ecrRepositoryName.length > 256 ||
    !ecrRepositoryPattern.test(config.ecrRepositoryName) ||
    !ecsNamePattern.test(config.clusterName) ||
    !ecsNamePattern.test(config.serviceName) ||
    !ecsNamePattern.test(config.containerName)
  ) {
    throw new ReleaseLedgerValidationError(
      "ECS Fargate runtime configuration contains an invalid resource name."
    );
  }

  if (config.outputUrl !== null) {
    validateRuntimeOutputUrl(config.outputUrl);
  }
}

function validateRuntimeOutputUrl(value: string): void {
  let outputUrl: URL;
  try {
    outputUrl = new URL(value);
  } catch {
    throw new ReleaseLedgerValidationError("Output URL must be an absolute HTTPS URL.");
  }
  if (
    outputUrl.protocol !== "https:" ||
    outputUrl.username ||
    outputUrl.password ||
    outputUrl.search ||
    outputUrl.hash ||
    value.length > 2_048
  ) {
    throw new ReleaseLedgerValidationError(
      "Output URL must be HTTPS and must not contain credentials, query parameters, or fragments."
    );
  }
}

async function requireAccessibleProject(
  input: { projectId: string; userId: string },
  repository: ProjectReleaseLedgerRepository
): Promise<void> {
  const project = await repository.findAccessibleProject(input.projectId, input.userId);
  if (!project) throw new ReleaseLedgerNotFoundError("Project not found");
}

async function validateReleaseReference(
  input: RecordApplicationReleaseInput,
  repository: ProjectReleaseLedgerRepository
): Promise<void> {
  if (input.source === "direct") {
    if (!input.deploymentId || input.pipelineRunId) {
      throw new ReleaseLedgerValidationError(
        "Direct releases require one deployment reference and no Pipeline Run reference."
      );
    }
    if (!(await repository.findDeploymentInProject(input.deploymentId, input.projectId))) {
      throw new ReleaseLedgerNotFoundError("Deployment not found for project");
    }
    return;
  }
  if (!input.pipelineRunId || input.deploymentId) {
    throw new ReleaseLedgerValidationError(
      "GitOps releases require one Pipeline Run reference and no deployment reference."
    );
  }
  if (!(await repository.findPipelineRunInProject(input.pipelineRunId, input.projectId))) {
    throw new ReleaseLedgerNotFoundError("Pipeline Run not found for project");
  }
}

function isSafeRepositoryPath(path: string): boolean {
  if (path === ".") return true;
  if (path.length === 0 || path.length > 512 || path.includes("\0")) return false;
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return false;
  return normalized.split("/").every((segment) => segment.length > 0 && segment !== "..");
}

function validateReleaseEvidence(
  input: RecordApplicationReleaseInput,
  targetProvider: "aws"
): void {
  if (input.outputUrl) {
    let outputUrl: URL;
    try {
      outputUrl = new URL(input.outputUrl);
    } catch {
      throw new ReleaseLedgerValidationError("Output URL must be an absolute HTTP(S) URL.");
    }
    if (
      (outputUrl.protocol !== "https:" && outputUrl.protocol !== "http:") ||
      outputUrl.username ||
      outputUrl.password ||
      outputUrl.search ||
      outputUrl.hash ||
      input.outputUrl.length > 2_048
    ) {
      throw new ReleaseLedgerValidationError(
        "Output URL must not contain credentials, query parameters, or fragments."
      );
    }
  }

  if (input.providerRevision) {
    const revision = input.providerRevision;
    if (
      revision.provider !== targetProvider ||
      !isBoundedIdentifier(revision.resourceType, 128) ||
      !isBoundedIdentifier(revision.revisionId, 1_024) ||
      (revision.artifactReference !== null &&
        !isBoundedIdentifier(revision.artifactReference, 2_048)) ||
      !revision.metadata ||
      typeof revision.metadata !== "object" ||
      Array.isArray(revision.metadata) ||
      Object.keys(revision.metadata).length > 50
    ) {
      throw new ReleaseLedgerValidationError("Provider revision evidence is invalid.");
    }
    assertNoSecretLikeKeys(revision.metadata, "Provider revision metadata");
  }
  assertNoSecretLikeKeys(input.healthEvidence, "Health evidence");
  assertNoSecretLikeKeys(input.rollbackEvidence, "Rollback evidence");
}

function assertNoSecretLikeKeys(value: JsonValue | null, label: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretLikeKeys(item, label);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "");
    if (/(?:secret|token|password|credential|privatekey|accesskey)/i.test(normalizedKey)) {
      throw new ReleaseLedgerValidationError(`${label} must not contain secret-like fields.`);
    }
    assertNoSecretLikeKeys(item, label);
  }
}

function isBoundedIdentifier(value: string, maxLength: number): boolean {
  return value.trim() === value && value.length > 0 && value.length <= maxLength;
}

function requireWrittenRecord<T>(record: T | undefined, message: string): T {
  if (!record) throw new Error(message);
  return record;
}
