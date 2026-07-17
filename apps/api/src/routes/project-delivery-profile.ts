import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  ProjectDeliveryProfile,
  ProjectDeliveryProfileResponse
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createPostgresProjectDeliveryProfileStore,
  createProjectDeliveryProfileService,
  ProjectDeliveryProfileNotFoundError
} from "../delivery/project-delivery-profile-service.js";
import {
  createGitCicdReadinessService,
  createPostgresGitCicdReadinessRepository,
  GitCicdReadinessNotFoundError
} from "../git-cicd/git-cicd-readiness-service.js";

const projectParamsSchema = z.object({ projectId: z.uuid() }).strict();

export type ProjectDeliveryProfileRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  getProfile?: (input: { projectId: string; userId: string }) => Promise<ProjectDeliveryProfile>;
  requireUserId?: (request: FastifyRequest) => Promise<string>;
};

export async function registerProjectDeliveryProfileRoutes(
  app: FastifyInstance,
  options: ProjectDeliveryProfileRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;
  const requireUser = options.requireUserId ?? ((request) =>
    requireActiveUserId(request, getClient));

  app.get("/projects/:projectId/delivery-profile", async (request, reply) => {
    const parsedParams = projectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "bad_request", message: "Invalid project id" });
    }
    const userId = await requireUser(request);

    try {
      const profile = await (options.getProfile ?? createProfileReader(getClient))({
        projectId: parsedParams.data.projectId,
        userId
      });
      const response: ProjectDeliveryProfileResponse = { profile };
      return reply.status(200).send(response);
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

function createProfileReader(getClient: () => DatabaseClient) {
  return (input: { projectId: string; userId: string }) => {
    const { db } = getClient();
    return createProjectDeliveryProfileService({
      store: createPostgresProjectDeliveryProfileStore(db),
      inspectReadiness: (readinessInput) =>
        createGitCicdReadinessService({
          repository: createPostgresGitCicdReadinessRepository(db)
        }).inspect(readinessInput)
    }).get(input);
  };
}

function handleError(error: unknown, reply: FastifyReply) {
  if (
    error instanceof ProjectDeliveryProfileNotFoundError ||
    error instanceof GitCicdReadinessNotFoundError
  ) {
    return reply.status(404).send({ error: "not_found", message: "Project not found" });
  }
  throw error;
}
