import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, gte, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  ApiErrorResponse,
  AuthResponse,
  CurrentUserResponse,
  LoginLockedErrorResponse
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  getLoginAttemptWindowStart,
  getLoginLockExpiresAt,
  isLoginLocked,
  shouldLockLogin
} from "../auth/login-attempt-policy.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  clearRefreshTokenCookie,
  createAuthSession,
  getRefreshTokenCookie,
  getRefreshTokenPersistence,
  hasValidCsrfToken,
  toPublicUser
} from "../auth/session.js";
import { hashToken } from "../auth/tokens.js";
import { type Database, type DatabaseClient, getDatabaseClient } from "../db/client.js";
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
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false)
});

type AuthRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions = {}
): Promise<void> {
  const getAuthDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;

  app.post("/auth/signup", async (request, reply) => {
    const body = signupBodySchema.parse(request.body);
    const { db } = getAuthDatabaseClient();

    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, body.username));

    if (existingUsername) {
      const response: ApiErrorResponse = {
        error: "conflict",
        message: "이미 사용 중인 아이디입니다."
      };

      return reply.status(409).send(response);
    }

    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email));

    if (existingEmail) {
      const response: ApiErrorResponse = {
        error: "conflict",
        message: "이미 사용 중인 이메일입니다."
      };

      return reply.status(409).send(response);
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
      throw new Error("사용자를 생성하지 못했습니다.");
    }

    const session = await createAuthSession(db, createdUser.id, request, reply, {
      persistent: false
    });
    const response: AuthResponse = {
      user: toPublicUser(createdUser),
      session
    };

    return reply.status(201).send(response);
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const { db } = getAuthDatabaseClient();

    const activeLock = await getActiveLoginLock(db, body.username, request.ip);

    if (activeLock) {
      return sendLoginLocked(reply, activeLock);
    }

    const [user] = await db.select().from(users).where(eq(users.username, body.username));

    if (!user || user.deletedAt) {
      const lockedUntil = await recordFailedLoginAttempt(db, request, {
        username: body.username,
        failureReason: "invalid_credentials"
      });

      if (lockedUntil) {
        return sendLoginLocked(reply, lockedUntil);
      }

      return sendUnauthorized(reply, "아이디 또는 비밀번호가 올바르지 않습니다.");
    }

    if (!user.passwordHash) {
      const lockedUntil = await recordFailedLoginAttempt(db, request, {
        userId: user.id,
        username: user.username,
        failureReason: "invalid_credentials"
      });

      if (lockedUntil) {
        return sendLoginLocked(reply, lockedUntil);
      }

      return sendUnauthorized(reply, "아이디 또는 비밀번호가 올바르지 않습니다.");
    }

    const passwordMatched = await verifyPassword(body.password, user.passwordHash);

    if (!passwordMatched) {
      const lockedUntil = await recordFailedLoginAttempt(db, request, {
        userId: user.id,
        username: user.username,
        failureReason: "invalid_credentials"
      });

      if (lockedUntil) {
        return sendLoginLocked(reply, lockedUntil);
      }

      return sendUnauthorized(reply, "아이디 또는 비밀번호가 올바르지 않습니다.");
    }

    await recordLoginAttempt(db, request, {
      userId: user.id,
      username: user.username,
      success: true
    });

    const session = await createAuthSession(db, user.id, request, reply, {
      persistent: body.rememberMe
    });
    const response: AuthResponse = {
      user: toPublicUser(user),
      session
    };

    return response;
  });

  app.post("/auth/refresh", async (request, reply) => {
    const refreshToken = getRefreshTokenCookie(request);

    if (!refreshToken) {
      clearRefreshTokenCookie(reply);

      return sendUnauthorized(reply, "로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
    }

    if (!hasValidCsrfToken(request)) {
      clearRefreshTokenCookie(reply);

      return sendUnauthorized(reply, "인증 요청이 올바르지 않습니다.");
    }

    const { db } = getAuthDatabaseClient();

    const tokenHash = hashToken(refreshToken);
    const now = new Date();

    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));

    if (!storedToken) {
      clearRefreshTokenCookie(reply);

      return sendUnauthorized(reply, "로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
    }

    if (storedToken.revokedAt) {
      clearRefreshTokenCookie(reply);
      await revokeActiveRefreshTokensForUser(db, storedToken.userId, now);
      request.log.warn(
        {
          refreshTokenId: storedToken.id,
          userId: storedToken.userId
        },
        "Detected refresh token reuse and revoked active sessions"
      );

      return sendUnauthorized(reply, "로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
    }

    if (storedToken.expiresAt.getTime() <= now.getTime()) {
      clearRefreshTokenCookie(reply);

      return sendUnauthorized(reply, "로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
    }

    const [user] = await db.select().from(users).where(eq(users.id, storedToken.userId));

    if (!user || user.deletedAt) {
      clearRefreshTokenCookie(reply);

      return sendUnauthorized(reply, "로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
    }

    await revokeRefreshToken(db, storedToken.id, now);

    const session = await createAuthSession(db, storedToken.userId, request, reply, {
      persistent: getRefreshTokenPersistence(refreshToken) === "persistent"
    });
    const response: AuthResponse = {
      user: toPublicUser(user),
      session
    };

    return response;
  });

  app.post("/auth/logout", async (request, reply) => {
    const refreshToken = getRefreshTokenCookie(request);
    const { db } = getAuthDatabaseClient();

    if (refreshToken) {
      if (!hasValidCsrfToken(request)) {
        return sendUnauthorized(reply, "인증 요청이 올바르지 않습니다.");
      }

      await db
        .update(refreshTokens)
        .set({
          revokedAt: new Date()
        })
        .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)));
    }

    clearRefreshTokenCookie(reply);

    return {
      ok: true
    };
  });

  app.post("/auth/logout-all", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getAuthDatabaseClient);
    const { db } = getAuthDatabaseClient();

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date()
      })
      .where(and(eq(refreshTokens.userId, currentUserId), isNull(refreshTokens.revokedAt)));

    clearRefreshTokenCookie(reply);

    return {
      ok: true
    };
  });

  app.get("/auth/me", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getAuthDatabaseClient);
    const { db } = getAuthDatabaseClient();

    const [user] = await db.select().from(users).where(eq(users.id, currentUserId));

    if (!user || user.deletedAt) {
      return sendUnauthorized(reply, "인증이 필요합니다.");
    }

    const response: CurrentUserResponse = {
      user: toPublicUser(user)
    };

    return response;
  });

  app.delete("/auth/me", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getAuthDatabaseClient);
    const { db } = getAuthDatabaseClient();
    const deletedAt = new Date();

    await db
      .update(users)
      .set({
        deletedAt,
        updatedAt: deletedAt
      })
      .where(eq(users.id, currentUserId));

    await db
      .update(refreshTokens)
      .set({
        revokedAt: deletedAt
      })
      .where(and(eq(refreshTokens.userId, currentUserId), isNull(refreshTokens.revokedAt)));

    clearRefreshTokenCookie(reply);

    return {
      ok: true
    };
  });
}

async function revokeRefreshToken(
  db: Database,
  refreshTokenId: string,
  revokedAt: Date
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({
      revokedAt
    })
    .where(eq(refreshTokens.id, refreshTokenId));
}

async function revokeActiveRefreshTokensForUser(
  db: Database,
  userId: string,
  revokedAt: Date
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({
      revokedAt
    })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

async function getActiveLoginLock(
  db: Database,
  username: string,
  ipAddress: string
): Promise<Date | null> {
  const [lockedAttempt] = await db
    .select({
      lockedUntil: loginAttempts.lockedUntil
    })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, username),
        eq(loginAttempts.ipAddress, ipAddress),
        gt(loginAttempts.lockedUntil, new Date())
      )
    )
    .orderBy(desc(loginAttempts.lockedUntil));

  const lockedUntil = lockedAttempt?.lockedUntil ?? null;

  if (!isLoginLocked(lockedUntil)) {
    return null;
  }

  return lockedUntil;
}

async function recordFailedLoginAttempt(
  db: Database,
  request: FastifyRequest,
  attempt: {
    userId?: string;
    username: string;
    failureReason: string;
  }
): Promise<Date | null> {
  const now = new Date();
  const attemptWindowStart = getLoginAttemptWindowStart(now);
  const [lastSuccessfulAttempt] = await db
    .select({
      createdAt: loginAttempts.createdAt
    })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, attempt.username),
        eq(loginAttempts.ipAddress, request.ip),
        eq(loginAttempts.success, true),
        gte(loginAttempts.createdAt, attemptWindowStart)
      )
    )
    .orderBy(desc(loginAttempts.createdAt));
  const failedAttemptWindowStart =
    lastSuccessfulAttempt?.createdAt &&
    lastSuccessfulAttempt.createdAt.getTime() > attemptWindowStart.getTime()
      ? lastSuccessfulAttempt.createdAt
      : attemptWindowStart;
  const [result] = await db
    .select({
      failedAttemptCount: count()
    })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, attempt.username),
        eq(loginAttempts.ipAddress, request.ip),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, failedAttemptWindowStart)
      )
    );
  const failedAttemptCount = Number(result?.failedAttemptCount ?? 0) + 1;
  const lockedUntil = shouldLockLogin(failedAttemptCount) ? getLoginLockExpiresAt(now) : null;

  await recordLoginAttempt(db, request, {
    ...attempt,
    success: false,
    lockedUntil
  });

  return lockedUntil;
}

async function recordLoginAttempt(
  db: Database,
  request: FastifyRequest,
  attempt: {
    userId?: string;
    username: string;
    success: boolean;
    failureReason?: string;
    lockedUntil?: Date | null;
  }
): Promise<void> {
  await db.insert(loginAttempts).values({
    id: randomUUID(),
    userId: attempt.userId ?? null,
    username: attempt.username,
    ipAddress: request.ip,
    success: attempt.success,
    failureReason: attempt.failureReason ?? null,
    lockedUntil: attempt.lockedUntil ?? null
  });
}

function sendUnauthorized(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "unauthorized",
    message
  };

  return reply.status(401).send(response);
}

function sendLoginLocked(reply: FastifyReply, lockedUntil: Date): FastifyReply {
  const response: LoginLockedErrorResponse = {
    error: "too_many_requests",
    message: "로그인 시도가 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    lockedUntil: lockedUntil.toISOString()
  };

  return reply.status(429).send(response);
}
