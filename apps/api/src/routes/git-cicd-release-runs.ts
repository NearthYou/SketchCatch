import { z } from "zod";
import type {
  CreateGitCicdReleaseRunRequest,
  GitCicdReleaseRunResponse
} from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  getDeploymentWorkerMode,
  type DeploymentWorkerMode
} from "../config/env.js";
import type { DatabaseClient } from "../db/client.js";
import { getDatabaseClient } from "../db/client.js";
import { createPostgresGitHubReleaseExecutionRepository, createGitHubReleaseRunExecutor } from "../git-cicd/github-release-run-executor.js";
import {
  acquireProjectExecutionLease,
  createPostgresProjectExecutionLeaseRepository,
  ProjectExecutionLeaseError,
  releaseProjectExecutionLease,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import {
  cancelGitHubReleaseRun,
  createGitHubReleaseRun,
  createPostgresGitHubReleaseRunRepository,
  getGitHubReleaseRun,
  GitHubReleaseRunError,
  retryGitHubReleaseFrontend,
  type GitHubReleaseRunExecutor,
  type GitHubReleaseRunRepository
} from "../git-cicd/github-release-run-service.js";
import {
  createGitHubReleaseIdentityVerifier,
  GitHubReleaseIdentityError,
  type VerifyGitHubReleaseIdentity
} from "../git-cicd/github-oidc-release-identity.js";

const projectParamsSchema = z.object({ projectId: z.uuid() }).strict();
const runParamsSchema = z.object({ runId: z.uuid() }).strict();
const createReleaseRunBodySchema = z
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

export type GitHubReleaseRunRouteOptions = {
  prefix?: string;
  getDatabaseClient?: () => DatabaseClient;
  repository?: GitHubReleaseRunRepository;
  executor?: GitHubReleaseRunExecutor;
  executionLeaseRepository?: ProjectExecutionLeaseRepository;
  verifyIdentity?: VerifyGitHubReleaseIdentity;
  requireOwnerUserId?: ((request: FastifyRequest) => Promise<string>) | undefined;
  now?: () => Date;
  generateId?: () => string;
};

export function shouldDispatchGitHubReleaseWorker(
  mode: DeploymentWorkerMode = getDeploymentWorkerMode()
): boolean {
  return mode === "ecs";
}

export async function registerGitHubReleaseRunRoutes(
  app: FastifyInstance,
  options: GitHubReleaseRunRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;
  const database =
    options.repository && options.executor ? undefined : getClient().db;
  const repository =
    options.repository ?? createPostgresGitHubReleaseRunRepository(database!);
  const executionLeaseRepository =
    options.executionLeaseRepository ??
    (database ? createPostgresProjectExecutionLeaseRepository(database) : undefined);
  const executor =
    options.executor ??
    createGitHubReleaseRunExecutor({
      db: database!,
      repository: createPostgresGitHubReleaseExecutionRepository(database!),
      executionLeaseRepository: executionLeaseRepository!,
      dispatchToWorker: shouldDispatchGitHubReleaseWorker()
    });
  const verifyIdentity = options.verifyIdentity ?? createGitHubReleaseIdentityVerifier();
  const requireOwnerUserId =
    options.requireOwnerUserId ??
    ((request: FastifyRequest) => requireActiveUserId(request, getClient));

  queueMicrotask(() => {
    void executor.recoverInterruptedRuns?.().catch(() => undefined);
  });

  app.post("/git-cicd/projects/:projectId/release-runs", async (request, reply) => {
    try {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = createReleaseRunBodySchema.parse(
        request.body
      ) as CreateGitCicdReleaseRunRequest;
      const requestKey = requireIdempotencyKey(request);
      const identity = await verifyIdentity(requireBearerToken(request));
      const result = await createGitHubReleaseRun(
        { projectId, requestKey, request: body, identity },
        repository,
        executor,
        {
          ...(options.generateId ? { generateId: options.generateId } : {}),
          ...(options.now ? { now: options.now } : {}),
          ...(executionLeaseRepository
            ? {
                reserveExecution: async (leaseInput: {
                  projectId: string;
                  runId: string;
                }) => {
                  await acquireProjectExecutionLease(
                    {
                      projectId: leaseInput.projectId,
                      holderId: leaseInput.runId,
                      source: "gitops"
                    },
                    executionLeaseRepository,
                    options.now ? { now: options.now } : {}
                  );
                },
                releaseReservedExecution: async (leaseInput: {
                  projectId: string;
                  runId: string;
                }) => {
                  const lease = await executionLeaseRepository.find(leaseInput.projectId);
                  if (lease?.holderId !== leaseInput.runId) return;
                  await releaseProjectExecutionLease(
                    {
                      projectId: lease.projectId,
                      holderId: lease.holderId,
                      fencingVersion: lease.fencingVersion
                    },
                    executionLeaseRepository
                  );
                }
              }
            : {})
        }
      );
      const response: GitCicdReleaseRunResponse = { run: result.run };
      return reply.status(result.created ? 202 : 200).send(response);
    } catch (error) {
      return sendReleaseRunError(reply, error);
    }
  });

  app.get("/git-cicd/release-runs/:runId", async (request, reply) => {
    try {
      const { runId } = runParamsSchema.parse(request.params);
      const identity = await verifyIdentity(requireBearerToken(request));
      const response: GitCicdReleaseRunResponse = {
        run: await getGitHubReleaseRun({ runId, identity }, repository)
      };
      return reply.send(response);
    } catch (error) {
      return sendReleaseRunError(reply, error);
    }
  });

  app.post("/git-cicd/release-runs/:runId/cancel", async (request, reply) => {
    try {
      const { runId } = runParamsSchema.parse(request.params);
      const authorization = request.headers.authorization
        ? { identity: await verifyIdentity(requireBearerToken(request)) }
        : { ownerUserId: await requireOwnerUserId(request) };
      const response: GitCicdReleaseRunResponse = {
        run: await cancelGitHubReleaseRun(
          { runId, ...authorization },
          repository,
          executor,
          options.now ? { now: options.now } : {}
        )
      };
      return reply.status(202).send(response);
    } catch (error) {
      return sendReleaseRunError(reply, error);
    }
  });

  app.post("/git-cicd/release-runs/:runId/frontend/retry", async (request, reply) => {
    try {
      const { runId } = runParamsSchema.parse(request.params);
      const ownerUserId = await requireOwnerUserId(request);
      const response: GitCicdReleaseRunResponse = {
        run: await retryGitHubReleaseFrontend(
          { runId, ownerUserId },
          repository,
          executor
        )
      };
      return reply.status(202).send(response);
    } catch (error) {
      return sendReleaseRunError(reply, error);
    }
  });
}

function requireBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? /^Bearer\s+(.+)$/iu.exec(header) : null;
  if (!match?.[1]) throw new GitHubReleaseIdentityError();
  return match[1];
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || !value.trim()) {
    throw new GitHubReleaseRunError(
      "GITHUB_RELEASE_REQUEST_INVALID",
      "Idempotency-Key가 필요합니다.",
      400
    );
  }
  return value.trim();
}

function sendReleaseRunError(reply: FastifyReply, error: unknown) {
  if (error instanceof ProjectExecutionLeaseError) {
    return reply.status(409).send({
      error: error.code,
      message: error.message,
      activeSource: error.activeSource
    });
  }
  if (error instanceof GitHubReleaseRunError || error instanceof GitHubReleaseIdentityError) {
    return reply.status(error.statusCode).send({
      error: error.errorCode,
      message: error.message
    });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "GITHUB_RELEASE_REQUEST_INVALID",
      message: "GitHub 릴리즈 요청 형식이 올바르지 않습니다."
    });
  }
  throw error;
}
