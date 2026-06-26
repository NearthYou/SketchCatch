import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { ApiErrorCode } from "@sketchcatch/types";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { users } from "../db/schema.js";
import { verifyAccessToken } from "./tokens.js";

type AuthHttpError = Error & {
  statusCode?: number;
  errorCode?: ApiErrorCode;
};

export async function getCurrentUserId(request: FastifyRequest): Promise<string | null> {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return (await verifyAccessToken(token))?.userId ?? null;
}

export async function requireCurrentUserId(request: FastifyRequest): Promise<string> {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    const error = new Error("인증이 필요합니다.") as AuthHttpError;

    error.statusCode = 401;
    error.errorCode = "unauthorized";
    throw error;
  }

  return currentUserId;
}

export async function requireActiveUserId(
  request: FastifyRequest,
  getAuthDatabaseClient: () => DatabaseClient = getDatabaseClient
): Promise<string> {
  const currentUserId = await requireCurrentUserId(request);
  const { db } = getAuthDatabaseClient();
  const [user] = await db
    .select({
      id: users.id,
      deletedAt: users.deletedAt
    })
    .from(users)
    .where(eq(users.id, currentUserId));

  if (!user || user.deletedAt) {
    const error = new Error("인증이 필요합니다.") as AuthHttpError;

    error.statusCode = 401;
    error.errorCode = "unauthorized";
    throw error;
  }

  return user.id;
}
