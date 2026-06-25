import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { projects } from "../../db/schema.js";

export type ProjectOwnerIdentity = {
  workspaceId?: string | undefined;
  userId?: string | undefined;
};

export type ProjectOwnerResolver = (
  request: FastifyRequest
) => ProjectOwnerIdentity | Promise<ProjectOwnerIdentity | null | undefined> | null | undefined;

export async function resolveProjectOwner(
  request: FastifyRequest,
  resolveAuthenticatedOwner?: ProjectOwnerResolver | undefined,
  clientGeneratedWorkspaceId?: string | undefined
): Promise<ProjectOwnerIdentity | null> {
  const authenticatedOwner = await resolveAuthenticatedOwner?.(request);
  const userId = authenticatedOwner?.userId;
  const workspaceId =
    authenticatedOwner?.workspaceId ?? clientGeneratedWorkspaceId ?? buildWorkspaceIdForUser(userId);

  if (!workspaceId && !userId) {
    return null;
  }

  return {
    workspaceId,
    userId
  };
}

export function buildProjectOwnerFilter(owner: ProjectOwnerIdentity | null) {
  if (!owner) {
    return null;
  }

  if (owner.userId) {
    return eq(projects.userId, owner.userId);
  }

  if (owner.workspaceId) {
    return eq(projects.workspaceId, owner.workspaceId);
  }

  return null;
}

function buildWorkspaceIdForUser(userId: string | undefined): string | undefined {
  if (!userId) {
    return undefined;
  }

  const workspaceId = `user:${userId}`;

  return workspaceId.length <= 128 ? workspaceId : undefined;
}
