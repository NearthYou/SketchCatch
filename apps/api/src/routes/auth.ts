import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, gte, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  isPasswordPolicySatisfied,
  PASSWORD_MAX_LENGTH,
  PASSWORD_POLICY_ERROR_MESSAGE,
  type ApiErrorResponse,
  type AuthResponse,
  type CurrentUserResponse,
  type LoginLockedErrorResponse,
  type PasswordResetConfirmResponse,
  type PasswordResetRequestResponse,
  type ProfilePasswordVerificationResponse,
  type SignupAvailabilityResponse,
  type UpdateProfileResponse
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
  ProfileUpdateError,
  updateProfile,
  verifyProfilePassword
} from "../auth/profile-update.js";
import {
  buildPasswordResetDebugUrl,
  createPasswordResetToken,
  getPasswordResetTokenExpiresAt,
  shouldExposePasswordResetDebugToken
} from "../auth/password-reset.js";
import {
  clearRefreshTokenCookie,
  createAuthSession,
  getProfileUpdateTokenCookie,
  getRefreshTokenCookie,
  getRefreshTokenPersistence,
  hasValidCsrfToken,
  setProfileUpdateTokenCookie,
  toPublicUser
} from "../auth/session.js";
import { hashToken } from "../auth/tokens.js";
import { type Database, type DatabaseClient, getDatabaseClient } from "../db/client.js";
import { loginAttempts, passwordResetTokens, refreshTokens, users } from "../db/schema.js";
import type { RateLimiter } from "../rate-limit/in-memory-rate-limiter.js";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value) => value.toLowerCase());

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());

const passwordPolicySchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_ERROR_MESSAGE)
  .refine(isPasswordPolicySatisfied, {
    message: PASSWORD_POLICY_ERROR_MESSAGE
  });

const signupBodySchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  nickname: z.string().trim().min(1).max(40),
  password: passwordPolicySchema,
  privacyAccepted: z.literal(true),
  termsAccepted: z.literal(true)
});

const signupAvailabilityBodySchema = z
  .object({
    username: usernameSchema.optional(),
    email: emailSchema.optional()
  })
  .refine((body) => body.username || body.email, {
    message: "username 또는 email 중 하나는 필요합니다."
  });

const loginBodySchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  rememberMe: z.boolean().optional().default(false)
});

const passwordResetRequestBodySchema = z.object({
  email: emailSchema
});

const passwordResetConfirmBodySchema = z.object({
  resetToken: z.string().trim().min(20).max(512),
  newPassword: passwordPolicySchema
});

const profilePasswordVerificationBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH)
});

const updateProfileBodySchema = z
  .object({
    nickname: z.string().trim().min(1).max(40),
    newPassword: passwordPolicySchema.optional(),
    newPasswordConfirmation: z.string().max(PASSWORD_MAX_LENGTH).optional()
  })
  .superRefine((body, context) => {
    const includesPasswordChange =
      body.newPassword !== undefined || body.newPasswordConfirmation !== undefined;

    if (!includesPasswordChange) return;

    if (!body.newPassword) {
      context.addIssue({
        code: "custom",
        message: "새 비밀번호를 입력해주세요.",
        path: ["newPassword"]
      });
    }
    if (!body.newPasswordConfirmation) {
      context.addIssue({
        code: "custom",
        message: "새 비밀번호 확인을 입력해주세요.",
        path: ["newPasswordConfirmation"]
      });
    }
    if (
      body.newPassword &&
      body.newPasswordConfirmation &&
      body.newPassword !== body.newPasswordConfirmation
    ) {
      context.addIssue({
        code: "custom",
        message: "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.",
        path: ["newPasswordConfirmation"]
      });
    }
  });

type AuthRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  passwordResetRequestEmailRateLimiter?: RateLimiter;
  passwordResetRequestIpRateLimiter?: RateLimiter;
};

const PASSWORD_RESET_REQUEST_RATE_LIMIT_MESSAGE =
  "비밀번호 재설정 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
const RECENT_REFRESH_TOKEN_RETRY_GRACE_MS = 10_000;

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions = {}
): Promise<void> {
  const getAuthDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;

  app.post("/auth/signup/availability", async (request) => {
    const body = signupAvailabilityBodySchema.parse(request.body);
    const { db } = getAuthDatabaseClient();
    const response: SignupAvailabilityResponse = {};

    if (body.username) {
      const [existingUsername] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, body.username));

      response.usernameAvailable = !existingUsername;
    }

    if (body.email) {
      const [existingEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, body.email));

      response.emailAvailable = !existingEmail;
    }

    return response;
  });

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
      if (isRecentlyRotatedRefreshToken(storedToken.revokedAt, now)) {
        request.log.info(
          {
            refreshTokenId: storedToken.id,
            userId: storedToken.userId
          },
          "Ignored immediately retried rotated refresh token"
        );

        return sendUnauthorized(reply, "로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
      }

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

  app.post("/auth/password-reset/request", async (request, reply) => {
    const body = passwordResetRequestBodySchema.parse(request.body);
    const rateLimitReply = consumePasswordResetRequestRateLimit(
      reply,
      request.ip,
      body.email,
      options
    );

    if (rateLimitReply) {
      return rateLimitReply;
    }

    const { db } = getAuthDatabaseClient();
    const response: PasswordResetRequestResponse = {
      ok: true
    };

    const [user] = await db.select().from(users).where(eq(users.email, body.email));

    if (!user || user.deletedAt || !user.passwordHash) {
      return response;
    }

    const resetToken = createPasswordResetToken();

    await db.insert(passwordResetTokens).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(resetToken),
      expiresAt: getPasswordResetTokenExpiresAt(),
      userAgent: getRequestUserAgent(request),
      ipAddress: request.ip
    });

    if (!shouldExposePasswordResetDebugToken()) {
      return response;
    }

    return {
      ...response,
      debugResetToken: resetToken,
      debugResetUrl: buildPasswordResetDebugUrl(resetToken)
    };
  });

  app.post("/auth/password-reset/confirm", async (request, reply) => {
    const body = passwordResetConfirmBodySchema.parse(request.body);
    const { db } = getAuthDatabaseClient();
    const now = new Date();
    const [storedToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(body.resetToken)));

    if (
      !storedToken ||
      storedToken.usedAt ||
      storedToken.expiresAt.getTime() <= now.getTime()
    ) {
      return sendUnauthorized(reply, "비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다.");
    }

    const [user] = await db.select().from(users).where(eq(users.id, storedToken.userId));

    if (!user || user.deletedAt) {
      return sendUnauthorized(reply, "비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다.");
    }

    const passwordHash = await hashPassword(body.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: now
        })
        .where(eq(users.id, storedToken.userId));

      await expireActivePasswordResetTokensForUser(tx, storedToken.userId, now);
      await revokeActiveRefreshTokensForUser(tx, storedToken.userId, now);
    });

    const response: PasswordResetConfirmResponse = {
      ok: true
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
      user: toPublicUser(user),
      canChangePassword: user.passwordHash !== null
    };

    return response;
  });

  app.post("/auth/me/password-verification", async (request, reply) => {
    const body = profilePasswordVerificationBodySchema.parse(request.body);
    const currentUserId = await requireActiveUserId(request, getAuthDatabaseClient);
    const { db } = getAuthDatabaseClient();
    const [user] = await db.select().from(users).where(eq(users.id, currentUserId));

    if (!user || user.deletedAt) {
      return sendUnauthorized(reply, "인증이 필요합니다.");
    }
    const activeLock = await getActiveLoginLock(db, user.username, request.ip);
    if (activeLock) {
      return sendLoginLocked(reply, activeLock);
    }

    const verification = await verifyProfilePassword(user, body.currentPassword);
    if (verification.status === "social_account") {
      return sendConflict(
        reply,
        "소셜 로그인 사용자는 현재 비밀번호 확인 없이 이름만 변경할 수 있습니다."
      );
    }
    if (verification.status === "invalid_password") {
      const lockedUntil = await recordFailedLoginAttempt(db, request, {
        userId: user.id,
        username: user.username,
        failureReason: "profile_reauthentication_failed"
      });
      if (lockedUntil) {
        return sendLoginLocked(reply, lockedUntil);
      }

      return sendUnauthorized(reply, "현재 비밀번호가 올바르지 않습니다.");
    }

    await recordLoginAttempt(db, request, {
      userId: user.id,
      username: user.username,
      success: true
    });

    setProfileUpdateTokenCookie(
      reply,
      verification.verificationToken,
      verification.expiresInSeconds
    );
    const response: ProfilePasswordVerificationResponse = {
      expiresInSeconds: verification.expiresInSeconds
    };

    return response;
  });

  app.patch("/auth/me", async (request, reply) => {
    const body = updateProfileBodySchema.parse(request.body);
    const currentUserId = await requireActiveUserId(request, getAuthDatabaseClient);
    const { db } = getAuthDatabaseClient();
    const [user] = await db.select().from(users).where(eq(users.id, currentUserId));

    if (!user || user.deletedAt) {
      return sendUnauthorized(reply, "인증이 필요합니다.");
    }

    const verificationToken = getProfileUpdateTokenCookie(request);
    let updateResult;
    try {
      updateResult = await updateProfile({
        db,
        user,
        nickname: body.nickname,
        ...(verificationToken ? { verificationToken } : {}),
        ...(body.newPassword ? { newPassword: body.newPassword } : {})
      });
    } catch (error) {
      if (!(error instanceof ProfileUpdateError)) {
        throw error;
      }

      if (error.reason === "password_change_not_supported") {
        return sendConflict(reply, "소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.");
      }
      if (error.reason === "password_reused") {
        return sendConflict(reply, "새 비밀번호는 현재 비밀번호와 다르게 입력해주세요.");
      }
      if (error.reason === "verification_required") {
        return sendUnauthorized(reply, "현재 비밀번호 확인이 필요합니다.");
      }

      return sendUnauthorized(
        reply,
        "현재 비밀번호 확인이 만료되었습니다. 다시 확인해주세요."
      );
    }

    const refreshToken = getRefreshTokenCookie(request);
    const session = updateResult.passwordChanged
      ? await createAuthSession(db, currentUserId, request, reply, {
          persistent:
            refreshToken !== null &&
            getRefreshTokenPersistence(refreshToken) === "persistent"
        })
      : undefined;
    const response: UpdateProfileResponse = {
      user: toPublicUser(updateResult.user),
      ...(session ? { session } : {})
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

function consumePasswordResetRequestRateLimit(
  reply: FastifyReply,
  ipAddress: string,
  email: string,
  options: Pick<
    AuthRouteOptions,
    "passwordResetRequestEmailRateLimiter" | "passwordResetRequestIpRateLimiter"
  >
): FastifyReply | null {
  if (options.passwordResetRequestIpRateLimiter) {
    const ipResult = options.passwordResetRequestIpRateLimiter.consume(
      createPasswordResetRequestRateLimitKey("ip", ipAddress)
    );

    if (!ipResult.allowed) {
      return sendTooManyPasswordResetRequests(reply, ipResult.retryAfterSeconds);
    }
  }

  if (options.passwordResetRequestEmailRateLimiter) {
    const emailResult = options.passwordResetRequestEmailRateLimiter.consume(
      createPasswordResetRequestRateLimitKey("email", email)
    );

    if (!emailResult.allowed) {
      return sendTooManyPasswordResetRequests(reply, emailResult.retryAfterSeconds);
    }
  }

  return null;
}

function createPasswordResetRequestRateLimitKey(type: "email" | "ip", value: string): string {
  return `password-reset:request:${type}:${value}`;
}

function sendTooManyPasswordResetRequests(
  reply: FastifyReply,
  retryAfterSeconds: number
): FastifyReply {
  const response: ApiErrorResponse = {
    error: "too_many_requests",
    message: PASSWORD_RESET_REQUEST_RATE_LIMIT_MESSAGE
  };

  return reply
    .status(429)
    .header("Retry-After", String(retryAfterSeconds))
    .send(response);
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
  db: Pick<Database, "update">,
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

function isRecentlyRotatedRefreshToken(revokedAt: Date, now: Date): boolean {
  const elapsedMs = now.getTime() - revokedAt.getTime();

  return elapsedMs >= 0 && elapsedMs <= RECENT_REFRESH_TOKEN_RETRY_GRACE_MS;
}

async function expireActivePasswordResetTokensForUser(
  db: Pick<Database, "update">,
  userId: string,
  usedAt: Date
): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({
      usedAt
    })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
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

function getRequestUserAgent(request: FastifyRequest): string | undefined {
  const userAgent = request.headers["user-agent"];

  if (Array.isArray(userAgent)) {
    return userAgent.join(",");
  }

  return userAgent;
}

function sendUnauthorized(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "unauthorized",
    message
  };

  return reply.status(401).send(response);
}

function sendConflict(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "conflict",
    message
  };

  return reply.status(409).send(response);
}

function sendLoginLocked(reply: FastifyReply, lockedUntil: Date): FastifyReply {
  const response: LoginLockedErrorResponse = {
    error: "too_many_requests",
    message: "로그인 시도가 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    lockedUntil: lockedUntil.toISOString()
  };

  return reply.status(429).send(response);
}
