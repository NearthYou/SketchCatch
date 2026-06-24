import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthResponse, AuthSession, CurrentUserResponse, User } from "@sketchcatch/types";
import { requireCurrentUserId } from "../auth/current-user.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashToken
} from "../auth/tokens.js";
import { type Database, getDatabaseClient } from "../db/client.js";
import { loginAttempts, refreshTokens, users } from "../db/schema.js";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value) => value.toLowerCase());

const signupBodySchema = z.object({
  username: usernameSchema,
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),
  nickname: z.string().trim().min(1).max(40),
  password: z.string().min(8).max(128)
});

const loginBodySchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128)
});

const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1)
});

type PublicUserRow = Pick<
  typeof users.$inferSelect,
  "id" | "username" | "email" | "nickname" | "createdAt"
>;

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", async (request, reply) => {
    const body = signupBodySchema.parse(request.body);
    const { db } = getDatabaseClient();

    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, body.username));

    if (existingUsername) {
      return reply.status(409).send({
        error: "conflict",
        message: "Username already exists"
      });
    }

    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email));

    if (existingEmail) {
      return reply.status(409).send({
        error: "conflict",
        message: "Email already exists"
      });
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        username: body.username,
        email: body.email,
        nickname: body.nickname,
        passwordHash: await hashPassword(body.password)
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        nickname: users.nickname,
        createdAt: users.createdAt
      });

    if (!createdUser) {
      throw new Error("Failed to create user");
    }

    const session = await createAuthSession(db, createdUser.id, request);
    const response: AuthResponse = {
      user: toPublicUser(createdUser),
      session
    };

    return reply.status(201).send(response);
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const { db } = getDatabaseClient();

    const [user] = await db.select().from(users).where(eq(users.username, body.username));

    if (!user || user.deletedAt) {
      await recordLoginAttempt(db, request, {
        username: body.username,
        success: false,
        failureReason: "invalid_credentials"
      });

      return sendUnauthorized(reply, "Username or password is incorrect");
    }

    const passwordMatched = await verifyPassword(body.password, user.passwordHash);

    if (!passwordMatched) {
      await recordLoginAttempt(db, request, {
        userId: user.id,
        username: user.username,
        success: false,
        failureReason: "invalid_credentials"
      });

      return sendUnauthorized(reply, "Username or password is incorrect");
    }

    await recordLoginAttempt(db, request, {
      userId: user.id,
      username: user.username,
      success: true
    });

    const session = await createAuthSession(db, user.id, request);
    const response: AuthResponse = {
      user: toPublicUser(user),
      session
    };

    return response;
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshTokenBodySchema.parse(request.body);
    const { db } = getDatabaseClient();
    const tokenHash = hashToken(body.refreshToken);

    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date())
        )
      );

    if (!storedToken) {
      return sendUnauthorized(reply, "Refresh token is invalid or expired");
    }

    const [user] = await db.select().from(users).where(eq(users.id, storedToken.userId));

    if (!user || user.deletedAt) {
      return sendUnauthorized(reply, "Refresh token is invalid or expired");
    }

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date()
      })
      .where(eq(refreshTokens.id, storedToken.id));

    const session = await createAuthSession(db, storedToken.userId, request);
    const response: AuthResponse = {
      user: toPublicUser(user),
      session
    };

    return response;
  });

  app.post("/auth/logout", async (request) => {
    const body = refreshTokenBodySchema.parse(request.body);
    const { db } = getDatabaseClient();

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date()
      })
      .where(eq(refreshTokens.tokenHash, hashToken(body.refreshToken)));

    return {
      ok: true
    };
  });

  app.get("/auth/me", async (request, reply) => {
    const currentUserId = requireCurrentUserId(request);
    const { db } = getDatabaseClient();

    const [user] = await db.select().from(users).where(eq(users.id, currentUserId));

    if (!user || user.deletedAt) {
      return sendUnauthorized(reply, "Authentication required");
    }

    const response: CurrentUserResponse = {
      user: toPublicUser(user)
    };

    return response;
  });
}

async function createAuthSession(
  db: Database,
  userId: string,
  request: FastifyRequest
): Promise<AuthSession> {
  const refreshToken = createRefreshToken();

  await db.insert(refreshTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiresAt(),
    userAgent: getUserAgent(request),
    ipAddress: request.ip
  });

  return {
    accessToken: createAccessToken(userId),
    refreshToken,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
  };
}

async function recordLoginAttempt(
  db: Database,
  request: FastifyRequest,
  attempt: {
    userId?: string;
    username: string;
    success: boolean;
    failureReason?: string;
  }
): Promise<void> {
  await db.insert(loginAttempts).values({
    id: randomUUID(),
    userId: attempt.userId,
    username: attempt.username,
    ipAddress: request.ip,
    success: attempt.success,
    failureReason: attempt.failureReason
  });
}

function toPublicUser(user: PublicUserRow): User {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt.toISOString()
  };
}

function getUserAgent(request: FastifyRequest): string | undefined {
  const userAgent = request.headers["user-agent"];

  if (Array.isArray(userAgent)) {
    return userAgent.join(",");
  }

  return userAgent;
}

function sendUnauthorized(reply: FastifyReply, message: string): FastifyReply {
  return reply.status(401).send({
    error: "unauthorized",
    message
  });
}
