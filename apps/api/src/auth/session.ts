import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthSession, User } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { refreshTokens, users } from "../db/schema.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashToken,
  REFRESH_TOKEN_TTL_DAYS
} from "./tokens.js";

const REFRESH_TOKEN_COOKIE_NAME = "sketchcatch_refresh_token";
const CSRF_TOKEN_COOKIE_NAME = "sketchcatch_csrf_token";
const PROFILE_UPDATE_TOKEN_COOKIE_NAME = "sketchcatch_profile_update_token";
const CSRF_TOKEN_HEADER_NAME = "x-csrf-token";
const REFRESH_TOKEN_COOKIE_PATH = "/api/auth";
const PROFILE_UPDATE_TOKEN_COOKIE_PATH = "/api/auth/me";
const CSRF_TOKEN_COOKIE_PATH = "/";
const REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
const SESSION_REFRESH_TOKEN_PREFIX = "session.";
const PERSISTENT_REFRESH_TOKEN_PREFIX = "persistent.";

type RefreshTokenPersistence = "session" | "persistent";

export type PublicUserRow = Pick<
  typeof users.$inferSelect,
  "id" | "username" | "email" | "nickname" | "createdAt"
>;

export async function createAuthSession(
  db: Database,
  userId: string,
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    persistent?: boolean;
  } = {}
): Promise<AuthSession> {
  const persistence = options.persistent === false ? "session" : "persistent";
  const refreshToken = createSessionRefreshToken(persistence);

  await db.insert(refreshTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiresAt(),
    userAgent: getUserAgent(request),
    ipAddress: request.ip
  });

  setRefreshTokenCookie(reply, refreshToken, persistence);

  return {
    accessToken: await createAccessToken(userId),
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
  };
}

export function toPublicUser(user: PublicUserRow): User {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt.toISOString()
  };
}

export function getRefreshTokenCookie(request: FastifyRequest): string | null {
  return getCookie(request, REFRESH_TOKEN_COOKIE_NAME);
}

export function getProfileUpdateTokenCookie(request: FastifyRequest): string | null {
  return getCookie(request, PROFILE_UPDATE_TOKEN_COOKIE_NAME);
}

export function setProfileUpdateTokenCookie(
  reply: FastifyReply,
  token: string,
  maxAge: number
): void {
  reply.header(
    "set-cookie",
    serializeAuthCookie(PROFILE_UPDATE_TOKEN_COOKIE_NAME, encodeURIComponent(token), {
      httpOnly: true,
      maxAge,
      path: PROFILE_UPDATE_TOKEN_COOKIE_PATH
    })
  );
}

export function hasValidCsrfToken(request: FastifyRequest): boolean {
  const cookieToken = getCookie(request, CSRF_TOKEN_COOKIE_NAME);
  const headerToken = getHeaderValue(request, CSRF_TOKEN_HEADER_NAME);

  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

export function clearRefreshTokenCookie(reply: FastifyReply): void {
  reply.header("set-cookie", [
    serializeAuthCookie(REFRESH_TOKEN_COOKIE_NAME, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: REFRESH_TOKEN_COOKIE_PATH
    }),
    serializeAuthCookie(CSRF_TOKEN_COOKIE_NAME, "", {
      expires: new Date(0),
      maxAge: 0,
      path: CSRF_TOKEN_COOKIE_PATH
    })
  ]);
}

export function getRefreshTokenPersistence(refreshToken: string): RefreshTokenPersistence {
  if (refreshToken.startsWith(SESSION_REFRESH_TOKEN_PREFIX)) {
    return "session";
  }

  return "persistent";
}

function getUserAgent(request: FastifyRequest): string | undefined {
  const userAgent = request.headers["user-agent"];

  if (Array.isArray(userAgent)) {
    return userAgent.join(",");
  }

  return userAgent;
}

function getCookie(request: FastifyRequest, cookieName: string): string | null {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;

  for (const cookie of cookies.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === cookieName) {
      const rawValue = rawValueParts.join("=");

      try {
        return rawValue ? decodeURIComponent(rawValue) : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function getHeaderValue(request: FastifyRequest, headerName: string): string | null {
  const value = request.headers[headerName];

  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function createSessionRefreshToken(persistence: RefreshTokenPersistence): string {
  const prefix =
    persistence === "persistent" ? PERSISTENT_REFRESH_TOKEN_PREFIX : SESSION_REFRESH_TOKEN_PREFIX;

  return `${prefix}${createRefreshToken()}`;
}

function setRefreshTokenCookie(
  reply: FastifyReply,
  refreshToken: string,
  persistence: RefreshTokenPersistence
): void {
  const csrfToken = createRefreshToken();
  const maxAge =
    persistence === "persistent" ? REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS : undefined;
  const lifetimeOptions = maxAge === undefined ? {} : { maxAge };

  reply.header("set-cookie", [
    serializeAuthCookie(REFRESH_TOKEN_COOKIE_NAME, encodeURIComponent(refreshToken), {
      httpOnly: true,
      path: REFRESH_TOKEN_COOKIE_PATH,
      ...lifetimeOptions
    }),
    serializeAuthCookie(CSRF_TOKEN_COOKIE_NAME, encodeURIComponent(csrfToken), {
      path: CSRF_TOKEN_COOKIE_PATH,
      ...lifetimeOptions
    })
  ]);
}

export function serializeAuthCookie(
  name: string,
  value: string,
  options: {
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path: string;
  }
): string {
  const attributes = [
    `${name}=${value}`,
    "SameSite=Lax",
    `Path=${options.path}`
  ];

  if (options.maxAge !== undefined) {
    attributes.push(`Max-Age=${options.maxAge}`);
  }

  if (options.httpOnly) {
    attributes.push("HttpOnly");
  }

  if (options.expires) {
    attributes.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}
