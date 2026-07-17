import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  GitCicdReadinessResponse,
  GitCicdReadinessSnapshot
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { getDeveloperErrorMessage } from "../network/developer-error-message.js";
import {
  createGitCicdReadinessService,
  createPostgresGitCicdReadinessRepository,
  GitCicdReadinessNotFoundError,
  GitCicdReadinessRefreshError,
  type GitCicdReadinessRepository
} from "../git-cicd/git-cicd-readiness-service.js";

const projectParamsSchema = z.object({ projectId: z.uuid() }).strict();

type RefreshGitCicdReadiness = (input: {
  projectId: string;
  userId: string;
}) => Promise<GitCicdReadinessSnapshot>;

export type GitCicdReadinessRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createRepository?: (db: DatabaseClient["db"]) => GitCicdReadinessRepository;
  refreshGitCicdReadiness?: RefreshGitCicdReadiness;
  requireUserId?: (request: FastifyRequest) => Promise<string>;
};

export async function registerGitCicdReadinessRoutes(
  app: FastifyInstance,
  options: GitCicdReadinessRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;
  const requireUserId =
    options.requireUserId ??
    ((request: FastifyRequest) => requireActiveUserId(request, getClient));

  app.post("/projects/:projectId/git-cicd/readiness/refresh", async (request, reply) => {
    const parsedParams = projectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "bad_request",
        message: "Invalid project id"
      });
    }

    const userId = await requireUserId(request);

    try {
      const readiness = await resolveRefresh(options, getClient)({
        projectId: parsedParams.data.projectId,
        userId
      });
      const response: GitCicdReadinessResponse = { readiness };
      return reply.status(200).send(response);
    } catch (error) {
      return handleGitCicdReadinessError(error, reply);
    }
  });
}

function resolveRefresh(
  options: GitCicdReadinessRouteOptions,
  getClient: () => DatabaseClient
): RefreshGitCicdReadiness {
  if (options.refreshGitCicdReadiness) {
    return options.refreshGitCicdReadiness;
  }

  return (input) => {
    const client = getClient();
    const repository =
      options.createRepository?.(client.db) ??
      createPostgresGitCicdReadinessRepository(client.db);
    return createGitCicdReadinessService({ repository }).refresh(input);
  };
}

function handleGitCicdReadinessError(
  error: unknown,
  reply: FastifyReply
): FastifyReply {
  if (error instanceof GitCicdReadinessNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }

  if (error instanceof GitCicdReadinessRefreshError) {
    return sendRefreshUnavailable(reply, error);
  }

  return sendRefreshUnavailable(reply, error);
}

function sendRefreshUnavailable(reply: FastifyReply, error: unknown): FastifyReply {
  return reply.status(503).send({
    error: "GIT_CICD_READINESS_REFRESH_FAILED",
    message: getDeveloperErrorMessage(
      error,
      "Git/CI/CD readiness evidence could not be refreshed"
    )
  });
}
