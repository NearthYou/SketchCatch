import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { getDatabaseClient } from "../db/client.js";
import { users } from "../db/schema.js";
import { verifyAccessToken } from "./tokens.js";

export function getCurrentUserId(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return verifyAccessToken(token)?.userId ?? null;
}

export function requireCurrentUserId(request: FastifyRequest): string {
  const currentUserId = getCurrentUserId(request);

  if (!currentUserId) {
    const error = new Error("Authentication required") as Error & {
      statusCode?: number;
      errorCode?: string;
    };

    error.statusCode = 401;
    error.errorCode = "unauthorized";
    throw error;
  }

  return currentUserId;
}

export async function requireActiveUserId(request: FastifyRequest): Promise<string> {
  const currentUserId = requireCurrentUserId(request);
  const { db } = getDatabaseClient();
  const [user] = await db
    .select({
      id: users.id,
      deletedAt: users.deletedAt
    })
    .from(users)
    .where(eq(users.id, currentUserId));

  if (!user || user.deletedAt) {
    const error = new Error("Authentication required") as Error & {
      statusCode?: number;
      errorCode?: string;
    };

    error.statusCode = 401;
    error.errorCode = "unauthorized";
    throw error;
  }

  return user.id;
}
