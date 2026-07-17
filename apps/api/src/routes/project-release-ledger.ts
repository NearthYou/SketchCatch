import { z } from "zod";
import type {
  ApplicationArtifactListResponse,
  ApplicationRelease,
  ApplicationReleaseListResponse,
  ApplicationReleaseResponse,
  ProjectDeploymentTarget,
  ProjectDeploymentTargetResponse,
  PutProjectDeploymentTargetRequest
} from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createPostgresProjectReleaseLedgerRepository,
  getApplicationRelease,
  getProjectDeploymentTarget,
  listApplicationArtifacts,
  listApplicationReleases,
  putProjectDeploymentTarget,
  ReleaseLedgerConflictError,
  ReleaseLedgerNotFoundError,
  ReleaseLedgerValidationError,
  type ApplicationReleaseRecord,
  type ProjectDeploymentTargetRecord,
  type ProjectReleaseLedgerRepository
} from "../releases/project-release-ledger-service.js";
import {
  credentialFreeHttpsUrlSchema,
  runtimeDeploymentTargetSchema
} from "../runtime-convergence/runtime-convergence-schemas.js";

const projectParamsSchema = z.object({ projectId: z.uuid() }).strict();
const releaseParamsSchema = projectParamsSchema.extend({ releaseId: z.uuid() }).strict();
const repositoryPathSchema = z.string().trim().min(1).max(512);
const nullableRepositoryPathSchema = repositoryPathSchema.nullable();
const commitShaSchema = z.string().regex(/^(?:[a-f\d]{40}|[a-f\d]{64})$/i);
const evidenceSchema = z
  .object({
    kind: z.enum(["dockerfile", "package_manifest", "sam_template", "appspec", "static_output"]),
    path: repositoryPathSchema
  })
  .strict();
const confirmedBuildConfigSchema = z
  .object({
    sourceRoot: repositoryPathSchema,
    evidence: z.array(evidenceSchema).min(1).max(10),
    installPreset: z.enum(["none", "pnpm_frozen_lockfile", "npm_ci", "yarn_frozen_lockfile"]),
    buildPreset: z.enum([
      "docker_build",
      "pnpm_build",
      "npm_build",
      "yarn_build",
      "sam_build",
      "codedeploy_bundle",
      "static_export"
    ]),
    artifactOutputPath: nullableRepositoryPathSchema,
    runtimeEntrypoint: z.string().trim().min(1).max(512).nullable(),
    healthCheckPath: z.string().trim().regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/).max(512).nullable(),
    dockerfilePath: nullableRepositoryPathSchema,
    packageManifestPath: nullableRepositoryPathSchema,
    samTemplatePath: nullableRepositoryPathSchema,
    appSpecPath: nullableRepositoryPathSchema,
    staticOutputPath: nullableRepositoryPathSchema,
    exactSemVerTag: z.string().trim().min(1).max(128).nullable(),
    manifestVersion: z.string().trim().min(1).max(128).nullable(),
    confirmedCommitSha: commitShaSchema,
    confirmedAt: z.iso.datetime({ offset: true })
  })
  .strict();
const ecsFargateRuntimeConfigSchema = z
  .object({
    runtimeTargetKind: z.literal("ecs_fargate"),
    codeBuildProjectName: z.string().trim().min(2).max(255),
    ecrRepositoryName: z.string().trim().min(1).max(256),
    clusterName: z.string().trim().min(1).max(255),
    serviceName: z.string().trim().min(1).max(255),
    containerName: z.string().trim().min(1).max(255),
    outputUrl: credentialFreeHttpsUrlSchema.nullable()
  })
  .strict();
const lambdaRuntimeConfigSchema = z
  .object({
    runtimeTargetKind: z.literal("lambda"),
    codeBuildProjectName: z.string().trim().min(2).max(255),
    functionLogicalId: z.string().trim().min(1).max(255),
    functionName: z.string().trim().min(1).max(64),
    aliasName: z.string().trim().min(1).max(128),
    codeDeployApplicationName: z.string().trim().min(1).max(100),
    codeDeployDeploymentGroupName: z.string().trim().min(1).max(100),
    outputUrl: credentialFreeHttpsUrlSchema
  })
  .strict();
const ec2AsgRuntimeConfigSchema = z
  .object({
    runtimeTargetKind: z.literal("ec2_asg"),
    codeBuildProjectName: z.string().trim().min(2).max(255),
    codeDeployApplicationName: z.string().trim().min(1).max(100),
    codeDeployDeploymentGroupName: z.string().trim().min(1).max(100),
    autoScalingGroupName: z.string().trim().min(1).max(255),
    outputUrl: credentialFreeHttpsUrlSchema
  })
  .strict();
const staticSiteRuntimeConfigSchema = z
  .object({
    runtimeTargetKind: z.literal("static_site"),
    codeBuildProjectName: z.string().trim().min(2).max(255),
    hostingBucketName: z.string().trim().min(3).max(63),
    cloudFrontDistributionId: z.string().trim().min(3).max(32),
    cloudFrontOriginId: z.string().trim().min(1).max(128),
    outputUrl: credentialFreeHttpsUrlSchema
  })
  .strict();
const deploymentRuntimeConfigSchema = z.discriminatedUnion("runtimeTargetKind", [
  ecsFargateRuntimeConfigSchema,
  lambdaRuntimeConfigSchema,
  ec2AsgRuntimeConfigSchema,
  staticSiteRuntimeConfigSchema
]);
const putTargetBodySchema = z
  .object({
    provider: z.literal("aws"),
    connectionId: z.uuid(),
    region: z.string().trim().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/).max(32),
    runtimeTargetKind: z.enum(["ecs_fargate", "lambda", "ec2_asg", "static_site"]),
    confirmedBuildConfig: confirmedBuildConfigSchema,
    runtimeConfig: deploymentRuntimeConfigSchema.nullable(),
    runtimeTarget: runtimeDeploymentTargetSchema.nullable().optional(),
    rolloutStrategy: z.literal("all_at_once")
  })
  .strict();

export type ProjectReleaseLedgerRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createRepository?: (db: DatabaseClient["db"]) => ProjectReleaseLedgerRepository;
};

export async function registerProjectReleaseLedgerRoutes(
  app: FastifyInstance,
  options?: ProjectReleaseLedgerRouteOptions
): Promise<void> {
  const getClient = options?.getDatabaseClient ?? getDatabaseClient;

  app.get("/projects/:projectId/deployment-target", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const context = await createRequestContext(request, options, getClient);
    try {
      const target = await getProjectDeploymentTarget(
        { projectId: params.projectId, userId: context.userId },
        context.repository
      );
      const response: ProjectDeploymentTargetResponse = {
        target: target ? toProjectDeploymentTarget(target) : null
      };
      return reply.status(200).send(response);
    } catch (error) {
      return handleReleaseLedgerError(error, reply);
    }
  });

  app.put("/projects/:projectId/deployment-target", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const target = putTargetBodySchema.parse(request.body) as PutProjectDeploymentTargetRequest;
    const context = await createRequestContext(request, options, getClient);
    try {
      const saved = await putProjectDeploymentTarget(
        { projectId: params.projectId, userId: context.userId, target },
        context.repository
      );
      const response: ProjectDeploymentTargetResponse = {
        target: toProjectDeploymentTarget(saved)
      };
      return reply.status(200).send(response);
    } catch (error) {
      return handleReleaseLedgerError(error, reply);
    }
  });

  app.get("/projects/:projectId/releases", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const context = await createRequestContext(request, options, getClient);
    try {
      const releases = await listApplicationReleases(
        { projectId: params.projectId, userId: context.userId },
        context.repository
      );
      const response: ApplicationReleaseListResponse = {
        releases: releases.map(toApplicationRelease)
      };
      return reply.status(200).send(response);
    } catch (error) {
      return handleReleaseLedgerError(error, reply);
    }
  });

  app.get("/projects/:projectId/artifacts", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const context = await createRequestContext(request, options, getClient);
    try {
      const artifacts = await listApplicationArtifacts(
        { projectId: params.projectId, userId: context.userId },
        context.repository
      );
      const response: ApplicationArtifactListResponse = { artifacts };
      return reply.status(200).send(response);
    } catch (error) {
      return handleReleaseLedgerError(error, reply);
    }
  });

  app.get("/projects/:projectId/releases/:releaseId", async (request, reply) => {
    const params = releaseParamsSchema.parse(request.params);
    const context = await createRequestContext(request, options, getClient);
    try {
      const release = await getApplicationRelease(
        { projectId: params.projectId, releaseId: params.releaseId, userId: context.userId },
        context.repository
      );
      const response: ApplicationReleaseResponse = { release: toApplicationRelease(release) };
      return reply.status(200).send(response);
    } catch (error) {
      return handleReleaseLedgerError(error, reply);
    }
  });
}

async function createRequestContext(
  request: FastifyRequest,
  options: ProjectReleaseLedgerRouteOptions | undefined,
  getClient: () => DatabaseClient
) {
  const client = getClient();
  return {
    userId: await requireActiveUserId(request, () => client),
    repository:
      options?.createRepository?.(client.db) ??
      createPostgresProjectReleaseLedgerRepository(client.db)
  };
}

function toProjectDeploymentTarget(row: ProjectDeploymentTargetRecord): ProjectDeploymentTarget {
  return {
    projectId: row.projectId,
    provider: row.provider,
    connectionId: row.connectionId,
    region: row.region,
    runtimeTargetKind: row.runtimeTargetKind,
    confirmedBuildConfig: row.confirmedBuildConfig,
    runtimeConfig: row.runtimeConfig,
    runtimeTarget: row.runtimeTarget,
    deploymentTargetFingerprint: row.deploymentTargetFingerprint,
    rolloutStrategy: row.rolloutStrategy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toApplicationRelease(row: ApplicationReleaseRecord): ApplicationRelease {
  return {
    id: row.id,
    projectId: row.projectId,
    artifactId: row.artifactId,
    deploymentId: row.deploymentId,
    pipelineRunId: row.pipelineRunId,
    source: row.source,
    runtimeTargetKind: row.runtimeTargetKind,
    runtimeAdapterKind: row.runtimeAdapterKind,
    deploymentTargetFingerprint: row.deploymentTargetFingerprint,
    convergenceOutcome: row.convergenceOutcome,
    version: row.version,
    commitSha: row.commitSha,
    artifactDigestAlgorithm: row.artifactDigestAlgorithm,
    artifactDigest: row.artifactDigest,
    providerRevision: row.providerRevision,
    outputUrl: row.outputUrl,
    status: row.status,
    healthEvidence: row.healthEvidence,
    rollbackEvidence: row.rollbackEvidence,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function handleReleaseLedgerError(error: unknown, reply: FastifyReply) {
  if (error instanceof ReleaseLedgerNotFoundError) {
    return reply.status(404).send({ error: "not_found", message: error.message });
  }
  if (error instanceof ReleaseLedgerValidationError) {
    return reply.status(400).send({ error: "bad_request", message: error.message });
  }
  if (error instanceof ReleaseLedgerConflictError) {
    return reply.status(409).send({ error: "conflict", message: error.message });
  }
  throw error;
}
