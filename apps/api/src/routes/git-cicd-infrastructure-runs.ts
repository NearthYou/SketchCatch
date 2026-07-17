import { z } from "zod";
import type {
  CompleteGitCicdInfrastructureRunRequest,
  CreateGitCicdInfrastructureRunRequest,
  GitCicdInfrastructureRunResponse
} from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import { getDatabaseClient } from "../db/client.js";
import {
  completeGitHubInfrastructureRun,
  createGitHubInfrastructureRun,
  createPostgresGitHubInfrastructureRunRepository,
  GitHubInfrastructureRunError,
  heartbeatGitHubInfrastructureRun,
  type GitHubInfrastructureRunRepository
} from "../git-cicd/github-infrastructure-run-service.js";
import {
  createGitHubReleaseIdentityVerifier,
  githubInfrastructureOidcAudience,
  GitHubReleaseIdentityError,
  type VerifyGitHubReleaseIdentity
} from "../git-cicd/github-oidc-release-identity.js";
import {
  createPostgresProjectExecutionLeaseRepository,
  ProjectExecutionLeaseError,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import type { GitHubActionsReadClient } from "../source-repositories/github-app-client.js";

const projectParamsSchema = z.object({ projectId: z.uuid() }).strict();
const runParamsSchema = z.object({ runId: z.uuid() }).strict();
const createInfrastructureRunBodySchema = z
  .object({
    repository: z.string().trim().min(3).max(241),
    repositoryId: z.string().regex(/^\d+$/u).max(32),
    commitSha: z.string().regex(/^([0-9a-f]{40}|[0-9a-f]{64})$/u),
    ref: z.string().trim().min(12).max(512),
    workflow: z.string().trim().min(1).max(2048),
    workflowRunId: z.string().regex(/^\d+$/u).max(32),
    workflowRunAttempt: z.number().int().positive(),
    workflowRunUrl: z.url().max(2048)
  })
  .strict();
const heartbeatBodySchema = z.object({}).strict();
const completeInfrastructureRunBodySchema = z
  .object({
    conclusion: z.enum(["succeeded", "failed", "cancelled"]),
    stage: z.enum(["configuration", "infra_plan", "infra_apply"])
  })
  .strict();

export type GitHubInfrastructureRunRouteOptions = {
  prefix?: string;
  getDatabaseClient?: () => DatabaseClient;
  repository?: GitHubInfrastructureRunRepository;
  executionLeaseRepository?: ProjectExecutionLeaseRepository;
  githubActionsClient?: Pick<GitHubActionsReadClient, "getWorkflowRun">;
  verifyIdentity?: VerifyGitHubReleaseIdentity;
  now?: () => Date;
  generateId?: () => string;
};

export async function registerGitHubInfrastructureRunRoutes(
  app: FastifyInstance,
  options: GitHubInfrastructureRunRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;
  const database =
    options.repository && options.executionLeaseRepository ? undefined : getClient().db;
  const repository =
    options.repository ?? createPostgresGitHubInfrastructureRunRepository(database!);
  const executionLeaseRepository =
    options.executionLeaseRepository ??
    createPostgresProjectExecutionLeaseRepository(database!);
  const verifyIdentity =
    options.verifyIdentity ??
    createGitHubReleaseIdentityVerifier({ audience: githubInfrastructureOidcAudience });

  app.post("/git-cicd/projects/:projectId/infrastructure-runs", async (request, reply) => {
    try {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = createInfrastructureRunBodySchema.parse(
        request.body
      ) as CreateGitCicdInfrastructureRunRequest;
      const identity = await verifyIdentity(requireBearerToken(request));
      const result = await createGitHubInfrastructureRun(
        { projectId, request: body, identity },
        repository,
        executionLeaseRepository,
        {
          ...(options.generateId ? { generateId: options.generateId } : {}),
          ...(options.now ? { now: options.now } : {}),
          ...(options.githubActionsClient
            ? { githubActionsClient: options.githubActionsClient }
            : {})
        }
      );
      const response: GitCicdInfrastructureRunResponse = { run: result.run };
      return reply.status(result.created ? 202 : 200).send(response);
    } catch (error) {
      return sendInfrastructureRunError(reply, error);
    }
  });

  app.post("/git-cicd/infrastructure-runs/:runId/heartbeat", async (request, reply) => {
    try {
      const { runId } = runParamsSchema.parse(request.params);
      heartbeatBodySchema.parse(request.body ?? {});
      const identity = await verifyIdentity(requireBearerToken(request));
      const response = await heartbeatGitHubInfrastructureRun(
        { runId, identity },
        repository,
        executionLeaseRepository,
        options.now ? { now: options.now } : {}
      );
      return reply.send(response);
    } catch (error) {
      return sendInfrastructureRunError(reply, error);
    }
  });

  app.post("/git-cicd/infrastructure-runs/:runId/complete", async (request, reply) => {
    try {
      const { runId } = runParamsSchema.parse(request.params);
      const body = completeInfrastructureRunBodySchema.parse(
        request.body
      ) as CompleteGitCicdInfrastructureRunRequest;
      const identity = await verifyIdentity(requireBearerToken(request));
      const response = await completeGitHubInfrastructureRun(
        { runId, identity, request: body },
        repository,
        executionLeaseRepository,
        options.now ? { now: options.now } : {}
      );
      return reply.send(response);
    } catch (error) {
      return sendInfrastructureRunError(reply, error);
    }
  });
}

function requireBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? /^Bearer\s+(.+)$/iu.exec(header) : null;
  if (!match?.[1]) throw new GitHubReleaseIdentityError();
  return match[1];
}

function sendInfrastructureRunError(reply: FastifyReply, error: unknown) {
  if (error instanceof ProjectExecutionLeaseError) {
    return reply.status(409).send({
      error: error.code,
      message:
        error.code === "PROJECT_RELEASE_IN_PROGRESS"
          ? "현재 이 프로젝트에서 다른 배포가 진행 중입니다. 완료 후 다시 실행해 주세요."
          : error.message,
      activeSource: error.activeSource
    });
  }
  if (
    error instanceof GitHubInfrastructureRunError ||
    error instanceof GitHubReleaseIdentityError
  ) {
    return reply.status(error.statusCode).send({
      error: error.errorCode,
      message: error.message
    });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "GITHUB_INFRASTRUCTURE_RUN_INVALID",
      message: "GitHub 인프라 실행 요청 형식이 올바르지 않습니다."
    });
  }
  throw error;
}
